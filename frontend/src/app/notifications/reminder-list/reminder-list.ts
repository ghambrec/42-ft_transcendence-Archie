import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { NotificationReminder, ReminderStatus } from '../notification.models';

const STATUS_CLASSES: Record<ReminderStatus, string> = {
  scheduled: 'text-bg-primary', sent: 'text-bg-success',
  skipped: 'text-bg-secondary', failed: 'text-bg-danger',
};

@Component({
  selector: 'app-reminder-list',
  imports: [DatePipe, TranslocoPipe],
  templateUrl: './reminder-list.html',
})
export class ReminderList {
  readonly reminders = input.required<NotificationReminder[]>();
  protected readonly statusClasses = STATUS_CLASSES;
}
