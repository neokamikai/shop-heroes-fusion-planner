const express = require('express');

const { createAccountsService } = require('../containers/accounts.container');

const usersRouter = express.Router();
const accountsService = createAccountsService();

usersRouter.post('/', async (request, response, next) => {
  try {
    const user = await accountsService.createUser(request.body);
    response.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  usersRouter
};

