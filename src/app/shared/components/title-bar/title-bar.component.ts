import { Component, inject } from '@angular/core';
import { AppState } from '../../../core/state/app.state';

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrl: './title-bar.component.scss',
})
export class TitleBarComponent {
  protected readonly state = inject(AppState);
}
