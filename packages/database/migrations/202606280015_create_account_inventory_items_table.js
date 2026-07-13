const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_inventory_items', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'item_id', 'catalog_items');
    addForeignUuid(table, 'tier_id', 'catalog_tiers');
    table.integer('quantity').notNullable().defaultTo(0);
    table.unique(['account_id', 'item_id', 'tier_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_inventory_items');
};

