import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import { Logger } from 'nestjs-pino';
import { StorageService, DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS } from '../storage/storage.service';
import { Document } from './entities/document.entity';
import { User } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { DocumentGroup } from '../document-groups/entities/document-group.entity';
import { Tag } from '../tags/entities/tag.entity';
import { DocumentTag } from '../tags/entities/document-tag.entity';
import { DocumentAiStatus } from './dto/document-ai-status.enum';
import { UploadResponseDto } from './dto/upload-response.dto';
import { DocumentSortField, GetDocumentsQueryDto, SortOrder } from './dto/get-documents-query.dto';
import { GetDocumentsResponseDto } from './dto/get-documents-response.dto';
import { DocumentSummaryDto } from './dto/document-summary.dto';
import { DocumentDownloadStreamDto } from './dto/document-download-stream.dto';
import { ApplicationException } from 'src/common/errors/application.exception';
import { ErrorCode } from 'src/common/errors/error-code';
import { GroupsService } from '../groups/groups.service';
import { DocumentGroupsService } from '../document-groups/document-groups.service';
import { IngestionService } from '../ai-service/ingestion/ingestion.service';
import { TagsService } from '../tags/tags.service';
import { DocumentTagResponseDto } from './dto/document-tag-response.dto';
import { DocumentGroupResponseDto } from './dto/document-group-response.dto';
import { ConfirmSuggestedTagsResponseDto } from './dto/confirm-suggested-tags-response.dto';
import { DocumentFileValidationService } from './document-file-validation.service';
import { PermissionsService } from '../permissions/permissions.service';
import { DocumentPermission } from '../permissions/permission-keys';
import { MIME_TYPES_BY_CATEGORY, PREVIEWABLE_MIME_TYPES } from './document-file.constants';
import {
  buildBestChunkSubquery,
  buildMatch,
  buildScoreExpression,
  buildSearchParameters,
  buildTermCondition,
  parseSearchTerms,
} from './document-search';
import { RenameDocumentResponseDto } from './dto/rename-document-response.dto';

const DOCUMENTS_BUCKET = 'documents';

// sortierung: feld -> sql und standard richtung
const SORT_COLUMNS: Record<
  Exclude<DocumentSortField, DocumentSortField.Relevance>,
  { expression: string; defaultOrder: SortOrder }
> = {
  [DocumentSortField.Name]: { expression: 'LOWER(document.filename)', defaultOrder: SortOrder.Asc },
  [DocumentSortField.CreatedAt]: { expression: 'document.createdAt', defaultOrder: SortOrder.Desc },
  [DocumentSortField.Size]: { expression: 'document.sizeBytes', defaultOrder: SortOrder.Desc },
};

