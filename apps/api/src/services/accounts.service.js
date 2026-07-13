const crypto = require('crypto');

const { ApiError } = require('../errors/api-error');
const { AccountSettingsRepository } = require('../repositories/account-settings.repository');
const { CatalogCharactersRepository } = require('../repositories/catalog-characters.repository');
const { CatalogSettingDefinitionsRepository } = require('../repositories/catalog-setting-definitions.repository');
const { CatalogItemsRepository } = require('../repositories/catalog-items.repository');
const { CatalogTiersRepository } = require('../repositories/catalog-tiers.repository');
const { GameAccountsRepository } = require('../repositories/game-accounts.repository');
const { UsersRepository } = require('../repositories/users.repository');
const {
  readOptionalBoolean,
  readOptionalStringEnum,
  readOptionalString,
  readRequiredInteger,
  readRequiredString
} = require('../utils/request-parsers');

class AccountsService {
  constructor({
    database,
    usersRepository,
    gameAccountsRepository,
    catalogItemsRepository,
    catalogCharactersRepository,
    catalogTiersRepository,
    settingDefinitionsRepository,
    accountSettingsRepository,
    accountCharacterStatesRepository,
    accountItemStatesRepository,
    accountInventoryItemsRepository,
    accountTargetsRepository,
    accountCraftsRepository,
    accountFusionsRepository
  }) {
    this.database = database;
    this.usersRepository = usersRepository;
    this.gameAccountsRepository = gameAccountsRepository;
    this.catalogItemsRepository = catalogItemsRepository;
    this.catalogCharactersRepository = catalogCharactersRepository;
    this.catalogTiersRepository = catalogTiersRepository;
    this.settingDefinitionsRepository = settingDefinitionsRepository;
    this.accountSettingsRepository = accountSettingsRepository;
    this.accountCharacterStatesRepository = accountCharacterStatesRepository;
    this.accountItemStatesRepository = accountItemStatesRepository;
    this.accountInventoryItemsRepository = accountInventoryItemsRepository;
    this.accountTargetsRepository = accountTargetsRepository;
    this.accountCraftsRepository = accountCraftsRepository;
    this.accountFusionsRepository = accountFusionsRepository;
  }

  async createUser(rawPayload = {}) {
    const displayName = readRequiredString(rawPayload.displayName, 'displayName');

    return this.usersRepository.create({
      id: crypto.randomUUID(),
      display_name: displayName
    });
  }

  async listAccounts(userId) {
    return this.gameAccountsRepository.listByUserId(userId);
  }

  async getAccount(accountId, userId) {
    const account = await this.gameAccountsRepository.findByIdAndUserId(accountId, userId);

    if (!account) {
      throw new ApiError(404, 'Account not found.', 'account_not_found');
    }

    return account;
  }

  async createAccount(rawPayload = {}, userId) {
    const name = readRequiredString(rawPayload.name, 'name');
    const platform = readRequiredString(rawPayload.platform, 'platform');
    const notes = readOptionalString(rawPayload.notes);
    const isActive = readOptionalBoolean(rawPayload.isActive, true);

    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ApiError(404, 'User not found.', 'user_not_found');
    }

    const account = await this.gameAccountsRepository.create({
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      platform,
      notes,
      is_active: isActive
    });

    await this.initializeAccountSettings(account.id);

