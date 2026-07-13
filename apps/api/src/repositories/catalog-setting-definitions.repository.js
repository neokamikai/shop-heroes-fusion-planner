class CatalogSettingDefinitionsRepository {
  constructor(database) {
    this.database = database;
  }

  async listAll() {
    const rows = await this.database('catalog_setting_definitions')
      .select(
        'id',
        'key',
        'value_type as valueType',
        'default_value as defaultValue',
        'description'
      )
      .orderBy('key', 'asc');

    return rows;
  }
}

module.exports = {
  CatalogSettingDefinitionsRepository
};

