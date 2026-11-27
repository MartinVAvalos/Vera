import {
  Component, inject, input, signal, computed, effect, untracked,
} from '@angular/core';
import { OpenPanel, AppState } from '../../core/state/app.state';
import { BibleService } from '../../core/services';

@Component({
  selector: 'app-reader-panel',
  templateUrl: './reader-panel.component.html',
  styleUrl: './reader-panel.component.scss',
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
