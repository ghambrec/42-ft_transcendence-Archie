import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SessionService } from './session/session.service';
import { LoginRequestDto } from './dto/login-request.dto';
import * as bcrypt from 'bcrypt';
import { LoginResult } from './interfaces/login-result.interface';
import { RegisterRequestDto } from './dto/register-request.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { Logger } from 'nestjs-pino';
import { LoginAttemptService } from './login-attempt.service';
import { LockedException } from './exceptions/locked.exception';
import { UserSummaryDto } from '../users/dto/user-summary.dto';
import { SessionCookieService } from './session/session-cookie.service';
import type { Request } from 'express';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor-setup-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
	constructor(
		private readonly logger: Logger,
		private readonly userService: UsersService,
		private readonly sessionService: SessionService,
		private readonly loginAttemptService: LoginAttemptService,
		private readonly sessionCookieService: SessionCookieService,
		private readonly twoFactorService: TwoFactorService,
	) { }

	async login(request: LoginRequestDto): Promise<LoginResult> {
		this.logger.log('Execute login', request.email);

		const retryAfterSeconds = await this.loginAttemptService.isLocked(request.email);
		if (retryAfterSeconds !== null) {
			this.logger.warn(`Login blocked for ${request.email}, locked out`);
			throw new LockedException(retryAfterSeconds);
		}

		const user = await this.userService.findByEmail(request.email);
		if (!user || !(await bcrypt.compare(request.password, user.passwordHash))) {
			await this.loginAttemptService.registerFailure(request.email);
			this.logger.warn(`Login failed for ${request.email}`);
			throw new UnauthorizedException('Invalid credentials');
		}

		// with 2fa the session is created after the code was verified
		if (user.totpEnabled) {
			const challengeToken = await this.twoFactorService.createChallenge(user.id);
			return { user, challengeToken, hasToChangePassword: user.mustChangePassword };
		}

		return this.completeLogin(user);
	}

	async verifyTwoFactor(request: TwoFactorVerifyDto): Promise<LoginResult> {
		const userId = await this.twoFactorService.getChallengeUserId(request.challengeToken);
		const user = userId ? await this.userService.findById(userId) : null;
		if (!user || !user.totpEnabled || !user.totpSecret) {
			throw new UnauthorizedException('Invalid or expired challenge');
		}
		this.logger.log('Execute verifyTwoFactor', user.email);

		const retryAfterSeconds = await this.loginAttemptService.isLocked(user.email);
		if (retryAfterSeconds !== null) {
			this.logger.warn(`2FA blocked for ${user.email}, locked out`);
			throw new LockedException(retryAfterSeconds);
		}

		if (!this.twoFactorService.verifyCode(user.totpSecret, request.code)) {
			await this.loginAttemptService.registerFailure(user.email);
			this.logger.warn(`2FA failed for ${user.email}`);
			throw new UnauthorizedException('Invalid code');
		}

		await this.twoFactorService.deleteChallenge(request.challengeToken);
		return this.completeLogin(user);
	}

	private async completeLogin(user: User): Promise<LoginResult> {
		await this.loginAttemptService.clearAttempts(user.email);

		const hasToChangePassword = user.mustChangePassword;

		const sessionId = await this.sessionService.create(user.id);
		try {
			await this.userService.recordSuccessfulLogin(user.id, new Date());
		} catch (error) {
			await this.sessionService.destroy(sessionId);
			throw error;
		}
		return { user, sessionId, hasToChangePassword };
	}

	async setupTwoFactor(userId: string): Promise<TwoFactorSetupResponseDto> {
		this.logger.log('Execute setupTwoFactor', userId);

		const user = await this.userService.findById(userId);
		if (!user) {
			throw new UnauthorizedException();
		}
		if (user.totpEnabled) {
			throw new ConflictException('Two factor authentication is already enabled');
		}

		// stays pending until the first code is confirmed
		const secret = this.twoFactorService.createSecret();
		await this.userService.setTwoFactor(userId, secret, false);

		const qrCodeDataUrl = await this.twoFactorService.createQrCode(user.email, secret);
		return { qrCodeDataUrl };
	}

	async enableTwoFactor(userId: string, code: string): Promise<void> {
		this.logger.log('Execute enableTwoFactor', userId);

		const user = await this.userService.findById(userId);
		if (!user || !user.totpSecret || user.totpEnabled) {
			throw new BadRequestException('Two factor setup was not started');
		}
		if (!this.twoFactorService.verifyCode(user.totpSecret, code)) {
			throw new BadRequestException('Invalid code');
		}

		await this.userService.setTwoFactor(userId, user.totpSecret, true);
	}

	async disableTwoFactor(userId: string): Promise<void> {
		this.logger.log('Execute disableTwoFactor', userId);

		await this.userService.setTwoFactor(userId, null, false);
	}

	async register(request: RegisterRequestDto): Promise<string> {
		this.logger.log('Execute register', request.email);

		const createUserDto: CreateUserDto = {
			email: request.email,
			password: request.password,
			displayName: request.displayName,
		}

		const user = await this.userService.create(createUserDto, false);

		const sessionId = await this.sessionService.create(user.id);
		return sessionId;
	}

	async logout(sessionId: string): Promise<void> {
		this.logger.log('Execute logout', sessionId);

		return this.sessionService.destroy(sessionId);
	}

	async getSessionUser(req: Request): Promise<UserSummaryDto | null> {
		const sessionId = this.sessionCookieService.extract(req);
		if (!sessionId) {
			return null;
		}

		const session = await this.sessionService.get(sessionId);
		if (!session) {
			return null;
		}

		try {
			return await this.userService.findProfileById(session.userId);
		} catch (error) {
			return null;
		}
	}
}
