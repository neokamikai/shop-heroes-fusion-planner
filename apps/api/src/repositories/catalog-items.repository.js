class CatalogItemsRepository {
  constructor(database) {
    this.database = database;
  }

  async findById(itemId) {
    return this.database('catalog_items')
      .select('id', 'name', 'subcategory_id as subcategoryId', 'min_tier_id as minTierId')
      .where('id', itemId)
      .first();
  }

  async listAll(filters = {}) {
    const {
      search,
      categoryCode,
      subcategoryCode,
      limit = 50,
      offset = 0
    } = filters;

    const query = this.database('catalog_items as item')
      .innerJoin('catalog_subcategories as subcategory', 'subcategory.id', 'item.subcategory_id')
      .innerJoin('catalog_categories as category', 'category.id', 'subcategory.category_id')
      .innerJoin('catalog_tiers as tier', 'tier.id', 'item.min_tier_id')
      .select(
        'item.id',
        'item.external_slug as externalSlug',
        'item.name',
        'item.level',
        'item.icon_url as iconUrl',
        'item.blueprint_url as blueprintUrl',
        'item.summary',
        'item.source',
        'category.id as categoryId',
        'category.code as categoryCode',
        'category.name as categoryName',
        'subcategory.id as subcategoryId',
        'subcategory.code as subcategoryCode',
        'subcategory.name as subcategoryName',
        'tier.id as minTierId',
        'tier.code as minTierCode',
        'tier.name as minTierName'
      )
      .orderBy('item.level', 'asc')
      .orderBy('item.name', 'asc')
      .limit(limit)
      .offset(offset);

    if (search) {
      query.whereILike('item.name', `%${search}%`);
    }

    if (categoryCode) {
      query.andWhere('category.code', categoryCode);
    }

    if (subcategoryCode) {
      query.andWhere('subcategory.code', subcategoryCode);
    }

    return query;
  }

  async countAll(filters = {}) {
    const { search, categoryCode, subcategoryCode } = filters;

    const query = this.database('catalog_items as item')
      .innerJoin('catalog_subcategories as subcategory', 'subcategory.id', 'item.subcategory_id')
      .innerJoin('catalog_categories as category', 'category.id', 'subcategory.category_id')
      .countDistinct({ total: 'item.id' })
      .first();

    if (search) {
      query.whereILike('item.name', `%${search}%`);
    }

    if (categoryCode) {
      query.andWhere('category.code', categoryCode);
    }

    if (subcategoryCode) {
      query.andWhere('subcategory.code', subcategoryCode);
    }

    const result = await query;

    return Number(result?.total || 0);
  }
}

module.exports = {
  CatalogItemsRepository
};
