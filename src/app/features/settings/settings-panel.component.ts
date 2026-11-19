import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';

@Component({
  selector: 'app-settings-panel',
  imports: [FormsModule],
  template: `
    <div class="settings-panel">
      <h2 class="panel-title">SETTINGS</h2>

      <!-- Display -->
      <section class="settings-section">
        <h3>Display</h3>
        <label class="setting-row">
          <span>Font size</span>
          <input type="range" min="1" max="5" step="1"
            [ngModel]="state.displayOptions().font_size"
            (ngModelChange)="patchDisplay({ font_size: +$event })" />
        </label>
        <label class="setting-row">
          <span>Line breaks between verses</span>
          <input type="checkbox"
            [ngModel]="state.displayOptions().line_breaks"
            (ngModelChange)="patchDisplay({ line_breaks: $event })" />
        </label>
      </section>

      <!-- Text Filters -->
      <section class="settings-section">
        <h3>Text Filters</h3>
        <label class="setting-row">
          <span>Verse numbers</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().verse_numbers"
            (ngModelChange)="patchFilter({ verse_numbers: $event })" />
        </label>
        <label class="setting-row">
          <span>Section headings</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().headings"
            (ngModelChange)="patchFilter({ headings: $event })" />
        </label>
        <label class="setting-row">
          <span>Footnotes</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().footnotes"
            (ngModelChange)="patchFilter({ footnotes: $event })" />
        </label>
        <label class="setting-row">
          <span>Strong's numbers</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().strongs"
            (ngModelChange)="patchFilter({ strongs: $event })" />
        </label>
        <label class="setting-row">
          <span>Red-letter words</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().red_letter"
            (ngModelChange)="patchFilter({ red_letter: $event })" />
        </label>
        <label class="setting-row">
          <span>Cross-references</span>
          <input type="checkbox"
            [ngModel]="state.filterOptions().cross_refs"
            (ngModelChange)="patchFilter({ cross_refs: $event })" />
        </label>
      </section>

      <!-- Layout -->
      <section class="settings-section">
        <h3>Layout</h3>
        <label class="setting-row">
          <span>Commentary panel</span>
          <input type="checkbox"
            [ngModel]="state.commentaryOpen()"
            (ngModelChange)="state.commentaryOpen.set($event)" />
        </label>
      </section>

      <!-- About -->
      <section class="settings-section">
        <h3>About</h3>
        <p class="about-text">Vera — Bible Study<br/>Tauri 2 · Angular 22 · Rust</p>
      </section>
    </div>
  `,
  styles: [`
    .settings-panel { padding: 8px 0; }
    .panel-title {
      font-size: 11px; font-weight: 700;
      color: var(--color-text-primary);
      padding: 6px 12px 10px;
      letter-spacing: 0.08em;
    }
    .settings-section {
      padding: 8px 12px 12px;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    h3 {
      font-size: 11px;
      color: var(--color-text-muted);
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-bottom: 8px;
      gap: 12px;
      cursor: pointer;
    }
    input[type=range] {
      accent-color: var(--color-text-link);
      width: 80px;
    }
    input[type=checkbox] { accent-color: var(--color-text-link); }
    .about-text {
      font-size: 12px;
      color: var(--color-text-muted);
      line-height: 1.6;
      margin: 0;
    }
  `],
})
export class SettingsPanelComponent {
  protected readonly state = inject(AppState);

  protected patchFilter(partial: Partial<ReturnType<typeof this.state.filterOptions>>): void {
    this.state.filterOptions.update(o => ({ ...o, ...partial }));
  }

  protected patchDisplay(partial: Partial<ReturnType<typeof this.state.displayOptions>>): void {
    this.state.displayOptions.update(o => ({ ...o, ...partial }));
  }
}
