import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { Bookmark, Highlight, Note } from '../models';

@Injectable({ providedIn: 'root' })
export class NotesService {
  // ── Notes ────────────────────────────────────────────────────────────────

  getNotes(reference?: string): Promise<Note[]> {
    return invoke<Note[]>('get_notes', { reference: reference ?? null });
  }

  saveNote(note: Note): Promise<void> {
    return invoke<void>('save_note', { note });
  }

  deleteNote(id: string): Promise<void> {
    return invoke<void>('delete_note', { id });
  }

  // ── Bookmarks ─────────────────────────────────────────────────────────────

  getBookmarks(): Promise<Bookmark[]> {
    return invoke<Bookmark[]>('get_bookmarks');
  }

  saveBookmark(id: string, book: string, chapter: number, verse: number, label: string): Promise<Bookmark> {
    return invoke<Bookmark>('save_bookmark', { id, book, chapter, verse, label });
  }

  deleteBookmark(id: string): Promise<void> {
    return invoke<void>('delete_bookmark', { id });
  }

  // ── Highlights ────────────────────────────────────────────────────────────

  getHighlights(): Promise<Highlight[]> {
    return invoke<Highlight[]>('get_highlights');
  }

  saveHighlight(book: string, chapter: number, verse: number, color: string): Promise<void> {
    return invoke<void>('save_highlight', { book, chapter, verse, color });
  }

  deleteHighlight(id: string): Promise<void> {
    return invoke<void>('delete_highlight', { id });
  }
}
