import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { CreateNotificationRequest, CreatedNotification, UpdateNotificationRequest } from './notification.models';

@Service()
export class Notifications {
  private readonly http = inject(HttpClient);

  create(body: CreateNotificationRequest) {
    return this.http.post<CreatedNotification>(`${environment.apiUrl}/notifications`, body, { withCredentials: true });
  }

  update(id: string, body: UpdateNotificationRequest) {
    return this.http.patch<{ id: string }>(`${environment.apiUrl}/notifications/${id}`, body, { withCredentials: true });
  }

  delete(id: string) {
    return this.http.delete<void>(`${environment.apiUrl}/notifications/${id}`, { withCredentials: true });
  }
}
