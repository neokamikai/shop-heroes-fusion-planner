const { env } = require('../config/env');
const { EmailService } = require('../services/email.service');

function createEmailService() {
  return new EmailService({
    appBaseUrl: env.appBaseUrl,
    emailFromAddress: env.emailFromAddress,
    emailFromName: env.emailFromName,
    smtpHost: env.smtpHost,
    smtpPort: env.smtpPort,
    smtpSecure: env.smtpSecure,
    smtpUser: env.smtpUser,
    smtpPassword: env.smtpPassword
  });
}

module.exports = {
  createEmailService
};
