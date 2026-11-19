import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Bookmark, formatRef } from '../../core/models';

@Component({
  selector: 'app-bookmarks-panel',
  imports: [FormsModule],
  template: `
    <div class="bookmarks">
      <h2 class="panel-title">BOOKMARKS</h2>

      <!-- Add bookmark from current ref -->
      @if (state.statusRef(); as ref) {
        <div class="add-row">
          <input
            class="label-input"
            [(ngModel)]="newLabel"
            [placeholder]="formatRef(ref)"
            (keydown.enter)="addBookmark()"
          />
          <button class="add-btn" (click)="addBookmark()" title="Save bookmark">+</button>
        </div>
      }

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (bookmarks().length) {
        <ul class="list">
          @for (bm of bookmarks(); track bm.id) {
            <li class="item">
              <button class="item-btn" (click)="jump(bm)">
                <span class="ref">{{ formatRef(bm.reference) }}</span>
                <span class="label">{{ bm.label }}</span>
              </button>
              <button class="del-btn" (click)="remove(bm.id)" title="Delete">×</button>
            </li>
          }
        </ul>
      } @else {
        <p class="muted">No bookmarks yet.<br>Navigate to a verse, then save it above.</p>
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
    .add-btn:hover { background: rgba(255,255,255,0.06); }
    .muted { color: var(--color-text-muted); font-size: 12px; padding: 8px 12px; line-height: 1.6; }
    .list { list-style: none; margin: 0; padding: 0; }
    .item {
      display: flex;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.04);
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
    .item-btn:hover { background: rgba(255,255,255,0.04); }
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
    .del-btn:hover { opacity: 1; color: #ec6860; }
  `],
})
export class BookmarksPanelComponent implements OnInit {
  protected readonly state = inject(AppState);
  private readonly notesService = inject(NotesService);

  protected readonly bookmarks = signal<Bookmark[]>([]);
  protected readonly loading = signal(false);
  protected newLabel = '';

  protected readonly formatRef = formatRef;

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.bookmarks.set(await this.notesService.getBookmarks());
    } catch {
      this.bookmarks.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected async addBookmark(): Promise<void> {
    const ref = this.state.statusRef();
    if (!ref) return;
    const label = this.newLabel.trim() || formatRef(ref);
    try {
      await this.notesService.saveBookmark(ref.book, ref.chapter, ref.verse, label);
      this.newLabel = '';
      await this.load();
    } catch { /* Tauri not available in browser dev */ }
  }

  protected async remove(id: string): Promise<void> {
    try {
      await this.notesService.deleteBookmark(id);
      this.bookmarks.update(bms => bms.filter(b => b.id !== id));
    } catch { /* offline */ }
  }

  protected jump(bm: Bookmark): void {
    const panel = this.state.activePanel();
    if (!panel) return;
    this.state.navigateTo(bm.reference);
  }
}
