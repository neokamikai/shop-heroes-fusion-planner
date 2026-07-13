const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'game_accounts', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'user_id', 'users');
    table.text('name').notNullable();
    table.text('platform').notNullable();
    table.text('notes').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'game_accounts');
};

