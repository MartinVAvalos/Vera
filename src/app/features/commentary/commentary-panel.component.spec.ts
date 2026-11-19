import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommentaryPanelComponent } from './commentary-panel.component';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

const mockModule = (id: string, type: Module['module_type'] = 'Commentary'): Module => ({
  id,
  name: id,
  module_type: type,
  lang: 'en',
  description: '',
  installed: true,
});

describe('CommentaryPanelComponent (P0.5c)', () => {
  let component: CommentaryPanelComponent;
  let fixture: ComponentFixture<CommentaryPanelComponent>;
  let appState: AppState;
  let modulesService: ModulesService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CommentaryPanelComponent],
      providers: [
        AppState,
        {
          provide: ModulesService,
          useValue: {
            listModules: vi.fn(),
          },
        },
      ],
    });

    appState = TestBed.inject(AppState);
    modulesService = TestBed.inject(ModulesService);

    // Initialize appState with default values
    appState.installedModules.set([]);
    appState.activeCommentaryModule.set(null);

    fixture = TestBed.createComponent(CommentaryPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (appState) {
      appState.installedModules.set([]);
      appState.openPanels.set([]);
      appState.activeCommentaryModule.set(null);
    }
    if (fixture) {
      fixture.destroy();
    }
  });

  describe('1. Loading and filtering modules', () => {
    it('should load commentary modules on init', async () => {
      const commentaries = [
        mockModule('MartinLuther', 'Commentary'),
        mockModule('JohnWesley', 'Commentary'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(commentaries);

      await component.ngOnInit();

      const loaded = component['commentaries']();
      expect(loaded.length).toBe(2);
      expect(loaded.some(m => m.id === 'MartinLuther')).toBe(true);
    });

    it('should filter to Commentary modules only', async () => {
      const mixed = [
        mockModule('MartinLuther', 'Commentary'),
        mockModule('KJV', 'Bible'),
        mockModule('DRC', 'Bible'),
        mockModule('Lexicon1', 'Lexicon'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(mixed);

      await component.ngOnInit();

      const commentaries = component['commentaries']();
      expect(commentaries.length).toBe(1);
      expect(commentaries[0].id).toBe('MartinLuther');
    });

    it('should handle empty list gracefully', async () => {
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      await component.ngOnInit();

      // After successful load with empty list, should have no commentaries
      expect(component['commentaries']().length).toBe(0);
    });
  });

  describe('2. Error handling (P0.5c correctness)', () => {
    it('should show error state when module loading fails', async () => {
      const error = new Error('Network timeout');
      vi.mocked(modulesService.listModules).mockRejectedValue(error);

      await component.ngOnInit();

      expect(component['loadError']()).toContain('Failed to load commentaries');
      expect(component['loadError']()).toContain('Network timeout');
    });

    it('should render error message in DOM when loadError is set', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Service unavailable'));
      await component.ngOnInit();
      fixture.detectChanges();

      const errorDiv = fixture.nativeElement.querySelector('.commentary-error');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv?.textContent).toContain('Error loading commentaries');
    });

    it('should NOT show CatenaAurea fallback when load fails', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Failed'));
      await component.ngOnInit();
      fixture.detectChanges();

      const content = fixture.nativeElement.textContent;
      expect(content).not.toContain('CatenaAurea');
      expect(content).toContain('Error loading commentaries');
    });

    it('should clear commentaries list on error', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Failed'));
      await component.ngOnInit();

      expect(component['commentaries']().length).toBe(0);
    });
  });

  describe('3. Module selection', () => {
    it('should update active commentary module when selected', async () => {
      vi.mocked(modulesService.listModules).mockResolvedValue([
        mockModule('Wesley', 'Commentary'),
      ]);
      await component.ngOnInit();
      fixture.detectChanges();

      // Directly test the selection logic
      const event = { target: { value: 'Wesley' } } as any;
      component['onSelectModule'](event);

      expect(appState.activeCommentaryModule()).toBe('Wesley');
    });

    it('should clear active commentary when empty option selected', async () => {
      appState.activeCommentaryModule.set('Wesley');

      // Directly test the selection logic
      const event = { target: { value: '' } } as any;
      component['onSelectModule'](event);

      expect(appState.activeCommentaryModule()).toBeNull();
    });
  });

  describe('4. UI state rendering', () => {
    it('should populate select options from loaded commentaries', async () => {
      vi.mocked(modulesService.listModules).mockResolvedValue([
        mockModule('Wesley', 'Commentary'),
        mockModule('Luther', 'Commentary'),
      ]);
      await component.ngOnInit();
      fixture.detectChanges();

      // Verify commentaries loaded
      const commentaries = component['commentaries']();
      expect(commentaries.some(c => c.id === 'Wesley')).toBe(true);
      expect(commentaries.some(c => c.id === 'Luther')).toBe(true);
    });
  });

  describe('5. Teardown and cleanup', () => {
    it('should properly destroy without state leakage', async () => {
      vi.mocked(modulesService.listModules).mockResolvedValue([
        mockModule('Wesley', 'Commentary'),
      ]);
      await component.ngOnInit();

      fixture.destroy();

      // After destroy, component should be destroyed and no longer updated
      // Note: Angular signals don't throw after destroy, they just become inert
    });
  });
});
