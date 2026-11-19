import { Component, inject } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AppState } from './core/state/app.state';
import { NavRailComponent } from './shared/components/nav-rail/nav-rail.component';
import { TitleBarComponent } from './shared/components/title-bar/title-bar.component';
import { StatusBarComponent } from './shared/components/status-bar/status-bar.component';
import { LibraryPanelComponent } from './features/library/library-panel.component';
import { InstallModulesComponent } from './features/install-modules/install-modules.component';
import { ReaderAreaComponent } from './features/reader/reader-area.component';
import { CommentaryPanelComponent } from './features/commentary/commentary-panel.component';
import { SearchPanelComponent } from './features/search/search-panel.component';
import { NotesPanelComponent } from './features/notes/notes-panel.component';
import { BookmarksPanelComponent } from './features/bookmarks/bookmarks-panel.component';
import { SettingsPanelComponent } from './features/settings/settings-panel.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [
    AngularSplitModule,
    NavRailComponent,
    TitleBarComponent,
    StatusBarComponent,
    LibraryPanelComponent,
    InstallModulesComponent,
    ReaderAreaComponent,
    CommentaryPanelComponent,
    SearchPanelComponent,
    NotesPanelComponent,
    BookmarksPanelComponent,
    SettingsPanelComponent,
  ],
})
export class App {
  protected readonly state = inject(AppState);
}
