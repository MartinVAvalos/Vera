import { Component, inject } from '@angular/core';
import { AppState } from '../../../core/state/app.state';

@Component({
  selector: 'app-status-bar',
  template: `
    <footer class="status-bar">
      <div class="status-left">
        <span class="status-dot" [class.available]="state.engineAvailable()"></span>
        <span class="status-text">{{ state.engineAvailable() ? 'Engine Ready' : 'Engine Unavailable' }}</span>
      </div>
      @if (state.statusLabel()) {
        <div class="status-right">
          {{ state.statusLabel() }}
        </div>
      }
    </footer>
  `,
  styles: [`
    .status-bar {
      height: 24px;
      background: var(--color-surface-tab);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      flex-shrink: 0;
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .status-left { display: flex; align-items: center; gap: 6px; }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-text-muted);
    }
    .status-dot.available { background: var(--color-status-online); }
    .status-right { color: var(--color-text-secondary); }
  `],
})
export class StatusBarComponent {
  protected readonly state = inject(AppState);
}