    return this.getPlannerSnapshot(account.id, userId);
  }

  async bootstrapAccount(rawPayload = {}, userId) {
    const accountName = readRequiredString(rawPayload.accountName, 'accountName');
    const platform = readRequiredString(rawPayload.platform, 'platform');
    const notes = readOptionalString(rawPayload.notes);
    const isActive = readOptionalBoolean(rawPayload.isActive, true);

    let accountId;

    await this.database.transaction(async (transaction) => {
      const transactionGameAccountsRepository = new GameAccountsRepository(transaction);
      const transactionSettingDefinitionsRepository = new CatalogSettingDefinitionsRepository(transaction);
      const transactionAccountSettingsRepository = new AccountSettingsRepository(transaction);

      const account = await transactionGameAccountsRepository.create({
        id: crypto.randomUUID(),
        user_id: userId,
        name: accountName,
        platform,
        notes,
        is_active: isActive
      });

      const definitions = await transactionSettingDefinitionsRepository.listAll();
      await transactionAccountSettingsRepository.createMany(
        definitions.map((definition) => ({
          id: crypto.randomUUID(),
          account_id: account.id,
          setting_definition_id: definition.id,
          setting_value: definition.defaultValue
        }))
      );

      accountId = account.id;
    });

    return this.getPlannerSnapshot(accountId, userId);
  }

  async listAccountSettings(accountId, userId) {
    await this.getAccount(accountId, userId);
    await this.ensureAccountSettings(accountId);
    return this.accountSettingsRepository.listForAccount(accountId);
  }

  async getAccountMcpBinding(accountId, userId) {
    const account = await this.getAccount(accountId, userId);
    return this.buildMcpBindingFromAccount(account);
  }

  async updateAccountMcpBinding(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const clearBinding = readOptionalBoolean(rawPayload.clearBinding, false);

    const payload = clearBinding
      ? {
          mcp_binding_mode: null,
          mcp_account_external_id: null,
          mcp_account_display_name: null,
          mcp_installation_id: null,
          mcp_installation_type: null,
          mcp_installation_label: null,
          mcp_last_session_id: null,
          mcp_last_session_started_at: null,
          mcp_last_session_seen_at: null
        }
      : {
          mcp_binding_mode: readOptionalStringEnum(
            rawPayload.bindingMode,
            'bindingMode',
            ['manual', 'account_external_id'],
            rawPayload.accountExternalId ? 'account_external_id' : 'manual'
          ),
          mcp_account_external_id: readOptionalString(rawPayload.accountExternalId),
          mcp_account_display_name: readOptionalString(rawPayload.accountDisplayName),
          mcp_installation_id: readOptionalString(rawPayload.installationId),
          mcp_installation_type: readOptionalString(rawPayload.installationType),
          mcp_installation_label: readOptionalString(rawPayload.installationLabel),
          mcp_last_session_id: readOptionalString(rawPayload.sessionId),
          mcp_last_session_started_at: readOptionalString(rawPayload.sessionStartedAt),
          mcp_last_session_seen_at: readOptionalString(rawPayload.sessionSeenAt) || new Date().toISOString()
        };

    const updatedAccount = await this.gameAccountsRepository.updateByIdAndUserId(accountId, userId, payload);
    return this.buildMcpBindingFromAccount(updatedAccount);
  }

  async listAccountCharacters(accountId, userId) {
    await this.getAccount(accountId, userId);
    await this.ensureAccountCharacterStates(accountId);
    return this.accountCharacterStatesRepository.listForAccount(accountId);
  }

  async upsertAccountCharacterState(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);
    await this.ensureAccountCharacterStates(accountId);

    const characterId = readRequiredString(rawPayload.characterId, 'characterId');
    const isUnlocked = readOptionalBoolean(rawPayload.isUnlocked, false);
    const level = readRequiredInteger(rawPayload.level, 'level', { min: 1 });

    await this.requireCatalogCharacter(characterId);

    await this.accountCharacterStatesRepository.upsert({
      id: crypto.randomUUID(),
      account_id: accountId,
      character_id: characterId,
      is_unlocked: isUnlocked,
      level
    });

    return this.listAccountCharacters(accountId, userId);
  }

  async listAccountItemStates(accountId, userId) {
    await this.getAccount(accountId, userId);
    return this.accountItemStatesRepository.listForAccount(accountId);
  }

  async listAccountInventory(accountId, userId) {
    await this.getAccount(accountId, userId);
    return this.accountInventoryItemsRepository.listForAccount(accountId);
  }

  async upsertAccountItemState(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const itemId = readRequiredString(rawPayload.itemId, 'itemId');
    const ownedBlueprint = readOptionalBoolean(rawPayload.ownedBlueprint, false);
    const craftUnlocked = readOptionalBoolean(rawPayload.craftUnlocked, false);

    await this.requireCatalogItem(itemId);

    await this.accountItemStatesRepository.upsert({
      id: crypto.randomUUID(),
      account_id: accountId,
      item_id: itemId,
      owned_blueprint: ownedBlueprint,
      craft_unlocked: craftUnlocked
    });

    return this.listAccountItemStates(accountId, userId);
  }

  async bulkUpsertAccountItemStates(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const entries = Array.isArray(rawPayload.entries) ? rawPayload.entries : null;

    if (!entries?.length) {
      throw new ApiError(400, 'entries must be a non-empty array.', 'validation_error');
    }

    for (const entry of entries) {
      const itemId = readRequiredString(entry?.itemId, 'itemId');
      const ownedBlueprint = readOptionalBoolean(entry?.ownedBlueprint, false);
      const craftUnlocked = readOptionalBoolean(entry?.craftUnlocked, false);

      await this.requireCatalogItem(itemId);

      await this.accountItemStatesRepository.upsert({
        id: crypto.randomUUID(),
        account_id: accountId,
        item_id: itemId,
        owned_blueprint: ownedBlueprint,
        craft_unlocked: craftUnlocked
      });
    }

    return this.listAccountItemStates(accountId, userId);
  }

  async upsertAccountInventoryItem(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const itemId = readRequiredString(rawPayload.itemId, 'itemId');
    const tierId = readRequiredString(rawPayload.tierId, 'tierId');
    const quantity = readRequiredInteger(rawPayload.quantity, 'quantity', { min: 0 });

    await Promise.all([
      this.requireCatalogItem(itemId),
      this.requireCatalogTier(tierId)
    ]);

    if (quantity === 0) {
      await this.accountInventoryItemsRepository.deleteByAccountItemAndTier(accountId, itemId, tierId);
      return this.listAccountInventory(accountId, userId);
    }

    await this.accountInventoryItemsRepository.upsert({
      id: crypto.randomUUID(),
      account_id: accountId,
      item_id: itemId,
      tier_id: tierId,
      quantity
    });

    return this.listAccountInventory(accountId, userId);
  }

  async bulkUpsertAccountInventory(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const entries = Array.isArray(rawPayload.entries) ? rawPayload.entries : null;

    if (!entries?.length) {
      throw new ApiError(400, 'entries must be a non-empty array.', 'validation_error');
    }

    for (const entry of entries) {
      const itemId = readRequiredString(entry?.itemId, 'itemId');
      const tierId = readRequiredString(entry?.tierId, 'tierId');
      const quantity = readRequiredInteger(entry?.quantity, 'quantity', { min: 0 });

      await Promise.all([
        this.requireCatalogItem(itemId),
        this.requireCatalogTier(tierId)
      ]);

      if (quantity === 0) {
        await this.accountInventoryItemsRepository.deleteByAccountItemAndTier(accountId, itemId, tierId);
        continue;
      }

      await this.accountInventoryItemsRepository.upsert({
        id: crypto.randomUUID(),
        account_id: accountId,
        item_id: itemId,
        tier_id: tierId,
        quantity
      });
    }

    return this.listAccountInventory(accountId, userId);
  }

  async createTarget(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const characterId = readRequiredString(rawPayload.characterId, 'characterId');
    const itemId = readRequiredString(rawPayload.itemId, 'itemId');
    const targetTierId = readRequiredString(rawPayload.targetTierId, 'targetTierId');
    const quantity = readRequiredInteger(rawPayload.quantity, 'quantity', { min: 1 });
    const priority = readRequiredInteger(rawPayload.priority, 'priority', { min: 0 });

    await Promise.all([
      this.requireCatalogCharacter(characterId),
      this.requireCatalogItem(itemId),
      this.requireCatalogTier(targetTierId)
    ]);

    try {
      await this.accountTargetsRepository.create({
        id: crypto.randomUUID(),
        account_id: accountId,
        character_id: characterId,
        item_id: itemId,
        target_tier_id: targetTierId,
        quantity,
        priority,
        is_completed: false,
        completed_at: null
      });
    } catch (error) {
      this.rethrowMutationError(error, 'Target conflicts with an existing priority for the same item and tier.');
    }

    return this.getPlannerSnapshot(accountId, userId);
  }

  async updateTarget(accountId, targetId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);
    const existingTarget = await this.accountTargetsRepository.findByAccountAndId(accountId, targetId);

    if (!existingTarget) {
      throw new ApiError(404, 'Target not found.', 'target_not_found');
    }

    const nextCharacterId = rawPayload.characterId !== undefined
      ? readRequiredString(rawPayload.characterId, 'characterId')
      : existingTarget.characterId;
    const nextItemId = rawPayload.itemId !== undefined
      ? readRequiredString(rawPayload.itemId, 'itemId')
      : existingTarget.itemId;
    const nextTargetTierId = rawPayload.targetTierId !== undefined
      ? readRequiredString(rawPayload.targetTierId, 'targetTierId')
      : existingTarget.targetTierId;
    const nextQuantity = rawPayload.quantity !== undefined
      ? readRequiredInteger(rawPayload.quantity, 'quantity', { min: 1 })
      : existingTarget.quantity;
    const nextPriority = rawPayload.priority !== undefined
      ? readRequiredInteger(rawPayload.priority, 'priority', { min: 0 })
      : existingTarget.priority;
    const nextIsCompleted = rawPayload.isCompleted !== undefined
      ? readOptionalBoolean(rawPayload.isCompleted, existingTarget.isCompleted)
      : existingTarget.isCompleted;
    const nextCompletedAt = nextIsCompleted
      ? (rawPayload.completedAt !== undefined ? readOptionalString(rawPayload.completedAt) : existingTarget.completedAt || new Date().toISOString())
      : null;

    await Promise.all([
      this.requireCatalogCharacter(nextCharacterId),
      this.requireCatalogItem(nextItemId),
      this.requireCatalogTier(nextTargetTierId)
    ]);

    try {
      await this.accountTargetsRepository.updateByAccountAndId(accountId, targetId, {
        character_id: nextCharacterId,
        item_id: nextItemId,
        target_tier_id: nextTargetTierId,
        quantity: nextQuantity,
        priority: nextPriority,
        is_completed: nextIsCompleted,
        completed_at: nextCompletedAt
      });
    } catch (error) {
      this.rethrowMutationError(error, 'Target conflicts with an existing priority for the same item and tier.');
    }

    return this.getPlannerSnapshot(accountId, userId);
  }

  async deleteTarget(accountId, targetId, userId) {
    await this.getAccount(accountId, userId);
    const deletedTarget = await this.accountTargetsRepository.deleteByAccountAndId(accountId, targetId);

    if (!deletedTarget) {
      throw new ApiError(404, 'Target not found.', 'target_not_found');
    }

    return this.getPlannerSnapshot(accountId, userId);
  }

  async createCraft(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const itemId = readRequiredString(rawPayload.itemId, 'itemId');
    const plannedTargetTierId = readRequiredString(rawPayload.plannedTargetTierId, 'plannedTargetTierId');
    const baseTierId = readRequiredString(rawPayload.baseTierId, 'baseTierId');
    const source = readOptionalStringEnum(rawPayload.source, 'source', ['target', 'catalog', 'manual']);
    const targetId = readOptionalString(rawPayload.targetId);
    const characterId = readOptionalString(rawPayload.characterId);

    await Promise.all([
      this.requireCatalogItem(itemId),
      this.requireCatalogTier(plannedTargetTierId),
      this.requireCatalogTier(baseTierId),
      characterId ? this.requireCatalogCharacter(characterId) : Promise.resolve(),
      targetId ? this.requireAccountTarget(accountId, targetId) : Promise.resolve()
    ]);

    await this.accountCraftsRepository.create({
      id: crypto.randomUUID(),
      account_id: accountId,
      item_id: itemId,
      target_id: targetId,
      character_id: characterId,
      planned_target_tier_id: plannedTargetTierId,
      base_tier_id: baseTierId,
      source: source || 'manual'
    });

    return this.getPlannerSnapshot(accountId, userId);
  }

  async deleteCraft(accountId, craftId, userId) {
    await this.getAccount(accountId, userId);
    const deletedCraft = await this.accountCraftsRepository.deleteByAccountAndId(accountId, craftId);

    if (!deletedCraft) {
      throw new ApiError(404, 'Craft not found.', 'craft_not_found');
    }

    return this.getPlannerSnapshot(accountId, userId);
  }

  async createFusion(accountId, rawPayload = {}, userId) {
    await this.getAccount(accountId, userId);

    const itemId = readRequiredString(rawPayload.itemId, 'itemId');
    const fromTierId = readRequiredString(rawPayload.fromTierId, 'fromTierId');
    const toTierId = readRequiredString(rawPayload.toTierId, 'toTierId');

    await Promise.all([
      this.requireCatalogItem(itemId),
      this.requireCatalogTier(fromTierId),
      this.requireCatalogTier(toTierId)
    ]);

    await this.accountFusionsRepository.create({
      id: crypto.randomUUID(),
      account_id: accountId,
      item_id: itemId,
      from_tier_id: fromTierId,
      to_tier_id: toTierId
    });

    return this.getPlannerSnapshot(accountId, userId);
  }

  async deleteFusion(accountId, fusionId, userId) {
    await this.getAccount(accountId, userId);
    const deletedFusion = await this.accountFusionsRepository.deleteByAccountAndId(accountId, fusionId);

    if (!deletedFusion) {
      throw new ApiError(404, 'Fusion not found.', 'fusion_not_found');
    }

    return this.getPlannerSnapshot(accountId, userId);
  }

  async getPlannerSnapshot(accountId, userId) {
    const account = await this.getAccount(accountId, userId);
    await this.ensureAccountSettings(accountId);
    await this.ensureAccountCharacterStates(accountId);

    const [settings, characters, itemStates, inventory, targets, crafts, fusions] = await Promise.all([
      this.accountSettingsRepository.listForAccount(accountId),
      this.accountCharacterStatesRepository.listForAccount(accountId),
      this.accountItemStatesRepository.listForAccount(accountId),
      this.accountInventoryItemsRepository.listForAccount(accountId),
      this.accountTargetsRepository.listForAccount(accountId),
      this.accountCraftsRepository.listForAccount(accountId),
      this.accountFusionsRepository.listForAccount(accountId)
    ]);

    return {
      account,
      settings,
      characters,
      itemStates,
      inventory,
      planner: {
        targets,
        crafts,
        fusions
      }
    };
  }

  async initializeAccountSettings(accountId) {
    const definitions = await this.settingDefinitionsRepository.listAll();

    await this.accountSettingsRepository.createMany(
      definitions.map((definition) => ({
        id: crypto.randomUUID(),
        account_id: accountId,
        setting_definition_id: definition.id,
        setting_value: definition.defaultValue
      }))
    );
  }

  async ensureAccountSettings(accountId) {
    const [definitions, existingSettings] = await Promise.all([
      this.settingDefinitionsRepository.listAll(),
      this.accountSettingsRepository.listForAccount(accountId)
    ]);

    const existingDefinitionIds = new Set(existingSettings.map((setting) => setting.settingDefinitionId));
    const missingSettings = definitions
      .filter((definition) => !existingDefinitionIds.has(definition.id))
      .map((definition) => ({
        id: crypto.randomUUID(),
        account_id: accountId,
        setting_definition_id: definition.id,
        setting_value: definition.defaultValue
      }));

    if (!missingSettings.length) {
      return;
    }

    await this.accountSettingsRepository.createMany(missingSettings);
  }

  async ensureAccountCharacterStates(accountId) {
    const [catalogCharacters, existingStates] = await Promise.all([
      this.catalogCharactersRepository.listAll(),
      this.accountCharacterStatesRepository.listForAccount(accountId)
    ]);

    const existingCharacterIds = new Set(existingStates.map((state) => state.characterId));
    const missingStates = catalogCharacters
      .filter((character) => !existingCharacterIds.has(character.id))
      .map((character) => ({
        id: crypto.randomUUID(),
        account_id: accountId,
        character_id: character.id,
        is_unlocked: false,
        level: 1
      }));

    if (!missingStates.length) {
      return;
    }

    await this.accountCharacterStatesRepository.createMany(missingStates);
  }

  async requireCatalogItem(itemId) {
    const item = await this.catalogItemsRepository.findById(itemId);

    if (!item) {
      throw new ApiError(404, 'Item not found.', 'item_not_found');
    }

    return item;
  }

  async requireCatalogCharacter(characterId) {
    const character = await this.catalogCharactersRepository.findById(characterId);

    if (!character) {
      throw new ApiError(404, 'Character not found.', 'character_not_found');
    }

    return character;
  }

  async requireCatalogTier(tierId) {
    const tier = await this.catalogTiersRepository.findById(tierId);

    if (!tier) {
      throw new ApiError(404, 'Tier not found.', 'tier_not_found');
    }

    return tier;
  }

  async requireAccountTarget(accountId, targetId) {
    const target = await this.accountTargetsRepository.findByAccountAndId(accountId, targetId);

    if (!target) {
      throw new ApiError(404, 'Target not found.', 'target_not_found');
    }

    return target;
  }

  rethrowMutationError(error, conflictMessage) {
    if (error?.code === '23505') {
      throw new ApiError(409, conflictMessage, 'conflict');
    }

    throw error;
  }

  buildMcpBindingFromAccount(account) {
    return {
      bindingMode: account?.mcpBindingMode || null,
      accountExternalId: account?.mcpAccountExternalId || null,
      accountDisplayName: account?.mcpAccountDisplayName || null,
      installationId: account?.mcpInstallationId || null,
      installationType: account?.mcpInstallationType || null,
      installationLabel: account?.mcpInstallationLabel || null,
      sessionId: account?.mcpLastSessionId || null,
      sessionStartedAt: account?.mcpLastSessionStartedAt || null,
      sessionSeenAt: account?.mcpLastSessionSeenAt || null,
      isBound: Boolean(
        account?.mcpBindingMode
        || account?.mcpAccountExternalId
        || account?.mcpInstallationId
        || account?.mcpLastSessionId
      )
    };
  }
}

module.exports = {
  AccountsService
};
