import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotesPanelComponent } from './notes-panel.component';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Note } from '../../core/models';

const makeNote = (id: string, body = 'test body'): Note => ({
  id,
  reference: { book: 'John', chapter: 1, verse: 1 },
  body,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
});

/** Flush the microtask queue and trigger Angular change detection. */
const flush = async (fix: ComponentFixture<unknown>) => {
  await new Promise(r => setTimeout(r, 10));
  fix.detectChanges();
};

describe('NotesPanelComponent', () => {
  let component: NotesPanelComponent;
  let fixture: ComponentFixture<NotesPanelComponent>;
  let notesService: NotesService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [NotesPanelComponent],
      providers: [
        AppState,
        {
          provide: NotesService,
          useValue: {
            getNotes: vi.fn(),
            saveNote: vi.fn(),
            deleteNote: vi.fn(),
          },
        },
      ],
    });

    notesService = TestBed.inject(NotesService);
    fixture = TestBed.createComponent(NotesPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  describe('Loading', () => {
    it('shows empty-state text when load succeeds with no notes', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('No notes yet');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeFalsy();
    });

    it('shows error when load fails — not an empty state', async () => {
      vi.mocked(notesService.getNotes).mockRejectedValue(new Error('DB unavailable'));
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('DB unavailable');
      expect(fixture.nativeElement.textContent).not.toContain('No notes yet');
    });

    it('shows loaded notes after successful load', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([makeNote('n1', 'First note')]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('First note');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeFalsy();
    });

    it('retry re-invokes backend and clears error on success', async () => {
      vi.mocked(notesService.getNotes).mockRejectedValueOnce(new Error('timeout'));
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert).toBeTruthy();

      vi.mocked(notesService.getNotes).mockResolvedValue([makeNote('n1')]);
      (alert.querySelector('button') as HTMLButtonElement).click();
      await flush(fixture);

      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeFalsy();
      expect(notesService.getNotes).toHaveBeenCalledTimes(2);
    });

    it('does not erase existing notes when a retry fails', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValueOnce([makeNote('n1', 'Existing note')]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('Existing note');

      vi.mocked(notesService.getNotes).mockRejectedValue(new Error('retry fail'));
      await component['retryLoad']();
      fixture.detectChanges();

      // Error shown but previously-loaded notes preserved
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Existing note');
    });

    it('prevents duplicate concurrent load requests', async () => {
      let resolveFirst!: (n: Note[]) => void;
      vi.mocked(notesService.getNotes).mockReturnValue(
        new Promise(r => { resolveFirst = r; })
      );

      fixture.detectChanges(); // first load starts

      // Attempt second load while first is pending
      await component['retryLoad']();

      expect(notesService.getNotes).toHaveBeenCalledTimes(1);
      resolveFirst([]);
    });
  });

  // ── Saving — new note ─────────────────────────────────────────────────────

  describe('Saving — new note', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('saves a new note, adds it to the list, and closes the editor', async () => {
      vi.mocked(notesService.saveNote).mockResolvedValue(undefined);

      component['newNote']();
      component['noteBody'] = 'My first note';
      fixture.detectChanges();

      await component['saveNote']();
      fixture.detectChanges();

      expect(notesService.saveNote).toHaveBeenCalledOnce();
      expect(component['editingNote']()).toBeNull();
      expect(component['notes']().length).toBe(1);
      expect(component['notes']()[0].body).toBe('My first note');
    });

    it('keeps editor open and draft intact when save fails', async () => {
      vi.mocked(notesService.saveNote).mockRejectedValue(new Error('disk full'));

      component['newNote']();
      component['noteBody'] = 'Draft text';
      fixture.detectChanges();

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['editingNote']()).not.toBeNull();
      expect(component['noteBody']).toBe('Draft text');
      expect(component['notes']().length).toBe(0); // not falsely added
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('disk full');
    });

    it('retry after failure saves without re-entering text', async () => {
      vi.mocked(notesService.saveNote)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(undefined);

      component['newNote']();
      component['noteBody'] = 'My note';
      await component['saveNote'](); // fails
      fixture.detectChanges();

      expect(component['notes']().length).toBe(0);
      expect(component['noteBody']).toBe('My note');

      await component['saveNote'](); // retry with same body — succeeds
      fixture.detectChanges();

      expect(component['notes']().length).toBe(1);
      expect(component['editingNote']()).toBeNull();
    });

    it('preserves the note id and created_at across save', async () => {
      vi.mocked(notesService.saveNote).mockResolvedValue(undefined);

      component['newNote']();
      const originalId = component['editingNote']()!.id;
      const originalCreatedAt = component['editingNote']()!.created_at;
      component['noteBody'] = 'body';

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['notes']()[0].id).toBe(originalId);
      expect(component['notes']()[0].created_at).toBe(originalCreatedAt);
    });
  });

  // ── Saving — existing note update ─────────────────────────────────────────

  describe('Saving — existing note update', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([makeNote('n1', 'Original')]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('updates the note in the list after a successful save', async () => {
      vi.mocked(notesService.saveNote).mockResolvedValue(undefined);

      component['editExisting'](component['notes']()[0]);
      component['noteBody'] = 'Updated text';

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['notes']()[0].body).toBe('Updated text');
      expect(component['editingNote']()).toBeNull();
    });

    it('does not update the list when save fails on an existing note', async () => {
      vi.mocked(notesService.saveNote).mockRejectedValue(new Error('error'));

      component['editExisting'](component['notes']()[0]);
      component['noteBody'] = 'Should not persist';

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['notes']()[0].body).toBe('Original');
      expect(component['editingNote']()).not.toBeNull();
    });
  });

  // ── Saving — pending state (DOM) ──────────────────────────────────────────

  describe('Saving — pending state', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('disables Save button while save is pending', () => {
      vi.mocked(notesService.saveNote).mockReturnValue(new Promise(() => {}));

      component['newNote']();
      component['noteBody'] = 'test';
      fixture.detectChanges();

      component['saveNote'](); // start — don't await
      fixture.detectChanges();

      const saveBtn = fixture.nativeElement
        .querySelector('.editor-actions button:first-child') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('disables Cancel button while save is pending', () => {
      vi.mocked(notesService.saveNote).mockReturnValue(new Promise(() => {}));

      component['newNote']();
      component['noteBody'] = 'test';
      fixture.detectChanges();

      component['saveNote']();
      fixture.detectChanges();

      const cancelBtn = fixture.nativeElement
        .querySelector('.editor-actions button:last-child') as HTMLButtonElement;
      expect(cancelBtn.disabled).toBe(true);
    });

    it('does not invoke backend twice on rapid duplicate submissions', async () => {
      let resolveFirst!: () => void;
      vi.mocked(notesService.saveNote).mockReturnValue(
        new Promise<void>(r => { resolveFirst = r; })
      );

      component['newNote']();
      component['noteBody'] = 'test';

      const first = component['saveNote']();
      const second = component['saveNote'](); // duplicate — must be blocked

      resolveFirst();
      await first;
      await second;

      expect(notesService.saveNote).toHaveBeenCalledTimes(1);
    });

    it('re-enables controls and closes editor after successful save', async () => {
      vi.mocked(notesService.saveNote).mockResolvedValue(undefined);

      component['newNote']();
      component['noteBody'] = 'test';
      fixture.detectChanges();

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['saving']()).toBe(false);
      expect(component['editingNote']()).toBeNull();
    });

    it('re-enables controls and shows error after save failure', async () => {
      vi.mocked(notesService.saveNote).mockRejectedValue(new Error('err'));

      component['newNote']();
      component['noteBody'] = 'test';
      fixture.detectChanges();

      await component['saveNote']();
      fixture.detectChanges();

      expect(component['saving']()).toBe(false);
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
    });
  });

  // ── Stale-load protection (Task A) ────────────────────────────────────────

  describe('Stale-load protection', () => {
    it('discards a load response that arrived after a confirmed save', async () => {
      let resolveOldLoad!: (notes: Note[]) => void;
      vi.mocked(notesService.getNotes).mockReturnValueOnce(
        new Promise(r => { resolveOldLoad = r; })
      );
      vi.mocked(notesService.saveNote).mockResolvedValue(undefined);

      fixture.detectChanges(); // triggers ngOnInit → load starts, deferred

      // User saves a new note while load is still pending
      component['newNote']();
      component['noteBody'] = 'Fresh note';
      await component['saveNote']();
      fixture.detectChanges();

      expect(component['notes']().length).toBe(1);
      expect(component['notes']()[0].body).toBe('Fresh note');

      // Now resolve the old load with a snapshot that pre-dates the save
      resolveOldLoad([]);
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      // Fresh note must remain; the old empty snapshot must not have overwritten it
      expect(component['notes']().length).toBe(1);
      expect(component['notes']()[0].body).toBe('Fresh note');
    });

    it('applies a load response when no mutation occurred during the load', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([makeNote('n1', 'Server note')]);

      fixture.detectChanges();
      await flush(fixture);

      expect(component['notes']().length).toBe(1);
      expect(component['notes']()[0].body).toBe('Server note');
    });
  });

  // ── Editor-switch guard during pending save (Task B) ─────────────────────

  describe('Editor-switch guard during pending save', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([
        makeNote('n1', 'First'),
        makeNote('n2', 'Second'),
      ]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('editExisting is rejected while a save is pending', () => {
      vi.mocked(notesService.saveNote).mockReturnValue(new Promise(() => {}));
      vi.mocked(notesService.getNotes).mockResolvedValue([]);

      component['editExisting'](component['notes']()[0]);
      component['noteBody'] = 'draft';
      const originalNote = component['editingNote']();

      component['saveNote'](); // start pending save, don't await
      fixture.detectChanges();

      // Attempt to switch to another note while save is pending
      component['editExisting'](component['notes']()[1]);

      // Editor must still show the original note, not the switched one
      expect(component['editingNote']()?.id).toBe(originalNote?.id);
    });

    it('newNote is rejected while a save is pending', () => {
      vi.mocked(notesService.saveNote).mockReturnValue(new Promise(() => {}));
      vi.mocked(notesService.getNotes).mockResolvedValue([]);

      component['editExisting'](component['notes']()[0]);
      component['noteBody'] = 'draft';
      const originalNote = component['editingNote']();

      component['saveNote']();
      fixture.detectChanges();

      component['newNote'](); // attempt to open new editor while save pending

      // Editor must remain on the original note being saved
      expect(component['editingNote']()?.id).toBe(originalNote?.id);
    });

    it('note-list buttons are disabled while saving', () => {
      vi.mocked(notesService.saveNote).mockReturnValue(new Promise(() => {}));
      vi.mocked(notesService.getNotes).mockResolvedValue([]);

      component['editExisting'](component['notes']()[0]);
      component['noteBody'] = 'test';
      component['saveNote']();
      fixture.detectChanges();

      const noteButtons = fixture.nativeElement.querySelectorAll('.note-btn') as NodeListOf<HTMLButtonElement>;
      expect(noteButtons.length).toBe(2);
      noteButtons.forEach(btn => expect(btn.disabled).toBe(true));
    });
  });

  // Tauri's invoke() rejects with the raw Err(String), not an Error instance.
  describe('Native IPC rejection shape (plain string)', () => {
    it('save: shows the backend message verbatim and keeps the draft', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([]);
      vi.mocked(notesService.saveNote).mockRejectedValue('Database error: disk full');
      fixture.detectChanges();
      await flush(fixture);

      (fixture.nativeElement.querySelector('.new-note-bar button') as HTMLButtonElement).click();
      fixture.detectChanges();
      await flush(fixture); // let ngModel complete its initial async model→view write
      const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Draft text';
      textarea.dispatchEvent(new Event('input'));
      (fixture.nativeElement.querySelector('.editor-actions button') as HTMLButtonElement).click();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Database error: disk full');
      expect(alert.textContent).not.toContain('Failed to save note');
      expect(component['noteBody']).toBe('Draft text');
      expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Draft text');
      expect(component['notes']()).toEqual([]);
    });

    it('load: shows the backend message instead of a false empty state', async () => {
      vi.mocked(notesService.getNotes).mockRejectedValue('Database error: database is locked');
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Database error: database is locked');
      expect(fixture.nativeElement.textContent).not.toContain('No notes yet');
    });

    it('a blank rejection still produces a visible generic error', async () => {
      vi.mocked(notesService.getNotes).mockResolvedValue([]);
      vi.mocked(notesService.saveNote).mockRejectedValue('');
      fixture.detectChanges();
      await flush(fixture);

      component['newNote']();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.editor-actions button') as HTMLButtonElement).click();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('Failed to save note');
    });
  });
});
