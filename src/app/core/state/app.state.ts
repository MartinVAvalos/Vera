import { Injectable, signal, computed } from '@angular/core';
import {
  BibleRef,
  Chapter,
  formatRef,
  FilterOptions,
  DisplayOptions,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_DISPLAY_OPTIONS,
} from '../models';
import { Module } from '../models';

export interface OpenPanel {
  id: string;
  moduleId: string;
  moduleName: string;
  ref: BibleRef;
  chapter: Chapter | null;
  loading: boolean;
}

/** A history step remembers which panel (module) it belongs to. */
export interface HistoryEntry {
  panelId: string;
  ref: BibleRef;
}

export type SidebarTab = 'library' | 'install' | 'search' | 'bookmarks' | 'notes' | 'settings';

@Injectable({ providedIn: 'root' })
export class AppState {
  // ── Layout ────────────────────────────────────────────────────────────────
  readonly activeSidebarTab = signal<SidebarTab>('library');
  readonly sidebarOpen = signal(true);
  readonly commentaryOpen = signal(true);

  // ── Reader panels ─────────────────────────────────────────────────────────
  readonly openPanels = signal<OpenPanel[]>([]);
  readonly activePanelId = signal<string | null>(null);

  readonly activeCommentaryModule = signal<string | null>(null);
  readonly installedModules = signal<Module[]>([]);

  // ── Module refresh coordination ───────────────────────────────────────────
  /**
   * Generation counter incremented after each successful module list refresh.
   * Used to prevent stale responses from older operations from rolling back
   * state from newer operations.
   */
  readonly refreshGenerationCounter = signal<number>(0);

  /**
   * Flag set when module list refresh fails. Allows UI to show retry UI.
   * Cleared when next refresh succeeds.
   */
  readonly refreshFailed = signal<boolean>(false);

  // ── Navigation history ────────────────────────────────────────────────────
  private readonly _history = signal<HistoryEntry[]>([]);
  private readonly _historyPos = signal(-1);

  readonly canGoBack = computed(() => {
    const open = new Set(this.openPanels().map(p => p.id));
    return this._history().slice(0, Math.max(this._historyPos(), 0)).some(e => open.has(e.panelId));
  });
  readonly canGoForward = computed(() => {
    const open = new Set(this.openPanels().map(p => p.id));
    return this._history().slice(this._historyPos() + 1).some(e => open.has(e.panelId));
  });

  // ── Reader options ────────────────────────────────────────────────────────
  readonly filterOptions = signal<FilterOptions>({ ...DEFAULT_FILTER_OPTIONS });
  readonly displayOptions = signal<DisplayOptions>({ ...DEFAULT_DISPLAY_OPTIONS });

  // ── Status ────────────────────────────────────────────────────────────────
  /**
   * Engine ready state: true when local SWORD engine is initialized and ready.
   * This does not reflect network connectivity; modules can be read offline.
   * Actual network detection deferred to future implementation.
   */
  readonly engineReady = signal(true);
  readonly statusRef = signal<BibleRef | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly activePanel = computed(() =>
    this.openPanels().find(p => p.id === this.activePanelId()) ?? null
  );

  /**
   * Engine availability for status bar display.
   * Returns true when engine is ready (local Bible reading capability available).
   * Returns false when engine is unavailable.
   * Does NOT reflect actual network connectivity or download availability.
   * Offline reading of installed modules is fully supported.
   */
  readonly engineAvailable = computed(() => this.engineReady());

  readonly statusLabel = computed(() => {
    const ref = this.statusRef();
    return ref ? formatRef(ref) : '';
  });

  /** Actual verse numbers of the chapter shown (may be sparse) — drives the BookNav verse dropdown. */
  readonly activePanelVerseIds = computed(() =>
    this.activePanel()?.chapter?.verses.map(v => v.verse) ?? []
  );

  // ── Panel management ──────────────────────────────────────────────────────

  openModule(module: Module, ref: BibleRef): void {
    const existing = this.openPanels().find(p => p.moduleId === module.id);
    if (existing) {
      this.activePanelId.set(existing.id);
      this.navigateTo(ref);
      return;
    }
    const id = `${module.id}-${Date.now()}`;
    const panel: OpenPanel = {
      id,
      moduleId: module.id,
      moduleName: module.name,
      ref,
      chapter: null,
      loading: false,
    };
    this.openPanels.update(ps => [...ps, panel]);
    this.activePanelId.set(id);
    this.navigateTo(ref);
  }

