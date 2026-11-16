import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { REDIS_CLIENT } from '../redis/redis.module';

const ISSUER = 'Archie';
const CHALLENGE_TTL_SECONDS = 5 * 60;
const SECRET_BYTES = 20;

const challengeKey = (token: string) => `2fa:challenge:${token}`;

@Injectable()
export class TwoFactorService {
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey = Buffer.from(
      this.configService.getOrThrow<string>('auth.totpEncryptionKey'),
      'base64',
    );
    if (this.encryptionKey.length !== 32) {
      throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    }
    // also accept the code of the time step before and after
    authenticator.options = { window: 1 };
  }

  // returns the secret encrypted, like it is stored in the db
  createSecret(): string {
    return this.encrypt(authenticator.generateSecret(SECRET_BYTES));
  }

  async createQrCode(email: string, encryptedSecret: string): Promise<string> {
    const uri = authenticator.keyuri(email, ISSUER, this.decrypt(encryptedSecret));
    return QRCode.toDataURL(uri);
  }

  verifyCode(encryptedSecret: string, code: string): boolean {
    return authenticator.check(code, this.decrypt(encryptedSecret));
  }

  async createChallenge(userId: string): Promise<string> {
    const token = randomUUID();
    await this.redis.set(challengeKey(token), userId, 'EX', CHALLENGE_TTL_SECONDS);
    return token;
  }

  async getChallengeUserId(token: string): Promise<string | null> {
    return this.redis.get(challengeKey(token));
  }

  async deleteChallenge(token: string): Promise<void> {
    await this.redis.del(challengeKey(token));
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join(':');
  }

  private decrypt(stored: string): string {
    const [iv, authTag, encrypted] = stored.split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
