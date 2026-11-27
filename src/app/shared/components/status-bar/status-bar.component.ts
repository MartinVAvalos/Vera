import { Component, inject } from '@angular/core';
import { AppState } from '../../../core/state/app.state';

@Component({
  selector: 'app-status-bar',
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
})
export class StatusBarComponent {
  protected readonly state = inject(AppState);
}
