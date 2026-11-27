import { Component, inject } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AppState } from '../../core/state/app.state';
import { ReaderPanelComponent } from './reader-panel.component';
import { BookNavComponent } from '../../shared/components/book-nav/book-nav.component';

@Component({
  selector: 'app-reader-area',
  imports: [ReaderPanelComponent, BookNavComponent, AngularSplitModule],
  templateUrl: './reader-area.component.html',
  styleUrl: './reader-area.component.scss',
})
export class ReaderAreaComponent {
  protected readonly state = inject(AppState);
}
