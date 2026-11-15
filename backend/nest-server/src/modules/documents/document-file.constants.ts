// grobe kategorien fuer den typ filter der dokumentensuche
export enum DocumentFileCategory {
	Pdf = 'pdf',
	Image = 'image',
	Text = 'text',
	Word = 'word',
	Excel = 'excel',
	Archive = 'archive',
}

export interface AllowedFileType {
	mimeType: string;
	detectedMimeType: string | null;
	aiSupported: boolean;
	previewable: boolean;
	category: DocumentFileCategory;
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ODT = 'application/vnd.oasis.opendocument.text';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CFB = 'application/x-cfb';

export const ALLOWED_FILE_TYPES = new Map<string, AllowedFileType>([
	['txt',		{ mimeType: 'text/plain',				detectedMimeType: null,					aiSupported: true,		previewable: true,	category: DocumentFileCategory.Text }],
	['pdf',		{ mimeType: 'application/pdf',			detectedMimeType: 'application/pdf',	aiSupported: true,		previewable: true,	category: DocumentFileCategory.Pdf }],
	['png',		{ mimeType: 'image/png',				detectedMimeType: 'image/png',			aiSupported: true,		previewable: true,	category: DocumentFileCategory.Image }],
	['jpg',		{ mimeType: 'image/jpeg',				detectedMimeType: 'image/jpeg',			aiSupported: true,		previewable: true,	category: DocumentFileCategory.Image }],
	['jpeg',	{ mimeType: 'image/jpeg',				detectedMimeType: 'image/jpeg',			aiSupported: true,		previewable: true,	category: DocumentFileCategory.Image }],
	['heic',	{ mimeType: 'image/heic',				detectedMimeType: 'image/heic',			aiSupported: true,		previewable: false,	category: DocumentFileCategory.Image }],
	['docx',	{ mimeType: DOCX,						detectedMimeType: DOCX,					aiSupported: true,		previewable: false,	category: DocumentFileCategory.Word }],
	['odt',		{ mimeType: ODT,						detectedMimeType: ODT,					aiSupported: true,		previewable: false,	category: DocumentFileCategory.Word }],
	['xlsx',	{ mimeType: XLSX,						detectedMimeType: XLSX,					aiSupported: true,		previewable: false,	category: DocumentFileCategory.Excel }],
	['doc',		{ mimeType: 'application/msword',		detectedMimeType: CFB,					aiSupported: false,		previewable: false,	category: DocumentFileCategory.Word }],
	['xls',		{ mimeType: 'application/vnd.ms-excel',	detectedMimeType: 'application/x-cfb',	aiSupported: true,		previewable: false,	category: DocumentFileCategory.Excel }],
	['md',		{ mimeType: 'text/markdown',			detectedMimeType: null,					aiSupported: true,		previewable: true,	category: DocumentFileCategory.Text }],
	['csv',		{ mimeType: 'text/csv',					detectedMimeType: null,					aiSupported: true,		previewable: true,	category: DocumentFileCategory.Excel }],
	['zip',		{ mimeType: 'application/zip',			detectedMimeType: 'application/zip',	aiSupported: false,		previewable: false,	category: DocumentFileCategory.Archive }],
]);

export const FILENAME_MAX_LENGTH = 255;
export const FILENAME_FALLBACK = 'file';
export const FILENAME_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g; // new lines, tabs, etc

export const PREVIEWABLE_MIME_TYPES = new Set([...ALLOWED_FILE_TYPES.values()].filter((type) => type.previewable).map((type) => type.mimeType));

// kategorie -> alle mime types dieser kategorie
export const MIME_TYPES_BY_CATEGORY = new Map<DocumentFileCategory, string[]>();
for (const type of ALLOWED_FILE_TYPES.values()) {
	const mimeTypes = MIME_TYPES_BY_CATEGORY.get(type.category) ?? [];
	if (!mimeTypes.includes(type.mimeType)) {
		mimeTypes.push(type.mimeType);
	}
	MIME_TYPES_BY_CATEGORY.set(type.category, mimeTypes);
}
