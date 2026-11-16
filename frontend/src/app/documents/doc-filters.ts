import { computed, inject, Service } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';

export const DOC_FILE_TYPES = ['pdf', 'image', 'text', 'word', 'excel', 'archive'] as const;
export type DocFileType = typeof DOC_FILE_TYPES[number];

export const DOC_PERIODS = ['today', '7d', '30d', 'year', 'lastYear'] as const;
export type DocPeriod = typeof DOC_PERIODS[number];

export type DocSortField = 'name' | 'createdAt' | 'size';
export type SortOrder = 'asc' | 'desc';

// richtung beim ersten klick auf eine spalte
const DEFAULT_ORDER: Record<DocSortField, SortOrder> = {
	name: 'asc',
	createdAt: 'desc',
	size: 'desc',
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sameItems(a: readonly string[], b: readonly string[]) {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// "2026-03-01" -> lokales datum um 00:00
function parseDate(value: string) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

// such- und filterzustand der dokumentenliste, die url ist die einzige quelle:
// ?q=telekom&type=pdf&period=30d&group=<id>&sort=size&order=desc&page=2
@Service()
export class DocFilters {
	private readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);

	private readonly params = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap
	});

	// suchtext
	readonly q = computed(() => this.params().get('q')?.trim() ?? '');

	// einzelne suchwoerter, zum markieren der treffer
	readonly terms = computed(
		() => this.q().split(/\s+/).filter(term => term !== ''),
		{ equal: sameItems }
	);

	readonly types = computed(
		() => this.params().getAll('type').filter((type): type is DocFileType => DOC_FILE_TYPES.includes(type as DocFileType)),
		{ equal: sameItems }
	);

	readonly groupIds = computed(() => this.params().getAll('group'), { equal: sameItems });

	// zeitraum: entweder ein preset oder ein eigener bereich (from / to)
	readonly period = computed(() => {
		const period = this.params().get('period') as DocPeriod | null;
		return period && DOC_PERIODS.includes(period) ? period : null;
	});

	readonly from = computed(() => this.readDate('from'));
	readonly to = computed(() => this.readDate('to'));

	readonly hasDateFilter = computed(() => !!(this.period() || this.from() || this.to()));

	// zeitraum als zeitpunkte fuer die api, createdTo ist exklusiv
	readonly createdFrom = computed(() => {
		const today = startOfDay(new Date());
		switch (this.period()) {
			case 'today': return today.toISOString();
			case '7d': return addDays(today, -7).toISOString();
			case '30d': return addDays(today, -30).toISOString();
			case 'year': return new Date(today.getFullYear(), 0, 1).toISOString();
			case 'lastYear': return new Date(today.getFullYear() - 1, 0, 1).toISOString();
		}
		const from = this.from();
		return from ? parseDate(from).toISOString() : null;
	});

	readonly createdTo = computed(() => {
		if (this.period() === 'lastYear') {
			return new Date(new Date().getFullYear(), 0, 1).toISOString();
		}
		if (this.period()) {
			return null;
		}
		// der "bis" tag soll noch komplett dabei sein
		const to = this.to();
		return to ? addDays(parseDate(to), 1).toISOString() : null;
	});

	// vom user gewaehlte sortierung, null = standard
	readonly sort = computed(() => {
		const sort = this.params().get('sort') as DocSortField | null;
		return sort && sort in DEFAULT_ORDER ? sort : null;
	});

	readonly order = computed((): SortOrder => {
		const order = this.params().get('order');
		if (order === 'asc' || order === 'desc') {
			return order;
		}
		return DEFAULT_ORDER[this.sort() ?? 'name'];
	});

	// spalte nach der gerade sortiert wird, null = relevanz (nur bei textsuche)
	readonly activeSort = computed((): DocSortField | null =>
		this.sort() ?? (this.q() ? null : 'name')
	);

	readonly page = computed(() => {
		const page = Number(this.params().get('page'));
		return Number.isInteger(page) && page >= 1 ? page : 1;
	});

	// filter in der chip leiste
	readonly hasChipFilters = computed(() =>
		this.types().length > 0 || this.groupIds().length > 0 || this.hasDateFilter()
	);

	readonly hasFilters = computed(() => this.q() !== '' || this.hasChipFilters());

	setQuery(q: string) {
		if (q === this.q()) {
			return;
		}
		// neuer suchtext -> wieder nach relevanz sortieren
		// replaceUrl: nicht jeder tastendruck soll in der browser history landen
		this.navigate({ q: q || null, sort: null, order: null }, true);
	}

	toggleType(type: DocFileType) {
		this.navigate({ type: this.toggle(this.types(), type) });
	}

	toggleGroup(groupId: string) {
		this.navigate({ group: this.toggle(this.groupIds(), groupId) });
	}

	setPeriod(period: DocPeriod | null) {
		this.navigate({ period, from: null, to: null });
	}

	setRange(from: string | null, to: string | null) {
		this.navigate({ period: null, from: from || null, to: to || null });
	}

	// klick auf spaltenkopf: gleiche spalte dreht die richtung um
	toggleSort(field: DocSortField) {
		let order = DEFAULT_ORDER[field];
		if (this.activeSort() === field) {
			order = this.order() === 'asc' ? 'desc' : 'asc';
		}

		// name aufsteigend ist ohne suche der standard, dann bleibt die url sauber
		const isDefault = !this.q() && field === 'name' && order === 'asc';
		this.navigate(isDefault ? { sort: null, order: null } : { sort: field, order });
	}

	setPage(page: number) {
		if (page === this.page()) {
			return;
		}
		this.router.navigate([], {
			queryParams: { page: page > 1 ? page : null },
			queryParamsHandling: 'merge'
		});
	}

	// suche und filter entfernen, ?tag und ?doc bleiben
	reset() {
		this.navigate({
			q: null, type: null, group: null, period: null, from: null, to: null, sort: null, order: null
		});
	}

	// gleiche suche in allen dokumenten statt nur im ausgewaehlten tag
	searchEverywhere() {
		this.navigate({ tag: null });
	}

	// jede aenderung an suche oder filter startet wieder auf seite 1
	private navigate(queryParams: Params, replaceUrl = false) {
		this.router.navigate([], {
			queryParams: { ...queryParams, page: null },
			queryParamsHandling: 'merge',
			replaceUrl
		});
	}

	private toggle<T extends string>(items: readonly T[], item: T): T[] | null {
		const next = items.includes(item) ? items.filter(other => other !== item) : [...items, item];
		return next.length > 0 ? next : null;
	}

	private readDate(key: string) {
		const value = this.params().get(key);
		return value && DATE_PATTERN.test(value) && !isNaN(parseDate(value).getTime()) ? value : null;
	}
}
