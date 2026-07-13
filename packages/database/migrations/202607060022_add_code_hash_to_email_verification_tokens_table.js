const { getSchemaName } = require('../src/schema');

exports.up = async function up(knex) {
  const schemaName = getSchemaName();
  const hasColumn = await knex.schema.withSchema(schemaName).hasColumn('email_verification_tokens', 'code_hash');

  if (!hasColumn) {
    await knex.schema.withSchema(schemaName).alterTable('email_verification_tokens', (table) => {
      table.text('code_hash').nullable();
    });
  }
};

exports.down = async function down(knex) {
  const schemaName = getSchemaName();
  const hasColumn = await knex.schema.withSchema(schemaName).hasColumn('email_verification_tokens', 'code_hash');

  if (hasColumn) {
    await knex.schema.withSchema(schemaName).alterTable('email_verification_tokens', (table) => {
      table.dropColumn('code_hash');
    });
  }
};
