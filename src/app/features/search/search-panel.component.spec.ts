import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchPanelComponent } from './search-panel.component';
import { AppState } from '../../core/state/app.state';
import { BibleService } from '../../core/services';
import { SearchResult } from '../../core/models';

const mockSearchResult = (
  snippet: string,
  reference: string,
  module_id: string = 'KJV'
): SearchResult => {
  // Parse reference string "John 1:1" or "1 John 4:8" into book/chapter/verse
  // Split on the last space (chapter:verse pattern is always at the end)
  const trimmed = reference.trim();
  const lastSpaceIndex = trimmed.lastIndexOf(' ');
  
  if (lastSpaceIndex === -1) {
    throw new Error(`Invalid reference format: "${reference}". Expected format: "Book Chapter:Verse" or "Number Book Chapter:Verse"`);
  }
  
  const book = trimmed.substring(0, lastSpaceIndex);
  const chapterVerse = trimmed.substring(lastSpaceIndex + 1).split(':');
  const chapter = parseInt(chapterVerse[0], 10);
  const verse = parseInt(chapterVerse[1], 10);

  if (isNaN(chapter) || isNaN(verse)) {
    throw new Error(`Invalid chapter:verse format in reference: "${reference}"`);
  }

  return {
    snippet,
    reference: { book, chapter, verse },
    module_id,
    score: 0.95,
  };
};

