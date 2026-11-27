import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../../core/state/app.state';
import { BibleService } from '../../../core/services';
import { BibleBook, BibleRef } from '../../../core/models';

@Component({
  selector: 'app-book-nav',
  imports: [FormsModule],
  templateUrl: './book-nav.component.html',
  styleUrl: './book-nav.component.scss',
})
export class BookNavComponent {
  protected readonly state    = inject(AppState);
  private  readonly bibleService = inject(BibleService);

  protected readonly books       = signal<BibleBook[]>([]);
  protected readonly loadError   = signal<string | null>(null);

  // Signals (not plain fields): the app is zoneless, so only signal writes refresh the view.
  protected readonly selectedBook    = signal('');
  protected readonly selectedChapter = signal(1);
  protected readonly selectedVerse   = signal(1);

  protected readonly currentBook = computed(() =>
    this.books().find(b => b.id === this.selectedBook()) ?? null
  );
  protected readonly chapterNums = computed(() => {
    const book = this.currentBook();
    return book ? range(1, book.chapters) : [this.selectedChapter()];
  });
  /** Real verse numbers of the loaded chapter; falls back to the selected verse until it loads. */
  protected readonly verseNums = computed(() => {
    const ids = this.state.activePanelVerseIds();
    return ids.length ? ids : [this.selectedVerse()];
  });

  private lastModuleId = '';

  constructor() {
    // Sync selectors when the active panel ref changes externally (e.g. history nav)
    effect(() => {
      const panel = this.state.activePanel();
      if (!panel) return;

      untracked(() => {
        if (panel.moduleId !== this.lastModuleId) {
          this.lastModuleId = panel.moduleId;
          this.books.set([]);
          this.loadBooks(panel.moduleId);
        }
        this.syncFromRef(panel.ref);
      });
    });
  }

  private async loadBooks(moduleId: string): Promise<void> {
    try {
      const loaded = await this.bibleService.listBooks(moduleId);
      // Ignore a response for a module that is no longer active.
      if (moduleId !== this.lastModuleId) return;
      this.loadError.set(null);
      this.books.set(loaded);
    } catch (e) {
      if (moduleId !== this.lastModuleId) return;
      // No invented book list: show the failure instead of offering books that may not exist.
      this.books.set([]);
      this.loadError.set(e instanceof Error ? e.message : String(e));
    }
  }

  private syncFromRef(ref: BibleRef): void {
    this.selectedBook.set(ref.book);
    this.selectedChapter.set(ref.chapter);
    this.selectedVerse.set(ref.verse || 1);
  }

  protected onBookChange(book: string): void {
    this.selectedBook.set(book);
    this.selectedChapter.set(1);
    this.selectedVerse.set(1);
    this.navigate();
  }

  protected onChapterChange(chapter: number): void {
    this.selectedChapter.set(chapter);
    this.selectedVerse.set(1);
    this.navigate();
  }

  protected onVerseChange(verse: number): void {
    this.selectedVerse.set(verse);
    this.navigate();
  }

  protected prevChapter(): void {
    if (this.selectedChapter() > 1) this.onChapterChange(this.selectedChapter() - 1);
  }

  protected nextChapter(): void {
    const max = this.currentBook()?.chapters ?? 1;
    if (this.selectedChapter() < max) this.onChapterChange(this.selectedChapter() + 1);
  }

  protected goBack():    void { const r = this.state.goBack();    if (r) this.syncFromRef(r); }
  protected goForward(): void { const r = this.state.goForward(); if (r) this.syncFromRef(r); }

  private navigate(): void {
    this.state.navigateTo({
      book: this.selectedBook(), chapter: this.selectedChapter(), verse: this.selectedVerse(),
    });
  }
}

function range(from: number, to: number): number[] {
  const arr: number[] = [];
  for (let i = from; i <= to; i++) arr.push(i);
  return arr;
}
