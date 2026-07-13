const { getDatabaseClient } = require('@shop-heroes-planner/database');

const { UsersRepository } = require('../repositories/users.repository');

function createUsersRepository() {
  const database = getDatabaseClient();
  return new UsersRepository(database);
}

module.exports = {
  createUsersRepository
};

