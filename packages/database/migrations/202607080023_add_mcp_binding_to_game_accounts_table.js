const { getSchemaName } = require('../src/schema');

exports.up = async function up(knex) {
  const schemaName = getSchemaName();

  await knex.schema.withSchema(schemaName).alterTable('game_accounts', (table) => {
    table.text('mcp_binding_mode').nullable();
    table.text('mcp_account_external_id').nullable();
    table.text('mcp_account_display_name').nullable();
    table.text('mcp_installation_id').nullable();
    table.text('mcp_installation_type').nullable();
    table.text('mcp_installation_label').nullable();
    table.text('mcp_last_session_id').nullable();
    table.timestamp('mcp_last_session_started_at', { useTz: true }).nullable();
    table.timestamp('mcp_last_session_seen_at', { useTz: true }).nullable();
  });

  await knex.schema.withSchema(schemaName).alterTable('game_accounts', (table) => {
    table.index(['mcp_account_external_id'], 'game_accounts_mcp_account_external_id_idx');
    table.index(['mcp_installation_id'], 'game_accounts_mcp_installation_id_idx');
  });
};

exports.down = async function down(knex) {
  const schemaName = getSchemaName();

  await knex.schema.withSchema(schemaName).alterTable('game_accounts', (table) => {
    table.dropIndex(['mcp_account_external_id'], 'game_accounts_mcp_account_external_id_idx');
    table.dropIndex(['mcp_installation_id'], 'game_accounts_mcp_installation_id_idx');
  });

  await knex.schema.withSchema(schemaName).alterTable('game_accounts', (table) => {
    table.dropColumn('mcp_binding_mode');
    table.dropColumn('mcp_account_external_id');
    table.dropColumn('mcp_account_display_name');
    table.dropColumn('mcp_installation_id');
    table.dropColumn('mcp_installation_type');
    table.dropColumn('mcp_installation_label');
    table.dropColumn('mcp_last_session_id');
    table.dropColumn('mcp_last_session_started_at');
    table.dropColumn('mcp_last_session_seen_at');
  });
};
