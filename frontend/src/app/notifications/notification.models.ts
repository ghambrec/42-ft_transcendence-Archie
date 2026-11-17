export type ReminderStatus = 'scheduled' | 'sent' | 'skipped' | 'failed';

export interface NotificationReminder {
  id: string;
  remind_at: string;
  status: ReminderStatus;
  sent_at: string | null;
  skipped_at: string | null;
  next_attempt_at: string | null;
  error_key: string | null;
}

export interface DocumentNotification {
  id: string;
  document_id: string;
  document_name: string;
  source: 'ai' | 'manual';
  title: string;
  message: string;
  due_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  reminders: NotificationReminder[];
}

export interface NotificationPage {
  data: DocumentNotification[];
  limit: number;
  offset: number;
  has_more: boolean;
}
