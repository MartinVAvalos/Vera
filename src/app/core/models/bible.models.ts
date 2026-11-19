export interface BibleRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  translation: string;
}

export interface Chapter {
  book: string;
  chapter: number;
  verses: Verse[];
}

/** Canonical book entry returned by list_books. */
export interface BibleBook {
  id: string;       // OSIS abbreviation e.g. "Gen"
  name: string;     // "Genesis"
  chapters: number;
}

export interface SearchResult {
  module_id: string;
  reference: BibleRef;
  snippet: string;
  score: number;
}

/** Which OSIS elements to include when rendering a chapter. */
export interface FilterOptions {
  verse_numbers: boolean;
  headings: boolean;
  footnotes: boolean;
  strongs: boolean;
  red_letter: boolean;
  cross_refs: boolean;
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  verse_numbers: true,
  headings: true,
  footnotes: false,
  strongs: false,
  red_letter: true,
  cross_refs: false,
};

export interface DisplayOptions {
  font_size: number;   // 1–5, default 3
  line_breaks: boolean;
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  font_size: 3,
  line_breaks: false,
};

export function formatRef(ref: BibleRef): string {
  return `${ref.book} ${ref.chapter}:${ref.verse}`;
}

export function parseRef(raw: string): BibleRef | null {
  const match = raw.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;
  return { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) };
}
