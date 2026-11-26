import { Component, inject, signal, OnInit } from '@angular/core';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

@Component({
  selector: 'app-commentary-panel',
  template: `
    <div class="commentary">
      <div class="panel-header">
        <span>Commentary</span>
        <button class="close-btn" (click)="state.commentaryOpen.set(false)" title="Close">×</button>
      </div>

      <div class="commentary-selector">
        <select (change)="onSelectModule($event)">
          <option value="">Select commentary…</option>
          @for (mod of commentaries(); track mod.id) {
            <option [value]="mod.id" [selected]="state.activeCommentaryModule() === mod.id">
              {{ mod.name }}
            </option>
          }
        </select>
      </div>

      @if (loadError()) {
        <div class="commentary-error">
          <p class="error-title">Error loading commentaries</p>
          <p class="error-message">{{ loadError() }}</p>
        </div>
      } @else if (state.activeCommentaryModule()) {
        <div class="commentary-content">
          <p class="muted">Commentary for {{ state.statusLabel() || 'the selected passage' }} will appear here once the module engine is connected.</p>
        </div>
      } @else {
        <div class="commentary-empty">
          <p>Select a commentary module above</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .commentary { height: 100%; display: flex; flex-direction: column; }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px 8px;
      background: var(--color-surface-tab);
      border-bottom: 1px solid var(--color-border-subtle);
      font-size: 13px;
      color: var(--color-text-primary);
      flex-shrink: 0;
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .close-btn:hover { color: var(--color-text-primary); }
    .commentary-selector {
      padding: 8px 12px;
      flex-shrink: 0;
    }
    select {
      width: 100%;
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .commentary-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
    }
    .commentary-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
      font-size: 13px;
      text-align: center;
      padding: 16px;
    }
    .commentary-error {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--error-text-color);
      font-size: 12px;
      text-align: center;
      padding: 16px;
      background: var(--error-bg-color);
    }
    .error-title {
      font-weight: 500;
      margin: 0 0 8px;
    }
    .error-message {
      margin: 0;
      font-size: 11px;
      opacity: 0.8;
    }
    .muted { color: var(--color-text-muted); font-size: 13px; line-height: 1.6; }
  `],
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
