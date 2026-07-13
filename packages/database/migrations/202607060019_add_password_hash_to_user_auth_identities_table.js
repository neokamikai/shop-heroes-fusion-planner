const { getSchemaName } = require('../src/schema');

exports.up = async function up(knex) {
  const schema = getSchemaName();
  const hasColumn = await knex.schema.withSchema(schema).hasColumn('user_auth_identities', 'password_hash');

  if (!hasColumn) {
    await knex.schema.withSchema(schema).alterTable('user_auth_identities', (table) => {
      table.text('password_hash').nullable();
      table.timestamp('last_signed_in_at', { useTz: true }).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const schema = getSchemaName();
  const hasPasswordHashColumn = await knex.schema.withSchema(schema).hasColumn('user_auth_identities', 'password_hash');

  if (hasPasswordHashColumn) {
    await knex.schema.withSchema(schema).alterTable('user_auth_identities', (table) => {
      table.dropColumn('last_signed_in_at');
      table.dropColumn('password_hash');
    });
  }
};
