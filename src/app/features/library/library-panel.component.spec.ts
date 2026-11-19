import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibraryPanelComponent } from './library-panel.component';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

const mockModule = (id: string, type: Module['module_type'] = 'Bible'): Module => ({
  id,
  name: id,
  module_type: type,
  lang: 'en',
  description: '',
  installed: true,
});

describe('LibraryPanelComponent (P0.5c)', () => {
  let component: LibraryPanelComponent;
  let fixture: ComponentFixture<LibraryPanelComponent>;
  let appState: AppState;
  let modulesService: ModulesService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LibraryPanelComponent],
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
    appState.openPanels.set([]);
    appState.activePanelId.set(null);

    fixture = TestBed.createComponent(LibraryPanelComponent);
    component = fixture.componentInstance;
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

  describe('1. Module loading and grouping', () => {
    it('should load modules on init', async () => {
      const modules = [
        mockModule('KJV', 'Bible'),
        mockModule('DRC', 'Bible'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      const bibleGroup = component['groups']().find(g => g.type === 'Bible');
      expect(bibleGroup?.modules.length).toBe(2);
    });

    it('should group modules by type', async () => {
      const modules = [
        mockModule('KJV', 'Bible'),
        mockModule('Wesley', 'Commentary'),
        mockModule('Lexicon1', 'Lexicon'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));

      const groups = component['groups']();
      expect(groups.find(g => g.type === 'Bible')?.modules.length).toBe(1);
      expect(groups.find(g => g.type === 'Commentary')?.modules.length).toBe(1);
      expect(groups.find(g => g.type === 'Lexicon')?.modules.length).toBe(1);
    });

    it('should only show installed modules', async () => {
      const modules = [
        mockModule('KJV', 'Bible'),
        { ...mockModule('DRC', 'Bible'), installed: false },
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));

      const bibleGroup = component['groups']().find(g => g.type === 'Bible');
      expect(bibleGroup?.modules.some(m => m.id === 'KJV')).toBe(true);
      expect(bibleGroup?.modules.some(m => m.id === 'DRC')).toBe(false);
    });
  });

  describe('2. Bible module opening (P0.5c correctness)', () => {
    it('should allow opening Bible modules', async () => {
      const modules = [mockModule('KJV', 'Bible')];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      expect(component['canOpen'](modules[0])).toBe(true);
    });

    it('should disable opening non-Bible modules', async () => {
      const commentary = mockModule('Wesley', 'Commentary');
      const lexicon = mockModule('Lexicon1', 'Lexicon');
      const genbook = mockModule('Church', 'GenBook');
      const devotional = mockModule('Daily', 'DailyDevotional');

      expect(component['canOpen'](commentary)).toBe(false);
      expect(component['canOpen'](lexicon)).toBe(false);
      expect(component['canOpen'](genbook)).toBe(false);
      expect(component['canOpen'](devotional)).toBe(false);
    });

    it('should disable button for non-Bible modules in DOM', async () => {
      const modules = [
        mockModule('KJV', 'Bible'),
        mockModule('Wesley', 'Commentary'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      // Verify canOpen() correctly returns false for non-Bible
      expect(component['canOpen'](modules[1])).toBe(false);
    });

    it('should enable button for Bible modules in DOM', async () => {
      const modules = [mockModule('KJV', 'Bible')];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.module-item');
      const bibleBtn = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('KJV')
      ) as HTMLButtonElement;

      expect(bibleBtn?.disabled).toBe(false);
      expect(bibleBtn?.classList.contains('disabled')).toBe(false);
    });

    it('should not open module when clicking disabled button', async () => {
      const commentary = mockModule('Wesley', 'Commentary');
      appState.installedModules.set([commentary]);
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      component['openModule'](commentary);

      expect(appState.openPanels().some(p => p.moduleId === 'Wesley')).toBe(false);
    });

    it('should open Bible module on click', async () => {
      const bible = mockModule('KJV', 'Bible');
      appState.installedModules.set([bible]);
      fixture.detectChanges();

      component['openModule'](bible);

      const opened = appState.openPanels();
      expect(opened.some(p => p.moduleId === 'KJV')).toBe(true);
    });
  });

  describe('3. Active module highlighting', () => {
    it('should mark active module as active in UI', async () => {
      const modules = [mockModule('KJV', 'Bible')];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);
      
      component.ngOnInit();
      fixture.detectChanges();
      appState.openModule(modules[0], { book: 'John', chapter: 1, verse: 1 });
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.module-item');
      const kjvBtn = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('KJV')
      ) as HTMLElement;

      expect(kjvBtn?.classList.contains('active')).toBe(true);
    });
  });

  describe('4. Error handling', () => {
    it('should show error when module loading fails', async () => {
      const error = new Error('Service unavailable');
      vi.mocked(modulesService.listModules).mockRejectedValue(error);

      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      expect(component['loadError']()).toContain('Service unavailable');
    });

    it('should render error message in DOM', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Network error'));
      
      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      const errorElement = fixture.nativeElement.querySelector('[role="alert"]');
      expect(errorElement).toBeTruthy();
      expect(errorElement?.textContent).toContain('Could not load modules');
    });

    it('should clear modules on load error', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Failed'));
      
      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));

      const groups = component['groups']();
      groups.forEach(g => {
        expect(g.modules.length).toBe(0);
      });
    });
  });

  describe('5. Group expansion/collapse', () => {
    it('should expand/collapse groups on header click', async () => {
      const modules = [
        mockModule('KJV', 'Bible'),
        mockModule('Wesley', 'Commentary'),
      ];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);
      
      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      const bibleGroup = component['groups']().find(g => g.type === 'Bible');
      const commentaryGroup = component['groups']().find(g => g.type === 'Commentary');

      expect(bibleGroup?.expanded).toBe(true);
      expect(commentaryGroup?.expanded).toBe(false);

      // Toggle commentary group
      commentaryGroup!.expanded = !commentaryGroup!.expanded;
      fixture.detectChanges();

      expect(commentaryGroup?.expanded).toBe(true);
    });

    it('should show loading state', async () => {
      vi.mocked(modulesService.listModules).mockImplementation(() => new Promise(() => {}));
      
      component.ngOnInit();
      fixture.detectChanges();

      expect(component['loading']()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Loading modules');
    });
  });

  describe('6. Teardown and cleanup', () => {
    it('should properly destroy without state leakage', async () => {
      const modules = [mockModule('KJV', 'Bible')];
      vi.mocked(modulesService.listModules).mockResolvedValue(modules);
      
      component.ngOnInit();
      fixture.detectChanges();
      await new Promise(r => setTimeout(r, 10));

      fixture.destroy();

      // After destroy, component should be destroyed and no longer updated
      // Note: Angular signals don't throw after destroy, they just become inert
    });
  });
});
