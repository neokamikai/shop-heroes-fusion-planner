const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'users', (table) => {
    addUuidPrimaryKey(table);
    table.text('display_name').notNullable();
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'users');
};

