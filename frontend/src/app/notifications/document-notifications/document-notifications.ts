import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { map, merge, take } from 'rxjs';
import type { DocumentSummary } from '../../documents/documents';
import { Users } from '../../users/users';
import { NotificationList } from '../notification-list/notification-list';
import { CreateNotificationModal } from '../create-notification-modal/create-notification-modal';
import { DeleteNotificationModal } from '../delete-notification-modal/delete-notification-modal';
import type { DocumentNotification } from '../notification.models';

@Component({
  selector: 'app-document-notifications',
  imports: [TranslocoPipe, NotificationList],
  templateUrl: './document-notifications.html',
})
export class DocumentNotifications {
  readonly document = input.required<Pick<DocumentSummary, 'id' | 'filename' | 'groups'>>();
  private readonly users = inject(Users);
  private readonly modals = inject(NgbModal);
  private readonly list = viewChild<NotificationList>('list');
  protected readonly dialogOpen = signal(false);
  protected readonly memberships = rxResource({
    params: () => this.document().id,
    stream: () => this.users.getMyGroups(),
  });
  protected readonly canManage = computed(() => {
    if (!this.memberships.hasValue() || this.memberships.isLoading()) return false;
    const groups = this.document().groups;
    return this.memberships.value().groups.some(membership =>
      membership.permissions.includes('notifications.manage') && groups.some(group => group.id === membership.groupId));
  });
  private readonly untilDestroyed = takeUntilDestroyed<boolean>();

  protected openCreate(notification?: DocumentNotification) {
    if (!this.canManage() || this.dialogOpen()) return;
    const { id, filename } = this.document();
    if (notification && notification.document_id !== id) return;
    let modal: NgbModalRef;
    modal = this.modals.open(CreateNotificationModal, {
      centered: true, size: 'lg', ariaLabelledBy: 'create-notification-title',
      beforeDismiss: () => !modal.componentInstance.notificationForm().submitting(),
    });
    if (notification) modal.componentInstance.edit(notification);
    else modal.componentInstance.document.set({ id, filename });
    this.watchModal(modal, id);
  }

  protected openDelete(notification: DocumentNotification) {
    if (!this.canManage() || this.dialogOpen() || notification.document_id !== this.document().id) return;
    let modal: NgbModalRef;
    modal = this.modals.open(DeleteNotificationModal, {
      centered: true, ariaLabelledBy: 'delete-notification-title',
      beforeDismiss: () => !modal.componentInstance.submitting(),
    });
    modal.componentInstance.notification.set({ id: notification.id, title: notification.title });
    this.watchModal(modal, this.document().id);
  }

  private watchModal(modal: NgbModalRef, id: string) {
    this.dialogOpen.set(true);
    merge(modal.closed.pipe(map(() => true)), modal.dismissed.pipe(map(() => false)))
      .pipe(take(1), this.untilDestroyed)
      .subscribe(created => {
        this.dialogOpen.set(false);
        if (created && this.document().id === id) this.list()?.reload();
      });
  }
}
