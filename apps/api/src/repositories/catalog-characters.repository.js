class CatalogCharactersRepository {
  constructor(database) {
    this.database = database;
  }

  async listAll() {
    return this.database('catalog_characters')
      .select('id', 'code', 'name', 'sort_order as sortOrder')
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc');
  }

  async findById(characterId) {
    return this.database('catalog_characters')
      .select('id', 'code', 'name')
      .where('id', characterId)
      .first();
  }
}

module.exports = {
  CatalogCharactersRepository
};
