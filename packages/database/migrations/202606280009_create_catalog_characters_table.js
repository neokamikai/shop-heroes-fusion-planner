const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'catalog_characters', (table) => {
    addUuidPrimaryKey(table);
    table.text('code').notNullable().unique();
    table.text('name').notNullable().unique();
    table.integer('sort_order').notNullable().defaultTo(0);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'catalog_characters');
};