  updatePanel(id: string, partial: Partial<OpenPanel>): void {
    this.openPanels.update(ps =>
      ps.map(p => p.id === id ? { ...p, ...partial } : p)
    );
  }

  closePanel(id: string): void {
    this.openPanels.update(ps => ps.filter(p => p.id !== id));
    if (this.activePanelId() === id) {
      const remaining = this.openPanels();
      this.activePanelId.set(remaining.at(-1)?.id ?? null);
    }
  }

  /**
   * Close all panels for a module and handle cascading state:
   * - Remove all open panels for the module
   * - Prune history entries for closed panels
   * - Adjust history position to stay valid
   * - Switch active panel to a surviving panel, or null
   * - Clear commentary if it was set to this module
   */
  closeModulePanels(moduleId: string): void {
    // Collect all panels that belong to this module (by panel ID)
    const panelsToClose = this.openPanels()
      .filter(p => p.moduleId === moduleId)
      .map(p => p.id);

    // Remove all panels for this module
    this.openPanels.update(ps => ps.filter(p => p.moduleId !== moduleId));

    // If the active panel was closed, switch to a surviving panel
    if (panelsToClose.includes(this.activePanelId() ?? '')) {
      const remaining = this.openPanels();
      this.activePanelId.set(remaining.at(-1)?.id ?? null);
    }

    // Clear commentary if it was set to this module
    if (this.activeCommentaryModule() === moduleId) {
      this.activeCommentaryModule.set(null);
    }

    // Prune history entries for closed panels and adjust position
    const panelSet = new Set(panelsToClose);
    const history = this._history();
    const prunedHistory = history.filter(e => !panelSet.has(e.panelId));
    
    // Remap history cursor position based on removed entries
    // If entries before the cursor are removed, the cursor position shifts down
    let newPos = this._historyPos();
    
    if (prunedHistory.length === 0) {
      // No history remains, reset cursor to -1 (invalid)
      newPos = -1;
    } else if (newPos >= history.length) {
      // Cursor was out of bounds, clamp it
      newPos = prunedHistory.length - 1;
    } else {
      // Count how many removed entries were at or before the original cursor
      let removedBeforeOrAt = 0;
      for (let i = 0; i <= newPos && i < history.length; i++) {
        if (panelSet.has(history[i].panelId)) {
          removedBeforeOrAt++;
        }
      }
      
      // Check if the entry at cursor was removed
      const cursorEntryRemoved = newPos < history.length && panelSet.has(history[newPos].panelId);
      
      if (cursorEntryRemoved) {
        // The cursor entry itself was removed
        // Move to the next non-removed entry if available
        // Otherwise move to the last remaining entry before cursor
        const newCursorIdx = newPos - removedBeforeOrAt + 1;
        newPos = Math.max(-1, Math.min(newCursorIdx, prunedHistory.length - 1));
      } else {
        // The cursor entry was not removed, just adjust for entries removed before it
        newPos = newPos - (removedBeforeOrAt);
        // Ensure we don't exceed bounds
        if (newPos >= prunedHistory.length) {
          newPos = prunedHistory.length - 1;
        }
      }
    }
    
    this._history.set(prunedHistory);
    this._historyPos.set(newPos);

    // Sync statusRef to the surviving active panel, or null when no panels remain
    const newActive = this.openPanels().find(p => p.id === (this.activePanelId() ?? ''));
    this.statusRef.set(newActive?.ref ?? null);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  navigateTo(ref: BibleRef): void {
    const panelId = this.activePanelId();
    if (panelId) {
      const pos = this._historyPos();
      const history = this._history().slice(0, pos + 1);
      this._history.set([...history, { panelId, ref }]);
      this._historyPos.set(history.length);
      this.updatePanel(panelId, { ref });
    }
    this.statusRef.set(ref);
  }

  goBack(): BibleRef | null { return this.step(-1); }
  goForward(): BibleRef | null { return this.step(1); }

  /** Moves through history, skipping entries whose panel has been closed. */
  private step(dir: -1 | 1): BibleRef | null {
    const history = this._history();
    let pos = this._historyPos() + dir;
    while (pos >= 0 && pos < history.length &&
           !this.openPanels().some(p => p.id === history[pos].panelId)) {
      pos += dir;
    }
    if (pos < 0 || pos >= history.length) return null;
    const { panelId, ref } = history[pos];
    this._historyPos.set(pos);
    this.activePanelId.set(panelId);
    this.updatePanel(panelId, { ref });
    this.statusRef.set(ref);
    return ref;
  }
}
