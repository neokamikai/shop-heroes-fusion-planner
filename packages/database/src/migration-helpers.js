const { getSchemaName, withSchema } = require('./schema');

function createScopedTable(knex, tableName, builder) {
  const schemaName = getSchemaName();

  return knex.schema.withSchema(schemaName).createTable(tableName, builder);
}

function dropScopedTable(knex, tableName) {
  const schemaName = getSchemaName();

  return knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}

function addUuidPrimaryKey(table) {
  table.uuid('id').primary();
}

function addTimestamps(table) {
  table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(table.client.raw('CURRENT_TIMESTAMP'));
  table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(table.client.raw('CURRENT_TIMESTAMP'));
}

function addForeignUuid(table, columnName, targetTableName, options = {}) {
  const { nullable = false } = options;
  const column = table.uuid(columnName);

  if (!nullable) {
    column.notNullable();
  }

  column.references('id').inTable(withSchema(targetTableName));

  return column;
}

module.exports = {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
};
