import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
	selector: 'app-legal-page',
	imports: [RouterLink, TranslocoPipe, MarkdownComponent],
	templateUrl: './legal-page.html',
})
export class LegalPage {
	// 'privacy' oder 'terms', kommt aus der route
	readonly doc: string = inject(ActivatedRoute).snapshot.data['doc'];
}
