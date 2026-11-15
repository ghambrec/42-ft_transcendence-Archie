import { Component, inject, signal } from '@angular/core';
import { email, form, FormRoot, maxLength, minLength, required } from '@angular/forms/signals';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../auth';
import { TextFormField } from '../../shared/form-field/form-field';
import { LanguageSwitcher } from '../../shared/language-switcher/language-switcher';
import { DISPLAY_NAME_MAX_LENGTH } from '../../validation/display-name-policy';
import { PASSWORD_POLICY } from '../../validation/password-policy';

@Component({
	selector: 'app-signup',
	imports: [TranslocoPipe, FormRoot, TextFormField, RouterLink, LanguageSwitcher],
	templateUrl: './signup.html',
})
export class Signup {
	private readonly authService = inject(Auth);
	private readonly router = inject(Router);

	signupModel = signal({
		email: '',
		displayName: '',
		password: '',
	});

	signupForm = form (
		this.signupModel,
		(p) => {
			required(p.email, { message: 'users.createUser.errors.emailRequired' });
			email(p.email, { message: 'users.createUser.errors.emailFormat' });

			required(p.displayName, { message: 'users.createUser.errors.displayNameRequired' });
			maxLength(p.displayName, DISPLAY_NAME_MAX_LENGTH, { message: 'users.createUser.errors.displayNameTooLong' });

			required(p.password, { message: 'users.createUser.errors.passwordRequired' });
			minLength(p.password, PASSWORD_POLICY.minLength, { message: 'users.createUser.errors.passwordMinLength' });
		},
		{
			submission: {
				action: async (field) => {
					try {
						// backend setzt direkt das session cookie
						await firstValueFrom(this.authService.register(field().value()));
						await this.authService.checkSession();

						this.router.navigateByUrl('/');
						return;
					} catch (error: unknown) {
						let message = 'signup.errorGeneral';
						if (error instanceof HttpErrorResponse) {
							switch (error.error?.code) {
								case 'AUTH_EMAIL_ALREADY_REGISTERED':
								case 'USER_NAME_ALREADY_REGISTERED':
								case 'VALIDATION_FAILED':
									message = `errors.${error.error.code}`;
							}
						}
						return { kind: 'serverError', message };
					}
				}
			}
		}
	);
}