describe('SearchPanelComponent (P0.5c)', () => {
  let component: SearchPanelComponent;
  let fixture: ComponentFixture<SearchPanelComponent>;
  let appState: AppState;
  let bibleService: BibleService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SearchPanelComponent, FormsModule],
      providers: [
        AppState,
        {
          provide: BibleService,
          useValue: {
            searchText: vi.fn(),
          },
        },
      ],
    });

    appState = TestBed.inject(AppState);
    bibleService = TestBed.inject(BibleService);

    // Initialize appState with default values
    appState.installedModules.set([]);
    appState.openPanels.set([]);
    appState.activePanelId.set(null);

    fixture = TestBed.createComponent(SearchPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (appState) {
      appState.installedModules.set([]);
      appState.openPanels.set([]);
      appState.activePanelId.set(null);
    }
    if (fixture) {
      fixture.destroy();
    }
  });

  describe('0. Test factory (mockSearchResult)', () => {
    it('should parse single-word book names correctly', () => {
      const result = mockSearchResult('Love is patient', 'John 1:1');
      expect(result.reference.book).toBe('John');
      expect(result.reference.chapter).toBe(1);
      expect(result.reference.verse).toBe(1);
    });

    it('should parse numbered book names correctly', () => {
      const result = mockSearchResult('Love never fails', '1 John 4:8');
      expect(result.reference.book).toBe('1 John');
      expect(result.reference.chapter).toBe(4);
      expect(result.reference.verse).toBe(8);
    });

    it('should parse multi-word book names correctly', () => {
      const result = mockSearchResult('In the beginning', '1 Corinthians 15:57');
      expect(result.reference.book).toBe('1 Corinthians');
      expect(result.reference.chapter).toBe(15);
      expect(result.reference.verse).toBe(57);
    });
  });

  describe('1. Search execution', () => {
    it('should execute search with query text', async () => {
      vi.mocked(bibleService.searchText).mockResolvedValue([]);
      component['query'] = 'love';

      await component.doSearch();

      expect(bibleService.searchText).toHaveBeenCalledWith('love', 50);
    });

    it('should not search if query is empty or whitespace', async () => {
      component['query'] = '   ';

      await component.doSearch();

      expect(bibleService.searchText).not.toHaveBeenCalled();
    });

    it('should populate results on successful search', async () => {
      const results = [
        mockSearchResult('Love is patient', 'John 1:1', 'KJV'),
        mockSearchResult('La charité est patiente', 'John 1:1', 'DRC'),
      ];
      vi.mocked(bibleService.searchText).mockResolvedValue(results);
      component['query'] = 'love';

      await component.doSearch();

      expect(component['results']().length).toBe(2);
      expect(component['results']()[0].snippet).toContain('Love');
    });
  });

  describe('2. Error vs empty search distinction (P0.5c correctness)', () => {
    it('should distinguish between error and zero results', async () => {
      vi.mocked(bibleService.searchText).mockResolvedValue([]);
      component['query'] = 'nonexistent';

      await component.doSearch();

      expect(component['searchError']()).toBe('');
      expect(component['results']().length).toBe(0);
      expect(component['searched']()).toBe(true);
    });

    it('should show error message when search fails', async () => {
      const error = new Error('Search service timeout');
      vi.mocked(bibleService.searchText).mockRejectedValue(error);
      component['query'] = 'test';

      await component.doSearch();

      expect(component['searchError']()).toContain('Search failed');
      expect(component['searchError']()).toContain('timeout');
      expect(component['results']().length).toBe(0);
    });

    it('should render error text in DOM when search fails', async () => {
      vi.mocked(bibleService.searchText).mockRejectedValue(new Error('Network error'));
      component['query'] = 'test';
      await component.doSearch();
      fixture.detectChanges();

      const errorElement = fixture.nativeElement.querySelector('.error-text');
      expect(errorElement).toBeTruthy();
      expect(errorElement?.textContent).toContain('Search failed');
    });

    it('should render "No results found" message for empty search, not error', async () => {
      vi.mocked(bibleService.searchText).mockResolvedValue([]);
      component['query'] = 'nonexistent';
      await component.doSearch();
      fixture.detectChanges();

      const errorElement = fixture.nativeElement.querySelector('.error-text');
      expect(errorElement).toBeFalsy();

      const emptyMessage = fixture.nativeElement.textContent;
      expect(emptyMessage).toContain('No results found');
    });

    it('should clear error state on new search', async () => {
      vi.mocked(bibleService.searchText)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce([mockSearchResult('Found', 'John 1:1')]);

      component['query'] = 'test';
      await component.doSearch();
      expect(component['searchError']()).toBeTruthy();

      component['query'] = 'different';
      await component.doSearch();
      expect(component['searchError']()).toBe('');
      expect(component['results']().length).toBe(1);
    });
  });

  describe('3. Module identity preservation (P0.5c correctness)', () => {
    it('should preserve module_id throughout result navigation', async () => {
      appState.installedModules.set([
        { id: 'KJV', name: 'KJV', module_type: 'Bible', lang: 'en', description: '', installed: true },
        { id: 'DRC', name: 'DRC', module_type: 'Bible', lang: 'en', description: '', installed: true },
      ]);

      const results = [
        mockSearchResult('Love is patient', 'John 1:1', 'DRC'),
      ];
      vi.mocked(bibleService.searchText).mockResolvedValue(results);
      component['query'] = 'love';
      await component.doSearch();

      const result = component['results']()[0];
      expect(result.module_id).toBe('DRC');

      // Jump to result should navigate to DRC module
      component.jump(result);

      // Verify DRC module is now open
      const drcPanel = appState.openPanels().find(p => p.moduleId === 'DRC');
      expect(drcPanel?.moduleId).toBe('DRC');
    });

    it('should navigate to existing panel if module already open', async () => {
      appState.openModule(
        { id: 'KJV', name: 'KJV', module_type: 'Bible', lang: 'en', description: '', installed: true },
        { book: 'Matthew', chapter: 5, verse: 3 }
      );

      const result = mockSearchResult('Love is patient', 'John 1:1', 'KJV');
      component.jump(result);

      expect(appState.activePanelId()).toBeTruthy();
    });

    it('should open new panel for unopen module', async () => {
      appState.installedModules.set([
        { id: 'DRC', name: 'DRC', module_type: 'Bible', lang: 'en', description: '', installed: true },
      ]);

      const result = mockSearchResult('Love is patient', 'John 1:1', 'DRC');
      component.jump(result);

      const panel = appState.openPanels().find(p => p.moduleId === 'DRC');
      expect(panel).toBeTruthy();
    });

    it('should not navigate if module not installed', async () => {
      appState.installedModules.set([]);

      const result = mockSearchResult('Love is patient', 'John 1:1', 'UnknownModule');
      component.jump(result);

      const panel = appState.openPanels().find(p => p.moduleId === 'UnknownModule');
      expect(panel).toBeFalsy();
    });
  });

  describe('4. UI state management', () => {
    it('should disable search button while searching', async () => {
      vi.mocked(bibleService.searchText).mockImplementation(() => new Promise(() => {}));
      component['query'] = 'test';
      component.doSearch();
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('should show searching message while query is in flight', async () => {
      vi.mocked(bibleService.searchText).mockImplementation(() => new Promise(() => {}));
      component['query'] = 'test';
      component.doSearch();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Searching');
    });

    it('should render search results as list', async () => {
      const results = [
        mockSearchResult('Love is patient', 'John 1:1', 'KJV'),
        mockSearchResult('Love never fails', 'John 1:2', 'KJV'),
      ];
      vi.mocked(bibleService.searchText).mockResolvedValue(results);
      component['query'] = 'love';
      await component.doSearch();
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.result-item');
      expect(items.length).toBe(2);
    });

    it('should mark results with module tag', async () => {
      const results = [
        mockSearchResult('Love is patient', 'John 1:1', 'DRC'),
      ];
      vi.mocked(bibleService.searchText).mockResolvedValue(results);
      component['query'] = 'love';
      await component.doSearch();
      fixture.detectChanges();

      const moduleTag = fixture.nativeElement.querySelector('.module-tag');
      expect(moduleTag?.textContent).toContain('DRC');
    });
  });

  describe('5. Teardown and cleanup', () => {
    it('should properly destroy without state leakage', async () => {
      vi.mocked(bibleService.searchText).mockResolvedValue([
        mockSearchResult('Love', 'John 1:1'),
      ]);
      component['query'] = 'test';
      await component.doSearch();

      fixture.destroy();

      // After destroy, component should be destroyed and no longer updated
      // Note: Angular signals don't throw after destroy, they just become inert
    });
  });
});
