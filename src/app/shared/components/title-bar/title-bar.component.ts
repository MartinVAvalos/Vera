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
      background: var(--titlebar-bg-color);
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
    .dot-close  { background: var(--titlebar-dot-close); }
    .dot-min    { background: var(--titlebar-dot-min); }
    .dot-max    { background: var(--titlebar-dot-max); }
    .address-bar {
      flex: 1;
      max-width: 360px;
      margin: 0 auto;
      background: var(--color-border-subtle);
      border-radius: 6px;
      padding: 2px 12px;
      font-size: 12px;
      color: var(--titlebar-text-color);
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
