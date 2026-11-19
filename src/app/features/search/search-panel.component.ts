import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { BibleService } from '../../core/services';
import { SearchResult, formatRef } from '../../core/models';

@Component({
  selector: 'app-search-panel',
  imports: [FormsModule],
  template: `
    <div class="search-panel">
      <h2 class="panel-title">SEARCH</h2>

      <div class="search-box">
        <input
          type="search"
          placeholder="Search scriptures…"
          [(ngModel)]="query"
          (keydown.enter)="doSearch()"
        />
        <button (click)="doSearch()" [disabled]="searching()">Go</button>
      </div>

      @if (searching()) {
        <p class="muted-text">Searching…</p>
      }

      @if (searchError()) {
        <p class="error-text">{{ searchError() }}</p>
      } @else if (results().length) {
        <ul class="results">
          @for (r of results(); track r.snippet) {
            <li class="result-item" (click)="jump(r)">
              <div class="result-meta">
                <span class="ref">{{ formatRef(r.reference) }}</span>
                <span class="module-tag">{{ r.module_id }}</span>
              </div>
              <span class="snippet">{{ r.snippet }}</span>
            </li>
          }
        </ul>
      } @else if (!searching() && searched()) {
        <p class="muted-text">No results found</p>
      }
    </div>
  `,
  styles: [`
    .search-panel { padding: 8px 0; }
    .panel-title {
      font-size: 11px; font-weight: 700; color: var(--color-text-primary);
      padding: 6px 12px 10px; letter-spacing: 0.08em;
    }
    .search-box { display: flex; gap: 6px; padding: 0 12px 10px; }
    input {
      flex: 1; background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary); padding: 5px 8px;
      border-radius: 4px; font-size: 12px; outline: none;
    }
    input:focus { border-color: var(--color-text-link); }
    button {
      background: var(--color-surface-tab); border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted); padding: 4px 10px;
      border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    button:hover:not(:disabled) { color: var(--color-text-primary); }
    button:disabled { opacity: 0.4; cursor: default; }
    .muted-text { color: var(--color-text-muted); font-size: 12px; padding: 0 12px; }
    .error-text {
      color: #d9534f; font-size: 12px; padding: 0 12px;
      background: rgba(217, 83, 79, 0.1); margin: 8px 12px 0;
      border: 1px solid rgba(217, 83, 79, 0.3); border-radius: 4px;
      padding: 8px 12px;
    }
    .results { list-style: none; margin: 0; padding: 0; }
    .result-item {
      display: flex; flex-direction: column; padding: 7px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer; gap: 3px;
    }
    .result-item:hover { background: rgba(255,255,255,0.04); }
    .result-meta { display: flex; align-items: center; gap: 8px; }
    .ref { font-size: 11px; color: var(--color-text-link); }
    .module-tag {
      font-size: 10px; color: var(--color-text-muted);
      background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 5px;
    }
    .snippet { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }
  `],
})
export class SearchPanelComponent {
  protected readonly state        = inject(AppState);
  private   readonly bibleService = inject(BibleService);

  protected query = '';
  protected readonly results     = signal<SearchResult[]>([]);
  protected readonly searching   = signal(false);
  protected readonly searched    = signal(false);
  protected readonly searchError = signal<string>('');
  protected readonly formatRef   = formatRef;

  async doSearch(): Promise<void> {
    if (!this.query.trim()) return;
    this.searching.set(true);
    this.searched.set(false);
    this.searchError.set('');
    try {
      this.results.set(await this.bibleService.searchText(this.query, 50));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.searchError.set(`Search failed: ${message}`);
      this.results.set([]);
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  jump(r: SearchResult): void {
    // Find an open panel for this module or open the first matching installed module
    const existing = this.state.openPanels().find(p => p.moduleId === r.module_id);
    if (existing) {
      this.state.activePanelId.set(existing.id);
      this.state.navigateTo(r.reference);
    } else {
      // Module isn't open — find it in installed list and open it
      const mod = this.state.installedModules().find(m => m.id === r.module_id);
      if (mod) {
        this.state.openModule(mod, r.reference);
      }
    }
  }
}
