import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Note, formatRef } from '../../core/models';

@Component({
  selector: 'app-notes-panel',
  imports: [FormsModule],
  templateUrl: './notes-panel.component.html',
  styleUrl: './notes-panel.component.scss',
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
