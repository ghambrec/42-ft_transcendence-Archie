import { Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Translation, TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap';
import { DOC_FILE_TYPES, DOC_PERIODS, DocFilters } from '../doc-filters';
import { Groups } from '../../groups/groups';
import { Tags } from '../../tags/tags';

const SEARCH_DELAY_MS = 300;
const MAX_TAG_SUGGESTIONS = 4;

@Component({
	selector: 'app-doc-search',
	imports: [DatePipe, RouterLink, TranslocoPipe, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem],
	templateUrl: './doc-search.html',
	styleUrl: './doc-search.scss',
})
export class DocSearch {
	protected readonly filters = inject(DocFilters);
	private readonly tags = inject(Tags);
	private readonly groups = inject(Groups);
	private readonly transloco = inject(TranslocoService);

	protected readonly fileTypes = DOC_FILE_TYPES;
	protected readonly periods = DOC_PERIODS;

	// text im suchfeld. folgt der url (zurueck button, tag wechsel, reset),
	// ausser die url enthaelt schon genau das was gerade getippt wurde
	protected readonly draft = linkedSignal<string, string>({
		source: this.filters.q,
		computation: (q, previous) => previous && previous.value.trim() === q ? previous.value : q,
	});

	// gruppen in denen der user dokumente lesen darf
	private readonly readGroups = this.groups.groupsWithPermission('documents.read');
	protected readonly groupList = computed(() => this.readGroups.hasValue() ? this.readGroups.value() : []);

	// gruppen filter nur anzeigen wenn es etwas zu waehlen gibt
	protected readonly showGroupFilter = computed(() =>
		this.groupList().length > 1 || this.filters.groupIds().length > 0
	);

	protected readonly selectedGroupNames = computed(() => {
		const selected = this.filters.groupIds();
		return this.groupList().filter(group => selected.includes(group.id)).map(group => group.name);
	});

	private readonly translation = toSignal(
		this.transloco.selectTranslation(),
		{ initialValue: {} as Translation }
	);

	// system tags haben nur einen uebersetzungs key als label, das backend kann sie
	// deshalb nicht per text finden -> passende tags hier als abkuerzung anbieten
	protected readonly tagSuggestions = computed(() => {
		const search = this.draft().trim().toLowerCase();
		if (search.length < 2 || !this.tags.tagDocsList.hasValue()) {
			return [];
		}

		const translation = this.translation();
		const selectedTagId = this.tags.selectedTagId();

		return this.tags.tagDocsList.value()
			.filter(tag => tag.id !== selectedTagId)
			.map(tag => ({ id: tag.id, label: (translation[tag.label] ?? tag.label) as string }))
			.filter(tag => tag.label.toLowerCase().includes(search))
			.slice(0, MAX_TAG_SUGGESTIONS);
	});

	constructor() {
		// erst suchen wenn kurz nicht mehr getippt wurde
		effect((onCleanup) => {
			const text = this.draft().trim();
			if (text === untracked(this.filters.q)) {
				return;
			}
			const timeoutId = setTimeout(() => this.filters.setQuery(text), SEARCH_DELAY_MS);
			onCleanup(() => clearTimeout(timeoutId));
		});
	}

	// enter: sofort suchen
	protected searchNow() {
		this.filters.setQuery(this.draft().trim());
	}
}
