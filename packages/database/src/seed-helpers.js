const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getSchemaName, withSchema } = require('./schema');

function makeDeterministicUuid(seed) {
  const hex = crypto.createHash('md5').update(String(seed)).digest('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

function getSchemaTable(tableName) {
  return withSchema(tableName);
}

async function truncateScopedTables(knex, tableNames) {
  if (!tableNames.length) return;

  await knex.raw(
    `TRUNCATE TABLE ${tableNames.map(() => '??').join(', ')} RESTART IDENTITY CASCADE`,
    tableNames.map(getSchemaTable)
  );
}

function titleCaseWords(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function loadRippedCatalogItems() {
  const filePath = path.resolve(__dirname, '../../../../__ripped/shop-heroes-items.json');
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return Array.isArray(payload?.items) ? payload.items : [];
}

function getScopedQuery(knex, tableName) {
  return knex.withSchema(getSchemaName())(tableName);
}

module.exports = {
  getSchemaTable,
  getScopedQuery,
  loadRippedCatalogItems,
  makeDeterministicUuid,
  titleCaseWords,
  truncateScopedTables
};
