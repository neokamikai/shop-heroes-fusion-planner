const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_crafts', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'item_id', 'catalog_items');
    addForeignUuid(table, 'target_id', 'account_targets', { nullable: true });
    addForeignUuid(table, 'character_id', 'catalog_characters', { nullable: true });
    addForeignUuid(table, 'planned_target_tier_id', 'catalog_tiers');
    addForeignUuid(table, 'base_tier_id', 'catalog_tiers');
    table.text('source').notNullable();
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_crafts');
};

