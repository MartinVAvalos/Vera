import { BibleRef } from './bible.models';

export interface Note {
  id: string;
  reference: BibleRef;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  reference: BibleRef;
  label: string;
  created_at: string;
}

export interface Highlight {
  id: string;
  reference: BibleRef;
  color: string;
  created_at: string;
}
