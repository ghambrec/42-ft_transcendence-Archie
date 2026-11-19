import { HttpErrorResponse } from '@angular/common/http';

export function notificationErrorKey(error: unknown, fallback: string): string {
  const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
  return ['AI_NOTIFICATION_ACCESS_DENIED', 'AI_NOTIFICATION_NOT_FOUND', 'AI_NOTIFICATION_CONFLICT', 'VALIDATION_FAILED'].includes(code)
    ? `errors.${code}` : fallback;
}
