const { getSchemaName } = require('../src/schema');

exports.up = async function up(knex) {
  const schema = getSchemaName();
  const hasColumn = await knex.schema.withSchema(schema).hasColumn('user_auth_identities', 'email_verified_at');

  if (!hasColumn) {
    await knex.schema.withSchema(schema).alterTable('user_auth_identities', (table) => {
      table.timestamp('email_verified_at', { useTz: true }).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const schema = getSchemaName();
  const hasColumn = await knex.schema.withSchema(schema).hasColumn('user_auth_identities', 'email_verified_at');

  if (hasColumn) {
    await knex.schema.withSchema(schema).alterTable('user_auth_identities', (table) => {
      table.dropColumn('email_verified_at');
    });
  }
};
