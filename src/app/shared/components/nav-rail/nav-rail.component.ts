import { Component, inject } from '@angular/core';
import { AppState, SidebarTab } from '../../../core/state/app.state';

interface NavItem {
  tab: SidebarTab;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-nav-rail',
  template: `
    <nav class="nav-rail">
      @for (item of navItems; track item.tab) {
        <button
          class="nav-btn"
          [class.active]="state.activeSidebarTab() === item.tab"
          [title]="item.label"
          (click)="onNavClick(item.tab)"
        >
          {{ item.icon }}
        </button>
      }
    </nav>
  `,
  styles: [`
    .nav-rail {
      width: 44px;
      background: var(--color-surface-nav);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 8px;
      flex-shrink: 0;
      border-right: 1px solid var(--color-border-subtle);
    }
    .nav-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: 6px;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .nav-btn:hover {
      background: rgba(255,255,255,0.06);
      color: var(--color-text-primary);
    }
    .nav-btn.active {
      background: rgba(255,255,255,0.1);
      color: var(--color-text-primary);
    }
  `],
})
export class NavRailComponent {
  protected readonly state = inject(AppState);

  protected readonly navItems: NavItem[] = [
    { tab: 'library',   label: 'Library',   icon: '▤' },
    { tab: 'install',   label: 'Install',   icon: '⬇' },
    { tab: 'search',    label: 'Search',    icon: '⌕' },
    { tab: 'bookmarks', label: 'Bookmarks', icon: '☆' },
    { tab: 'notes',     label: 'Notes',     icon: '✎' },
    { tab: 'settings',  label: 'Settings',  icon: '⚙' },
  ];

  onNavClick(tab: SidebarTab): void {
    if (this.state.activeSidebarTab() === tab) {
      this.state.sidebarOpen.update(v => !v);
    } else {
      this.state.activeSidebarTab.set(tab);
      this.state.sidebarOpen.set(true);
    }
  }
}
