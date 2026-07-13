const express = require('express');

const { createAccountsService } = require('../containers/accounts.container');
const { requireAuthenticatedUser } = require('../middlewares/authentication');

const accountsRouter = express.Router();
const accountsService = createAccountsService();

accountsRouter.use(requireAuthenticatedUser);

accountsRouter.post('/', async (request, response, next) => {
  try {
    const account = await accountsService.createAccount(request.body, request.auth.user.id);
    response.status(201).json(account);
  } catch (error) {
    next(error);
  }
});

accountsRouter.post('/bootstrap', async (request, response, next) => {
  try {
    const snapshot = await accountsService.bootstrapAccount(request.body, request.auth.user.id);
    response.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/', async (request, response, next) => {
  try {
    const accounts = await accountsService.listAccounts(request.auth.user.id);
    response.json(accounts);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId', async (request, response, next) => {
  try {
    const account = await accountsService.getAccount(request.params.accountId, request.auth.user.id);
    response.json(account);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/settings', async (request, response, next) => {
  try {
    const settings = await accountsService.listAccountSettings(request.params.accountId, request.auth.user.id);
    response.json(settings);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/mcp-binding', async (request, response, next) => {
  try {
    const binding = await accountsService.getAccountMcpBinding(request.params.accountId, request.auth.user.id);
    response.json(binding);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/mcp-binding', async (request, response, next) => {
  try {
    const binding = await accountsService.updateAccountMcpBinding(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(binding);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/characters', async (request, response, next) => {
  try {
    const characters = await accountsService.listAccountCharacters(request.params.accountId, request.auth.user.id);
    response.json(characters);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/characters', async (request, response, next) => {
  try {
    const characters = await accountsService.upsertAccountCharacterState(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(characters);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/item-states', async (request, response, next) => {
  try {
    const itemStates = await accountsService.listAccountItemStates(request.params.accountId, request.auth.user.id);
    response.json(itemStates);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/inventory', async (request, response, next) => {
  try {
    const inventory = await accountsService.listAccountInventory(request.params.accountId, request.auth.user.id);
    response.json(inventory);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/item-states', async (request, response, next) => {
  try {
    const itemStates = await accountsService.upsertAccountItemState(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(itemStates);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/item-states-bulk', async (request, response, next) => {
  try {
    const itemStates = await accountsService.bulkUpsertAccountItemStates(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(itemStates);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/inventory', async (request, response, next) => {
  try {
    const inventory = await accountsService.upsertAccountInventoryItem(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(inventory);
  } catch (error) {
    next(error);
  }
});

accountsRouter.put('/:accountId/inventory-bulk', async (request, response, next) => {
  try {
    const inventory = await accountsService.bulkUpsertAccountInventory(
      request.params.accountId,
      request.body,
      request.auth.user.id
    );
    response.json(inventory);
  } catch (error) {
    next(error);
  }
});

accountsRouter.post('/:accountId/targets', async (request, response, next) => {
  try {
    const snapshot = await accountsService.createTarget(request.params.accountId, request.body, request.auth.user.id);
    response.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.patch('/:accountId/targets/:targetId', async (request, response, next) => {
  try {
    const snapshot = await accountsService.updateTarget(
      request.params.accountId,
      request.params.targetId,
      request.body,
      request.auth.user.id
    );
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.delete('/:accountId/targets/:targetId', async (request, response, next) => {
  try {
    const snapshot = await accountsService.deleteTarget(
      request.params.accountId,
      request.params.targetId,
      request.auth.user.id
    );
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.post('/:accountId/crafts', async (request, response, next) => {
  try {
    const snapshot = await accountsService.createCraft(request.params.accountId, request.body, request.auth.user.id);
    response.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.delete('/:accountId/crafts/:craftId', async (request, response, next) => {
  try {
    const snapshot = await accountsService.deleteCraft(
      request.params.accountId,
      request.params.craftId,
      request.auth.user.id
    );
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.post('/:accountId/fusions', async (request, response, next) => {
  try {
    const snapshot = await accountsService.createFusion(request.params.accountId, request.body, request.auth.user.id);
    response.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.delete('/:accountId/fusions/:fusionId', async (request, response, next) => {
  try {
    const snapshot = await accountsService.deleteFusion(
      request.params.accountId,
      request.params.fusionId,
      request.auth.user.id
    );
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

accountsRouter.get('/:accountId/planner', async (request, response, next) => {
  try {
    const plannerSnapshot = await accountsService.getPlannerSnapshot(request.params.accountId, request.auth.user.id);
    response.json(plannerSnapshot);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  accountsRouter
};
