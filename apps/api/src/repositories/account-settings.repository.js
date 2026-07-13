class AccountSettingsRepository {
  constructor(database) {
    this.database = database;
  }

  async createMany(payloads) {
    if (!payloads.length) return [];

    return this.database('account_settings')
      .insert(payloads)
      .onConflict(['account_id', 'setting_definition_id'])
      .ignore()
      .returning([
        'id',
        'account_id as accountId',
        'setting_definition_id as settingDefinitionId',
        'setting_value as settingValue',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);
  }

  async listForAccount(accountId) {
    return this.database('account_settings as account_setting')
      .innerJoin(
        'catalog_setting_definitions as definition',
        'definition.id',
        'account_setting.setting_definition_id'
      )
      .select(
        'account_setting.id',
        'account_setting.account_id as accountId',
        'account_setting.setting_definition_id as settingDefinitionId',
        'account_setting.setting_value as settingValue',
        'definition.key',
        'definition.value_type as valueType',
        'definition.default_value as defaultValue',
        'definition.description'
      )
      .where('account_setting.account_id', accountId)
      .orderBy('definition.key', 'asc');
  }
}

module.exports = {
  AccountSettingsRepository
};
