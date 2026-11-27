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
  templateUrl: './library-panel.component.html',
  styleUrl: './library-panel.component.scss',
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
