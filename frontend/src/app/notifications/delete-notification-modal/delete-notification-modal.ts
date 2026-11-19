import { Component, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Notifications } from '../notifications';
import { notificationErrorKey } from '../notification-error';

@Component({
  selector: 'app-delete-notification-modal',
  imports: [TranslocoPipe],
  templateUrl: './delete-notification-modal.html',
})
export class DeleteNotificationModal {
  protected readonly activeModal = inject(NgbActiveModal);
  private readonly notifications = inject(Notifications);
  readonly notification = signal<{ id: string; title: string } | null>(null);
  readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm() {
    const notification = this.notification();
    if (!notification || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.notifications.delete(notification.id));
      this.activeModal.close(true);
    } catch (error: unknown) {
      this.error.set(notificationErrorKey(error, 'notifications.delete.failed'));
    } finally {
      this.submitting.set(false);
    }
  }
}
