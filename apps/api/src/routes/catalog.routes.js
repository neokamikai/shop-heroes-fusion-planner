const express = require('express');

const { createCatalogService } = require('../containers/catalog.container');

const catalogRouter = express.Router();
const catalogService = createCatalogService();

catalogRouter.get('/characters', async (_request, response, next) => {
  try {
    const characters = await catalogService.listCharacters();
    response.json(characters);
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/categories', async (_request, response, next) => {
  try {
    const categories = await catalogService.listCategories();
    response.json(categories);
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/tiers', async (_request, response, next) => {
  try {
    const tiers = await catalogService.listTiers();
    response.json(tiers);
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/items', async (request, response, next) => {
  try {
    const items = await catalogService.listItems(request.query);
    response.json(items);
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/setting-definitions', async (_request, response, next) => {
  try {
    const settingDefinitions = await catalogService.listSettingDefinitions();
    response.json(settingDefinitions);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  catalogRouter
};
