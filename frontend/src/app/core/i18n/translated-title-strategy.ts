import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

// route titles are transloco keys, the tab title follows the active language
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
	private title = inject(Title);
	private transloco = inject(TranslocoService);
	private sub?: Subscription;

	override updateTitle(snapshot: RouterStateSnapshot): void {
		this.sub?.unsubscribe();
		const key = this.buildTitle(snapshot);
		if (!key) {
			this.title.setTitle('Archie');
			return;
		}
		this.sub = this.transloco
			.selectTranslate(key)
			.subscribe((text) => this.title.setTitle(text));
	}
}
