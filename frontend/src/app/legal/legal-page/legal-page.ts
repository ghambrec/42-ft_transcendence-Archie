import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownComponent } from 'ngx-markdown';
import { LanguageSwitcher } from '../../shared/language-switcher/language-switcher';

@Component({
	selector: 'app-legal-page',
	imports: [RouterLink, TranslocoPipe, MarkdownComponent, LanguageSwitcher],
	templateUrl: './legal-page.html',
})
export class LegalPage {
	// 'privacy' oder 'terms', kommt aus der route
	readonly doc: string = inject(ActivatedRoute).snapshot.data['doc'];
}
