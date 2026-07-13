class CatalogTiersRepository {
  constructor(database) {
    this.database = database;
  }

  async findById(tierId) {
    return this.database('catalog_tiers')
      .select(
        'id',
        'code',
        'name',
        'sort_order as sortOrder',
        'value_multiplier as valueMultiplier',
        'previous_tier_count_required as previousTierCountRequired'
      )
      .where('id', tierId)
      .first();
  }

  async listAll() {
    return this.database('catalog_tiers')
      .select(
        'id',
        'code',
        'name',
        'sort_order as sortOrder',
        'value_multiplier as valueMultiplier',
        'previous_tier_count_required as previousTierCountRequired'
      )
      .orderBy('sort_order', 'asc');
  }
}

module.exports = {
  CatalogTiersRepository
};

