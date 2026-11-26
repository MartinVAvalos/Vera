import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Bookmark, BibleRef, formatRef } from '../../core/models';

@Component({
  selector: 'app-bookmarks-panel',
  imports: [FormsModule],
  template: `
    <div class="bookmarks">
      <h2 class="panel-title">BOOKMARKS</h2>

      <div class="add-row">
        <input
          class="label-input"
          [(ngModel)]="newLabel"
          [placeholder]="state.statusRef() ? formatRef(state.statusRef()!) : 'Navigate to a verse first'"
          [disabled]="saving() || !state.statusRef() && !pendingSave"
          (keydown.enter)="addBookmark()"
        />
        <button class="add-btn" type="button" (click)="addBookmark()"
                [disabled]="saving() || (!state.statusRef() && !pendingSave)" title="Save bookmark">
          {{ saving() ? '…' : '+' }}
        </button>
      </div>
      @if (saveError()) {
        <div class="error-msg" role="alert">
          {{ saveError() }}
          <button type="button" (click)="addBookmark()" [disabled]="saving()">Retry</button>
          <button type="button" (click)="cancelPendingSave()">Dismiss</button>
        </div>
      }

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else {
        @if (loadError()) {
          <div class="error-msg" role="alert">
            {{ loadError() }}
            <button type="button" (click)="retryLoad()">Retry</button>
          </div>
        }
        @if (bookmarks().length) {
          <ul class="list">
            @for (bm of bookmarks(); track bm.id) {
              <li class="item">
                <button class="item-btn" type="button" (click)="jump(bm)">
                  <span class="ref">{{ formatRef(bm.reference) }}</span>
                  <span class="label">{{ bm.label }}</span>
                </button>
                <button
                  class="del-btn"
                  type="button"
                  (click)="remove(bm.id)"
                  [disabled]="deletingIds().has(bm.id)"
                  title="Delete"
                >{{ deletingIds().has(bm.id) ? '…' : '×' }}</button>
              </li>
              @if (deleteErrors().get(bm.id); as err) {
                <li class="delete-error-row" role="alert">
                  {{ err }}
                  <button type="button" (click)="retryDelete(bm.id)" [disabled]="deletingIds().has(bm.id)">Retry</button>
                </li>
              }
            }
          </ul>
        } @else if (!loadError()) {
          <p class="muted">No bookmarks yet.<br>Navigate to a verse, then save it above.</p>
        }
      }
    </div>
  `,
  styles: [`
    .bookmarks { padding: 8px 0; }
    .panel-title {
      font-size: 11px; font-weight: 700;
      color: var(--color-text-primary);
      padding: 6px 12px 10px;
      letter-spacing: 0.08em;
    }
    .add-row {
      display: flex;
      gap: 6px;
      padding: 0 12px 10px;
    }
    .label-input {
      flex: 1;
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      outline: none;
    }
    .label-input:focus { border-color: var(--color-text-link); }
    .label-input:disabled { opacity: 0.6; cursor: not-allowed; }
    .add-btn {
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-link);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .add-btn:hover:not(:disabled) { background: var(--active-bg); }
    .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .error-msg {
      color: var(--error-text-color);
      font-size: 11px;
      padding: 2px 12px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .error-msg button {
      font-size: 11px;
      padding: 2px 8px;
      background: transparent;
      border: 1px solid var(--error-text-color);
      color: var(--error-text-color);
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .error-msg button:disabled { opacity: 0.5; cursor: not-allowed; }
    .delete-error-row {
      list-style: none;
      color: var(--error-text-color);
      font-size: 11px;
      padding: 2px 12px 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .delete-error-row button {
      font-size: 11px;
      padding: 2px 8px;
      background: transparent;
      border: 1px solid var(--error-text-color);
      color: var(--error-text-color);
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .delete-error-row button:disabled { opacity: 0.5; cursor: not-allowed; }
    .muted { color: var(--color-text-muted); font-size: 12px; padding: 8px 12px; line-height: 1.6; }
    .list { list-style: none; margin: 0; padding: 0; }
    .item {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--hover-bg);
    }
    .item-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      background: none;
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      text-align: left;
    }
    .item-btn:hover { background: var(--hover-bg); }
    .ref { font-size: 11px; color: var(--color-text-link); }
    .label { font-size: 12px; color: var(--color-text-muted); }
    .del-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 6px 10px;
      font-size: 14px;
      opacity: 0.5;
    }
    .del-btn:hover:not(:disabled) { opacity: 1; color: var(--color-status-error); }
    .del-btn:disabled { cursor: not-allowed; }
  `],
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
