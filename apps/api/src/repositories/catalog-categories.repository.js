class CatalogCategoriesRepository {
  constructor(database) {
    this.database = database;
  }

  async listWithSubcategories() {
    const rows = await this.database('catalog_categories as category')
      .leftJoin('catalog_subcategories as subcategory', 'subcategory.category_id', 'category.id')
      .select(
        'category.id as category_id',
        'category.code as category_code',
        'category.name as category_name',
        'category.sort_order as category_sort_order',
        'subcategory.id as subcategory_id',
        'subcategory.code as subcategory_code',
        'subcategory.name as subcategory_name',
        'subcategory.sort_order as subcategory_sort_order'
      )
      .orderBy('category.sort_order', 'asc')
      .orderBy('subcategory.sort_order', 'asc');

    const categories = new Map();

    for (const row of rows) {
      if (!categories.has(row.category_id)) {
        categories.set(row.category_id, {
          id: row.category_id,
          code: row.category_code,
          name: row.category_name,
          sortOrder: row.category_sort_order,
          subcategories: []
        });
      }

      if (row.subcategory_id) {
        categories.get(row.category_id).subcategories.push({
          id: row.subcategory_id,
          code: row.subcategory_code,
          name: row.subcategory_name,
          sortOrder: row.subcategory_sort_order
        });
      }
    }

    return [...categories.values()];
  }
}

module.exports = {
  CatalogCategoriesRepository
};

