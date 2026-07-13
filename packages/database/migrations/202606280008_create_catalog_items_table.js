const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'catalog_items', (table) => {
    addUuidPrimaryKey(table);
    table.text('external_slug').notNullable().unique();
    table.text('name').notNullable();
    addForeignUuid(table, 'subcategory_id', 'catalog_subcategories');
    table.integer('level').notNullable();
    addForeignUuid(table, 'min_tier_id', 'catalog_tiers');
    table.text('icon_url').nullable();
    table.text('blueprint_url').nullable();
    table.text('summary').nullable();
    table.text('source').notNullable().defaultTo('seed');
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'catalog_items');
};

