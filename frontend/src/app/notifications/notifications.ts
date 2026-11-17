import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { CreateNotificationRequest, CreatedNotification } from './notification.models';

@Service()
export class Notifications {
  private readonly http = inject(HttpClient);

  create(body: CreateNotificationRequest) {
    return this.http.post<CreatedNotification>(`${environment.apiUrl}/notifications`, body, { withCredentials: true });
  }
}
