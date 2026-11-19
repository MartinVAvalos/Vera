import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../../core/state/app.state';
import { BibleService } from '../../../core/services';
import { BibleBook, BibleRef } from '../../../core/models';

@Component({
  selector: 'app-book-nav',
  imports: [FormsModule],
  template: `
    <nav class="book-nav">
      <button class="nav-btn" [disabled]="!state.canGoBack()"    (click)="goBack()"    title="Back">‹</button>
      <button class="nav-btn" [disabled]="!state.canGoForward()" (click)="goForward()" title="Forward">›</button>
      <div class="divider"></div>

      <select class="nav-select book-select" [ngModel]="selectedBook()" (ngModelChange)="onBookChange($event)">
        @for (b of books(); track b.id) {
          <option [ngValue]="b.id">{{ b.name }}</option>
        }
      </select>

      <select class="nav-select ch-select" [ngModel]="selectedChapter()" (ngModelChange)="onChapterChange($event)">
        @for (n of chapterNums(); track n) {
          <option [ngValue]="n">{{ n }}</option>
        }
      </select>

      <select class="nav-select v-select" [ngModel]="selectedVerse()" (ngModelChange)="onVerseChange($event)">
        @for (n of verseNums(); track n) {
          <option [ngValue]="n">{{ n }}</option>
        }
      </select>

      <div class="divider"></div>
      <button class="nav-btn" [disabled]="selectedChapter() <= 1"
        (click)="prevChapter()" title="Previous chapter">«</button>
      <button class="nav-btn" [disabled]="selectedChapter() >= (currentBook()?.chapters ?? 1)"
        (click)="nextChapter()" title="Next chapter">»</button>
      @if (loadError()) {
        <span class="nav-error" role="alert">Could not load books: {{ loadError() }}</span>
      }
    </nav>
  `,
  styles: [`
    .book-nav {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 8px;
      background: var(--color-surface-tab);
      border-bottom: 1px solid var(--color-border-subtle);
      flex-shrink: 0;
    }
    .nav-btn {
      background: none; border: 1px solid transparent;
      color: var(--color-text-muted); cursor: pointer;
      padding: 3px 7px; border-radius: 4px; font-size: 14px; line-height: 1;
      transition: color 0.12s, border-color 0.12s;
    }
    .nav-btn:hover:not(:disabled) { color: var(--color-text-primary); border-color: var(--color-border-subtle); }
    .nav-btn:disabled { opacity: 0.35; cursor: default; }
    .nav-select {
      background: var(--color-surface-base); border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary); border-radius: 4px;
      padding: 3px 6px; font-size: 12px; cursor: pointer; outline: none;
    }
    .nav-select:focus { border-color: var(--color-text-link); }
    .book-select { max-width: 160px; }
    .ch-select, .v-select { width: 54px; }
    .divider { width: 1px; height: 18px; background: var(--color-border-subtle); margin: 0 2px; }
    .nav-error { color: var(--color-text-muted); font-size: 12px; margin-left: 8px; }
  `],
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
