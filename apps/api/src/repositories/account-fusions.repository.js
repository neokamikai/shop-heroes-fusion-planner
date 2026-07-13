class AccountFusionsRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('account_fusions')
      .insert(payload)
      .returning([
        'id',
        'account_id as accountId',
        'item_id as itemId',
        'from_tier_id as fromTierId',
        'to_tier_id as toTierId'
      ]);

    return row;
  }

  async deleteByAccountAndId(accountId, fusionId) {
    const [row] = await this.database('account_fusions')
      .where({
        account_id: accountId,
        id: fusionId
      })
      .delete()
      .returning(['id']);

    return row || null;
  }

  async listForAccount(accountId) {
    return this.database('account_fusions as fusion')
      .innerJoin('catalog_items as item', 'item.id', 'fusion.item_id')
      .innerJoin('catalog_tiers as from_tier', 'from_tier.id', 'fusion.from_tier_id')
      .innerJoin('catalog_tiers as to_tier', 'to_tier.id', 'fusion.to_tier_id')
      .select(
        'fusion.id',
        'fusion.account_id as accountId',
        'fusion.item_id as itemId',
        'fusion.from_tier_id as fromTierId',
        'fusion.to_tier_id as toTierId',
        'fusion.created_at as createdAt',
        'fusion.updated_at as updatedAt',
        'item.name as itemName',
        'item.external_slug as externalSlug',
        'item.level',
        'item.icon_url as iconUrl',
        'from_tier.code as fromTierCode',
        'from_tier.name as fromTierName',
        'from_tier.sort_order as fromTierSortOrder',
        'to_tier.code as toTierCode',
        'to_tier.name as toTierName',
        'to_tier.sort_order as toTierSortOrder'
      )
      .where('fusion.account_id', accountId)
      .orderBy('fusion.created_at', 'asc');
  }
}

module.exports = {
  AccountFusionsRepository
};
