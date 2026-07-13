const crypto = require('crypto');

const { ApiError } = require('../errors/api-error');
const { readRequiredString } = require('../utils/request-parsers');
const {
  PASSWORD_PROVIDER,
  createAccessToken,
  createNumericCode,
  createOpaqueToken,
  hashPassword,
  hashOpaqueToken,
  normalizeEmail,
  verifyAccessToken,
  verifyPassword
} = require('../utils/auth');

class AuthService {
  constructor({
    database,
    usersRepository,
    userAuthIdentitiesRepository,
    emailVerificationTokensRepository,
    emailService,
    appBaseUrl,
    emailVerificationTtlHours,
    jwtSecret,
    jwtTtl
  }) {
    this.database = database;
    this.usersRepository = usersRepository;
    this.userAuthIdentitiesRepository = userAuthIdentitiesRepository;
    this.emailVerificationTokensRepository = emailVerificationTokensRepository;
    this.emailService = emailService;
    this.appBaseUrl = appBaseUrl;
    this.emailVerificationTtlHours = emailVerificationTtlHours;
    this.jwtSecret = jwtSecret;
    this.jwtTtl = jwtTtl;
  }

  async signUp(rawPayload = {}) {
    const displayName = readRequiredString(rawPayload.displayName, 'displayName');
    const email = normalizeEmail(readRequiredString(rawPayload.email, 'email'));
    const password = readRequiredString(rawPayload.password, 'password');

    this.validateEmail(email);
    this.validatePassword(password);

    const existingIdentity = await this.userAuthIdentitiesRepository.findByProviderAndProviderUserId(
      PASSWORD_PROVIDER,
      email
    );

    if (existingIdentity) {
      throw new ApiError(409, 'An account already exists for this email.', 'email_already_registered');
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const verificationToken = createOpaqueToken();
    const verificationCode = createNumericCode(6);
    const verificationTokenHash = hashOpaqueToken(verificationToken);
    const verificationCodeHash = hashOpaqueToken(verificationCode);
    const verificationExpiresAt = new Date(
      Date.now() + (this.emailVerificationTtlHours * 60 * 60 * 1000)
    ).toISOString();
    let authResult = null;

    await this.database.transaction(async (transaction) => {
      const { UsersRepository } = require('../repositories/users.repository');
      const { EmailVerificationTokensRepository } = require('../repositories/email-verification-tokens.repository');
      const { UserAuthIdentitiesRepository } = require('../repositories/user-auth-identities.repository');

      const transactionEmailVerificationTokensRepository = new EmailVerificationTokensRepository(transaction);
      const transactionUsersRepository = new UsersRepository(transaction);
      const transactionUserAuthIdentitiesRepository = new UserAuthIdentitiesRepository(transaction);

      const user = await transactionUsersRepository.create({
        id: crypto.randomUUID(),
        display_name: displayName
      });

      const identity = await transactionUserAuthIdentitiesRepository.create({
        id: crypto.randomUUID(),
        user_id: user.id,
        provider: PASSWORD_PROVIDER,
        provider_user_id: email,
        provider_email: email,
        password_hash: passwordHash,
        email_verified_at: null,
        last_signed_in_at: now
      });

      await transactionEmailVerificationTokensRepository.create({
        id: crypto.randomUUID(),
        user_auth_identity_id: identity.id,
        token_hash: verificationTokenHash,
        code_hash: verificationCodeHash,
        expires_at: verificationExpiresAt,
        consumed_at: null
      });

      authResult = {
        accessToken: this.createAccessTokenForUser(user, identity),
        user: this.presentAuthenticatedUser(user, identity)
      };
    });

    await this.sendVerificationEmail({
      displayName,
      email,
      verificationToken,
      verificationCode
    });

    return authResult;
  }

  async signIn(rawPayload = {}) {
    const email = normalizeEmail(readRequiredString(rawPayload.email, 'email'));
    const password = readRequiredString(rawPayload.password, 'password');

    this.validateEmail(email);

    const identity = await this.userAuthIdentitiesRepository.findByProviderAndProviderUserId(
      PASSWORD_PROVIDER,
      email
    );

    if (!identity?.passwordHash) {
      throw new ApiError(401, 'Invalid email or password.', 'invalid_credentials');
    }

    const isPasswordValid = await verifyPassword(password, identity.passwordHash);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid email or password.', 'invalid_credentials');
    }

    const user = await this.usersRepository.findById(identity.userId);

    if (!user) {
      throw new ApiError(401, 'Account could not be resolved.', 'user_not_found');
    }

    const now = new Date().toISOString();
    const refreshedIdentity = await this.userAuthIdentitiesRepository.touchLastSignedIn(identity.id, now);

    return {
      accessToken: this.createAccessTokenForUser(user, refreshedIdentity),
      user: this.presentAuthenticatedUser(user, refreshedIdentity)
    };
  }

