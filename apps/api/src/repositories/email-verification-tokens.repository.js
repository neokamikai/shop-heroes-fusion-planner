class EmailVerificationTokensRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('email_verification_tokens')
      .insert(payload)
      .returning([
        'id',
        'user_auth_identity_id as userAuthIdentityId',
        'token_hash as tokenHash',
        'code_hash as codeHash',
        'expires_at as expiresAt',
        'consumed_at as consumedAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }

  async deleteByIdentityId(userAuthIdentityId) {
    return this.database('email_verification_tokens')
      .where('user_auth_identity_id', userAuthIdentityId)
      .del();
  }

  async findActiveByTokenHash(tokenHash) {
    return this.database('email_verification_tokens')
      .select(
        'id',
        'user_auth_identity_id as userAuthIdentityId',
        'token_hash as tokenHash',
        'code_hash as codeHash',
        'expires_at as expiresAt',
        'consumed_at as consumedAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .where('token_hash', tokenHash)
      .whereNull('consumed_at')
      .first();
  }

  async findActiveByIdentityId(userAuthIdentityId) {
    return this.database('email_verification_tokens')
      .select(
        'id',
        'user_auth_identity_id as userAuthIdentityId',
        'token_hash as tokenHash',
        'code_hash as codeHash',
        'expires_at as expiresAt',
        'consumed_at as consumedAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .where('user_auth_identity_id', userAuthIdentityId)
      .whereNull('consumed_at')
      .orderBy('created_at', 'desc')
      .first();
  }

  async consume(tokenId, consumedAt) {
    const [row] = await this.database('email_verification_tokens')
      .where('id', tokenId)
      .update({
        consumed_at: consumedAt,
        updated_at: this.database.fn.now()
      })
      .returning([
        'id',
        'user_auth_identity_id as userAuthIdentityId',
        'token_hash as tokenHash',
        'code_hash as codeHash',
        'expires_at as expiresAt',
        'consumed_at as consumedAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }
}

module.exports = {
  EmailVerificationTokensRepository
};
