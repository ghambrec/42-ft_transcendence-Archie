import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { SupportedLanguage } from '../../core/i18n/supported-language';

@Component({
	selector: 'app-language-switcher',
	templateUrl: './language-switcher.html',
})
export class LanguageSwitcher {
	private readonly translocoService = inject(TranslocoService);

	readonly languages: SupportedLanguage[] = ['en', 'de', 'es'];
	readonly activeLang = toSignal(this.translocoService.langChanges$, {
		initialValue: this.translocoService.getActiveLang(),
	});

	// nur im speicher, nach reload gilt wieder der default
	setLanguage(lang: SupportedLanguage) {
		this.translocoService.setActiveLang(lang);
	}
}
