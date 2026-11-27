import { Component, inject } from '@angular/core';
import { AppState, SidebarTab } from '../../../core/state/app.state';

interface NavItem {
  tab: SidebarTab;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-nav-rail',
  templateUrl: './nav-rail.component.html',
  styleUrl: './nav-rail.component.scss',
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
