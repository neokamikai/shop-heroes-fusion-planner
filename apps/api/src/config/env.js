const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../../../.env')
});

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPort: Number(process.env.API_PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'shop-heroes-planner-dev-secret-change-me',
  jwtTtl: process.env.JWT_TTL || '8h',
  emailVerificationTtlHours: Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24),
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply@shop-heroes-planner.local',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Shop Heroes Planner',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 0),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  llmBaseUrl: process.env.LLM_BASE_URL || '',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || '',
  llmTemperature: Number(process.env.LLM_TEMPERATURE || 0.2)
};

module.exports = {
  env
};
