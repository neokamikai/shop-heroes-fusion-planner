class UsersRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('users')
      .insert(payload)
      .returning(['id', 'display_name as displayName', 'created_at as createdAt', 'updated_at as updatedAt']);

    return row;
  }

  async findById(userId) {
    return this.database('users')
      .select('id', 'display_name as displayName', 'created_at as createdAt', 'updated_at as updatedAt')
      .where('id', userId)
      .first();
  }

  async updateDisplayName(userId, displayName) {
    const [row] = await this.database('users')
      .where('id', userId)
      .update({
        display_name: displayName,
        updated_at: this.database.fn.now()
      })
      .returning(['id', 'display_name as displayName', 'created_at as createdAt', 'updated_at as updatedAt']);

    return row;
  }
}

module.exports = {
  UsersRepository
};
