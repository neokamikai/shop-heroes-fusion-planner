class AccountTargetsRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('account_targets')
      .insert(payload)
      .returning([
        'id',
        'account_id as accountId',
        'character_id as characterId',
        'item_id as itemId',
        'target_tier_id as targetTierId',
        'quantity',
        'priority',
        'is_completed as isCompleted',
        'completed_at as completedAt'
      ]);

    return row;
  }

  async findByAccountAndId(accountId, targetId) {
    return this.database('account_targets')
      .select(
        'id',
        'account_id as accountId',
        'character_id as characterId',
        'item_id as itemId',
        'target_tier_id as targetTierId',
        'quantity',
        'priority',
        'is_completed as isCompleted',
        'completed_at as completedAt'
      )
      .where({
        account_id: accountId,
        id: targetId
      })
      .first();
  }

  async updateByAccountAndId(accountId, targetId, payload) {
    const [row] = await this.database('account_targets')
      .where({
        account_id: accountId,
        id: targetId
      })
      .update({
        ...payload,
        updated_at: this.database.raw('CURRENT_TIMESTAMP')
      })
      .returning([
        'id',
        'account_id as accountId',
        'character_id as characterId',
        'item_id as itemId',
        'target_tier_id as targetTierId',
        'quantity',
        'priority',
        'is_completed as isCompleted',
        'completed_at as completedAt'
      ]);

    return row || null;
  }

  async deleteByAccountAndId(accountId, targetId) {
    const [row] = await this.database('account_targets')
      .where({
        account_id: accountId,
        id: targetId
      })
      .delete()
      .returning(['id']);

    return row || null;
  }

  async listForAccount(accountId) {
    return this.database('account_targets as target')
      .innerJoin('catalog_characters as character', 'character.id', 'target.character_id')
      .innerJoin('catalog_items as item', 'item.id', 'target.item_id')
      .innerJoin('catalog_tiers as tier', 'tier.id', 'target.target_tier_id')
      .innerJoin('catalog_subcategories as subcategory', 'subcategory.id', 'item.subcategory_id')
      .innerJoin('catalog_categories as category', 'category.id', 'subcategory.category_id')
      .select(
        'target.id',
        'target.account_id as accountId',
        'target.character_id as characterId',
        'target.item_id as itemId',
        'target.target_tier_id as targetTierId',
        'target.quantity',
        'target.priority',
        'target.is_completed as isCompleted',
        'target.completed_at as completedAt',
        'target.created_at as createdAt',
        'target.updated_at as updatedAt',
        'character.code as characterCode',
        'character.name as characterName',
        'item.name as itemName',
        'item.external_slug as externalSlug',
        'item.level',
        'item.icon_url as iconUrl',
        'category.code as categoryCode',
        'category.name as categoryName',
        'subcategory.code as subcategoryCode',
        'subcategory.name as subcategoryName',
        'tier.code as targetTierCode',
        'tier.name as targetTierName',
        'tier.sort_order as targetTierSortOrder'
      )
      .where('target.account_id', accountId)
      .orderBy('target.priority', 'asc')
      .orderBy('character.name', 'asc')
      .orderBy('item.level', 'asc');
  }
}

module.exports = {
  AccountTargetsRepository
};
