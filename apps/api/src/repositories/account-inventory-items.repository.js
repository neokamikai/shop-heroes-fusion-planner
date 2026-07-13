class AccountInventoryItemsRepository {
  constructor(database) {
    this.database = database;
  }

  async upsert(payload) {
    const [row] = await this.database('account_inventory_items')
      .insert(payload)
      .onConflict(['account_id', 'item_id', 'tier_id'])
      .merge({
        quantity: payload.quantity,
        updated_at: this.database.raw('CURRENT_TIMESTAMP')
      })
      .returning([
        'id',
        'account_id as accountId',
        'item_id as itemId',
        'tier_id as tierId',
        'quantity'
      ]);

    return row;
  }

  async deleteByAccountItemAndTier(accountId, itemId, tierId) {
    const [row] = await this.database('account_inventory_items')
      .where({
        account_id: accountId,
        item_id: itemId,
        tier_id: tierId
      })
      .delete()
      .returning([
        'id',
        'account_id as accountId',
        'item_id as itemId',
        'tier_id as tierId',
        'quantity'
      ]);

    return row || null;
  }

  async listForAccount(accountId) {
    return this.database('account_inventory_items as inventory_item')
      .innerJoin('catalog_items as item', 'item.id', 'inventory_item.item_id')
      .innerJoin('catalog_tiers as tier', 'tier.id', 'inventory_item.tier_id')
      .innerJoin('catalog_subcategories as subcategory', 'subcategory.id', 'item.subcategory_id')
      .innerJoin('catalog_categories as category', 'category.id', 'subcategory.category_id')
      .select(
        'inventory_item.id',
        'inventory_item.account_id as accountId',
        'inventory_item.item_id as itemId',
        'inventory_item.tier_id as tierId',
        'inventory_item.quantity',
        'item.name as itemName',
        'item.external_slug as externalSlug',
        'item.level',
        'item.icon_url as iconUrl',
        'category.code as categoryCode',
        'category.name as categoryName',
        'subcategory.code as subcategoryCode',
        'subcategory.name as subcategoryName',
        'tier.code as tierCode',
        'tier.name as tierName',
        'tier.sort_order as tierSortOrder'
      )
      .where('inventory_item.account_id', accountId)
      .orderBy('item.level', 'asc')
      .orderBy('item.name', 'asc')
      .orderBy('tier.sort_order', 'asc');
  }
}

module.exports = {
  AccountInventoryItemsRepository
};
