const { getDatabaseClient } = require('@shop-heroes-planner/database');

const { env } = require('../config/env');
const { createEmailService } = require('./email.container');
const { EmailVerificationTokensRepository } = require('../repositories/email-verification-tokens.repository');
const { UserAuthIdentitiesRepository } = require('../repositories/user-auth-identities.repository');
const { UsersRepository } = require('../repositories/users.repository');
const { AuthService } = require('../services/auth.service');

function createAuthService() {
  const database = getDatabaseClient();

  return new AuthService({
    database,
    usersRepository: new UsersRepository(database),
    userAuthIdentitiesRepository: new UserAuthIdentitiesRepository(database),
    emailVerificationTokensRepository: new EmailVerificationTokensRepository(database),
    emailService: createEmailService(),
    appBaseUrl: env.appBaseUrl,
    emailVerificationTtlHours: env.emailVerificationTtlHours,
    jwtSecret: env.jwtSecret,
    jwtTtl: env.jwtTtl
  });
}

module.exports = {
  createAuthService
};
