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
              <button (click)="saveNote()">Save</button>
              <button (click)="cancelEdit()">Cancel</button>
            </div>
          </div>
          <textarea
            [(ngModel)]="noteBody"
            placeholder="Write your note…"
            rows="8"
          ></textarea>
        </div>
      }

      <div class="new-note-bar">
        <button (click)="newNote()">+ New note</button>
      </div>

      @if (notes().length) {
        <ul class="notes-list">
          @for (n of notes(); track n.id) {
            <li class="note-item" (click)="editExisting(n)">
              <span class="note-ref">{{ formatRef(n.reference) }}</span>
              <span class="note-preview">{{ n.body.substring(0, 80) }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="muted-text">No notes yet</p>
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
    .new-note-bar button:hover { color: var(--color-text-primary); }
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
    .notes-list { list-style: none; margin: 0; padding: 0; }
    .note-item {
      display: flex;
      flex-direction: column;
      padding: 7px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer;
    }
    .note-item:hover { background: rgba(255,255,255,0.04); }
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
  protected noteBody = '';

  ngOnInit(): void {
    this.loadNotes();
  }

  private async loadNotes(): Promise<void> {
    try {
      this.notes.set(await this.notesService.getNotes());
    } catch {
      this.notes.set([]);
    }
  }

  protected newNote(): void {
    const ref = this.appState.statusRef() ?? { book: 'General', chapter: 0, verse: 0 };
    const note: Note = {
      id: crypto.randomUUID(),
      reference: ref,
      body: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.editingNote.set(note);
    this.noteBody = '';
  }

  protected readonly formatRef = formatRef;

  protected editExisting(note: Note): void {
    this.editingNote.set(note);
    this.noteBody = note.body;
  }

  protected async saveNote(): Promise<void> {
    const note = this.editingNote();
    if (!note) return;
    const updated = { ...note, body: this.noteBody, updated_at: new Date().toISOString() };
    try {
      await this.notesService.saveNote(updated);
    } catch { /* offline */ }
    this.notes.update(ns => {
      const idx = ns.findIndex(n => n.id === updated.id);
      return idx >= 0 ? ns.map(n => n.id === updated.id ? updated : n) : [updated, ...ns];
    });
    this.editingNote.set(null);
  }

  protected cancelEdit(): void {
    this.editingNote.set(null);
  }
}
