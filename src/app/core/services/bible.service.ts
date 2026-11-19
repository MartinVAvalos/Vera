import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { BibleBook, Chapter, SearchResult, Verse } from '../models';

@Injectable({ providedIn: 'root' })
export class BibleService {
  getChapter(moduleId: string, book: string, chapter: number): Promise<Chapter> {
    return invoke<Chapter>('get_chapter', { moduleId, book, chapter });
  }

  getVerse(moduleId: string, book: string, chapter: number, verse: number): Promise<Verse> {
    return invoke<Verse>('get_verse', { moduleId, book, chapter, verse });
  }

  listBooks(moduleId: string): Promise<BibleBook[]> {
    return invoke<BibleBook[]>('list_books', { moduleId });
  }

  searchText(query: string, limit = 50): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('search_text', { query, limit });
  }
}
