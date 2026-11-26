import { Component, OnInit, inject, signal } from '@angular/core';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module, ModuleType } from '../../core/models';

interface ModuleGroup {
  type: ModuleType;
  label: string;
  expanded: boolean;
  modules: Module[];
}

@Component({
  selector: 'app-library-panel',
  template: `
    <div class="library">
      <h2 class="panel-title">LIBRARY</h2>

      @if (loading()) {
        <p class="muted-text">Loading modules…</p>
      } @else if (loadError()) {
        <p class="muted-text" role="alert">Could not load modules: {{ loadError() }}</p>
      } @else {
        @for (group of groups(); track group.type) {
          <div class="group">
            <button class="group-header" (click)="group.expanded = !group.expanded">
              <span class="chevron">{{ group.expanded ? '⌄' : '›' }}</span>
              {{ group.label }}
            </button>
            @if (group.expanded) {
              @for (mod of group.modules; track mod.id) {
                <button
                  class="module-item"
                  [class.active]="isActive(mod)"
                  [class.disabled]="!canOpen(mod)"
                  [title]="canOpen(mod) ? '' : 'Module type not yet supported in reader'"
                  (click)="openModule(mod)"
                  [disabled]="!canOpen(mod)"
                >
                  {{ mod.name }}
                </button>
              }
              @if (!group.modules.length) {
                <span class="muted-text module-item">No modules installed</span>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .library { padding: 8px 0; }
    .panel-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--panel-text-color);
      padding: 6px 12px 10px;
      letter-spacing: 0.08em;
    }
    .group { margin-bottom: 2px; }
    .group-header {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      background: none;
      border: none;
      color: var(--panel-text-color);
      font-size: 12px;
      font-weight: 500;
      padding: 5px 12px;
      cursor: pointer;
      text-align: left;
    }
    .group-header:hover { background: var(--panel-hover-bg); }
    .chevron { font-size: 10px; width: 12px; }
    .module-item {
      display: block;
      width: 100%;
      background: none;
      border: none;
      color: var(--panel-text-muted);
      font-size: 12px;
      padding: 4px 12px 4px 28px;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .module-item:hover:not(:disabled) { background: var(--panel-hover-bg); color: var(--panel-text-color); }
    .module-item.active { color: var(--reader-link-color); }
    .module-item.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      color: var(--panel-text-muted);
    }
    .module-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .muted-text { color: var(--panel-text-muted); font-size: 11px; }
  `],
})
export class LibraryPanelComponent implements OnInit {
  private readonly appState = inject(AppState);
  private readonly modulesService = inject(ModulesService);

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly groups = signal<ModuleGroup[]>([
    { type: 'Bible',           label: 'Bibles',          expanded: true,  modules: [] },
    { type: 'Commentary',      label: 'Commentaries',    expanded: false, modules: [] },
    { type: 'GenBook',         label: 'Church Fathers',  expanded: false, modules: [] },
    { type: 'Lexicon',         label: 'Lexicons',        expanded: false, modules: [] },
    { type: 'DailyDevotional', label: 'Theology',        expanded: false, modules: [] },
  ]);

  ngOnInit(): void {
    this.loadModules();
  }

  private async loadModules(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const modules = await this.modulesService.listModules();
      this.appState.installedModules.set(modules);
      this.groups.update(groups =>
        groups.map(g => ({
          ...g,
          modules: modules.filter(m => m.module_type === g.type && m.installed),
        }))
      );
    } catch (e) {
      // No mock data: an unreachable backend must not look like installed modules.
      this.loadError.set(e instanceof Error ? e.message : String(e));
      this.groups.update(groups => groups.map(g => ({ ...g, modules: [] })));
    } finally {
      this.loading.set(false);
    }
  }

  protected isActive(mod: Module): boolean {
    const panel = this.appState.activePanel();
    return panel?.moduleId === mod.id;
  }

  protected canOpen(mod: Module): boolean {
    return mod.module_type === 'Bible';
  }

  protected openModule(mod: Module): void {
    if (!this.canOpen(mod)) return;
    this.appState.openModule(mod, { book: 'John', chapter: 1, verse: 1 });
  }
}