  async authenticateToken(accessToken) {
    if (!accessToken) {
      return null;
    }

    let payload;
    try {
      payload = verifyAccessToken(accessToken, this.jwtSecret);
    } catch {
      return null;
    }

    const user = await this.usersRepository.findById(payload.sub);

    if (!user) {
      return null;
    }

    const identity = await this.userAuthIdentitiesRepository.findByUserIdAndProvider(user.id, PASSWORD_PROVIDER);

    if (!identity) {
      return null;
    }

    return {
      user: this.presentAuthenticatedUser(user, identity)
    };
  }

  async signOut() {
    return;
  }

  async resendVerificationEmail(userId) {
    const identity = await this.userAuthIdentitiesRepository.findByUserIdAndProvider(userId, PASSWORD_PROVIDER);

    if (!identity) {
      throw new ApiError(404, 'Authentication identity not found.', 'auth_identity_not_found');
    }

    if (identity.emailVerifiedAt) {
      return {
        alreadyVerified: true
      };
    }

    const user = await this.usersRepository.findById(userId);
    const verificationToken = createOpaqueToken();
    const verificationCode = createNumericCode(6);
    const verificationTokenHash = hashOpaqueToken(verificationToken);
    const verificationCodeHash = hashOpaqueToken(verificationCode);
    const verificationExpiresAt = new Date(
      Date.now() + (this.emailVerificationTtlHours * 60 * 60 * 1000)
    ).toISOString();

    await this.database.transaction(async (transaction) => {
      const { EmailVerificationTokensRepository } = require('../repositories/email-verification-tokens.repository');
      const transactionEmailVerificationTokensRepository = new EmailVerificationTokensRepository(transaction);

      await transactionEmailVerificationTokensRepository.deleteByIdentityId(identity.id);
      await transactionEmailVerificationTokensRepository.create({
        id: crypto.randomUUID(),
        user_auth_identity_id: identity.id,
        token_hash: verificationTokenHash,
        code_hash: verificationCodeHash,
        expires_at: verificationExpiresAt,
        consumed_at: null
      });
    });

    await this.sendVerificationEmail({
      displayName: user.displayName,
      email: identity.providerEmail,
      verificationToken,
      verificationCode
    });

    return {
      alreadyVerified: false
    };
  }

  async verifyEmail(rawPayload = {}) {
    const token = readRequiredString(rawPayload.token, 'token');
    const tokenHash = hashOpaqueToken(token);
    const tokenRecord = await this.emailVerificationTokensRepository.findActiveByTokenHash(tokenHash);

    if (!tokenRecord) {
      throw new ApiError(400, 'Verification token is invalid.', 'invalid_verification_token');
    }

    if (new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(400, 'Verification token has expired.', 'expired_verification_token');
    }

    const identity = await this.database('user_auth_identities')
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
      .where('id', tokenRecord.userAuthIdentityId)
      .first();

    if (!identity) {
      throw new ApiError(404, 'Authentication identity not found.', 'auth_identity_not_found');
    }

    const verifiedAt = new Date().toISOString();
    await this.emailVerificationTokensRepository.consume(tokenRecord.id, verifiedAt);
    const verifiedIdentity = identity.emailVerifiedAt
      ? identity
      : await this.userAuthIdentitiesRepository.markEmailVerified(identity.id, verifiedAt);
    const user = await this.usersRepository.findById(verifiedIdentity.userId);

    return {
      user: this.presentAuthenticatedUser(user, verifiedIdentity)
    };
  }

