const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_settings', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'setting_definition_id', 'catalog_setting_definitions');
    table.text('setting_value').nullable();
    table.unique(['account_id', 'setting_definition_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_settings');
};

