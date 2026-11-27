import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Bookmark, BibleRef, formatRef } from '../../core/models';

@Component({
  selector: 'app-bookmarks-panel',
  imports: [FormsModule],
  templateUrl: './bookmarks-panel.component.html',
  styleUrl: './bookmarks-panel.component.scss',
})
export class BookmarksPanelComponent implements OnInit {
  protected readonly state = inject(AppState);
  private readonly notesService = inject(NotesService);

  protected readonly bookmarks = signal<Bookmark[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());
  protected readonly deleteErrors = signal<ReadonlyMap<string, string>>(new Map());
  protected newLabel = '';

  /** Captured at first save attempt; reused on retry to prevent wrong-ref substitution. */
  protected pendingSave: { id: string; ref: BibleRef; label: string } | null = null;

  /** Incremented on every confirmed mutation; prevents stale load responses from overwriting newer state. */
  private mutationVersion = 0;

  protected readonly formatRef = formatRef;

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(null);
    const versionAtStart = this.mutationVersion;
    try {
      const bookmarks = await this.notesService.getBookmarks();
      if (this.mutationVersion !== versionAtStart) return;
      this.bookmarks.set(bookmarks);
    } catch (e) {
      this.loadError.set((e instanceof Error ? e.message : String(e)) || 'Failed to load bookmarks');
    } finally {
      this.loading.set(false);
    }
  }

  protected retryLoad(): void {
    this.load();
  }

  protected async addBookmark(): Promise<void> {
    if (this.saving()) return;

    // Capture intended data on first attempt; reuse unchanged on retry
    if (!this.pendingSave) {
      const ref = this.state.statusRef();
      if (!ref) return;
      this.pendingSave = {
        id: crypto.randomUUID(),
        ref,
        label: this.newLabel.trim() || formatRef(ref),
      };
    }
    const { id, ref: savedRef, label } = this.pendingSave;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.notesService.saveBookmark(
        id, savedRef.book, savedRef.chapter, savedRef.verse, label
      );
      this.mutationVersion++;
      this.bookmarks.update(bms => [saved, ...bms]);
      this.newLabel = '';
      this.pendingSave = null;
    } catch (e) {
      this.saveError.set((e instanceof Error ? e.message : String(e)) || 'Failed to save bookmark');
      // Keep pendingSave for idempotent retry
    } finally {
      this.saving.set(false);
    }
  }

  protected cancelPendingSave(): void {
    this.pendingSave = null;
    this.saveError.set(null);
  }

  protected async remove(id: string): Promise<void> {
    // Prevent duplicate deletion of the same bookmark
    const ids = new Set(this.deletingIds());
    if (ids.has(id)) return;
    ids.add(id);
    this.deletingIds.set(ids);

    // Clear any previous error for this bookmark
    const errs = new Map(this.deleteErrors());
    errs.delete(id);
    this.deleteErrors.set(errs);

    try {
      await this.notesService.deleteBookmark(id);
      this.mutationVersion++;
      this.bookmarks.update(bms => bms.filter(b => b.id !== id));
      // Clear error on success
      const finalErrs = new Map(this.deleteErrors());
      finalErrs.delete(id);
      this.deleteErrors.set(finalErrs);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || 'Failed to delete bookmark';
      const newErrs = new Map(this.deleteErrors());
      newErrs.set(id, msg);
      this.deleteErrors.set(newErrs);
    } finally {
      const finalIds = new Set(this.deletingIds());
      finalIds.delete(id);
      this.deletingIds.set(finalIds);
    }
  }

  protected retryDelete(id: string): void {
    this.remove(id);
  }

  protected jump(bm: Bookmark): void {
    const panel = this.state.activePanel();
    if (!panel) return;
    this.state.navigateTo(bm.reference);
  }
}
