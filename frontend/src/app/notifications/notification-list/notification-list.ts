import { httpResource } from '@angular/common/http';
import { Component, computed, input, linkedSignal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import type { NotificationPage } from '../notification.models';
import { NotificationCard } from '../notification-card/notification-card';
import { PageNavigation } from '../../shared/page-navigation/page-navigation';

const PAGE_SIZE = 20;
const EMPTY_PAGE: NotificationPage = { data: [], limit: PAGE_SIZE, offset: 0, has_more: false };

@Component({
  selector: 'app-notification-list',
  imports: [TranslocoPipe, NotificationCard, PageNavigation],
  templateUrl: './notification-list.html',
  styleUrl: './notification-list.scss',
})
export class NotificationList {
  readonly documentId = input<string | null>(null);
  readonly showDocumentLinks = input(true);

  protected readonly offset = linkedSignal({ source: this.documentId, computation: () => 0 });
  protected readonly resource = httpResource<NotificationPage>(() => ({
    url: `${environment.apiUrl}/notifications`,
    withCredentials: true,
    params: {
      limit: PAGE_SIZE,
      offset: this.offset(),
      ...(this.documentId() ? { document_id: this.documentId()! } : {}),
    },
  }), { defaultValue: EMPTY_PAGE });

  protected readonly page = computed(() => this.resource.hasValue() ? this.resource.value() : EMPTY_PAGE);
  protected readonly pageNumber = computed(() => this.offset() / PAGE_SIZE + 1);

  reload() {
    if (this.offset() === 0) this.resource.reload();
    else this.offset.set(0);
  }

  protected nextPage() {
    if (!this.resource.isLoading() && this.page().has_more) {
      this.offset.update(offset => offset + PAGE_SIZE);
    }
  }

  protected previousPage() {
    if (!this.resource.isLoading()) this.offset.update(offset => Math.max(0, offset - PAGE_SIZE));
  }
}
