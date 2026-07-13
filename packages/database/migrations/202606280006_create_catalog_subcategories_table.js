const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'catalog_subcategories', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'category_id', 'catalog_categories');
    table.text('code').notNullable();
    table.text('name').notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.unique(['category_id', 'code']);
    table.unique(['category_id', 'name']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'catalog_subcategories');
};

