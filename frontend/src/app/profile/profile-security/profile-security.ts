import { Component, computed, inject, signal } from '@angular/core';
import { form, FormRoot, maxLength, minLength, pattern, required } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../auth/auth';
import { TextFormField } from '../../shared/form-field/form-field';
import { Users } from '../../users/users';
import { PASSWORD_POLICY } from '../../validation/password-policy';

@Component({
  selector: 'app-profile-security',
  imports: [FormRoot, TextFormField, TranslocoPipe],
  templateUrl: './profile-security.html',
})
export class ProfileSecurity {
  private readonly users = inject(Users);
  private readonly auth = inject(Auth);
  readonly passwordModel = signal({ password: '' });
  readonly passwordSaveMessage = signal<string | null>(null);

  readonly twoFactorEnabled = computed(() => this.users.currentUser()?.twoFactorEnabled === true);
  // qr code is only set while the setup is running
  readonly qrCode = signal<string | null>(null);
  readonly twoFactorError = signal<string | null>(null);
  readonly codeModel = signal({ code: '' });

  readonly passwordForm = form(this.passwordModel, (path) => {
    required(path.password, { message: 'profile.security.required' });
    minLength(path.password, PASSWORD_POLICY.minLength, { message: 'profile.security.minLength' });
    maxLength(path.password, PASSWORD_POLICY.maxLength, { message: 'profile.security.maxLength' });
    pattern(path.password, PASSWORD_POLICY.pattern, { message: 'profile.security.pattern' });
  }, {
    submission: {
      action: async (field) => this.savePassword(field().value().password),
    },
  });

  readonly codeForm = form(this.codeModel, (path) => {
    required(path.code, { message: 'profile.twoFactor.codeRequired' });
    pattern(path.code, /^\d{6}$/, { message: 'profile.twoFactor.codeFormat' });
  }, {
    submission: {
      action: async (field) => this.enableTwoFactor(field().value().code),
    },
  });

  async startTwoFactorSetup() {
    this.twoFactorError.set(null);
    try {
      const { qrCodeDataUrl } = await firstValueFrom(this.auth.setupTwoFactor());
      this.qrCode.set(qrCodeDataUrl);
    } catch {
      this.twoFactorError.set('profile.twoFactor.error');
    }
  }

  async disableTwoFactor() {
    this.twoFactorError.set(null);
    try {
      await firstValueFrom(this.auth.disableTwoFactor());
      this.users.currentUser.update(u => u && { ...u, twoFactorEnabled: false });
    } catch {
      this.twoFactorError.set('profile.twoFactor.error');
    }
  }

  private async enableTwoFactor(code: string) {
    try {
      await firstValueFrom(this.auth.enableTwoFactor(code));
      this.users.currentUser.update(u => u && { ...u, twoFactorEnabled: true });
      this.qrCode.set(null);
      this.codeForm().reset({ code: '' });
      return;
    } catch (error: any) {
      const translocoKey = error.status == 400 ? 'profile.twoFactor.invalidCode' : 'profile.twoFactor.error';
      return { kind: 'serverError', message: translocoKey };
    }
  }

  private async savePassword(password: string) {
    this.passwordSaveMessage.set(null);
    try {
      await firstValueFrom(this.users.changeOwnPassword(password));
      this.passwordForm().reset({ password: '' });
      this.passwordSaveMessage.set('profile.security.success');
      return;
    } catch {
      return { kind: 'serverError', message: 'profile.security.error' };
    }
  }
}
