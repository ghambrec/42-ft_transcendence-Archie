import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session/session-cookie.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { UserSummaryDto } from '../users/dto/user-summary.dto';
import { TwoFactorChallengeDto } from './dto/two-factor-challenge.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor-setup-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly sessionCookieService: SessionCookieService,
	) { }

	@ApiOperation({
		summary: 'Log in',
		description:
			'Authenticates a user with email and password, starts a new session, and sets the session cookie on the response.',
	})
	@Post('login')
	async login(
		@Body() loginRequest: LoginRequestDto,
		@Res({ passthrough: true }) res: Response,
	): Promise<LoginResponseDto | TwoFactorChallengeDto> {
		const { user, sessionId, challengeToken, hasToChangePassword } = await this.authService.login(loginRequest); //hasToChangePassword

		if (challengeToken) {
			return { twoFactorRequired: true, challengeToken };
		}

		this.sessionCookieService.set(res, sessionId!);

		return { id: user.id, email: user.email, displayName: user.displayName, hasToChangePassword }; // hasToChangePassword
	}

	@ApiOperation({
		summary: 'Finish login with 2FA code',
		description:
			'Verifies the code from the authenticator app for a pending login, starts a new session, and sets the session cookie on the response.',
	})
	@Post('2fa/verify')
	async verifyTwoFactor(
		@Body() verifyRequest: TwoFactorVerifyDto,
		@Res({ passthrough: true }) res: Response,
	): Promise<LoginResponseDto> {
		const { user, sessionId, hasToChangePassword } = await this.authService.verifyTwoFactor(verifyRequest);

		this.sessionCookieService.set(res, sessionId!);

		return { id: user.id, email: user.email, displayName: user.displayName, hasToChangePassword };
	}

	@ApiOperation({
		summary: 'Start 2FA setup',
		description: 'Creates a new secret for the current user and returns it as QR code for the authenticator app.',
	})
	@UseGuards(SessionAuthGuard)
	@Post('2fa/setup')
	async setupTwoFactor(@Req() req: Request): Promise<TwoFactorSetupResponseDto> {
		return this.authService.setupTwoFactor(req.userId!);
	}

	@ApiOperation({
		summary: 'Enable 2FA',
		description: 'Confirms the 2FA setup with the first code from the authenticator app.',
	})
	@UseGuards(SessionAuthGuard)
	@Post('2fa/enable')
	async enableTwoFactor(@Req() req: Request, @Body() dto: TwoFactorCodeDto): Promise<void> {
		await this.authService.enableTwoFactor(req.userId!, dto.code);
	}

	@ApiOperation({ summary: 'Disable 2FA' })
	@UseGuards(SessionAuthGuard)
	@Post('2fa/disable')
	async disableTwoFactor(@Req() req: Request): Promise<void> {
		await this.authService.disableTwoFactor(req.userId!);
	}

	@ApiOperation({
		summary: 'Register a new user',
		description:
			'Creates a new user account, starts a session for it, and sets the session cookie on the response.',
	})
	@Post('register')
	async register(
		@Body() registerRequest: RegisterRequestDto,
		@Res({ passthrough: true }) res: Response,
	): Promise<void> {
		const sessionId = await this.authService.register(registerRequest);

		this.sessionCookieService.set(res, sessionId);
	}

	@ApiOperation({
		summary: 'Log out',
		description: 'Invalidates the current session and clears the session cookie.',
	})
	@UseGuards(SessionAuthGuard)
	@Get('logout')
	async logout(
		@Req() req: Request,
		@Res({ passthrough: true }) res: Response,
	): Promise<void> {
		const sessionId = this.sessionCookieService.extract(req)!;
		await this.authService.logout(sessionId);
		this.sessionCookieService.clear(res);
	}

	@ApiOperation({
		summary: 'Get current session state (never error)'
	})
	@Get('session')
	async getSession(@Req() req: Request): Promise<{ user: UserSummaryDto | null }> {
		const user = await this.authService.getSessionUser(req);
		return { user };
	}
}
