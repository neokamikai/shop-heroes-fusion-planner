class UserAuthIdentitiesRepository {
  constructor(database) {
    this.database = database;
  }

  async create(payload) {
    const [row] = await this.database('user_auth_identities')
      .insert(payload)
      .returning([
        'id',
        'user_id as userId',
        'provider',
        'provider_user_id as providerUserId',
        'provider_email as providerEmail',
        'password_hash as passwordHash',
        'email_verified_at as emailVerifiedAt',
        'last_signed_in_at as lastSignedInAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }

  async findByProviderAndProviderUserId(provider, providerUserId) {
    return this.database('user_auth_identities')
      .select(
        'id',
        'user_id as userId',
        'provider',
        'provider_user_id as providerUserId',
        'provider_email as providerEmail',
        'password_hash as passwordHash',
        'email_verified_at as emailVerifiedAt',
        'last_signed_in_at as lastSignedInAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .where({
        provider,
        provider_user_id: providerUserId
      })
      .first();
  }

  async findByUserIdAndProvider(userId, provider) {
    return this.database('user_auth_identities')
      .select(
        'id',
        'user_id as userId',
        'provider',
        'provider_user_id as providerUserId',
        'provider_email as providerEmail',
        'password_hash as passwordHash',
        'email_verified_at as emailVerifiedAt',
        'last_signed_in_at as lastSignedInAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .where({
        user_id: userId,
        provider
      })
      .first();
  }

  async touchLastSignedIn(identityId, signedInAt) {
    const [row] = await this.database('user_auth_identities')
      .where('id', identityId)
      .update({
        last_signed_in_at: signedInAt,
        updated_at: this.database.fn.now()
      })
      .returning([
        'id',
        'user_id as userId',
        'provider',
        'provider_user_id as providerUserId',
        'provider_email as providerEmail',
        'password_hash as passwordHash',
        'email_verified_at as emailVerifiedAt',
        'last_signed_in_at as lastSignedInAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }

  async markEmailVerified(identityId, verifiedAt) {
    const [row] = await this.database('user_auth_identities')
      .where('id', identityId)
      .update({
        email_verified_at: verifiedAt,
        updated_at: this.database.fn.now()
      })
      .returning([
        'id',
        'user_id as userId',
        'provider',
        'provider_user_id as providerUserId',
        'provider_email as providerEmail',
        'password_hash as passwordHash',
        'email_verified_at as emailVerifiedAt',
        'last_signed_in_at as lastSignedInAt',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    return row;
  }
}

module.exports = {
  UserAuthIdentitiesRepository
};
