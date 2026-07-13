const { getDatabaseClient } = require('@shop-heroes-planner/database');

const { CatalogCharactersRepository } = require('../repositories/catalog-characters.repository');
const { CatalogCategoriesRepository } = require('../repositories/catalog-categories.repository');
const { CatalogItemsRepository } = require('../repositories/catalog-items.repository');
const { CatalogSettingDefinitionsRepository } = require('../repositories/catalog-setting-definitions.repository');
const { CatalogTiersRepository } = require('../repositories/catalog-tiers.repository');
const { CatalogService } = require('../services/catalog.service');

function createCatalogService() {
  const database = getDatabaseClient();

  return new CatalogService({
    charactersRepository: new CatalogCharactersRepository(database),
    categoriesRepository: new CatalogCategoriesRepository(database),
    tiersRepository: new CatalogTiersRepository(database),
    itemsRepository: new CatalogItemsRepository(database),
    settingDefinitionsRepository: new CatalogSettingDefinitionsRepository(database)
  });
}

module.exports = {
  createCatalogService
};
