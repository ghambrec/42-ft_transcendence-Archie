import { Component, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Users } from '../../users/users';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-profile-avatar',
  imports: [TranslocoPipe],
  templateUrl: './profile-avatar.html',
  styleUrl: './profile-avatar.scss',
})
export class ProfileAvatar {
  readonly userId = input.required<string>();
  readonly avatarUrl = input('images/default-avatar.svg');
  readonly avatarError = output<Event>();
  private readonly users = inject(Users);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  constructor() {
    effect(onCleanup => {
      const file = this.selectedFile();
      if (!file) {
        this.previewUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(file);
      this.previewUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected selectFile(event: Event) {
    if (this.uploading()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFile.set(null);
    this.saved.set(false);
    this.error.set(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      input.value = '';
      this.error.set('errors.INVALID_AVATAR_FILE_TYPE');
    } else if (file.size > MAX_AVATAR_SIZE) {
      input.value = '';
      this.error.set('errors.AVATAR_FILE_TOO_LARGE');
    } else {
      this.selectedFile.set(file);
    }
  }

  protected cancel() {
    if (this.uploading()) return;
    this.selectedFile.set(null);
    if (this.fileInput()) this.fileInput()!.nativeElement.value = '';
    this.error.set(null);
    this.saved.set(false);
  }

  protected imageError(event: Event) {
    if (this.selectedFile()) {
      this.selectedFile.set(null);
      if (this.fileInput()) this.fileInput()!.nativeElement.value = '';
      this.error.set('errors.INVALID_AVATAR_FILE_TYPE');
    } else {
      this.avatarError.emit(event);
    }
  }

  protected async upload() {
    const file = this.selectedFile();
    const userId = this.userId();
    if (!file || !userId || this.uploading()) return;
    this.uploading.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      // A confirmed write must finish even when switching tabs; the service refreshes shared image URLs.
      await firstValueFrom(this.users.updateAvatar(userId, file));
      if (this.destroyRef.destroyed) return;
      this.selectedFile.set(null);
      if (this.fileInput()) this.fileInput()!.nativeElement.value = '';
      this.saved.set(true);
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) return;
      const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
      this.error.set(['INVALID_AVATAR_FILE_TYPE', 'AVATAR_FILE_TOO_LARGE', 'VALIDATION_FAILED'].includes(code)
        ? `errors.${code}` : 'profile.avatar.error');
    } finally {
      if (!this.destroyRef.destroyed) this.uploading.set(false);
    }
  }
}
