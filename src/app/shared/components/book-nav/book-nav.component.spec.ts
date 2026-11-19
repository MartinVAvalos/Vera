import { TestBed } from '@angular/core/testing';
import { BookNavComponent } from './book-nav.component';
import { AppState } from '../../../core/state/app.state';
import { BibleService } from '../../../core/services';
import { Module } from '../../../core/models';

const kjv = { id: 'KJV', name: 'KJV', module_type: 'Bible', lang: 'en', description: '', installed: true } as Module;

describe('BookNavComponent', () => {
  async function setup(listBooks: () => Promise<unknown>) {
    await TestBed.configureTestingModule({
      imports: [BookNavComponent],
      providers: [{ provide: BibleService, useValue: { listBooks } }],
    }).compileComponents();
    const state = TestBed.inject(AppState);
    state.openModule(kjv, { book: 'Gen', chapter: 1, verse: 1 });
    const fixture = TestBed.createComponent(BookNavComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    return { state, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists the books reported by the module, not a built-in list', async () => {
    const { el } = await setup(async () => [{ id: 'Gen', name: 'Genesis', chapters: 50 }]);
    const opts = Array.from(el.querySelectorAll('.book-select option')).map(o => o.textContent!.trim());
    expect(opts).toEqual(['Genesis']);
  });

  it('shows an error and no invented books when listing fails', async () => {
    const { el } = await setup(async () => { throw new Error('module not found'); });
    expect(el.querySelectorAll('.book-select option')).toHaveLength(0);
    expect(el.querySelector('[role=alert]')!.textContent).toContain('module not found');
  });

  it('navigates the active panel when the user picks a chapter', async () => {
    const { state, fixture, el } = await setup(async () => [{ id: 'Gen', name: 'Genesis', chapters: 50 }]);
    const sel = el.querySelector<HTMLSelectElement>('.ch-select')!;
    sel.selectedIndex = 2; // chapter 3
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(state.activePanel()!.ref).toEqual({ book: 'Gen', chapter: 3, verse: 1 });
  });

  it('builds the verse dropdown from actual verse numbers', async () => {
    const { state, fixture, el } = await setup(async () => [{ id: 'Gen', name: 'Genesis', chapters: 50 }]);
    state.updatePanel(state.activePanelId()!, {
      chapter: { book: 'Gen', chapter: 1, verses: [1, 2, 4, 5].map(v => ({ verse: v })) } as never,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const opts = Array.from(el.querySelectorAll('.v-select option')).map(o => o.textContent!.trim());
    expect(opts).toEqual(['1', '2', '4', '5']);
  });
});
