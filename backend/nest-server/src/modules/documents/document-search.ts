import { DocumentMatchDto, DocumentMatchSource } from './dto/document-match.dto';

export const MAX_SEARCH_TERMS = 8;

const SNIPPET_LENGTH = 180;
const SNIPPET_LEAD = 60; // text vor dem ersten treffer

// suchtext in woerter teilen, jedes wort muss einzeln passen
export function parseSearchTerms(q?: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const term of (q ?? '').split(/\s+/)) {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_SEARCH_TERMS) {
      break;
    }
  }
  return terms;
}

// wort zu ILIKE muster, % und _ escapen
export function toLikePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

export function searchParamName(index: number): string {
  return `searchTerm${index}`;
}

// parameter fuer alle suchwoerter
export function buildSearchParameters(terms: string[]): Record<string, string> {
  const parameters: Record<string, string> = {};
  terms.forEach((term, index) => {
    parameters[searchParamName(index)] = toLikePattern(term);
  });
  return parameters;
}

interface SearchField {
  weight: number;
  condition: (param: string) => string;
}

// felder in denen gesucht wird, weight = punkte fuer die relevanz
const SEARCH_FIELDS: SearchField[] = [
  {
    // dateiname
    weight: 10,
    condition: (param) => `document.filename ILIKE :${param}`,
  },
  {
    // system tags haben nur einen key als label, deshalb nur name
    weight: 6,
    condition: (param) => `document.id IN (
      SELECT s_dt.document_id
      FROM document_tags s_dt
      INNER JOIN tags s_tag ON s_tag.id = s_dt.tag_id
      WHERE s_tag.name ILIKE :${param}
        OR (s_tag.is_system = false AND s_tag.label ILIKE :${param})
    )`,
  },
  {
    // ki zusammenfassung
    weight: 4,
    condition: (param) => `document.id IN (
      SELECT s_ai.id FROM ai_documents s_ai WHERE s_ai.ai_summary ILIKE :${param}
    )`,
  },
  {
    // hochlader
    weight: 2,
    condition: (param) => `document.uploadedBy IN (
      SELECT s_user.id FROM users s_user WHERE s_user.display_name ILIKE :${param}
    )`,
  },
  {
    // gruppenname
    weight: 2,
    condition: (param) => `document.id IN (
      SELECT s_dg.document_id
      FROM document_groups s_dg
      INNER JOIN "groups" s_group ON s_group.id = s_dg.group_id
      WHERE s_group.name ILIKE :${param}
    )`,
  },
  {
    // extrahierter text
    weight: 1,
    condition: (param) => `document.id IN (
      SELECT s_chunk.ai_document_id FROM ai_chunks s_chunk WHERE s_chunk.content ILIKE :${param}
    )`,
  },
];

// wort kommt in mindestens einem feld vor
export function buildTermCondition(param: string): string {
  return `(${SEARCH_FIELDS.map((field) => field.condition(param)).join(' OR ')})`;
}

// relevanz: summe der punkte ueber alle woerter
export function buildScoreExpression(params: string[]): string {
  const parts = params.flatMap((param) =>
    SEARCH_FIELDS.map((field) => `CASE WHEN ${field.condition(param)} THEN ${field.weight} ELSE 0 END`),
  );
  return parts.join(' + ');
}

// chunk mit den meisten treffern, fuer den textausschnitt
export function buildBestChunkSubquery(params: string[]): string {
  const hits = params.map((param) => `s_chunk.content ILIKE :${param}`);
  const hitCount = hits.map((hit) => `CASE WHEN ${hit} THEN 1 ELSE 0 END`).join(' + ');

  return `(
    SELECT s_chunk.content
    FROM ai_chunks s_chunk
    WHERE s_chunk.ai_document_id = document.id AND (${hits.join(' OR ')})
    ORDER BY ${hitCount} DESC, s_chunk.chunk_index ASC
    LIMIT 1
  )`;
}

function findFirstHit(text: string, terms: string[]): number {
  let first = -1;
  for (const term of terms) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const index = text.search(pattern);
    if (index !== -1 && (first === -1 || index < first)) {
      first = index;
    }
  }
  return first;
}

// parser reste aus dem text entfernen
function cleanSnippetText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/(?:Native pdf|OCR) extraction text:\s*:?\s*,?/gi, ' ')
    .replace(/[|#*]+|-{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// kurzer ausschnitt um den ersten treffer
export function buildSnippet(text: string | null | undefined, terms: string[]): string | null {
  if (!text) {
    return null;
  }

  const clean = cleanSnippetText(text);
  const hit = findFirstHit(clean, terms);
  if (hit === -1) {
    return null;
  }

  let start = Math.max(0, hit - SNIPPET_LEAD);
  if (start > 0) {
    // nicht mitten im wort anfangen
    const nextSpace = clean.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < hit) {
      start = nextSpace + 1;
    }
  }
  const end = Math.min(clean.length, start + SNIPPET_LENGTH);

  return `${start > 0 ? '… ' : ''}${clean.slice(start, end).trim()}${end < clean.length ? ' …' : ''}`;
}

// erst text, sonst zusammenfassung
export function buildMatch(
  bestChunk: string | null | undefined,
  aiSummary: string | null | undefined,
  terms: string[],
): DocumentMatchDto | undefined {
  const contentSnippet = buildSnippet(bestChunk, terms);
  if (contentSnippet) {
    return { source: DocumentMatchSource.Content, snippet: contentSnippet };
  }

  const summarySnippet = buildSnippet(aiSummary, terms);
  if (summarySnippet) {
    return { source: DocumentMatchSource.Summary, snippet: summarySnippet };
  }

  return undefined;
}
