import { Component } from '@angular/core';
import { DocReview } from '../doc-review/doc-review';
import { DocList } from '../doc-list/doc-list';
import { DocDetail } from '../doc-detail/doc-detail';
import { DocBreadcrump } from '../doc-breadcrump/doc-breadcrump';
import { DocSearch } from '../doc-search/doc-search';

@Component({
  selector: 'app-doc-page',
  imports: [DocReview, DocList, DocDetail, DocBreadcrump, DocSearch],
  templateUrl: './doc-page.html',
  styleUrl: './doc-page.scss',
})
export class DocPage {}
