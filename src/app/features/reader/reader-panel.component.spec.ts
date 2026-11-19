import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ReaderPanelComponent } from './reader-panel.component';
import { AppState, OpenPanel } from '../../core/state/app.state';
import { BibleService } from '../../core/services';
import { Chapter } from '../../core/models';

interface Deferred {
  key: string;
  resolve: (c: Chapter) => void;
  reject: (e: unknown) => void;
}

function chapterOf(book: string, chapter: number, text: string): Chapter {
  return {
    module_id: 'kjv',
    book,
    chapter,
    verses: [
      { module_id: 'kjv', translation: 'KJV', book, chapter, verse: 1, text },
      { module_id: 'kjv', translation: 'KJV', book, chapter, verse: 2, text: text + ' two' },
    ],
  } as unknown as Chapter;
}

function panelOf(book: string, chapter: number, extra: Partial<OpenPanel> = {}): OpenPanel {
  return {
    id: 'p1',
    moduleId: 'kjv',
    moduleName: 'KJV',
    ref: { book, chapter, verse: 0 },
    chapter: null,
    loading: false,
    ...extra,
  };
}

describe('ReaderPanelComponent request lifecycle', () => {
  let calls: Deferred[];
  let state: AppState;
  let fixture: ComponentFixture<ReaderPanelComponent>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** Mirrors the reader area: the input always reflects the panel held in AppState. */
  async function sync(): Promise<void> {
    await new Promise(r => setTimeout(r)); // let pending promise continuations run
    fixture.componentRef.setInput('panel', state.openPanels()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function navigate(book: string, chapter: number): Promise<void> {
    state.updatePanel('p1', { ref: { book, chapter, verse: 0 } });
    await sync();
  }

  beforeEach(async () => {
    calls = [];
    await TestBed.configureTestingModule({
      imports: [ReaderPanelComponent],
      providers: [{
        provide: BibleService,
        useValue: {
          getChapter: (moduleId: string, book: string, chapter: number) =>
            new Promise<Chapter>((resolve, reject) =>
              calls.push({ key: `${moduleId}|${book}|${chapter}`, resolve, reject })),
        },
      }],
    }).compileComponents();

    state = TestBed.inject(AppState);
    state.openPanels.set([panelOf('Gen', 1)]);
    state.activePanelId.set('p1');
    fixture = TestBed.createComponent(ReaderPanelComponent);
    fixture.componentRef.setInput('panel', state.openPanels()[0]);
    await sync();
  });

  it('issues exactly one request when the panel opens', () => {
    expect(calls.map(c => c.key)).toEqual(['kjv|Gen|1']);
  });

  it('does not re-request on chapter payload, loading or verse selection writes', async () => {
    calls[0].resolve(chapterOf('Gen', 1, 'In the beginning'));
    await sync();
    expect(text()).toContain('In the beginning');

    state.updatePanel('p1', { loading: true });
    await sync();
    state.statusRef.set({ book: 'Gen', chapter: 1, verse: 2 });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.verse')!.click();
    await sync();

    expect(calls).toHaveLength(1);
  });

  it('shows only the latest navigation when responses arrive out of order', async () => {
    await navigate('Gen', 2);
    expect(calls.map(c => c.key)).toEqual(['kjv|Gen|1', 'kjv|Gen|2']);

    calls[1].resolve(chapterOf('Gen', 2, 'Second chapter'));
    await sync();
    calls[0].resolve(chapterOf('Gen', 1, 'First chapter'));
    await sync();

    expect(text()).toContain('Second chapter');
    expect(text()).not.toContain('First chapter');
    expect(state.openPanels()[0].chapter?.chapter).toBe(2);
  });

  it('clears the previous chapter and shows the error when a request fails', async () => {
    calls[0].resolve(chapterOf('Gen', 1, 'Old text'));
    await sync();
    expect(text()).toContain('Old text');

    await navigate('Gen', 99);
    calls[1].reject(new Error('chapter not found'));
    await sync();

    expect(state.openPanels()[0].chapter).toBeNull();
    expect(text()).toContain('chapter not found');
    expect(text()).not.toContain('Old text');
  });

  it('ignores a stale failure that arrives after a newer success', async () => {
    await navigate('Gen', 2);
    calls[1].resolve(chapterOf('Gen', 2, 'Good text'));
    await sync();
    calls[0].reject(new Error('late failure'));
    await sync();

    expect(text()).toContain('Good text');
    expect(text()).not.toContain('late failure');
  });

  it('does not resurrect a panel that was closed while a request was in flight', async () => {
    state.closePanel('p1');
    calls[0].resolve(chapterOf('Gen', 1, 'Zombie'));
    await fixture.whenStable();

    expect(state.openPanels()).toHaveLength(0);
  });
});
