const { ApiError } = require('../errors/api-error');

function readRequiredString(value, fieldName) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new ApiError(400, `${fieldName} is required.`, 'validation_error');
  }

  return normalized;
}

function readOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function readOptionalBoolean(value, fallbackValue) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallbackValue;
}

function readRequiredInteger(value, fieldName, options = {}) {
  const { min = Number.NEGATIVE_INFINITY } = options;
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min) {
    throw new ApiError(400, `${fieldName} must be an integer${Number.isFinite(min) ? ` >= ${min}` : ''}.`, 'validation_error');
  }

  return parsed;
}

function readOptionalStringEnum(value, fieldName, allowedValues, fallbackValue = undefined) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallbackValue;
  }

  const normalized = String(value).trim();

  if (!allowedValues.includes(normalized)) {
    throw new ApiError(400, `${fieldName} must be one of: ${allowedValues.join(', ')}.`, 'validation_error');
  }

  return normalized;
}

module.exports = {
  readOptionalBoolean,
  readOptionalStringEnum,
  readOptionalString,
  readRequiredInteger,
  readRequiredString
};
