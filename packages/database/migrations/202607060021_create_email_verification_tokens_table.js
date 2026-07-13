const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'email_verification_tokens', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'user_auth_identity_id', 'user_auth_identities');
    table.text('token_hash').notNullable().unique();
    table.text('code_hash').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'email_verification_tokens');
};
