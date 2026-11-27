import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { BibleService } from '../../core/services';
import { SearchResult, formatRef } from '../../core/models';

@Component({
  selector: 'app-search-panel',
  imports: [FormsModule],
  templateUrl: './search-panel.component.html',
  styleUrl: './search-panel.component.scss',
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
