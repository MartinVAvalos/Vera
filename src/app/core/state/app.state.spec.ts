import { TestBed } from '@angular/core/testing';
import { AppState } from './app.state';
import { Module } from '../models';

const mod = (id: string): Module =>
  ({ id, name: id, module_type: 'Bible', lang: 'en', description: '', installed: true }) as Module;

describe('AppState history', () => {
  let state: AppState;
  beforeEach(() => { state = TestBed.inject(AppState); });

  it('restores the module panel a history entry belongs to', () => {
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    const kjv = state.activePanelId()!;
    state.openModule(mod('DRC'), { book: 'Ps', chapter: 23, verse: 1 });
    const drc = state.activePanelId()!;
    expect(drc).not.toBe(kjv);

    const ref = state.goBack();
    expect(ref).toEqual({ book: 'Gen', chapter: 1, verse: 1 });
    expect(state.activePanelId()).toBe(kjv);
    // The DRC panel keeps its own reference.
    expect(state.openPanels().find(p => p.id === drc)!.ref.book).toBe('Ps');

    state.goForward();
    expect(state.activePanelId()).toBe(drc);
  });

  it('skips history entries whose panel was closed', () => {
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    const kjv = state.activePanelId()!;
    state.openModule(mod('DRC'), { book: 'Ps', chapter: 23, verse: 1 });
    const drc = state.activePanelId()!;
    state.navigateTo({ book: 'Ps', chapter: 24, verse: 1 });

    state.closePanel(kjv);
    expect(state.canGoBack()).toBe(true); // Ps 23 in DRC
    expect(state.goBack()).toEqual({ book: 'Ps', chapter: 23, verse: 1 });
    expect(state.activePanelId()).toBe(drc);
    expect(state.canGoBack()).toBe(false);
    expect(state.goBack()).toBeNull();
  });

  it('exposes the real, possibly sparse, verse numbers of the active chapter', () => {
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    const id = state.activePanelId()!;
    state.updatePanel(id, {
      chapter: {
        book: 'Gen', chapter: 1,
        verses: [1, 2, 4, 5].map(v => ({ verse: v })),
      } as never,
    });
    expect(state.activePanelVerseIds()).toEqual([1, 2, 4, 5]);
  });

  it('closeModulePanels closes all panels for a module and updates active panel', () => {
    // Open KJV and DRC
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    const kjvId = state.activePanelId()!;
    state.openModule(mod('DRC'), { book: 'Gen', chapter: 1, verse: 1 });
    const drcId = state.activePanelId()!;
    
    // Verify both are open
    expect(state.openPanels().length).toBe(2);
    expect(state.activePanelId()).toBe(drcId);

    // Close all KJV panels (while DRC is active)
    state.closeModulePanels('KJV');

    // Verify KJV is closed, DRC is still active
    expect(state.openPanels().length).toBe(1);
    expect(state.openPanels()[0].moduleId).toBe('DRC');
    expect(state.activePanelId()).toBe(drcId);
  });

  it('closeModulePanels switches to surviving panel if closing active module', () => {
    // Open KJV and DRC
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    const kjvId = state.activePanelId()!;
    state.openModule(mod('DRC'), { book: 'Gen', chapter: 1, verse: 1 });
    const drcId = state.activePanelId()!;

    // Switch back to KJV (make it active)
    state.activePanelId.set(kjvId);

    // Close KJV (which is active)
    state.closeModulePanels('KJV');

    // Verify DRC is now active
    expect(state.openPanels().length).toBe(1);
    expect(state.activePanelId()).toBe(drcId);
  });

  it('closeModulePanels clears active panel if closing the only open module', () => {
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });

    state.closeModulePanels('KJV');

    expect(state.openPanels().length).toBe(0);
    expect(state.activePanelId()).toBeNull();
  });

  it('closeModulePanels clears commentary if it was set to closed module', () => {
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    state.activeCommentaryModule.set('KJV');

    state.closeModulePanels('KJV');

    expect(state.activeCommentaryModule()).toBeNull();
  });

  it('closeModulePanels remaps history cursor when removing entry before cursor', () => {
    // Open modules and build history
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'Gen', chapter: 2, verse: 1 });
    
    state.openModule(mod('DRC'), { book: 'John', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'John', chapter: 2, verse: 1 });
    
    // History should have 4 entries: (KJV,Gen1:1), (KJV,Gen2:1), (DRC,John1:1), (DRC,John2:1)
    // Cursor at index 3 (last entry)
    expect(state['_historyPos']()).toBe(3);
    expect(state['_history']().length).toBe(4);
    
    // Close KJV (removes first 2 entries)
    state.closeModulePanels('KJV');
    
    // After removing 2 entries before cursor position 3:
    // Cursor should remap from 3 to 1 (3 - 2 = 1)
    expect(state['_history']().length).toBe(2);
    expect(state['_historyPos']()).toBe(1);
  });

  it('closeModulePanels remaps history cursor when removing entry at cursor', () => {
    // Open modules and build history
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'Gen', chapter: 2, verse: 1 });
    
    state.openModule(mod('DRC'), { book: 'John', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'John', chapter: 2, verse: 1 });
    
    // History: (KJV,Gen1:1), (KJV,Gen2:1), (DRC,John1:1), (DRC,John2:1)
    // Cursor at index 3
    expect(state['_historyPos']()).toBe(3);
    
    // Set cursor to point to a DRC entry (index 2)
    state['_historyPos'].set(2);
    
    // Close DRC (removes entries at index 2 and 3)
    state.closeModulePanels('DRC');
    
    // Cursor should remap to last remaining entry (index 1)
    expect(state['_history']().length).toBe(2);
    expect(state['_historyPos']()).toBe(1);
  });

  it('closeModulePanels remaps history cursor when removing entry after cursor', () => {
    // Open modules and build history
    state.openModule(mod('KJV'), { book: 'Gen', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'Gen', chapter: 2, verse: 1 });
    
    state.openModule(mod('DRC'), { book: 'John', chapter: 1, verse: 1 });
    state.navigateTo({ book: 'John', chapter: 2, verse: 1 });
    
    // Set cursor to index 1 (KJV,Gen2:1)
    state['_historyPos'].set(1);
    expect(state['_historyPos']()).toBe(1);
    
    // Close DRC (removes entries at index 2 and 3)
    state.closeModulePanels('DRC');
    
    // Cursor should stay at index 1 (still points to same entry)
    expect(state['_history']().length).toBe(2);
    expect(state['_historyPos']()).toBe(1);
  });

  it('closeModulePanels syncs statusRef to surviving active panel after active module removed', () => {
    state.openModule(mod('KJV'), { book: 'John', chapter: 1, verse: 1 });
    const kjvId = state.activePanelId()!;

    state.openModule(mod('DRC'), { book: 'Gen', chapter: 3, verse: 1 });
    const drcId = state.activePanelId()!;
    state.updatePanel(drcId, { ref: { book: 'Gen', chapter: 3, verse: 1 } });

    // Make KJV active with its own statusRef
    state.activePanelId.set(kjvId);
    state.statusRef.set({ book: 'John', chapter: 1, verse: 1 });

    state.closeModulePanels('KJV');

    // DRC should be the new active panel
    expect(state.activePanelId()).toBe(drcId);
    // statusRef must follow the surviving panel's reference, not the removed one
    expect(state.statusRef()).toEqual({ book: 'Gen', chapter: 3, verse: 1 });
  });

  it('closeModulePanels sets statusRef to null when no panels remain', () => {
    state.openModule(mod('KJV'), { book: 'John', chapter: 1, verse: 1 });
    state.statusRef.set({ book: 'John', chapter: 1, verse: 1 });

    state.closeModulePanels('KJV');

    expect(state.openPanels().length).toBe(0);
    expect(state.statusRef()).toBeNull();
  });
});

