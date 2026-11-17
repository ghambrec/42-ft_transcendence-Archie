import { Component, inject, signal } from '@angular/core';
import { form, FormRoot, maxLength, required, validate } from '@angular/forms/signals';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { TextFormField } from '../../shared/form-field/form-field';
import { Notifications } from '../notifications';

@Component({
  selector: 'app-create-notification-modal',
  imports: [FormRoot, TextFormField, TranslocoPipe],
  templateUrl: './create-notification-modal.html',
})
export class CreateNotificationModal {
  protected readonly activeModal = inject(NgbActiveModal);
  private readonly notifications = inject(Notifications);
  readonly document = signal<{ id: string; filename: string } | null>(null);
  readonly model = signal({ title: '', message: '', dueDate: '', remindAt: '' });
  readonly notificationForm = form(this.model, path => {
    for (const field of [path.title, path.message, path.dueDate, path.remindAt]) {
      required(field, { message: 'notifications.create.required' });
    }
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
          const result = await firstValueFrom(this.notifications.create({
            document_id: document.id, title: value.title.trim(), message: value.message.trim(),
            due_date: value.dueDate, remind_at: new Date(value.remindAt).toISOString(),
          }));
          this.activeModal.close(result);
          return;
        } catch (error: unknown) {
          const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
          const message = ['AI_NOTIFICATION_ACCESS_DENIED', 'VALIDATION_FAILED'].includes(code)
            ? `errors.${code}` : 'notifications.create.failed';
          return { kind: 'serverError', message };
        }
      },
    },
  });
}
