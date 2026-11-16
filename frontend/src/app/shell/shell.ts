import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, TranslocoPipe],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
	// nur in der mobilen ansicht relevant, ab lg ist die sidebar immer sichtbar
	protected readonly sidebarOpen = signal(false);

	constructor() {
		// nach jeder navigation wieder einklappen
		inject(Router).events
			.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
			.subscribe(() => this.sidebarOpen.set(false));
	}
}
