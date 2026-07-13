class AccountCraftsRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('account_crafts')
      .insert(payload)
      .returning([
        'id',
        'account_id as accountId',
        'item_id as itemId',
        'target_id as targetId',
        'character_id as characterId',
        'planned_target_tier_id as plannedTargetTierId',
        'base_tier_id as baseTierId',
        'source'
      ]);

    return row;
  }

  async deleteByAccountAndId(accountId, craftId) {
    const [row] = await this.database('account_crafts')
      .where({
        account_id: accountId,
        id: craftId
      })
      .delete()
      .returning(['id']);

    return row || null;
  }

  async listForAccount(accountId) {
    return this.database('account_crafts as craft')
      .innerJoin('catalog_items as item', 'item.id', 'craft.item_id')
      .leftJoin('catalog_characters as character', 'character.id', 'craft.character_id')
      .leftJoin('account_targets as target', 'target.id', 'craft.target_id')
      .innerJoin('catalog_tiers as planned_tier', 'planned_tier.id', 'craft.planned_target_tier_id')
      .innerJoin('catalog_tiers as base_tier', 'base_tier.id', 'craft.base_tier_id')
      .select(
        'craft.id',
        'craft.account_id as accountId',
        'craft.item_id as itemId',
        'craft.target_id as targetId',
        'craft.character_id as characterId',
        'craft.planned_target_tier_id as plannedTargetTierId',
        'craft.base_tier_id as baseTierId',
        'craft.source',
        'craft.created_at as createdAt',
        'craft.updated_at as updatedAt',
        'item.name as itemName',
        'item.external_slug as externalSlug',
        'item.level',
        'item.icon_url as iconUrl',
        'character.code as characterCode',
        'character.name as characterName',
        'target.priority as targetPriority',
        'planned_tier.code as plannedTargetTierCode',
        'planned_tier.name as plannedTargetTierName',
        'base_tier.code as baseTierCode',
        'base_tier.name as baseTierName'
      )
      .where('craft.account_id', accountId)
      .orderBy('craft.created_at', 'asc');
  }
}

module.exports = {
  AccountCraftsRepository
};
