import { inject, Service, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import type { SupportedLanguage } from '../core/i18n/supported-language'
import { CurrentUser, Users } from '../users/users';

export interface LoginRequest {
	email: string;
	password: string;
}

export interface RegisterRequest {
	email: string;
	displayName: string;
	password: string;
}

export interface LoginResponse {
	id: string;
	email: string;
	displayName: string;
	preferredLanguage: SupportedLanguage;
	hasToChangePassword: boolean;
	// nur gesetzt wenn der 2fa code noch fehlt
	twoFactorRequired?: boolean;
	challengeToken?: string;
}

export interface TwoFactorVerifyRequest {
	challengeToken: string;
	code: string;
}


@Service()
export class Auth {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/auth`;
	private readonly usersService = inject(Users)
	private readonly translocoService = inject(TranslocoService);


	login(body: LoginRequest) {
		const url = `${this.baseUrl}/login`;

		return this.http.post<LoginResponse>(url, body, { withCredentials: true });
	}

	register(body: RegisterRequest) {
		const url = `${this.baseUrl}/register`;

		return this.http.post<void>(url, body, { withCredentials: true });
	}

	logout() {
		const url = `${this.baseUrl}/logout`;

		return this.http.get<void>(url, { withCredentials: true });
	}

	async checkSession(): Promise<boolean> {
		try {
			const { user } = await firstValueFrom(this.http.get<{ user: CurrentUser | null}>(`${this.baseUrl}/session`, { withCredentials: true}));
			this.usersService.currentUser.set(user);
			if (user) this.translocoService.setActiveLang(user.preferredLanguage);
			return user !== null;
		} catch {
			this.usersService.currentUser.set(null);
			return false;
		}
	}

	verifyTwoFactor(body: TwoFactorVerifyRequest) {
		const url = `${this.baseUrl}/2fa/verify`;

		return this.http.post<LoginResponse>(url, body, { withCredentials: true });
	}

	setupTwoFactor() {
		const url = `${this.baseUrl}/2fa/setup`;

		return this.http.post<{ qrCodeDataUrl: string }>(url, {}, { withCredentials: true });
	}

	enableTwoFactor(code: string) {
		const url = `${this.baseUrl}/2fa/enable`;

		return this.http.post<void>(url, { code }, { withCredentials: true });
	}

	disableTwoFactor() {
		const url = `${this.baseUrl}/2fa/disable`;

		return this.http.post<void>(url, {}, { withCredentials: true });
	}

	setPassword(body: { password: string }) {
		const setPasswordUrl = `${environment.apiUrl}/users/me/password`;

		return this.http.patch<void>(setPasswordUrl, body, { withCredentials: true });
	}
}
