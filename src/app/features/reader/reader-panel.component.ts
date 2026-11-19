import {
  Component, inject, input, signal, computed, effect, untracked,
} from '@angular/core';
import { OpenPanel, AppState } from '../../core/state/app.state';
import { BibleService } from '../../core/services';

@Component({
  selector: 'app-reader-panel',
  template: `
    <div class="reader-panel">
      @if (loading()) {
        <div class="loading">Loading…</div>
      } @else if (panel().chapter) {
        <div class="chapter-header">
          <span class="chapter-title">
            {{ panel().chapter!.verses[0]?.translation || panel().moduleName }}
            &mdash;
            {{ panel().ref.book }}&nbsp;{{ panel().ref.chapter }}
          </span>
        </div>

        <div class="verses" [style.font-size.px]="baseFontSize()">
          @for (verse of panel().chapter!.verses; track verse.verse) {
            <span
              class="verse"
              [class.selected]="selectedVerse() === verse.verse"
              (click)="selectVerse(verse.verse)"
            >
              @if (state.filterOptions().verse_numbers) {
                <sup class="verse-num">{{ verse.verse }}</sup>
              }
              {{ verse.text }}
            </span>
          }
        </div>
      } @else if (error()) {
        <div class="error">
          <p>{{ error() }}</p>
          <p class="hint">Install a Bible module from the Library to start reading.</p>
        </div>
      } @else {
        <div class="empty">Select a passage from the navigation bar above</div>
      }
    </div>
  `,
  styles: [`
    .reader-panel {
      flex: 1; overflow-y: auto; padding: 24px 36px;
      background: var(--color-surface-reader);
    }
    .loading, .empty, .error {
      color: var(--color-text-muted); padding: 48px 24px; text-align: center;
    }
    .error p { margin: 0 0 8px; }
    .hint { font-size: 12px; opacity: 0.7; }
    .chapter-header {
      margin-bottom: 20px; padding-bottom: 12px;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .chapter-title {
      font-family: var(--font-serif); font-size: 18px;
      color: var(--color-text-accent); font-weight: 600;
    }
    .verses {
      line-height: 1.9; font-family: var(--font-serif);
      color: var(--color-text-secondary);
    }
    .verse {
      cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.1s;
    }
    .verse:hover { background: rgba(255,255,255,0.04); }
    .verse.selected { background: var(--color-surface-highlight); color: var(--color-text-primary); }
    .verse-num {
      color: var(--color-text-muted); font-size: 10px; margin-right: 4px; vertical-align: super;
    }
  `],
})
export class ReaderPanelComponent {
  /** Signal input — tracked reactively; replaces @Input + OnChanges. */
  readonly panel = input.required<OpenPanel>();

  protected readonly state        = inject(AppState);
  private  readonly bibleService  = inject(BibleService);

  protected readonly loading       = signal(false);
  protected readonly error         = signal<string | null>(null);
  protected readonly selectedVerse = signal<number | null>(null);

  protected readonly baseFontSize = computed(() =>
    12 + (this.state.displayOptions().font_size - 1) * 2
  );

  /**
   * Stable request key: depends ONLY on the navigation dimensions
   * (moduleId, book, chapter). Computed equality on the returned string
   * prevents the effect from firing on chapter-payload or loading writes.
   */
  private readonly _requestKey = computed(() => {
    const p = this.panel();
    return `${p.moduleId}|${p.ref.book}|${p.ref.chapter}`;
  });

  /** Monotonically incremented on each fetch start; guards stale responses. */
  private _generation = 0;

  constructor() {
    effect(() => {
      // Tracked dependency: only requestKey — not loading, chapter, or status.
      this._requestKey();
      // Run the actual I/O call outside signal tracking so writes inside
      // _startFetch cannot create reactive dependencies or cause loop triggers.
      untracked(() => {
        const p = this.panel();
        this._startFetch(p.moduleId, p.ref.book, p.ref.chapter, p.id);
      });
    });
  }

  protected selectVerse(verse: number): void {
    this.selectedVerse.set(verse);
    // The key excludes verse, so this write cannot trigger a new request.
    const ref = { ...this.panel().ref, verse };
    this.state.updatePanel(this.panel().id, { ref });
    this.state.statusRef.set(ref);
  }

  private async _startFetch(
    moduleId: string, book: string, chapter: number, panelId: string,
  ): Promise<void> {
    // Capture generation before the first await; any navigation that changes
    // the request key will increment _generation, making this token stale.
    const gen = ++this._generation;

    this.loading.set(true);
    this.error.set(null);

    try {
      const ch = await this.bibleService.getChapter(moduleId, book, chapter);

      // Reject if superseded by a newer navigation.
      if (gen !== this._generation) return;
      // Reject if the panel was closed while the request was in flight.
      if (!this.state.openPanels().find(p => p.id === panelId)) return;

      // Write chapter data. moduleId/book/chapter on the panel object are
      // unchanged, so _requestKey() returns the same string → no loop.
      this.state.updatePanel(panelId, { chapter: ch });
      this.selectedVerse.set(this.panel().ref.verse || null);
    } catch (e) {
      if (gen !== this._generation) return;

      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(msg);
      // Clear stale chapter so old text cannot appear under a new reference.
      this.state.updatePanel(panelId, { chapter: null });
    } finally {
      // Only the owner of this generation updates the loading flag.
      if (gen === this._generation) this.loading.set(false);
    }
  }
}
