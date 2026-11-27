import { Component, inject, signal, OnInit } from '@angular/core';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

@Component({
  selector: 'app-commentary-panel',
  templateUrl: './commentary-panel.component.html',
  styleUrl: './commentary-panel.component.scss',
})
export class CommentaryPanelComponent implements OnInit {
  protected readonly state = inject(AppState);
  private readonly modulesService = inject(ModulesService);

  protected readonly commentaries = signal<Module[]>([]);
  protected readonly loadError = signal<string>('');

  async ngOnInit(): Promise<void> {
    try {
      const all = await this.modulesService.listModules();
      const filtered = all.filter(m => m.module_type === 'Commentary');
      this.commentaries.set(filtered);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.loadError.set(`Failed to load commentaries: ${message}`);
      this.commentaries.set([]);
    }
  }

  protected onSelectModule(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.state.activeCommentaryModule.set(id || null);
  }
}
