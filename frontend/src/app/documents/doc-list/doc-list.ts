import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgbHighlight, NgbPagination, NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { Documents } from '../documents';
import { DocStatusBadge } from '../doc-status-badge/doc-status-badge';
import { FileSizePipe } from '../../core/file-size-pipe';
import { RouterLink } from '@angular/router';
import { DocFilters, DocSortField } from '../doc-filters';
import { Tags } from '../../tags/tags';

@Component({
	selector: 'app-doc-list',
	imports: [DatePipe, TranslocoPipe, NgbPagination, NgbTooltip, NgbHighlight, DocStatusBadge, FileSizePipe, RouterLink],
	templateUrl: './doc-list.html',
	styleUrl: './doc-list.scss',
})
export class DocList {
	protected readonly docs = inject(Documents);
	protected readonly filters = inject(DocFilters);
	protected readonly tags = inject(Tags);

	// pfeil im spaltenkopf, nur bei der spalte nach der sortiert wird
	protected sortIcon(field: DocSortField) {
		if (this.filters.activeSort() !== field) {
			return 'bi-chevron-expand sort-idle';
		}
		return this.filters.order() === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill';
	}

	// fuer screenreader
	protected ariaSort(field: DocSortField) {
		if (this.filters.activeSort() !== field) {
			return null;
		}
		return this.filters.order() === 'asc' ? 'ascending' : 'descending';
	}
}
