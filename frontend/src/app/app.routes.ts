import { Routes } from '@angular/router';
import { Settings } from './settings/settings';
import { Shell } from './shell/shell';
import { Login } from './auth/login/login';
import { adminGuard, authGuard, guestGuard } from './auth/auth-guard';
// import { Profile } from './profile/profile';
import { DocPage } from './documents/doc-page/doc-page';
import { AIChat } from './ai-chat/ai-chat';

export const routes: Routes = [
	{
		path: 'login',
		component: Login,
		canActivate: [guestGuard],
		title: 'pageTitle.login',
	},
	{
		path: 'signup',
		loadComponent: () =>
			import('./auth/signup/signup').then((m) => m.Signup),
		canActivate: [guestGuard],
		title: 'pageTitle.signup',
	},
	// legal pages, reachable without login
	{
		path: 'privacy',
		loadComponent: () =>
			import('./legal/legal-page/legal-page').then((m) => m.LegalPage),
		data: { doc: 'privacy' },
		title: 'pageTitle.privacy',
	},
	{
		path: 'terms',
		loadComponent: () =>
			import('./legal/legal-page/legal-page').then((m) => m.LegalPage),
		data: { doc: 'terms' },
		title: 'pageTitle.terms',
	},
	{
		path: '',
		component: Shell,
		canActivate: [authGuard],
		children: [
			{
				path: '',
				redirectTo: 'documents',
				pathMatch: 'full',
			},
			{
				path: 'documents',
				loadComponent: () =>
        			import('./documents/doc-page/doc-page').then((m) => m.DocPage),
				title: 'pageTitle.documents',
			},
			{
				path: 'ai-chat',
				component: AIChat,
				title: 'pageTitle.aiChat',
			},
			{
				path: 'ai-chat/:id',
				component: AIChat,
				title: 'pageTitle.aiChat',
			},
			{
				path: 'profile',
				loadComponent: () =>
					import('./profile/profile').then((m) => m.Profile),
				title: 'pageTitle.profile',
			},
			{
				path: 'settings',
				component: Settings,
				canActivate: [adminGuard],
				title: 'pageTitle.settings'
			}
		],
	},
	{
		path: '**',
		redirectTo: ''
	}
];
