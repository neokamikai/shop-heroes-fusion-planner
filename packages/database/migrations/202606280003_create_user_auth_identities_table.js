const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'user_auth_identities', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'user_id', 'users');
    table.text('provider').notNullable();
    table.text('provider_user_id').notNullable();
    table.text('provider_email').nullable();
    table.unique(['provider', 'provider_user_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'user_auth_identities');
};

