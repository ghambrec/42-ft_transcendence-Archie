import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DocumentNotification } from '../notification.models';
import { ReminderList } from '../reminder-list/reminder-list';

@Component({
  selector: 'app-notification-card',
  imports: [DatePipe, RouterLink, TranslocoPipe, ReminderList],
  templateUrl: './notification-card.html',
  styleUrl: './notification-card.scss',
})
export class NotificationCard {
  readonly notification = input.required<DocumentNotification>();
  readonly showDocumentLink = input(true);
}
