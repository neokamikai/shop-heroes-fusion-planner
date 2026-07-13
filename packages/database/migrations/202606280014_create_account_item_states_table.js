const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_item_states', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'item_id', 'catalog_items');
    table.boolean('owned_blueprint').notNullable().defaultTo(false);
    table.boolean('craft_unlocked').notNullable().defaultTo(false);
    table.unique(['account_id', 'item_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_item_states');
};

