import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationList } from './notification-list/notification-list';

@Component({
  selector: 'app-notifications-page',
  imports: [TranslocoPipe, NotificationList],
  templateUrl: './notifications-page.html',
})
export class NotificationsPage {}
