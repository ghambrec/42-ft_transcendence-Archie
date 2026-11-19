import { Component, computed, inject, signal } from '@angular/core';
import { form, FormRoot, maxLength, required, validate } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { TextFormField } from '../../shared/form-field/form-field';
import { Notifications } from '../notifications';
import type { DocumentNotification } from '../notification.models';
import { notificationErrorKey } from '../notification-error';

@Component({
  selector: 'app-create-notification-modal',
  imports: [FormRoot, TextFormField, TranslocoPipe],
  templateUrl: './create-notification-modal.html',
})
export class CreateNotificationModal {
  protected readonly activeModal = inject(NgbActiveModal);
  private readonly notifications = inject(Notifications);
  readonly document = signal<{ id: string; filename: string } | null>(null);
  readonly notification = signal<DocumentNotification | null>(null);
  readonly canEditReminder = computed(() => !this.notification() || this.notification()!.reminders.length === 1);
  private originalReminderInput = '';
  readonly model = signal({ title: '', message: '', dueDate: '', remindAt: '' });

  edit(notification: DocumentNotification) {
    this.notification.set(notification);
    this.document.set({ id: notification.document_id, filename: notification.document_name });
    const reminder = notification.reminders[0];
    const date = reminder ? new Date(reminder.remind_at) : null;
    const pad = (value: number) => String(value).padStart(2, '0');
    this.originalReminderInput = date
      ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
      : '';
    this.model.set({ title: notification.title, message: notification.message,
      dueDate: notification.due_date, remindAt: this.originalReminderInput });
  }

  readonly notificationForm = form(this.model, path => {
    for (const field of [path.title, path.message, path.dueDate]) {
      required(field, { message: 'notifications.create.required' });
    }
    required(path.remindAt, { message: 'notifications.create.required', when: () => this.canEditReminder() });
    for (const field of [path.title, path.message]) {
      validate(field, ({ value }) => value().trim() ? undefined : { kind: 'required', message: 'notifications.create.required' });
    }
    maxLength(path.title, 255, { message: 'notifications.create.titleTooLong' });
    validate(path.dueDate, ({ value }) => {
      const date = value();
      const parsed = new Date(date);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
        ? undefined : { kind: 'date', message: 'notifications.create.invalidDate' };
    });
    validate(path.remindAt, ({ value }) => {
      if (!this.canEditReminder()) return undefined;
      const local = value();
      const date = new Date(local);
      // Reject nonexistent local times during the spring daylight-saving transition.
      const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
      const expected = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
      return expected && parts.every((part, index) => part === Number(expected[index + 1]))
        ? undefined : { kind: 'date', message: 'notifications.create.invalidDate' };
    });
  }, {
    submission: {
      action: async field => {
        const document = this.document();
        if (!document) return { kind: 'document', message: 'notifications.create.failed' };
        const value = field().value();
        try {
          const notification = this.notification();
          const content = { title: value.title.trim(), message: value.message.trim(), due_date: value.dueDate };
          const result = notification
            ? await firstValueFrom(this.notifications.update(notification.id, {
                ...content,
                // Omit untouched times to preserve seconds, fractional precision and DST offsets.
                ...(this.canEditReminder() && value.remindAt !== this.originalReminderInput
                  ? { remind_at: new Date(value.remindAt).toISOString() } : {}),
              }))
            : await firstValueFrom(this.notifications.create({ ...content,
                document_id: document.id, remind_at: new Date(value.remindAt).toISOString(),
              }));
          this.activeModal.close(result);
          return;
        } catch (error: unknown) {
          const message = notificationErrorKey(error, this.notification() ? 'notifications.edit.failed' : 'notifications.create.failed');
          return { kind: 'serverError', message };
        }
      },
    },
  });
}
