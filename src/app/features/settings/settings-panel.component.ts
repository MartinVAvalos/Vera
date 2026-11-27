import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { ThemeService } from '../../core/services';

@Component({
  selector: 'app-settings-panel',
  imports: [FormsModule],
  templateUrl: './settings-panel.component.html',
  styleUrl: './settings-panel.component.scss',
})
export class SettingsPanelComponent {
  protected readonly state = inject(AppState);
  protected readonly themeService = inject(ThemeService);

  protected patchFilter(partial: Partial<ReturnType<typeof this.state.filterOptions>>): void {
    this.state.filterOptions.update(o => ({ ...o, ...partial }));
  }

  protected patchDisplay(partial: Partial<ReturnType<typeof this.state.displayOptions>>): void {
    this.state.displayOptions.update(o => ({ ...o, ...partial }));
  }

  protected cycleTheme(): void {
    this.themeService.cycleTheme();
  }

  protected getThemeName(themeId: ReturnType<typeof this.themeService.currentTheme>): string {
    return this.themeService.getThemeName(themeId);
  }
}
