import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BookmarksPanelComponent } from './bookmarks-panel.component';
import { AppState } from '../../core/state/app.state';
import { NotesService } from '../../core/services';
import { Bookmark } from '../../core/models';

const makeBm = (id: string, label = 'Test'): Bookmark => ({
  id,
  reference: { book: 'John', chapter: 1, verse: 1 },
  label,
  created_at: '2024-01-01T00:00:00.000Z',
});

const flush = async (fix: ComponentFixture<unknown>) => {
  await new Promise(r => setTimeout(r, 10));
  fix.detectChanges();
};

describe('BookmarksPanelComponent', () => {
  let component: BookmarksPanelComponent;
  let fixture: ComponentFixture<BookmarksPanelComponent>;
  let notesService: NotesService;
  let appState: AppState;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [BookmarksPanelComponent],
      providers: [
        AppState,
        {
          provide: NotesService,
          useValue: {
            getBookmarks: vi.fn(),
            saveBookmark: vi.fn(),
            deleteBookmark: vi.fn(),
          },
        },
      ],
    });

    notesService = TestBed.inject(NotesService);
    appState = TestBed.inject(AppState);
    // Give the component a current reference so the add row renders
    appState.statusRef.set({ book: 'John', chapter: 1, verse: 1 });

    fixture = TestBed.createComponent(BookmarksPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  describe('Loading', () => {
    it('shows empty-state text when load succeeds with no bookmarks', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('No bookmarks yet');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeFalsy();
    });

    it('shows error when load fails — not empty state', async () => {
      vi.mocked(notesService.getBookmarks).mockRejectedValue(new Error('DB error'));
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('DB error');
      expect(fixture.nativeElement.textContent).not.toContain('No bookmarks yet');
    });

    it('shows loaded bookmarks after successful load', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([makeBm('b1', 'Genesis 1:1')]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('Genesis 1:1');
    });

    it('retry re-invokes backend and clears error on success', async () => {
      vi.mocked(notesService.getBookmarks).mockRejectedValueOnce(new Error('timeout'));
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert).toBeTruthy();

      vi.mocked(notesService.getBookmarks).mockResolvedValue([makeBm('b1')]);
      (alert.querySelector('button') as HTMLButtonElement).click();
      await flush(fixture);

      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeFalsy();
      expect(notesService.getBookmarks).toHaveBeenCalledTimes(2);
    });

    it('does not erase existing bookmarks when a retry fails', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValueOnce([makeBm('b1', 'Kept')]);
      fixture.detectChanges();
      await flush(fixture);

      expect(fixture.nativeElement.textContent).toContain('Kept');

      vi.mocked(notesService.getBookmarks).mockRejectedValue(new Error('retry fail'));
      await component['retryLoad']();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Kept');
    });

    it('prevents duplicate concurrent load requests', async () => {
      let resolveFirst!: (b: Bookmark[]) => void;
      vi.mocked(notesService.getBookmarks).mockReturnValue(
        new Promise(r => { resolveFirst = r; })
      );

      fixture.detectChanges(); // first load

      await component['retryLoad'](); // second attempt while first is pending

      expect(notesService.getBookmarks).toHaveBeenCalledTimes(1);
      resolveFirst([]);
    });

    it('discards stale load response after a confirmed add', async () => {
      let resolveOldLoad!: (b: Bookmark[]) => void;
      vi.mocked(notesService.getBookmarks).mockReturnValueOnce(
        new Promise(r => { resolveOldLoad = r; })
      );
      vi.mocked(notesService.saveBookmark).mockImplementation(id =>
        Promise.resolve(makeBm(id, 'My Label'))
      );

      fixture.detectChanges(); // initial load starts, deferred

      // Confirm an add while load is still in flight
      component['newLabel'] = 'My Label';
      await component['addBookmark']();
      fixture.detectChanges();

      // Bookmark immediately visible via optimistic local update
      expect(component['bookmarks']().length).toBe(1);
      expect(component['bookmarks']()[0].label).toBe('My Label');

      // Resolve the original stale load with empty data
      resolveOldLoad([]);
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      // Stale empty response must not have erased the new bookmark
      expect(component['bookmarks']().length).toBe(1);
    });

    it('discards stale load response after a confirmed delete', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValueOnce([makeBm('b1', 'ToDelete')]);
      fixture.detectChanges();
      await flush(fixture); // initial load: [b1]

      // User retries load — the response is deferred (simulates slow backend)
      let resolveStaleLoad!: (b: Bookmark[]) => void;
      vi.mocked(notesService.getBookmarks).mockReturnValueOnce(
        new Promise(r => { resolveStaleLoad = r; })
      );
      component['retryLoad'](); // background load with versionAtStart = 0
      fixture.detectChanges();

      // User deletes b1 while retry load is still pending
      vi.mocked(notesService.deleteBookmark).mockResolvedValue(undefined);
      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['bookmarks']().length).toBe(0);

      // Stale retry load resolves with the already-deleted bookmark
      resolveStaleLoad([makeBm('b1', 'ToDelete')]);
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      // Stale response must not restore the deleted bookmark
      expect(component['bookmarks']().length).toBe(0);
    });
  });

  // ── Adding bookmarks ──────────────────────────────────────────────────────

  describe('Adding bookmarks', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('saves a bookmark and adds it to the list optimistically', async () => {
      vi.mocked(notesService.saveBookmark).mockImplementation(id =>
        Promise.resolve(makeBm(id, 'Added'))
      );

      component['newLabel'] = 'Added';
      await component['addBookmark']();
      fixture.detectChanges();

      expect(notesService.saveBookmark).toHaveBeenCalledOnce();
      expect(component['bookmarks']().length).toBe(1);
      expect(component['bookmarks']()[0].label).toBe('Added');
      expect(component['bookmarks']()[0].reference).toEqual({ book: 'John', chapter: 1, verse: 1 });
      expect(component['newLabel']).toBe('');
      expect(component['saveError']()).toBeNull();
    });

    it('preserves label input and shows error when save fails', async () => {
      vi.mocked(notesService.saveBookmark).mockRejectedValue(new Error('disk full'));

      component['newLabel'] = 'My Bookmark';
      await component['addBookmark']();
      fixture.detectChanges();

      expect(component['newLabel']).toBe('My Bookmark'); // preserved for retry
      expect(component['bookmarks']().length).toBe(0);
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('disk full');
    });

    it('retry after failure saves without re-entering the label', async () => {
      vi.mocked(notesService.saveBookmark)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockImplementationOnce(id => Promise.resolve(makeBm(id, 'Retry Label')));

      component['newLabel'] = 'Retry Label';
      await component['addBookmark'](); // fails
      expect(component['newLabel']).toBe('Retry Label'); // label preserved

      await component['addBookmark'](); // retry with same label — succeeds
      fixture.detectChanges();

      expect(component['bookmarks']().length).toBe(1);
      expect(component['bookmarks']()[0].label).toBe('Retry Label');
      expect(component['newLabel']).toBe('');
    });

    it('prevents duplicate save submissions', async () => {
      let resolveSave!: (b: Bookmark) => void;
      vi.mocked(notesService.saveBookmark).mockReturnValue(
        new Promise<Bookmark>(r => { resolveSave = r; })
      );

      component['newLabel'] = 'test';
      const first = component['addBookmark']();
      const second = component['addBookmark'](); // duplicate

      resolveSave(makeBm('some-id'));
      await first;
      await second;

      expect(notesService.saveBookmark).toHaveBeenCalledTimes(1);
    });

    it('disables add button while saving', () => {
      vi.mocked(notesService.saveBookmark).mockReturnValue(new Promise<Bookmark>(() => {}));

      component['newLabel'] = 'test';
      component['addBookmark']();
      fixture.detectChanges();

      const addBtn = fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
    });

    it('re-enables controls after save completes', async () => {
      vi.mocked(notesService.saveBookmark).mockResolvedValue(makeBm('b1'));

      component['newLabel'] = 'test';
      await component['addBookmark']();
      fixture.detectChanges();

      expect(component['saving']()).toBe(false);
    });
  });

  // ── Deleting bookmarks ────────────────────────────────────────────────────

  describe('Deleting bookmarks', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([
        makeBm('b1', 'First'),
        makeBm('b2', 'Second'),
      ]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('removes bookmark from the list on successful deletion', async () => {
      vi.mocked(notesService.deleteBookmark).mockResolvedValue(undefined);

      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['bookmarks']().length).toBe(1);
      expect(component['bookmarks']()[0].id).toBe('b2');
    });

    it('preserves the bookmark and shows error when deletion fails', async () => {
      vi.mocked(notesService.deleteBookmark).mockRejectedValue(new Error('delete failed'));

      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['bookmarks']().length).toBe(2);
      expect(component['deleteErrors']().get('b1')).toContain('delete failed');
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
    });

    it('retry delete succeeds and removes the bookmark', async () => {
      vi.mocked(notesService.deleteBookmark)
        .mockRejectedValueOnce(new Error('err'))
        .mockResolvedValueOnce(undefined);

      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['deleteErrors']().get('b1')).toBeTruthy();

      await component['retryDelete']('b1');
      fixture.detectChanges();

      expect(component['bookmarks']().length).toBe(1);
      expect(component['deleteErrors']().get('b1')).toBeUndefined();
    });

    it('prevents duplicate deletion while one is in progress', async () => {
      let resolveDelete!: () => void;
      vi.mocked(notesService.deleteBookmark).mockReturnValue(
        new Promise<void>(r => { resolveDelete = r; })
      );

      const first = component['remove']('b1');
      const second = component['remove']('b1'); // duplicate

      resolveDelete();
      await first;
      await second;

      expect(notesService.deleteBookmark).toHaveBeenCalledTimes(1);
    });

    it('preserves surviving bookmarks when one deletion fails', async () => {
      vi.mocked(notesService.deleteBookmark).mockRejectedValue(new Error('err'));

      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['bookmarks']().some(b => b.id === 'b1')).toBe(true);
      expect(component['bookmarks']().some(b => b.id === 'b2')).toBe(true);
    });

    it('two different bookmarks can be deleted concurrently with independent state', async () => {
      let resolveB1!: () => void;
      let resolveB2!: () => void;
      vi.mocked(notesService.deleteBookmark)
        .mockReturnValueOnce(new Promise<void>(r => { resolveB1 = r; }))
        .mockReturnValueOnce(new Promise<void>(r => { resolveB2 = r; }));

      const taskB1 = component['remove']('b1');
      const taskB2 = component['remove']('b2');

      // Both are pending simultaneously
      expect(component['deletingIds']().has('b1')).toBe(true);
      expect(component['deletingIds']().has('b2')).toBe(true);

      // Finish b2 first
      resolveB2();
      await taskB2;
      fixture.detectChanges();

      expect(component['bookmarks']().some(b => b.id === 'b2')).toBe(false);
      // b1 is still in-flight
      expect(component['deletingIds']().has('b1')).toBe(true);

      // Finish b1
      resolveB1();
      await taskB1;
      fixture.detectChanges();

      expect(component['bookmarks']().some(b => b.id === 'b1')).toBe(false);
      expect(component['deletingIds']().size).toBe(0);
    });

    it('errors are associated with the correct bookmark ID', async () => {
      vi.mocked(notesService.deleteBookmark).mockRejectedValue(new Error('err'));

      await component['remove']('b1');
      fixture.detectChanges();

      expect(component['deleteErrors']().has('b1')).toBe(true);
      expect(component['deleteErrors']().has('b2')).toBe(false);
    });
  });

  // ── Bookmark identity (P0.7.1) ────────────────────────────────────────────

  describe('Bookmark identity', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('displays the UUID returned by the backend, not a locally generated one', async () => {
      const persisted = makeBm('server-uuid-abc', 'Bookmarked');
      vi.mocked(notesService.saveBookmark).mockResolvedValue(persisted);

      component['newLabel'] = 'Bookmarked';
      await component['addBookmark']();
      fixture.detectChanges();

      expect(component['bookmarks']()[0].id).toBe('server-uuid-abc');
    });

    it('passes the client-generated id to the backend for idempotency', async () => {
      const capturedId: string[] = [];
      vi.mocked(notesService.saveBookmark).mockImplementation((id, ...rest) => {
        capturedId.push(id);
        return Promise.resolve(makeBm(id));
      });

      component['newLabel'] = 'test';
      await component['addBookmark']();

      expect(capturedId.length).toBe(1);
      expect(capturedId[0]).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(component['bookmarks']()[0].id).toBe(capturedId[0]);
    });

    it('immediate delete after save calls deleteBookmark with the backend UUID', async () => {
      const persisted = makeBm('real-uuid-xyz');
      vi.mocked(notesService.saveBookmark).mockResolvedValue(persisted);
      vi.mocked(notesService.deleteBookmark).mockResolvedValue(undefined);

      component['newLabel'] = 'test';
      await component['addBookmark']();
      fixture.detectChanges();

      await component['remove']('real-uuid-xyz');

      expect(notesService.deleteBookmark).toHaveBeenCalledWith('real-uuid-xyz');
      expect(component['bookmarks']().length).toBe(0);
    });

    it('retry uses the same client UUID (idempotent, no duplicate record)', async () => {
      const capturedIds: string[] = [];
      vi.mocked(notesService.saveBookmark)
        .mockImplementationOnce(id => { capturedIds.push(id); return Promise.reject(new Error('err')); })
        .mockImplementation(id => { capturedIds.push(id); return Promise.resolve(makeBm(id)); });

      component['newLabel'] = 'test';
      await component['addBookmark'](); // fails; pendingSave set
      await component['addBookmark'](); // retry

      expect(capturedIds.length).toBe(2);
      expect(capturedIds[0]).toBe(capturedIds[1]); // same UUID on retry
    });
  });

  // ── Save with preserved reference (P0.7.1 Task C) ────────────────────────

  describe('Save — preserved reference on retry', () => {
    beforeEach(async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      fixture.detectChanges();
      await flush(fixture);
    });

    it('captures the original reference on first attempt', async () => {
      vi.mocked(notesService.saveBookmark).mockRejectedValue(new Error('err'));

      appState.statusRef.set({ book: 'John', chapter: 3, verse: 16 });
      component['newLabel'] = 'First attempt';
      await component['addBookmark'](); // fails

      expect(component['pendingSave']?.ref).toEqual({ book: 'John', chapter: 3, verse: 16 });
    });

    it('retry uses original reference even after statusRef changes to a different verse', async () => {
      let capturedBook = '';
      vi.mocked(notesService.saveBookmark)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockImplementation((id, book) => { capturedBook = book; return Promise.resolve(makeBm(id)); });

      appState.statusRef.set({ book: 'John', chapter: 3, verse: 16 });
      component['newLabel'] = 'Save me';
      await component['addBookmark'](); // fails

      // User navigates to a different verse
      appState.statusRef.set({ book: 'Gen', chapter: 1, verse: 1 });
      fixture.detectChanges();

      await component['addBookmark'](); // retry
      expect(capturedBook).toBe('John'); // original book, not Gen
    });

    it('cancelPendingSave clears the pending state', async () => {
      vi.mocked(notesService.saveBookmark).mockRejectedValue(new Error('err'));
      component['newLabel'] = 'test';
      await component['addBookmark']();
      expect(component['pendingSave']).not.toBeNull();

      component['cancelPendingSave']();
      expect(component['pendingSave']).toBeNull();
      expect(component['saveError']()).toBeNull();
    });
  });

  // Tauri's invoke() rejects with the raw Err(String), not an Error instance.
  describe('Native IPC rejection shape (plain string)', () => {
    it('save: shows the backend message verbatim and keeps the draft', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      vi.mocked(notesService.saveBookmark).mockRejectedValue('Database error: disk full');
      fixture.detectChanges();
      await flush(fixture);

      const input = fixture.nativeElement.querySelector('.label-input') as HTMLInputElement;
      input.value = 'My draft';
      input.dispatchEvent(new Event('input'));
      (fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement).click();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Database error: disk full');
      expect(alert.textContent).not.toContain('Failed to save bookmark');
      expect(input.value).toBe('My draft');
      expect(component['bookmarks']()).toEqual([]);
    });

    it('delete: shows the backend message on the failed row and keeps the bookmark', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([makeBm('b1', 'Keep me')]);
      vi.mocked(notesService.deleteBookmark).mockRejectedValue('Database error: bookmark b1 not found');
      fixture.detectChanges();
      await flush(fixture);

      (fixture.nativeElement.querySelector('.del-btn') as HTMLButtonElement).click();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('.delete-error-row[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Database error: bookmark b1 not found');
      expect(fixture.nativeElement.textContent).toContain('Keep me');
      expect(component['bookmarks']().map(b => b.id)).toEqual(['b1']);
    });

    it('load: shows the backend message instead of a false empty state', async () => {
      vi.mocked(notesService.getBookmarks).mockRejectedValue('Database error: database is locked');
      fixture.detectChanges();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Database error: database is locked');
      expect(fixture.nativeElement.textContent).not.toContain('No bookmarks yet');
    });

    it('a blank rejection still produces a visible generic error', async () => {
      vi.mocked(notesService.getBookmarks).mockResolvedValue([]);
      vi.mocked(notesService.saveBookmark).mockRejectedValue('');
      fixture.detectChanges();
      await flush(fixture);

      (fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement).click();
      await flush(fixture);

      const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('Failed to save bookmark');
    });
  });
});
