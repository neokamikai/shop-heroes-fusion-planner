class AccountItemStatesRepository {
  constructor(database) {
    this.database = database;
  }

  async upsert(payload) {
    const [row] = await this.database('account_item_states')
      .insert(payload)
      .onConflict(['account_id', 'item_id'])
      .merge({
        owned_blueprint: payload.owned_blueprint,
        craft_unlocked: payload.craft_unlocked,
        updated_at: this.database.raw('CURRENT_TIMESTAMP')
      })
      .returning([
        'id',
        'account_id as accountId',
        'item_id as itemId',
        'owned_blueprint as ownedBlueprint',
        'craft_unlocked as craftUnlocked'
      ]);

    return row;
  }

  async listForAccount(accountId) {
    return this.database('account_item_states as item_state')
      .innerJoin('catalog_items as item', 'item.id', 'item_state.item_id')
      .innerJoin('catalog_subcategories as subcategory', 'subcategory.id', 'item.subcategory_id')
      .innerJoin('catalog_categories as category', 'category.id', 'subcategory.category_id')
      .innerJoin('catalog_tiers as tier', 'tier.id', 'item.min_tier_id')
      .select(
        'item_state.id',
        'item_state.account_id as accountId',
        'item_state.item_id as itemId',
        'item_state.owned_blueprint as ownedBlueprint',
        'item_state.craft_unlocked as craftUnlocked',
        'item.name as itemName',
        'item.external_slug as externalSlug',
        'item.level',
        'item.icon_url as iconUrl',
        'item.blueprint_url as blueprintUrl',
        'category.code as categoryCode',
        'category.name as categoryName',
        'subcategory.code as subcategoryCode',
        'subcategory.name as subcategoryName',
        'tier.code as minTierCode',
        'tier.name as minTierName'
      )
      .where('item_state.account_id', accountId)
      .orderBy('item.level', 'asc')
      .orderBy('item.name', 'asc');
  }
}

module.exports = {
  AccountItemStatesRepository
};
