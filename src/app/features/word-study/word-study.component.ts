import { Component } from '@angular/core';

@Component({
  selector: 'app-word-study',
  template: `
    <div class="word-study">
      <h2 class="panel-title">WORD STUDY</h2>
      <p class="muted-text">Select a word in the reader to study its original language meaning.</p>
    </div>
  `,
  styles: [`
    .word-study { padding: 8px 0; }
    .panel-title {
      font-size: 11px; font-weight: 700;
      color: var(--color-text-primary);
      padding: 6px 12px 10px;
      letter-spacing: 0.08em;
    }
    .muted-text { color: var(--color-text-muted); font-size: 12px; padding: 0 12px; line-height: 1.5; }
  `],
})
export class WordStudyComponent {}
