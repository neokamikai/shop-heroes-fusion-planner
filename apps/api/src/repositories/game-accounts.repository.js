class GameAccountsRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('game_accounts')
      .insert(payload)
      .returning([
        'id',
        'user_id as userId',
        'name',
        'platform',
        'notes',
        'is_active as isActive',
        'mcp_binding_mode as mcpBindingMode',
        'mcp_account_external_id as mcpAccountExternalId',
        'mcp_account_display_name as mcpAccountDisplayName',
        'mcp_installation_id as mcpInstallationId',
        'mcp_installation_type as mcpInstallationType',
        'mcp_installation_label as mcpInstallationLabel',
        'mcp_last_session_id as mcpLastSessionId',
        'mcp_last_session_started_at as mcpLastSessionStartedAt',
        'mcp_last_session_seen_at as mcpLastSessionSeenAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }

  async listByUserId(userId) {
    return this.database('game_accounts as account')
      .leftJoin('users as user', 'user.id', 'account.user_id')
      .select(
        'account.id',
        'account.user_id as userId',
        'account.name',
        'account.platform',
        'account.notes',
        'account.is_active as isActive',
        'account.mcp_binding_mode as mcpBindingMode',
        'account.mcp_account_external_id as mcpAccountExternalId',
        'account.mcp_account_display_name as mcpAccountDisplayName',
        'account.mcp_installation_id as mcpInstallationId',
        'account.mcp_installation_type as mcpInstallationType',
        'account.mcp_installation_label as mcpInstallationLabel',
        'account.mcp_last_session_id as mcpLastSessionId',
        'account.mcp_last_session_started_at as mcpLastSessionStartedAt',
        'account.mcp_last_session_seen_at as mcpLastSessionSeenAt',
        'account.created_at as createdAt',
        'account.updated_at as updatedAt',
        'user.display_name as userDisplayName'
      )
      .where('account.user_id', userId)
      .orderBy('account.name', 'asc');
  }

  async findById(accountId) {
    return this.findByIdAndUserId(accountId, undefined);
  }

  async findByIdAndUserId(accountId, userId) {
    const query = this.database('game_accounts as account')
      .leftJoin('users as user', 'user.id', 'account.user_id')
      .select(
        'account.id',
        'account.user_id as userId',
        'account.name',
        'account.platform',
        'account.notes',
        'account.is_active as isActive',
        'account.mcp_binding_mode as mcpBindingMode',
        'account.mcp_account_external_id as mcpAccountExternalId',
        'account.mcp_account_display_name as mcpAccountDisplayName',
        'account.mcp_installation_id as mcpInstallationId',
        'account.mcp_installation_type as mcpInstallationType',
        'account.mcp_installation_label as mcpInstallationLabel',
        'account.mcp_last_session_id as mcpLastSessionId',
        'account.mcp_last_session_started_at as mcpLastSessionStartedAt',
        'account.mcp_last_session_seen_at as mcpLastSessionSeenAt',
        'account.created_at as createdAt',
        'account.updated_at as updatedAt',
        'user.display_name as userDisplayName'
      )
      .where('account.id', accountId);

    if (userId) {
      query.andWhere('account.user_id', userId);
    }

    return query.first();
  }

  async findByNameForUser(userId, accountName) {
    return this.database('game_accounts as account')
      .leftJoin('users as user', 'user.id', 'account.user_id')
      .select(
        'account.id',
        'account.user_id as userId',
        'account.name',
        'account.platform',
        'account.notes',
        'account.is_active as isActive',
        'account.mcp_binding_mode as mcpBindingMode',
        'account.mcp_account_external_id as mcpAccountExternalId',
        'account.mcp_account_display_name as mcpAccountDisplayName',
        'account.mcp_installation_id as mcpInstallationId',
        'account.mcp_installation_type as mcpInstallationType',
        'account.mcp_installation_label as mcpInstallationLabel',
        'account.mcp_last_session_id as mcpLastSessionId',
        'account.mcp_last_session_started_at as mcpLastSessionStartedAt',
        'account.mcp_last_session_seen_at as mcpLastSessionSeenAt',
        'account.created_at as createdAt',
        'account.updated_at as updatedAt',
        'user.display_name as userDisplayName'
      )
      .where({
        'account.user_id': userId,
        'account.name': accountName
      })
      .first();
  }

  async updateByIdAndUserId(accountId, userId, payload) {
    const [row] = await this.database('game_accounts')
      .where({
        id: accountId,
        user_id: userId
      })
      .update({
        ...payload,
        updated_at: this.database.fn.now()
      })
      .returning([
        'id',
        'user_id as userId',
        'name',
        'platform',
        'notes',
        'is_active as isActive',
        'mcp_binding_mode as mcpBindingMode',
        'mcp_account_external_id as mcpAccountExternalId',
        'mcp_account_display_name as mcpAccountDisplayName',
        'mcp_installation_id as mcpInstallationId',
        'mcp_installation_type as mcpInstallationType',
        'mcp_installation_label as mcpInstallationLabel',
        'mcp_last_session_id as mcpLastSessionId',
        'mcp_last_session_started_at as mcpLastSessionStartedAt',
        'mcp_last_session_seen_at as mcpLastSessionSeenAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row || null;
  }
}

module.exports = {
  GameAccountsRepository
};
