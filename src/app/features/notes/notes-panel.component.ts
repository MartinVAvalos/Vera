import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Note, formatRef } from '../../core/models';

@Component({
  selector: 'app-notes-panel',
  imports: [FormsModule],
  template: `
    <div class="notes-panel">
      <h2 class="panel-title">NOTES</h2>

      @if (editingNote(); as note) {
        <div class="note-editor">
          <div class="editor-header">
            <span class="note-ref">{{ formatRef(note.reference) }}</span>
            <div class="editor-actions">
              <button type="button" (click)="saveNote()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
              <button type="button" (click)="cancelEdit()" [disabled]="saving()">Cancel</button>
            </div>
          </div>
          <textarea
            [(ngModel)]="noteBody"
            placeholder="Write your note…"
            rows="8"
            [disabled]="saving()"
          ></textarea>
          @if (saveError()) {
            <div class="error-msg" role="alert">
              {{ saveError() }}
              <button type="button" (click)="saveNote()" [disabled]="saving()">Retry</button>
            </div>
          }
        </div>
      }

      <div class="new-note-bar">
        <button type="button" (click)="newNote()" [disabled]="saving()">+ New note</button>
      </div>

      @if (loading()) {
        <p class="muted-text">Loading…</p>
      } @else {
        @if (loadError()) {
          <div class="error-msg load-error" role="alert">
            {{ loadError() }}
            <button type="button" (click)="retryLoad()">Retry</button>
          </div>
        }
        @if (notes().length) {
          <ul class="notes-list">
            @for (n of notes(); track n.id) {
              <li class="note-item">
                <button type="button" class="note-btn" (click)="editExisting(n)" [disabled]="saving()">
                  <span class="note-ref">{{ formatRef(n.reference) }}</span>
                  <span class="note-preview">{{ n.body.substring(0, 80) }}</span>
                </button>
              </li>
            }
          </ul>
        } @else if (!loadError()) {
          <p class="muted-text">No notes yet</p>
        }
      }
    </div>
  `,
  styles: [`
    .notes-panel { padding: 8px 0; }
    .panel-title {
      font-size: 11px; font-weight: 700;
      color: var(--color-text-primary);
      padding: 6px 12px 10px;
      letter-spacing: 0.08em;
    }
    .new-note-bar { padding: 0 12px 10px; }
    .new-note-bar button {
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
    }
    .new-note-bar button:hover:not(:disabled) { color: var(--color-text-primary); }
    .new-note-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
    .note-editor {
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--color-border-subtle);
      margin-bottom: 8px;
    }
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .editor-actions { display: flex; gap: 6px; }
    .editor-actions button {
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    .editor-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
    textarea {
      width: 100%;
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      resize: vertical;
      font-family: var(--font-sans);
    }
    textarea:disabled { opacity: 0.6; cursor: not-allowed; }
    .error-msg {
      color: #d9534f;
      font-size: 11px;
      padding: 4px 0 2px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .error-msg button {
      font-size: 11px;
      padding: 2px 8px;
      background: transparent;
      border: 1px solid #d9534f;
      color: #d9534f;
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .error-msg button:disabled { opacity: 0.5; cursor: not-allowed; }
    .load-error { padding: 4px 12px; }
    .notes-list { list-style: none; margin: 0; padding: 0; }
    .note-item {
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .note-btn {
      display: flex;
      flex-direction: column;
      width: 100%;
      background: none;
      border: none;
      padding: 7px 12px;
      text-align: left;
      cursor: pointer;
    }
    .note-btn:hover:not(:disabled) { background: rgba(255,255,255,0.04); }
    .note-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .note-ref { font-size: 11px; color: var(--color-text-link); margin-bottom: 2px; }
    .note-preview { font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
    .muted-text { color: var(--color-text-muted); font-size: 12px; padding: 0 12px; }
  `],
})
export class NotesPanelComponent implements OnInit {
  private readonly appState = inject(AppState);
  private readonly notesService = inject(NotesService);

  protected readonly notes = signal<Note[]>([]);
  protected readonly editingNote = signal<Note | null>(null);
  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected noteBody = '';

  /** Incremented on every confirmed save; guards load responses from overwriting newer local state. */
  private mutationVersion = 0;

  ngOnInit(): void {
    this.loadNotes();
  }

  private async loadNotes(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(null);
    const versionAtStart = this.mutationVersion;
    try {
      const notes = await this.notesService.getNotes();
      // Discard if a confirmed save occurred while this load was in flight
      if (this.mutationVersion !== versionAtStart) return;
      this.notes.set(notes);
    } catch (e) {
      this.loadError.set((e instanceof Error ? e.message : String(e)) || 'Failed to load notes');
      // Do not reset notes — preserve any previously loaded data
    } finally {
      this.loading.set(false);
    }
  }

  protected retryLoad(): void {
    this.loadNotes();
  }

  protected newNote(): void {
    if (this.saving()) return;
    const ref = this.appState.statusRef() ?? { book: 'General', chapter: 0, verse: 0 };
    const note: Note = {
      id: crypto.randomUUID(),
      reference: ref,
      body: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.saveError.set(null);
    this.editingNote.set(note);
    this.noteBody = '';
  }

  protected readonly formatRef = formatRef;

  protected editExisting(note: Note): void {
    if (this.saving()) return;
    this.saveError.set(null);
    this.editingNote.set(note);
    this.noteBody = note.body;
  }

  protected async saveNote(): Promise<void> {
    const note = this.editingNote();
    if (!note || this.saving()) return;
    const updated: Note = {
      ...note,
      body: this.noteBody,
      updated_at: new Date().toISOString(),
    };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.notesService.saveNote(updated);
      // Mark local state as newer than any in-flight load response
      this.mutationVersion++;
      // Only update local state after confirmed backend persistence
      this.notes.update(ns => {
        const idx = ns.findIndex(n => n.id === updated.id);
        return idx >= 0 ? ns.map(n => n.id === updated.id ? updated : n) : [updated, ...ns];
      });
      this.editingNote.set(null);
    } catch (e) {
      // Keep editor open with draft intact; expose error so user can retry
      this.saveError.set((e instanceof Error ? e.message : String(e)) || 'Failed to save note');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancelEdit(): void {
    this.editingNote.set(null);
    this.saveError.set(null);
  }
}
