class AccountCharacterStatesRepository {
  constructor(database) {
    this.database = database;
  }

  async createMany(payload) {
    if (!payload.length) {
      return [];
    }

    return this.database('account_character_states')
      .insert(payload)
      .onConflict(['account_id', 'character_id'])
      .ignore()
      .returning(['id', 'account_id as accountId', 'character_id as characterId']);
  }

  async listForAccount(accountId) {
    return this.database('account_character_states as character_state')
      .innerJoin('catalog_characters as character', 'character.id', 'character_state.character_id')
      .select(
        'character_state.id',
        'character_state.account_id as accountId',
        'character_state.character_id as characterId',
        'character_state.is_unlocked as isUnlocked',
        'character_state.level',
        'character.id as catalogCharacterId',
        'character.code as characterCode',
        'character.name as characterName',
        'character.sort_order as characterSortOrder'
      )
      .where('character_state.account_id', accountId)
      .orderBy('character.sort_order', 'asc')
      .orderBy('character.name', 'asc');
  }

  async upsert(payload) {
    return this.database('account_character_states')
      .insert(payload)
      .onConflict(['account_id', 'character_id'])
      .merge({
        is_unlocked: payload.is_unlocked,
        level: payload.level,
        updated_at: this.database.fn.now()
      })
      .returning(['id', 'account_id as accountId', 'character_id as characterId']);
  }
}

module.exports = {
  AccountCharacterStatesRepository
};
