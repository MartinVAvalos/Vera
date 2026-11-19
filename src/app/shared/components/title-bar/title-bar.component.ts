import { Component, inject } from '@angular/core';
import { AppState } from '../../../core/state/app.state';

@Component({
  selector: 'app-title-bar',
  template: `
    <header class="title-bar" data-tauri-drag-region>
      <div class="traffic-lights">
        <span class="dot dot-close"></span>
        <span class="dot dot-min"></span>
        <span class="dot dot-max"></span>
      </div>
      <div class="address-bar">
        {{ state.statusLabel() || 'Vera — Bible Study' }}
      </div>
    </header>
  `,
  styles: [`
    .title-bar {
      height: 36px;
      background: var(--color-surface-bar);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      flex-shrink: 0;
      -webkit-app-region: drag;
      user-select: none;
    }
    .traffic-lights {
      display: flex;
      gap: 7px;
      align-items: center;
      -webkit-app-region: no-drag;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot-close  { background: #ec6860; }
    .dot-min    { background: #e9bc50; }
    .dot-max    { background: #61bd6a; }
    .address-bar {
      flex: 1;
      max-width: 360px;
      margin: 0 auto;
      background: var(--color-border-subtle);
      border-radius: 6px;
      padding: 2px 12px;
      font-size: 12px;
      color: var(--color-text-secondary);
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      -webkit-app-region: no-drag;
    }
  `],
})
export class TitleBarComponent {
  protected readonly state = inject(AppState);
}
