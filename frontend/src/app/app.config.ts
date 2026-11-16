import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';
import { provideTransloco } from '@jsverse/transloco';
import { provideMarkdown } from 'ngx-markdown'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    provideHttpClient(withXhr()),
    provideZonelessChangeDetection(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'de', 'es'],
        defaultLang: 'en',
        fallbackLang: 'en',
		missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
	provideMarkdown(),
  ]
};