// zeile aus createSummaryQuery
interface DocumentSummaryRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: Date;
  updatedAt: Date;
  uploaderId: string;
  uploaderName: string;
  aiStatus: DocumentAiStatus | null;
  aiSummary: string | null;
  language: string | null;
  aiErrorKey: string | null;
  groups: { id: string; name: string }[];
  tags: { id: string; name: string; label: string }[];
  matchChunk?: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly storageService: StorageService,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly groupsService: GroupsService,
    private readonly documentGroupsService: DocumentGroupsService,
    private readonly aiIngestionService: IngestionService,
    private readonly tagsService: TagsService,
    private readonly logger: Logger,
	private readonly documentFileValidationService: DocumentFileValidationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async upload(
    userId: string,
    groupId: string,
    file: Express.Multer.File,
  ): Promise<UploadResponseDto> {

	const filename = this.documentFileValidationService.normalizeFilename(file.originalname);

    this.logger.log(
      { userId, groupId, filename: filename, mimeType: file.mimetype, sizeBytes: file.size },
      'Uploading document',
    );

	const mimeType = await this.documentFileValidationService.validate(file);

    await this.groupsService.get(groupId, userId);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    if (await this.existsInGroup(groupId, sha256)) {
      this.logger.warn({ userId, groupId, sha256 }, 'Document already exists in group');
      throw new ApplicationException(ErrorCode.DocumentAlreadyExistsInGroup);
    }

    const key = `${DOCUMENTS_BUCKET}-${randomUUID()}`;

    await this.storageService.putObject(
      DOCUMENTS_BUCKET,
      key,
      file.buffer,
      file.size,
      {
        'Content-Type': mimeType,
      },
    );

    const insertResult = await this.documentsRepository.insert({
      uploadedBy: userId,
      filename: filename,
      mimeType: mimeType,
      objectKey: key,
      sizeBytes: file.size,
      sha256,
    });

    const documentId = insertResult.identifiers[0].id as string;

    await this.documentGroupsService.setGroup(documentId, groupId);

    this.logger.log({ documentId, groupId }, 'Document uploaded successfully');

    try {
		await this.aiIngestionService.triggerIngestion(documentId);
	} catch (error) {
		this.logger.error({ documentId, error }, 'could not trigger ingestion pipeline, is ai service running?');
	}

    return { id: documentId, objectKey: key };
  }

  async findAll(userId: string, query: GetDocumentsQueryDto): Promise<GetDocumentsResponseDto> {
    const { page, limit } = query;
    const terms = parseSearchTerms(query.q);
    const searchParameters = buildSearchParameters(terms);
    const searchParams = Object.keys(searchParameters);

    this.logger.log({ userId, page, limit, searchTerms: terms.length }, 'Listing documents');

    // 1. welche dokumente: leserecht, filter, textsuche
    const baseQuery = await this.createReadableDocumentsQuery(userId, query.groupId);

    if (!baseQuery) {
      this.logger.log({ userId, total: 0 }, 'Documents listed successfully');
      return { data: [], page, limit, total: 0, totalPages: 0 };
    }

    this.applyFilters(baseQuery, query);

    for (const param of searchParams) {
      baseQuery.andWhere(buildTermCondition(param));
    }
    baseQuery.setParameters(searchParameters);

    const total = await baseQuery.getCount();

    // 2. welche seite: nur die ids
    const pageQuery = baseQuery.clone().select('document.id', 'id');
    this.applySorting(pageQuery, query, searchParams);

    const pageRows = await pageQuery
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: string }>();
    const ids = pageRows.map((row) => row.id);

    // 3. daten fuer die ids der seite laden
    let documents: DocumentSummaryDto[] = [];
    if (ids.length > 0) {
      const summaryQuery = this.createSummaryQuery().where('document.id IN (:...ids)', { ids });

      if (searchParams.length > 0) {
        summaryQuery
          .addSelect(buildBestChunkSubquery(searchParams), 'matchChunk')
          .setParameters(searchParameters);
      }

      const rows = await summaryQuery.getRawMany<DocumentSummaryRow>();
      const rowsById = new Map(rows.map((row) => [row.id, row]));

      // IN behaelt die reihenfolge nicht, deshalb wieder nach ids sortieren
      documents = ids
        .map((id) => rowsById.get(id))
        .filter((row): row is DocumentSummaryRow => row !== undefined)
        .map((row) => this.toSummaryDto(row, terms));
    }

    this.logger.log({ userId, total }, 'Documents listed successfully');

    return {
      data: documents,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string): Promise<DocumentSummaryDto> {

    this.logger.log({ userId, id }, 'Find one document');

    // Access is checked by DocumentPermissionsGuard (documents.read)
    const raw = await this.createSummaryQuery()
      .where('document.id = :id', { id })
      .getRawOne<DocumentSummaryRow>();

    if (!raw) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    this.logger.log({ userId, id }, 'One document found');

    return this.toSummaryDto(raw);
  }

  async downloadStream(userId: string, id: string): Promise<DocumentDownloadStreamDto> {

    this.logger.log({ userId, id }, 'Stream document download');

    const document = await this.findDocumentFile(id);

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    const stream = await this.storageService.getObject(DOCUMENTS_BUCKET, document.objectKey);

    this.logger.log({ userId, id }, 'Document download stream opened');

    return {
      stream,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    };
  }

  async previewStream(userId: string, id: string): Promise<DocumentDownloadStreamDto> {
	this.logger.log({ userId, id }, 'stream document preview');

	const document = await this.findDocumentFile(id);

	if (!PREVIEWABLE_MIME_TYPES.has(document.mimeType)) {
		throw new ApplicationException(ErrorCode.DocumentNotPreviewable);
	}

	const stream = await this.storageService.getObject(DOCUMENTS_BUCKET, document.objectKey);

	this.logger.log({ userId, id }, 'document preview stream opened');

	return {
		stream,
		filename: document.filename,
		mimeType: document.mimeType,
		sizeBytes: document.sizeBytes
	}
  }

  async setTag(
    userId: string,
    id: string,
    tagId: string,
  ): Promise<DocumentTagResponseDto> {

    this.logger.log({ userId, id, tagId }, 'Assign tag to document');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    await this.tagsService.assignToDocument(id, tagId);

    this.logger.log({ userId, id, tagId }, 'Tag assigned to document');

    return { documentId: id, tagId };
  }

  async confirmSuggestedTags(
    userId: string,
    id: string,
  ): Promise<ConfirmSuggestedTagsResponseDto> {

    this.logger.log({ userId, id }, 'Confirm suggested tags for document');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    const confirmedTagIds = await this.tagsService.confirmAiSuggestions(id);

    this.logger.log({ userId, id, count: confirmedTagIds.length }, 'Suggested tags confirmed');

    return { documentId: id, confirmedTagIds };
  }

  async removeTag(
    userId: string,
    id: string,
    tagId: string,
  ): Promise<void> {

    this.logger.log({ userId, id, tagId }, 'Remove tag from document');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    await this.tagsService.removeFromDocument(id, tagId);

    this.logger.log({ userId, id, tagId }, 'Tag removed from document');
  }

  async rename(
    userId: string,
    id: string,
    filename: string,
  ): Promise<RenameDocumentResponseDto> {
    this.logger.log({ userId, id }, 'Rename document');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true, filename: true },
    });
    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    const newFilename = this.documentFileValidationService.buildRenamedFilename(document.filename, filename);
    await this.documentsRepository.update(id, { filename: newFilename });
    this.logger.log({ userId, id, oldFilename: document.filename, newFilename }, 'Document renamed');
    return { documentId: id, filename: newFilename };
  }

  async moveToGroup(
    userId: string,
    id: string,
    groupId: string,
  ): Promise<DocumentGroupResponseDto> {

    this.logger.log({ userId, id, groupId }, 'Move document to group');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true, sha256: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    // Check if group exists
    await this.groupsService.get(groupId, userId);

	// pruefen ob upload berechtigung in zielgruppe vorhanden ist
	const canUploadToTarget = await this.permissionsService.hasPermission(userId, groupId, DocumentPermission.Upload);
	if (!canUploadToTarget) {
		this.logger.warn({ userId, id, groupId }, 'Missing upload permission in target group');
		throw new ForbiddenException();
	}

    if (await this.existsInGroup(groupId, document.sha256, id)) {
      this.logger.warn({ userId, groupId, sha256: document.sha256 }, 'Document already exists in group');
      throw new ApplicationException(ErrorCode.DocumentAlreadyExistsInGroup);
    }

    await this.documentGroupsService.moveToGroup(id, groupId);

    this.logger.log({ userId, id, groupId }, 'Document moved to group');

    return { documentId: id, groupId };
  }

  async removeGroup(
    userId: string,
    id: string,
    groupId: string,
  ): Promise<void> {

    this.logger.log({ userId, id, groupId }, 'Remove document from group');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    await this.documentGroupsService.removeGroup(id, groupId);

    this.logger.log({ userId, id, groupId }, 'Document removed from group');
  }

  async remove(userId: string, id: string): Promise<void> {

    this.logger.log({ userId, id }, 'Delete document');

    const document = await this.documentsRepository.findOne({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new ApplicationException(ErrorCode.DocumentNotFound);
    }

    await this.documentsRepository.softDelete(id);

    this.logger.log({ userId, id }, 'Document deleted');
  }


  // filter, alle mit AND
  private applyFilters(qb: SelectQueryBuilder<Document>, query: GetDocumentsQueryDto): void {
    const { tagId, includeDescendants, type, createdFrom, createdTo } = query;

    if (tagId) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(DocumentTag, 'filterDocumentTag')
          .innerJoin(Tag, 'filterTag', 'filterTag.id = filterDocumentTag.tagId')
          .where('filterDocumentTag.documentId = document.id')
          .andWhere(
            includeDescendants
              ? '(filterTag.id = :tagId OR filterTag.parentId = :tagId)'
              : 'filterTag.id = :tagId',
            { tagId },
          )
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
    }

    if (type?.length) {
      const mimeTypes = type.flatMap((category) => MIME_TYPES_BY_CATEGORY.get(category) ?? []);
      qb.andWhere('document.mimeType IN (:...mimeTypes)', { mimeTypes });
    }

    if (createdFrom) {
      qb.andWhere('document.createdAt >= :createdFrom', { createdFrom });
    }

    if (createdTo) {
      qb.andWhere('document.createdAt < :createdTo', { createdTo });
    }
  }

  // spalten nur aus fester liste, nie direkt vom user
  private applySorting(
    qb: SelectQueryBuilder<Document>,
    query: GetDocumentsQueryDto,
    searchParams: string[],
  ): void {
    const isSearching = searchParams.length > 0;
    let sort = query.sort ?? (isSearching ? DocumentSortField.Relevance : DocumentSortField.Name);

    // relevanz geht nur mit suchtext
    if (sort === DocumentSortField.Relevance && !isSearching) {
      sort = DocumentSortField.Name;
    }

    if (sort === DocumentSortField.Relevance) {
      qb.addSelect(buildScoreExpression(searchParams), 'score')
        .orderBy('score', 'DESC')
        .addOrderBy('document.createdAt', 'DESC')
        .addOrderBy('document.id', 'ASC');
      return;
    }

    const column = SORT_COLUMNS[sort];
    const order = query.order ?? column.defaultOrder;

    qb.orderBy(column.expression, order === SortOrder.Asc ? 'ASC' : 'DESC')
      .addOrderBy('document.id', 'ASC');
  }

  // eine zeile pro dokument
  private createSummaryQuery(): SelectQueryBuilder<Document> {
    return this.documentsRepository
      .createQueryBuilder('document')
      .innerJoin(User, 'uploader', 'uploader.id = document.uploadedBy')
      .leftJoin(DocumentGroup, 'documentGroup', 'documentGroup.documentId = document.id')
      .leftJoin(Group, 'group', 'group.id = documentGroup.groupId')
      .leftJoin(DocumentTag, 'documentTag', 'documentTag.documentId = document.id')
      .leftJoin(Tag, 'tag', 'tag.id = documentTag.tagId')
      .leftJoin('ai_documents', 'aiDocument', '"aiDocument"."id" = document.id')
      .select([
        'document.id AS "id"',
        'document.filename AS "filename"',
        'document.mimeType AS "mimeType"',
        'document.sizeBytes AS "sizeBytes"',
        'document.createdAt AS "createdAt"',
        'document.updatedAt AS "updatedAt"',
        'uploader.id AS "uploaderId"',
        'uploader.displayName AS "uploaderName"',
        '"aiDocument"."status" AS "aiStatus"',
        '"aiDocument"."ai_summary" AS "aiSummary"',
        '"aiDocument"."language" AS "language"',
        '"aiDocument"."error_key" AS "aiErrorKey"',
      ])
      .addSelect(
        `COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', "group"."id", 'name', "group"."name"))
            FILTER (WHERE "group"."id" IS NOT NULL),
          '[]'
        )`,
        'groups',
      )
      .addSelect(
        `COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', "tag"."id", 'name', "tag"."name", 'label', "tag"."label"))
            FILTER (WHERE "tag"."id" IS NOT NULL),
          '[]'
        )`,
        'tags',
      )
      .groupBy('document.id')
      .addGroupBy('uploader.id')
      .addGroupBy('"aiDocument"."id"');
  }

  private toSummaryDto(row: DocumentSummaryRow, searchTerms: string[] = []): DocumentSummaryDto {
    const match = searchTerms.length > 0
      ? buildMatch(row.matchChunk, row.aiSummary, searchTerms)
      : undefined;

    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      uploadedBy: { id: row.uploaderId, name: row.uploaderName },
      groups: row.groups,
      tags: row.tags,
      aiStatus: row.aiStatus ?? DocumentAiStatus.NOT_STARTED,
      aiSummary: row.aiSummary ?? undefined,
      language: row.language ?? '',
      aiErrorKey: row.aiErrorKey ?? null,
      previewable: PREVIEWABLE_MIME_TYPES.has(row.mimeType),
      ...(match ? { match } : {}),
    };
  }

  // groupFilter schraenkt nur die lesbaren gruppen ein
  private async createReadableDocumentsQuery(
    userId: string,
    groupFilter?: string[],
  ): Promise<SelectQueryBuilder<Document> | null> {
    let readableGroupIds = await this.permissionsService.getGroupIdsWithPermission(
      userId,
      DocumentPermission.Read,
    );

    if (groupFilter?.length) {
      readableGroupIds = readableGroupIds.filter((groupId) => groupFilter.includes(groupId));
    }

    if (readableGroupIds.length === 0) {
      return null;
    }

    return this.documentsRepository
      .createQueryBuilder('document')
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(DocumentGroup, 'readableDocumentGroup')
          .where('readableDocumentGroup.documentId = document.id')
          .andWhere('readableDocumentGroup.groupId IN (:...readableGroupIds)', { readableGroupIds })
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
  }

  private existsInGroup(groupId: string, sha256: string, excludeDocumentId?: string): Promise<boolean> {
    const query = this.documentsRepository
      .createQueryBuilder('document')
      .innerJoin(DocumentGroup, 'documentGroup', 'documentGroup.documentId = document.id')
      .where('documentGroup.groupId = :groupId', { groupId })
      .andWhere('document.sha256 = :sha256', { sha256 });

    if (excludeDocumentId) {
      query.andWhere('document.id != :excludeDocumentId', { excludeDocumentId });
    }

    return query.getExists();
  }

  private async findDocumentFile(id: string) {
	const document = await this.documentsRepository.findOne({
		where: { id },
		select: { objectKey: true, filename: true, mimeType: true, sizeBytes: true },
	});

	if (!document) {
		throw new ApplicationException(ErrorCode.DocumentNotFound);
	}

	return document;
  }
}
