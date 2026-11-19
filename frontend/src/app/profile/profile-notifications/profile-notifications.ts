import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Users, type NotificationSettings } from '../../users/users';

@Component({
  selector: 'app-profile-notifications',
  imports: [TranslocoPipe],
  templateUrl: './profile-notifications.html',
})
export class ProfileNotifications {
  private readonly users = inject(Users);
  private readonly untilDestroyed = takeUntilDestroyed<NotificationSettings>();
  protected readonly settings = httpResource<NotificationSettings>(() => ({
    url: `${environment.apiUrl}/users/me/notification`,
    withCredentials: true,
  }));
  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);
  protected readonly saved = signal(false);
  protected readonly active = computed(() => this.settings.hasValue() && this.settings.value().active);
  protected readonly disabled = computed(() =>
    !this.settings.hasValue() || this.settings.isLoading() || this.saving());

  protected changePreference(event: Event) {
    const control = event.target as HTMLInputElement;
    const requested = control.checked;
    // Keep displaying the confirmed preference until the server accepts the change.
    control.checked = this.active();
    if (this.disabled() || requested === this.active()) return;

    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    this.users.updateNotificationSettings(requested)
      .pipe(this.untilDestroyed, finalize(() => this.saving.set(false)))
      .subscribe({
        next: settings => {
          this.settings.set(settings);
          this.saved.set(true);
        },
        error: () => this.saveError.set(true),
      });
  }
}
