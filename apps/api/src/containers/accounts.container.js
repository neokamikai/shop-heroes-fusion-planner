const { getDatabaseClient } = require('@shop-heroes-planner/database');

const { AccountCharacterStatesRepository } = require('../repositories/account-character-states.repository');
const { AccountCraftsRepository } = require('../repositories/account-crafts.repository');
const { AccountFusionsRepository } = require('../repositories/account-fusions.repository');
const { AccountInventoryItemsRepository } = require('../repositories/account-inventory-items.repository');
const { AccountItemStatesRepository } = require('../repositories/account-item-states.repository');
const { AccountSettingsRepository } = require('../repositories/account-settings.repository');
const { AccountTargetsRepository } = require('../repositories/account-targets.repository');
const { CatalogCharactersRepository } = require('../repositories/catalog-characters.repository');
const { CatalogItemsRepository } = require('../repositories/catalog-items.repository');
const { CatalogSettingDefinitionsRepository } = require('../repositories/catalog-setting-definitions.repository');
const { CatalogTiersRepository } = require('../repositories/catalog-tiers.repository');
const { GameAccountsRepository } = require('../repositories/game-accounts.repository');
const { UsersRepository } = require('../repositories/users.repository');
const { AccountsService } = require('../services/accounts.service');

function createAccountsService() {
  const database = getDatabaseClient();

  return new AccountsService({
    database,
    usersRepository: new UsersRepository(database),
    gameAccountsRepository: new GameAccountsRepository(database),
    catalogItemsRepository: new CatalogItemsRepository(database),
    catalogCharactersRepository: new CatalogCharactersRepository(database),
    catalogTiersRepository: new CatalogTiersRepository(database),
    settingDefinitionsRepository: new CatalogSettingDefinitionsRepository(database),
    accountSettingsRepository: new AccountSettingsRepository(database),
    accountCharacterStatesRepository: new AccountCharacterStatesRepository(database),
    accountItemStatesRepository: new AccountItemStatesRepository(database),
    accountInventoryItemsRepository: new AccountInventoryItemsRepository(database),
    accountTargetsRepository: new AccountTargetsRepository(database),
    accountCraftsRepository: new AccountCraftsRepository(database),
    accountFusionsRepository: new AccountFusionsRepository(database)
  });
}

module.exports = {
  createAccountsService
};
