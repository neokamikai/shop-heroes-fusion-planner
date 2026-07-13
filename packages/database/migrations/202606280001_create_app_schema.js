const { getSchemaName } = require('../src/schema');

exports.up = async function up(knex) {
  const schemaName = getSchemaName();

  await knex.raw('CREATE SCHEMA IF NOT EXISTS ??', [schemaName]);
};

exports.down = async function down(knex) {
  const schemaName = getSchemaName();

  await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schemaName]);
};

