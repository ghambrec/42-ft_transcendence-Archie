import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Pipe } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotificationList } from './notification-list';
import type { DocumentNotification, NotificationPage } from '../notification.models';
import { NotificationCard } from '../notification-card/notification-card';
import { ReminderList } from '../reminder-list/reminder-list';
import { PageNavigation } from '../../shared/page-navigation/page-navigation';

@Pipe({ name: 'transloco' })
class TranslationKeys {
  transform(key: string): string { return key; }
}

const notification: DocumentNotification = {
  id: 'notification-a', document_id: 'document-a', document_name: 'Invoice.pdf', source: 'manual',
  title: 'Invoice deadline', message: 'Please check the invoice.', due_date: '2026-12-01',
  created_by: 'user', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  reminders: ['scheduled', 'sent', 'skipped', 'failed'].map((status, index) => ({
    id: `reminder-${index}`, status: status as 'scheduled' | 'sent' | 'skipped' | 'failed',
    remind_at: '2026-11-30T09:00:00Z',
    sent_at: status === 'sent' ? '2026-11-30T09:01:00Z' : null,
    skipped_at: status === 'skipped' ? '2026-11-30T09:01:00Z' : null,
    error_key: status === 'failed' ? 'smtp_error' : null,
    next_attempt_at: status === 'failed' ? '2026-11-30T09:05:00Z' : null,
  })),
};

const page = (data: DocumentNotification[] = [], has_more = false, offset = 0): NotificationPage => ({
  data, limit: 20, offset, has_more,
});

describe('Notification list', () => {
  let fixture: ComponentFixture<NotificationList>;
  let http: HttpTestingController;
  let initialRequest: TestRequest;
  const element = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [NotificationList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    for (const component of [NotificationList, NotificationCard, ReminderList, PageNavigation]) {
      TestBed.overrideComponent(component, {
        remove: { imports: [TranslocoPipe] }, add: { imports: [TranslationKeys] },
      });
    }
    await TestBed.compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotificationList);
    fixture.detectChanges();
    TestBed.tick();
    initialRequest = http.expectOne(r => r.url.endsWith('/notifications'));
  });

  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('loads with credentials and distinguishes loading from empty', async () => {
    expect(initialRequest.request.withCredentials).toBe(true);
    expect(initialRequest.request.params.get('limit')).toBe('20');
    expect(initialRequest.request.params.get('offset')).toBe('0');
    expect(initialRequest.request.params.has('document_id')).toBe(false);
    expect(element().querySelector('[role="status"]')).not.toBeNull();
    expect(element().textContent).not.toContain('notifications.empty');
    initialRequest.flush(page());
    await fixture.whenStable();
    expect(element().textContent).toContain('notifications.empty');
    expect(element().querySelector('[role="status"]')).toBeNull();
  });

  it('renders nested states, retry time and a link to the document', async () => {
    initialRequest.flush(page([notification]));
    await fixture.whenStable();
    expect(element().textContent).toContain('Invoice deadline');
    expect(element().textContent).toContain('Invoice.pdf');
    for (const state of ['scheduled', 'sent', 'skipped', 'failed']) {
      expect(element().textContent).toContain(`notifications.status.${state}`);
    }
    expect(element().textContent).toContain('notifications.nextAttempt');
    expect(element().querySelector('a')?.getAttribute('href')).toBe('/documents?doc=document-a');
  });

  it('shows errors separately from empty results and supports retry', async () => {
    initialRequest.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('notifications.loadError');
    expect(element().textContent).not.toContain('notifications.empty');
    element().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    TestBed.tick();
    http.expectOne(r => r.url.endsWith('/notifications')).flush(page([notification]));
    await fixture.whenStable();
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().textContent).toContain('Invoice deadline');
  });

  it('paginates using has_more and can return to the first page', async () => {
    initialRequest.flush(page([notification], true));
    await fixture.whenStable();
    element().querySelector<HTMLButtonElement>('[data-testid="next"]')!.click();
    TestBed.tick();
    const next = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(next.request.params.get('offset')).toBe('20');
    next.flush(page([{ ...notification, title: 'Second page' }], false, 20));
    await fixture.whenStable();
    expect(element().textContent).toContain('Second page');
    expect(element().querySelector<HTMLButtonElement>('[data-testid="next"]')!.disabled).toBe(true);
    element().querySelector<HTMLButtonElement>('[data-testid="previous"]')!.click();
    TestBed.tick();
    const previous = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(previous.request.params.get('offset')).toBe('0');
    previous.flush(page());
    await fixture.whenStable();
  });

  it('resets pagination and cancels stale requests when the selected document changes', async () => {
    initialRequest.flush(page([notification], true));
    await fixture.whenStable();
    element().querySelector<HTMLButtonElement>('[data-testid="next"]')!.click();
    TestBed.tick();
    const stale = http.expectOne(r => r.url.endsWith('/notifications'));
    fixture.componentRef.setInput('documentId', 'document-b');
    fixture.componentRef.setInput('showDocumentLinks', false);
    fixture.detectChanges();
    TestBed.tick();
    expect(stale.cancelled).toBe(true);
    const current = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(current.request.params.get('document_id')).toBe('document-b');
    expect(current.request.params.get('offset')).toBe('0');
    expect(element().textContent).not.toContain('Invoice deadline');
    current.flush(page([{ ...notification, document_id: 'document-b', title: 'Document B' }]));
    await fixture.whenStable();
    expect(element().textContent).toContain('Document B');
    expect(element().querySelector('a')).toBeNull();
  });

  it('handles notifications without reminders and renders messages as text', async () => {
    initialRequest.flush(page([{ ...notification, reminders: [], message: '<img src=x onerror=alert(1)>' }]));
    await fixture.whenStable();
    expect(element().textContent).toContain('notifications.noReminders');
    expect(element().textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element().querySelector('img')).toBeNull();
  });

  it('reloads the first page after a notification is created on a later page', async () => {
    initialRequest.flush(page([notification], true));
    await fixture.whenStable();
    element().querySelector<HTMLButtonElement>('[data-testid="next"]')!.click();
    TestBed.tick();
    http.expectOne(r => r.url.endsWith('/notifications')).flush(page([], false, 20));
    await fixture.whenStable();
    fixture.componentInstance.reload();
    TestBed.tick();
    const request = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(request.request.params.get('offset')).toBe('0');
    request.flush(page([notification]));
    await fixture.whenStable();
    expect(element().textContent).toContain('Invoice deadline');
  });

  it('renders management actions only when permitted and forwards the selected notification', async () => {
    initialRequest.flush(page([notification]));
    await fixture.whenStable();
    expect(element().querySelector('[data-testid="edit-notification"]')).toBeNull();
    expect(element().querySelector('[data-testid="delete-notification"]')).toBeNull();
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    const edits: DocumentNotification[] = [];
    const removals: DocumentNotification[] = [];
    fixture.componentInstance.edit.subscribe(item => edits.push(item));
    fixture.componentInstance.remove.subscribe(item => removals.push(item));
    element().querySelector<HTMLButtonElement>('[data-testid="edit-notification"]')!.click();
    element().querySelector<HTMLButtonElement>('[data-testid="delete-notification"]')!.click();
    expect(edits).toEqual([notification]);
    expect(removals).toEqual([notification]);
  });
});
