const express = require('express');

const { createAccountsService } = require('../containers/accounts.container');
const { createAssistantService } = require('../containers/assistant.container');
const { requireAuthenticatedUser } = require('../middlewares/authentication');
const { readRequiredString } = require('../utils/request-parsers');

const assistantRouter = express.Router();
const accountsService = createAccountsService();
const assistantService = createAssistantService();

assistantRouter.use(requireAuthenticatedUser);

assistantRouter.post('/chat', async (request, response, next) => {
  try {
    const accountId = readRequiredString(request.body.accountId, 'accountId');
    const prompt = readRequiredString(request.body.prompt, 'prompt');
    const snapshot = await accountsService.getPlannerSnapshot(accountId, request.auth.user.id);
    const assistantResponse = await assistantService.generateResponse({
      account: snapshot.account,
      snapshot,
      prompt,
      localSessionDescriptor: request.body.localSessionDescriptor || null,
      localPlannerOverview: request.body.localPlannerOverview || null
    });

    response.json(assistantResponse);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  assistantRouter
};
