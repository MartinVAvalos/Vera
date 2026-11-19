import { Component, inject } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AppState } from '../../core/state/app.state';
import { ReaderPanelComponent } from './reader-panel.component';
import { BookNavComponent } from '../../shared/components/book-nav/book-nav.component';

@Component({
  selector: 'app-reader-area',
  imports: [ReaderPanelComponent, BookNavComponent, AngularSplitModule],
  template: `
    <div class="reader-area">
      @if (state.openPanels().length) {
        <div class="tab-bar">
          @for (panel of state.openPanels(); track panel.id) {
            <button
              class="tab"
              [class.active]="state.activePanelId() === panel.id"
              (click)="state.activePanelId.set(panel.id)"
            >
              {{ panel.moduleName }}
              <span class="tab-close"
                (click)="$event.stopPropagation(); state.closePanel(panel.id)">×</span>
            </button>
          }
        </div>

        @if (state.activePanel()) {
          <app-book-nav />
        }

        <as-split direction="horizontal" class="split-host" [gutterSize]="4">
          <as-split-area [size]="100">
            @if (state.activePanel(); as panel) {
              <app-reader-panel [panel]="panel" />
            }
          </as-split-area>
        </as-split>

      } @else {
        <div class="empty-state">
          <div class="empty-icon">✝</div>
          <p>Open a module from the Library to begin reading</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .reader-area {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-surface-reader);
      overflow: hidden;
    }
    .tab-bar {
      display: flex;
      background: var(--color-surface-tab);
      border-bottom: 1px solid var(--color-border-subtle);
      overflow-x: auto;
      flex-shrink: 0;
      min-height: 34px;
    }
    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      background: none;
      border: none;
      border-right: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.12s, background 0.12s;
    }
    .tab:hover { background: rgba(255,255,255,0.04); color: var(--color-text-primary); }
    .tab.active {
      background: var(--color-surface-reader);
      color: var(--color-text-primary);
      border-bottom: 2px solid var(--color-text-link);
    }
    .tab-close {
      opacity: 0.5;
      font-size: 14px;
      line-height: 1;
    }
    .tab-close:hover { opacity: 1; }
    .split-host {
      flex: 1;
      overflow: hidden;
    }
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
      gap: 12px;
    }
    .empty-icon { font-size: 40px; opacity: 0.3; }
    .empty-state p { font-size: 13px; }
  `],
})
export class ReaderAreaComponent {
  protected readonly state = inject(AppState);
}
