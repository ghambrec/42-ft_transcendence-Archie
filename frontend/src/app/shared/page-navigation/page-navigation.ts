import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-page-navigation',
  imports: [TranslocoPipe],
  templateUrl: './page-navigation.html',
})
export class PageNavigation {
  readonly page = input.required<number>();
  readonly hasPrevious = input.required<boolean>();
  readonly hasNext = input.required<boolean>();
  readonly disabled = input(false);
  readonly previous = output<void>();
  readonly next = output<void>();
}
