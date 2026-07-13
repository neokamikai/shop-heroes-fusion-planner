const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../../.env')
});

function readRequiredEnv(name, fallbackValue) {
  const value = process.env[name] || fallbackValue;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

module.exports = {
  readRequiredEnv
};

