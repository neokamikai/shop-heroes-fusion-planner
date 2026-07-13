const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_targets', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'character_id', 'catalog_characters');
    addForeignUuid(table, 'item_id', 'catalog_items');
    addForeignUuid(table, 'target_tier_id', 'catalog_tiers');
    table.integer('quantity').notNullable().defaultTo(1);
    table.integer('priority').notNullable();
    table.boolean('is_completed').notNullable().defaultTo(false);
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.unique(['account_id', 'item_id', 'target_tier_id', 'priority']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_targets');
};