  async verifyEmailCode(userId, rawPayload = {}) {
    const code = readRequiredString(rawPayload.code, 'code').replace(/\D/g, '');

    if (code.length !== 6) {
      throw new ApiError(400, 'Verification code must contain exactly 6 digits.', 'invalid_verification_code');
    }

    const identity = await this.userAuthIdentitiesRepository.findByUserIdAndProvider(userId, PASSWORD_PROVIDER);

    if (!identity) {
      throw new ApiError(404, 'Authentication identity not found.', 'auth_identity_not_found');
    }

    if (identity.emailVerifiedAt) {
      const user = await this.usersRepository.findById(identity.userId);

      return {
        alreadyVerified: true,
        user: this.presentAuthenticatedUser(user, identity)
      };
    }

    const tokenRecord = await this.emailVerificationTokensRepository.findActiveByIdentityId(identity.id);

    if (!tokenRecord) {
      throw new ApiError(400, 'Verification code is invalid.', 'invalid_verification_code');
    }

    if (new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(400, 'Verification code has expired.', 'expired_verification_code');
    }

    const codeHash = hashOpaqueToken(code);

    if (tokenRecord.codeHash !== codeHash) {
      throw new ApiError(400, 'Verification code is invalid.', 'invalid_verification_code');
    }

    const verifiedAt = new Date().toISOString();
    await this.emailVerificationTokensRepository.consume(tokenRecord.id, verifiedAt);
    const verifiedIdentity = await this.userAuthIdentitiesRepository.markEmailVerified(identity.id, verifiedAt);
    const user = await this.usersRepository.findById(verifiedIdentity.userId);

    return {
      alreadyVerified: false,
      user: this.presentAuthenticatedUser(user, verifiedIdentity)
    };
  }

  createAccessTokenForUser(user, identity) {
    return createAccessToken(
      {
        sub: user.id,
        email: identity?.providerEmail || undefined,
        displayName: user.displayName,
        emailVerified: Boolean(identity?.emailVerifiedAt)
      },
      this.jwtSecret,
      {
        expiresIn: this.jwtTtl
      }
    );
  }

  presentAuthenticatedUser(user, identity) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: identity?.providerEmail || null,
      emailVerified: Boolean(identity?.emailVerifiedAt),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async sendVerificationEmail({ displayName, email, verificationToken, verificationCode }) {
    const verificationUrl = `${this.appBaseUrl.replace(/\/$/, '')}/?verifyEmailToken=${encodeURIComponent(verificationToken)}`;
    const subject = 'Confirm your Shop Heroes Planner email';
    const textBody = [
      `Hi ${displayName},`,
      '',
      'Welcome to Shop Heroes Planner.',
      `Your verification code is: ${verificationCode}`,
      '',
      'You can type this code in the confirmation screen, or use the fallback link below:',
      verificationUrl,
      '',
      `This link expires in ${this.emailVerificationTtlHours} hour(s).`
    ].join('\n');
    const htmlBody = [
      `<p>Hi ${displayName},</p>`,
      '<p>Welcome to <strong>Shop Heroes Planner</strong>.</p>',
      `<p>Your verification code is:</p><p style="font-size: 2rem; font-weight: 800; letter-spacing: 0.4rem; margin: 0.5rem 0 1rem;">${verificationCode}</p>`,
      '<p>You can type this code in the confirmation screen, or use the fallback link below:</p>',
      `<p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
      `<p>This link expires in ${this.emailVerificationTtlHours} hour(s).</p>`
    ].join('');

    await this.emailService.sendEmail({
      to: email,
      subject,
      textBody,
      htmlBody,
      metadata: {
        kind: 'email-verification',
        verificationCode,
        verificationUrl
      }
    });
  }

  validateEmail(email) {
    if (!email || !email.includes('@')) {
      throw new ApiError(400, 'email must be a valid email address.', 'validation_error');
    }
  }

  validatePassword(password) {
    if (password.length < 8) {
      throw new ApiError(400, 'password must contain at least 8 characters.', 'validation_error');
    }
  }
}

module.exports = {
  AuthService
};
