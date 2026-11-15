import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, FormRoot, pattern, required } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth, LoginResponse } from '../auth';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { Users } from '../../users/users';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SetPassword } from '../set-password/set-password';
import { LanguageSwitcher } from '../../shared/language-switcher/language-switcher';

@Component({
	selector: 'app-login',
	imports: [TranslocoPipe, FormRoot, FormField, RouterLink, LanguageSwitcher],
	templateUrl: './login.html',
	styleUrl: './login.scss',
})
export class Login {
	private readonly authService = inject(Auth);
	private readonly router = inject(Router);
	private readonly translocoService = inject(TranslocoService);
	private readonly usersService = inject(Users)
	private readonly modalService = inject(NgbModal);

	// gesetzt sobald das passwort stimmt und noch der 2fa code fehlt
	challengeToken = signal<string | null>(null);

	loginModel = signal({
		email: '',
		password: '',
	});

	codeModel = signal({
		code: '',
	});

	loginForm = form (
		this.loginModel,
		(p) => {
			required(p.email, { message: 'login.errors.emailRequired' });
			email(p.email, { message: 'login.errors.emailFormat' });

			required(p.password, { message: 'login.errors.passwordRequired' });
		},
		{
			submission: {
				action: async (field) => {
					try {
						const response = await firstValueFrom(this.authService.login(field().value()));

						if (response.twoFactorRequired) {
							this.challengeToken.set(response.challengeToken!);
							return;
						}

						await this.finishLogin(response);

						return;
					} catch (error : any) {
						const translocoKey = error.status == 401 ? 'login.errorInvalidCred' : 'login.errorGeneral';
						return { kind: 'serverError', message: translocoKey };
					}
				}
			}
		}
	);

	codeForm = form (
		this.codeModel,
		(p) => {
			required(p.code, { message: 'login.twoFactor.errors.codeRequired' });
			pattern(p.code, /^\d{6}$/, { message: 'login.twoFactor.errors.codeFormat' });
		},
		{
			submission: {
				action: async (field) => {
					try {
						const response = await firstValueFrom(this.authService.verifyTwoFactor({
							challengeToken: this.challengeToken()!,
							code: field().value().code,
						}));

						await this.finishLogin(response);

						return;
					} catch (error : any) {
						const translocoKey = error.status == 401 ? 'login.twoFactor.errorInvalidCode' : 'login.errorGeneral';
						return { kind: 'serverError', message: translocoKey };
					}
				}
			}
		}
	);

	backToLogin() {
		this.challengeToken.set(null);
		this.codeForm().reset({ code: '' });
	}

	private async finishLogin(response: LoginResponse) {
		await this.authService.checkSession();

		const user = this.usersService.currentUser();

		this.translocoService.setActiveLang(user!.preferredLanguage);

		if (response.hasToChangePassword) {
			// this.router.navigateByUrl('/set-password');
			const modalRef = this.modalService.open(SetPassword, {
				centered: true,
				backdrop: 'static',
				keyboard: false,
			});

			modalRef.closed.subscribe(() => {
				this.usersService.currentUser.update(u => u && { ...u, hasToChangePassword: false });
				this.router.navigateByUrl('/');
			});

			modalRef.dismissed.subscribe(() => {
				this.router.navigateByUrl('/login');
			});

			return;
		}

		this.router.navigateByUrl('/');
	}
}
