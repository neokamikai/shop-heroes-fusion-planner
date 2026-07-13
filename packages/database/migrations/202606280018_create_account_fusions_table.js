const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_fusions', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'item_id', 'catalog_items');
    addForeignUuid(table, 'from_tier_id', 'catalog_tiers');
    addForeignUuid(table, 'to_tier_id', 'catalog_tiers');
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_fusions');
};
