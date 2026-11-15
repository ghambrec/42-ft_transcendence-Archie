import { Component, effect, ElementRef, input, model, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-chat-composer',
  imports: [TranslocoPipe],
  templateUrl: './chat-composer.html',
  styles: [':host { display: block; flex-shrink: 0; }'],
})
export class ChatComposer {
  readonly draft = model('');
  readonly busy = input(false);
  readonly canDeleteChat = input(false);
  readonly canDeleteAll = input(false);
  readonly sendError = input<string | null>(null);
  readonly sendRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly deleteAllRequested = output<void>();

  private readonly questionInput = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');
  private refocus = false;

  constructor() {
    // textarea is disabled while busy and loses focus, give it back afterwards
    effect(() => {
      if (this.busy() || !this.refocus) return;
      this.refocus = false;
      setTimeout(() => this.questionInput()?.nativeElement.focus());
    });
  }

  protected send(): void {
    if (this.busy() || !this.draft().trim()) return;
    this.refocus = true;
    this.sendRequested.emit();
  }

  // enter sends, shift+enter stays a line break
  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).isComposing) return;
    event.preventDefault();
    this.send();
  }
}
