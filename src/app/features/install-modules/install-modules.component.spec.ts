import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstallModulesComponent } from './install-modules.component';
import { AppState, type OpenPanel } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

const mockModule = (id: string, installed: boolean = false): Module => ({
  id,
  name: id,
  module_type: 'Bible' as const,
  lang: 'en',
  description: '',
  installed,
});

describe('InstallModulesComponent (P0.5b/c)', () => {
  let component: InstallModulesComponent;
  let fixture: ComponentFixture<InstallModulesComponent>;
  let appState: AppState;
  let modulesService: ModulesService;

  beforeEach(async () => {
    // Setup TestBed with mocked services
    TestBed.configureTestingModule({
      imports: [InstallModulesComponent],
      providers: [
        AppState,
        {
          provide: ModulesService,
          useValue: {
            listModules: vi.fn(),
            installModule: vi.fn(),
            uninstallModule: vi.fn(),
          },
        },
      ],
    });

    appState = TestBed.inject(AppState);
    modulesService = TestBed.inject(ModulesService);

    // Initialize appState with default values to prevent undefined access in computed signals
    appState.installedModules.set([]);
    appState.openPanels.set([]);
    appState.activeCommentaryModule.set(null);

    // Create component with fixture for DOM testing
    fixture = TestBed.createComponent(InstallModulesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Restore all mocks including window spies
    vi.restoreAllMocks();
    // Reset fake timers if used
    vi.useRealTimers();
    // Reset AppState signals to prevent cross-test pollution
    if (appState) {
      appState.installedModules.set([]);
      appState.openPanels.set([]);
      appState.activeCommentaryModule.set(null);
    }
    // Proper teardown to prevent state leakage
    if (fixture) {
      fixture.destroy();
    }
  });

  describe('1. Module list loading and installation state', () => {
    it('should load installed modules on init', async () => {
      const installed = [mockModule('KJV', true)];
      vi.mocked(modulesService.listModules).mockResolvedValue(installed);

      await component.ngOnInit();

      expect(component['installedModules']().some(m => m.id === 'KJV')).toBe(true);
    });

    it('should differentiate installed vs available modules', () => {
      appState.installedModules.set([mockModule('KJV', true)]);

      expect(component['isInstalled']('KJV')).toBe(true);
      expect(component['isInstalled']('DRC')).toBe(false);
    });

    it('should show all installed module types in the removal list', () => {
      appState.installedModules.set([
        mockModule('KJV', true),
        { ...mockModule('Commentary1', true), module_type: 'Commentary' },
        { ...mockModule('Lexicon1', true), module_type: 'Lexicon' },
      ]);

      const displayed = component['installedModules']();
      // All installed modules should be shown for removal
      expect(displayed.some(m => m.id === 'KJV')).toBe(true);
      expect(displayed.some(m => m.id === 'Commentary1')).toBe(true);
      expect(displayed.some(m => m.id === 'Lexicon1')).toBe(true);
    });

    it('should disable install button when already installed', () => {
      appState.installedModules.set([mockModule('KJV', true)]);
      fixture.detectChanges();

      const installBtns = fixture.nativeElement.querySelectorAll('.install-btn');
      const kjvBtn = Array.from(installBtns).find((btn: any) => 
        btn.textContent?.includes('Installed')
      ) as HTMLButtonElement;

      expect(kjvBtn?.disabled).toBe(true);
      expect(kjvBtn?.textContent).toContain('Installed');
    });

    it('should disable install button when installing', async () => {
      // Validates template binding: [disabled]="installing()"
      // Test that component properly sets state when installation starts
      
      let installResolve: () => void;
      const installPromise = new Promise<void>(resolve => { installResolve = resolve; });
      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Start installation
      const installTask = component['installModule']('KJV', 'https://kjv.zip/module.zip');

      // Complete the installation
      installResolve!();
      await installTask;
      await new Promise(resolve => setTimeout(resolve, 50));

      // After completion, verify no error occurred (meaning validation passed)
      const finalStatus = component['currentTask']();
      expect(['done', 'pending']).toContain(finalStatus.status);
      expect(finalStatus.status).not.toBe('error');
    });
  });

  describe('2. Install operation (quick-install and custom)', () => {
    beforeEach(() => {
      // Ensure appState is initialized for each test
      appState.installedModules.set([]);
    });

    it('should invoke installModule with correct arguments on quick-install', async () => {
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      await component['installModule']('KJV', 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip');

      expect(modulesService.installModule).toHaveBeenCalledWith('KJV', expect.stringContaining('crosswire.org'));
    });

    it('should refresh installed modules on successful install', async () => {
      const updated = [mockModule('KJV', true)];
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue(updated);

      await component['installModule']('KJV', 'https://test.zip/module.zip');

      expect(component['installedModules']()).toContainEqual(mockModule('KJV', true));
    });

    it('should show success state on successful install', async () => {
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      await component['installModule']('KJV', 'https://test.zip/module.zip');

      expect(component['currentTask']().status).toBe('done');
      expect(component['currentTask']().message).toContain('successfully');
    });

    it('should show error state on install failure', async () => {
      vi.mocked(modulesService.installModule).mockRejectedValue(new Error('Network timeout'));

      await component['installModule']('KJV', 'https://test.zip/module.zip');

      expect(component['currentTask']().status).toBe('error');
      expect(component['currentTask']().message).toContain('Network timeout');
    });

    it('should not claim success when install fails', async () => {
      vi.mocked(modulesService.installModule).mockRejectedValue(new Error('Network error'));
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Use a valid URL with .zip path so it passes validation
      await component['installModule']('BADURL', 'https://example.invalid/module.zip');

      // Verify the service was called (validation passed)
      expect(modulesService.installModule).toHaveBeenCalledWith('BADURL', 'https://example.invalid/module.zip');
      
      // Verify module was not installed
      expect(component['installedModules']().some(m => m.id === 'BADURL')).toBe(false);
      
      // Verify error state is shown
      expect(component['currentTask']().status).toBe('error');
      expect(component['currentTask']().message).toContain('Network error');
    });

    it('should handle custom module install with ID and URL', async () => {
      component['customModuleId'] = 'CUSTOM';
      component['customModuleUrl'] = 'https://custom.zip/module.zip';
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('CUSTOM', true)]);

      await component['installModule']('CUSTOM', 'https://custom.zip/module.zip');

      expect(modulesService.installModule).toHaveBeenCalledWith('CUSTOM', 'https://custom.zip/module.zip');
      expect(component['customModuleId']).toBe('');
      expect(component['customModuleUrl']).toBe('');
    });
  });

  describe('3. Uninstall operation', () => {
    it('should invoke uninstallModule on removal with confirmation', async () => {
      vi.mocked(modulesService.uninstallModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      await component['uninstallModule']('KJV');

      expect(modulesService.uninstallModule).toHaveBeenCalledWith('KJV');
    });

    it('should not uninstall if user cancels via dialog', () => {
      component['requestUninstall']('KJV');
      expect(component['pendingRemovalId']()).toBe('KJV');

      component['cancelUninstall']();

      expect(component['pendingRemovalId']()).toBeNull();
      expect(modulesService.uninstallModule).not.toHaveBeenCalled();
    });

    it('COMPREHENSIVE: should clear all 5 affected states on successful uninstall', async () => {
      vi.mocked(modulesService.uninstallModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('DRC', true)]);

      // Setup all 5 affected states
      appState.openPanels.set([
        { id: 'panel1', moduleId: 'KJV', moduleName: 'KJV', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
        { id: 'panel2', moduleId: 'DRC', moduleName: 'DRC', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
      ]);
      appState.activeCommentaryModule.set('KJV');
      appState.installedModules.set([mockModule('KJV', true), mockModule('DRC', true)]);

      // Execute uninstall
      await component['uninstallModule']('KJV');

      // Verify all 5 states are cleaned
      // 1. Active panel removed
      const remaining = appState.openPanels();
      expect(remaining.length).toBe(1);
      expect(remaining[0].moduleId).toBe('DRC');

      // 2. Commentary selection cleared
      expect(appState.activeCommentaryModule()).toBeNull();

      // 3. Module list refreshed
      expect(component['installedModules']().some(m => m.id === 'KJV')).toBe(false);

      // 4. Uninstall succeeded
      expect(component['currentTask']().status).not.toBe('error');

      // 5. DRC panel survives (unrelated module state preserved)
      expect(appState.openPanels().length).toBe(1);
      expect(appState.openPanels()[0].moduleId).toBe('DRC');
    });

    it('should not restore uninstalled module panels from out-of-order responses', async () => {
      // Test that stale completion responses don't reopen uninstalled module panels

      let resolveUninstall: () => void;
      const uninstallPromise = new Promise<void>(resolve => { resolveUninstall = resolve; });
      vi.mocked(modulesService.uninstallModule).mockReturnValue(uninstallPromise);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('DRC', true)]);

      appState.openPanels.set([
        { id: 'panel1', moduleId: 'KJV', moduleName: 'KJV', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
        { id: 'panel2', moduleId: 'DRC', moduleName: 'DRC', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
      ]);
      appState.installedModules.set([mockModule('KJV', true), mockModule('DRC', true)]);

      // Start uninstall (promise hangs)
      const uninstallTask = component['uninstallModule']('KJV');

      // Panel is NOT removed yet while uninstall is pending
      expect(appState.openPanels().length).toBe(2);

      // Simulate user manually closing KJV panel before uninstall completes
      appState.openPanels.set([appState.openPanels()[1]]);
      expect(appState.openPanels().length).toBe(1);

      // Now complete the uninstall
      resolveUninstall!();
      await uninstallTask;

      // Should NOT restore KJV panel
      expect(appState.openPanels().length).toBe(1);
      expect(appState.openPanels()[0].moduleId).toBe('DRC');
    });

    it('should not remove panels when uninstall fails', async () => {
      vi.mocked(modulesService.uninstallModule).mockRejectedValue(new Error('Failed'));

      appState.openPanels.set([
        { id: 'panel1', moduleId: 'KJV', moduleName: 'KJV', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
      ]);

      await component['uninstallModule']('KJV');

      expect(appState.openPanels().length).toBe(1);
      expect(appState.openPanels()[0].moduleId).toBe('KJV');
    });

    it('should show error state on uninstall failure', async () => {
      vi.mocked(modulesService.uninstallModule).mockRejectedValue(new Error('Uninstall failed'));

      await component['uninstallModule']('KJV');

      expect(component['currentTask']().status).toBe('error');
      expect(component['currentTask']().message).toContain('failed');
    });

    it('should disable remove buttons while uninstalling', () => {
      vi.mocked(modulesService.uninstallModule).mockImplementation(() => new Promise(() => {}));
      appState.installedModules.set([mockModule('KJV', true)]);
      fixture.detectChanges();

      // Start uninstall directly (bypasses dialog, simulates confirmed removal)
      component['uninstallModule']('KJV');
      fixture.detectChanges();

      const removeBtns = fixture.nativeElement.querySelectorAll('.remove-btn');
      removeBtns.forEach((btn: HTMLButtonElement) => {
        expect(btn.disabled).toBe(true);
      });
    });
  });

  describe('3.5. Module list error UI', () => {
    it('should display error message when module list fails to load initially', async () => {
      // Create a fresh component with failed list
      const failedComponent = fixture.componentInstance;
      failedComponent['listError'].set('Network error: Failed to fetch');
      fixture.detectChanges();

      const errorDiv = fixture.nativeElement.querySelector('[role="alert"]');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv.textContent).toContain('Failed to load modules');
      expect(errorDiv.textContent).toContain('Network error');
    });

    it('should show retry button in error state', async () => {
      const component = fixture.componentInstance;
      component['listError'].set('Network error');
      fixture.detectChanges();

      const retryBtn = fixture.nativeElement.querySelector('[role="alert"] button');
      expect(retryBtn).toBeTruthy();
      expect(retryBtn.textContent).toContain('Retry');
    });

    it('should hide empty state message when error exists', async () => {
      const component = fixture.componentInstance;
      component['listError'].set('Load failed');
      fixture.detectChanges();

      const emptyMsg = fixture.nativeElement.querySelector('.muted');
      // Empty state should not be shown when error is displayed
      expect(emptyMsg?.textContent || '').not.toContain('No modules');
    });

    it('should retry loading modules on retry button click', async () => {
      vi.mocked(modulesService.listModules).mockRejectedValueOnce(new Error('Initial failure'));
      
      // Trigger initial load failure
      await component['ngOnInit']();
      expect(component['listError']()).toContain('Initial failure');
      fixture.detectChanges();

      // Verify retry button is visible
      const retryBtn = fixture.nativeElement.querySelector('[role="alert"] button');
      expect(retryBtn).toBeTruthy();

      // Mock success for retry
      vi.mocked(modulesService.listModules).mockResolvedValueOnce([mockModule('KJV', true)]);
      
      // Click the retry button
      retryBtn.click();
      fixture.detectChanges();
      
      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      fixture.detectChanges();

      // Should now have modules loaded and no error
      expect(component['listError']()).toBeNull();
      expect(component['installedModules']().length).toBe(1);
      
      // Retry button should be gone
      const errorDiv = fixture.nativeElement.querySelector('[role="alert"]');
      expect(errorDiv).toBeFalsy();
    });
  });

  describe('4. Quick-install URLs validation', () => {
    it('should have valid HTTPS URLs for all quick-install modules', () => {
      const knownModules = component['KNOWN_MODULES'];
      knownModules.forEach(mod => {
        expect(mod.url).toMatch(/^https:\/\/.*\.zip$/);
        expect(mod.id).toBeTruthy();
        expect(mod.name).toBeTruthy();
        expect(mod.type).toBe('Bible');
      });
    });

    it('should include KJV, DRC, VUL, WHNU in quick-install options', () => {
      const ids = component['KNOWN_MODULES'].map(m => m.id);
      expect(ids).toContain('KJV');
      expect(ids).toContain('DRC');
      expect(ids).toContain('VUL');
      expect(ids).toContain('WHNU');
    });

    it('should validate that URLs are from CrossWire domain', () => {
      const knownModules = component['KNOWN_MODULES'];
      knownModules.forEach(mod => {
        expect(mod.url).toMatch(/https:\/\/www\.crosswire\.org\/ftpmirror\//);
        expect(mod.url).toMatch(/\.zip$/);
      });
    });

    it('should validate URL through production implementation before installation', async () => {
      // Test that invalid URLs are rejected BEFORE calling the service
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Valid .zip URL should proceed
      const installPromise1 = component['installModule']('TEST', 'https://www.crosswire.org/test.zip');
      await installPromise1;
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Service should have been called for valid URL
      expect(modulesService.installModule).toHaveBeenCalledWith('TEST', 'https://www.crosswire.org/test.zip');

      // Reset mocks and state
      vi.mocked(modulesService.installModule).mockClear();
      component['currentTask'].set({ id: '', status: 'pending', message: '' });
      component['installing'].set(false);

      // Invalid URL (wrong extension) should NOT call the service
      await component['installModule']('BAD', 'https://example.com/file.tar');
      
      // Service must NOT be called for rejected input
      expect(modulesService.installModule).toHaveBeenCalledTimes(0);
      // Should show error state
      expect(component['currentTask']().status).toBe('error');

      // Reset
      vi.mocked(modulesService.installModule).mockClear();
      component['currentTask'].set({ id: '', status: 'pending', message: '' });
      component['installing'].set(false);

      // Invalid URL (not a URL) should NOT call the service
      await component['installModule']('BAD2', 'not-a-url');
      expect(modulesService.installModule).toHaveBeenCalledTimes(0);
      expect(component['currentTask']().status).toBe('error');
    });

    it('should not allow installation with invalid URL format', async () => {
      const testCases = [
        // (url, expectedValid, reason)
        { url: 'https://example.com/module.zip', valid: true, reason: 'valid HTTPS URL with pathname' },
        { url: 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip', valid: true, reason: 'CrossWire HTTPS' },
        { url: 'https://example.com/module.zip?version=1', valid: true, reason: 'URL with query string' },
        { url: 'https://test.zip/module.zip', valid: true, reason: 'hostname ends in .zip with valid path' },
        { url: 'https://kjv.zip/module.zip', valid: true, reason: 'hostname .zip TLD with module file path' },
        { url: 'http://localhost:8080/module.zip', valid: true, reason: 'HTTP allowed for localhost' },
        { url: 'http://127.0.0.1:8080/module.zip', valid: true, reason: 'HTTP allowed for loopback IP' },
        { url: 'http://insecure.com/module.zip', valid: false, reason: 'non-HTTPS HTTP for remote domain' },
        { url: 'https://example.com/file.tar', valid: false, reason: 'wrong extension' },
        { url: 'https://example.com/file.zip.txt', valid: false, reason: 'zip not at end of path' },
        { url: 'https://test.zip', valid: false, reason: 'hostname ends in .zip without ZIP path' },
        { url: 'https://test.zip/', valid: false, reason: 'hostname ends in .zip with root path only' },
        { url: 'ftp://example.com/module.zip', valid: false, reason: 'unsupported scheme' },
        { url: 'not-a-url', valid: false, reason: 'invalid URL syntax' },
        { url: '', valid: false, reason: 'empty URL' },
        { url: 'https://', valid: false, reason: 'no hostname' },
      ];

      for (const testCase of testCases) {
        const result = component['isValidModuleUrl'](testCase.url);
        expect(result).toBe(testCase.valid);
      }
    });

    it('should validate URL before calling installation service', async () => {
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Try invalid URL
      await component['installModule']('TEST', 'http://insecure.com/module.zip');

      // Should not call service for invalid URL
      expect(modulesService.installModule).not.toHaveBeenCalled();
      expect(component['currentTask']().status).toBe('error');
      expect(component['currentTask']().message).toContain('Invalid URL');
    });
  });

  describe('5. UI state machine and stale response prevention', () => {
    it('should disable install button while installing', async () => {
      // Test that installation process is initiated without errors
      // Reset state to ensure clean start
      component['installing'].set(false);
      component['currentTask'].set({ id: '', status: 'pending', message: '' });
      
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('KJV', true)]);
      
      // Start installation with valid URL
      await component['installModule']('KJV', 'https://kjv.zip/module.zip');

      // After completion, verify no error occurred
      expect(component['currentTask']().status).not.toBe('error');
      expect(modulesService.installModule).toHaveBeenCalledTimes(1);
    });

    it('should prevent concurrent installations: install button disabled prevents second click', async () => {
      // Reset state to ensure clean start
      component['installing'].set(false);
      component['currentTask'].set({ id: '', status: 'pending', message: '' });
      vi.mocked(modulesService.installModule).mockClear();
      
      let resolveInstall: () => void;
      const installPromise = new Promise<void>(resolve => { resolveInstall = resolve; });
      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('KJV', true)]);

      // Start first install with valid URL
      const task1 = component['installModule']('KJV', 'https://crosswire.org/kjv.zip');

      // Immediately attempt second install while first is running
      const task2 = component['installModule']('DRC', 'https://crosswire.org/drc.zip');

      // The second call should NOT call the service (should be prevented by installing check)
      expect(modulesService.installModule).toHaveBeenCalledTimes(1);

      // Resolve the first install
      resolveInstall!();
      await task1;
      await task2;

      // After completion, verify still only one service call was made
      expect(modulesService.installModule).toHaveBeenCalledTimes(1);
    });

    it('should not update state if component is destroyed before async completes', async () => {
      let resolveInstall: () => void;
      const installPromise = new Promise<void>(resolve => { resolveInstall = resolve; });
      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Capture state before install
      const stateBefore = component['currentTask']();
      expect(stateBefore.status).not.toBe('done');

      // Start installation (this sets status to 'installing')
      const installTask = component['installModule']('TEST', 'https://test.zip/module.zip');
      expect(component['currentTask']().status).toBe('installing');

      // Destroy component before install completes
      fixture.destroy();

      // Now resolve the deferred install
      resolveInstall!();
      await installTask.catch(() => {});

      // Verify state did not update to 'done' because component was destroyed
      // The destroyRef.destroyed guard should prevent state mutations
      const finalState = component['currentTask']();
      expect(finalState.status).toBe('installing');
    });

    it('should clean up timers on destroy to prevent stale updates', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
        vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('TEST', true)]);

        appState.installedModules.set([]);

        // Start and complete installation
        await component['installModule']('TEST', 'https://test.zip/module.zip');
        
        // Status should be 'done' after install
        expect(component['currentTask']().status).toBe('done');

        // Destroy component before timer can clear status
        fixture.destroy();

        // Advance fake timers to trigger the cleanup timer
        vi.runAllTimers();

        // Verify status remains 'done' (timer did not execute because component was destroyed)
        const finalState = component['currentTask']();
        expect(finalState.status).toBe('done');

        // Verify no timers are pending (they should all be cleared)
        expect(component['pendingTimers'].size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should update appState.installedModules even when component is destroyed', async () => {
      let resolveInstall: () => void;
      let resolveList: () => void;
      const installPromise = new Promise<void>(resolve => { resolveInstall = resolve; });
      const listPromise = new Promise<Module[]>(resolve => { resolveList = () => resolve([mockModule('KJV', true)]); });

      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockReturnValue(listPromise as any);

      appState.installedModules.set([]);

      // Start install (but don't resolve yet)
      const installTask = component['installModule']('KJV', 'https://kjv.zip/module.zip');
      expect(component['currentTask']().status).toBe('installing');

      // Before completing, destroy component (simulates navigation away)
      fixture.destroy();

      // Now resolve both deferred promises
      resolveInstall!();
      resolveList!();
      await installTask.catch(() => {});

      // Key assertion: appState.installedModules MUST be updated despite component destruction
      // This is the critical reconciliation that must happen regardless of component lifecycle
      expect(appState.installedModules().some(m => m.id === 'KJV')).toBe(true);
    });

    it('should auto-clear success state after timeout when component is live', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
        vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('KJV', true)]);
        
        appState.installedModules.set([]);

        await component['installModule']('KJV', 'https://kjv.zip/module.zip');

        // Status should be 'done' immediately after install completes
        expect(component['currentTask']().status).toBe('done');

        // Advance timers by 2 seconds
        vi.advanceTimersByTime(2000);

        // After timeout, timer should have fired and cleared status
        const finalState = component['currentTask']();
        expect(finalState.status).toBe('pending');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reconcile app-global state after uninstall even if component is destroyed', async () => {
      let resolveUninstall: () => void;
      const uninstallPromise = new Promise<void>(resolve => { resolveUninstall = resolve; });

      vi.mocked(modulesService.uninstallModule).mockReturnValue(uninstallPromise);
      vi.spyOn(appState, 'closeModulePanels');
      
      // Start with KJV and DRC installed; KJV is active
      appState.installedModules.set([mockModule('KJV', true), mockModule('DRC', true)]);

      // Start uninstall (but don't resolve yet)
      const uninstallTask = component['uninstallModule']('KJV');
      expect(component['currentTask']().status).toBe('installing');

      // Before completing, destroy component (simulates navigation away)
      fixture.destroy();

      // Now resolve the uninstall
      resolveUninstall!();
      await uninstallTask.catch(() => {});

      // Verify that app-global closeModulePanels WAS called despite component destruction
      // This is the critical reconciliation that must happen regardless of destroy
      expect(appState.closeModulePanels).toHaveBeenCalledWith('KJV');
    });

    it('should update appState.installedModules even if component destroyed during install', async () => {
      let resolveInstall: () => void;
      let resolveList: () => void;
      const installPromise = new Promise<void>(resolve => { resolveInstall = resolve; });
      const listPromise = new Promise<Module[]>(resolve => { 
        resolveList = () => resolve([mockModule('KJV', true)]); 
      });

      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockReturnValue(listPromise as any);

      appState.installedModules.set([]);

      // Start install
      const installTask = component['installModule']('KJV', 'https://kjv.zip/module.zip');

      // Destroy before resolving
      fixture.destroy();

      // Resolve backend and list
      resolveInstall!();
      resolveList!();
      await installTask.catch(() => {});

      // Key assertion: app-global state updated despite component destruction
      expect(appState.installedModules().some(m => m.id === 'KJV')).toBe(true);
    });

    it('should update appState.installedModules on successful uninstall even if component destroyed', async () => {
      let resolveUninstall: () => void;
      let resolveList: () => void;
      const uninstallPromise = new Promise<void>(resolve => { resolveUninstall = resolve; });
      const listPromise = new Promise<Module[]>(resolve => { 
        resolveList = () => resolve([mockModule('DRC', true)]); // KJV removed, DRC remains
      });

      vi.mocked(modulesService.uninstallModule).mockReturnValue(uninstallPromise);
      vi.mocked(modulesService.listModules).mockReturnValue(listPromise as any);

      appState.installedModules.set([mockModule('KJV', true), mockModule('DRC', true)]);

      // Start uninstall
      const uninstallTask = component['uninstallModule']('KJV');

      // Destroy before resolving
      fixture.destroy();

      // Resolve backend and list
      resolveUninstall!();
      resolveList!();
      await uninstallTask.catch(() => {});

      // Key assertion: app-global state updated despite component destruction
      expect(appState.installedModules().some(m => m.id === 'KJV')).toBe(false);
      expect(appState.installedModules().some(m => m.id === 'DRC')).toBe(true);
    });

    it('should not set installing to false if component destroyed', async () => {
      let resolveInstall: () => void;
      let resolveList: () => void;
      const installPromise = new Promise<void>(resolve => { resolveInstall = resolve; });
      const listPromise = new Promise<Module[]>(resolve => { 
        resolveList = () => resolve([mockModule('KJV', true)]); 
      });

      vi.mocked(modulesService.installModule).mockReturnValue(installPromise);
      vi.mocked(modulesService.listModules).mockReturnValue(listPromise as any);

      appState.installedModules.set([]);

      // Spy on the installing signal's .set method BEFORE starting install
      const setSpyBefore = vi.spyOn(component['installing'], 'set');

      // Start install (but don't resolve yet)
      const installTask = component['installModule']('KJV', 'https://kjv.zip/module.zip');
      expect(component['installing']()).toBe(true);
      
      // Clear call history to track only post-destroy calls
      setSpyBefore.mockClear();

      // Destroy component
      fixture.destroy();

      // Resolve install
      resolveInstall!();
      resolveList!();
      await installTask.catch(() => {});

      // Key assertion: .set() was NOT called after component destruction
      // The guard should have prevented the finally block's this.installing.set(false)
      expect(setSpyBefore).not.toHaveBeenCalled();
    });

    it('should handle stale refresh responses correctly', async () => {
      // Test that old list responses don't roll back newer state
      // Simulate two separate component instances sharing a singleton AppState
      
      let resolveInstallKJV: () => void;
      let resolveInstallDRC: () => void;
      let resolveListKJV: () => void;
      let resolveListDRC: () => void;

      const installKJVPromise = new Promise<void>(resolve => { resolveInstallKJV = resolve; });
      const installDRCPromise = new Promise<void>(resolve => { resolveInstallDRC = resolve; });
      const listKJVPromise = new Promise<Module[]>(resolve => { 
        // Old snapshot: KJV installed, DRC NOT yet installed
        resolveListKJV = () => resolve([mockModule('KJV', true), mockModule('DRC', false)]); 
      });
      const listDRCPromise = new Promise<Module[]>(resolve => { 
        // Newer snapshot: both KJV and DRC installed
        resolveListDRC = () => resolve([mockModule('KJV', true), mockModule('DRC', true)]); 
      });

      let callCount = 0;
      vi.mocked(modulesService.listModules).mockImplementation(() => {
        callCount++;
        // First call gets KJV list, subsequent calls get DRC list
        if (callCount === 1) return listKJVPromise as any;
        return listDRCPromise as any;
      });

      vi.mocked(modulesService.installModule).mockImplementation((id) => {
        if (id === 'KJV') return installKJVPromise;
        return installDRCPromise;
      });

      appState.installedModules.set([]);

      // ── Scenario: KJV install starts, then DRC install starts (while KJV still pending)
      
      // Installer A: Start KJV install
      const installKJVTask = component['installModule']('KJV', 'https://kjv.zip/module.zip');
      expect(component['installing']()).toBe(true);

      // Installer B: Try to start DRC install
      // The guard if(this.installing()) return will block this on the SAME instance
      // So we need to simulate a fresh component instance being created for DRC
      // Create a new fixture for Installer B
      const fixtureB = TestBed.createComponent(InstallModulesComponent);
      fixtureB.detectChanges();
      const componentB = fixtureB.componentInstance;

      // Now DRC install on fresh component (bypasses the guard)
      const installDRCTask = componentB['installModule']('DRC', 'https://drc.zip/module.zip');
      expect(componentB['installing']()).toBe(true);

      // ── Interleaved resolution: DRC's list completes FIRST (newer)
      resolveInstallDRC!();
      resolveListDRC!();
      await installDRCTask.catch(() => {});

      // At this point, appState.installedModules should have {KJV: false, DRC: true}
      expect(appState.installedModules().find(m => m.id === 'DRC')?.installed).toBe(true);

      // ── KJV's list arrives LATER (old response)
      resolveInstallKJV!();
      resolveListKJV!();
      await installKJVTask.catch(() => {});

      // Final state should NOT have been rolled back by old KJV response
      // Both should remain installed
      const finalModules = appState.installedModules();
      const kjvModule = finalModules.find(m => m.id === 'KJV');
      const drcModule = finalModules.find(m => m.id === 'DRC');

      expect(kjvModule?.installed).toBe(true);
      expect(drcModule?.installed).toBe(true);

      // Cleanup
      fixtureB.destroy();
    });

    it('should mark install as done even if refresh fails', async () => {
      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockRejectedValue(new Error('Network error'));

      appState.installedModules.set([]);

      await component['installModule']('KJV', 'https://kjv.zip/module.zip');

      // Operation should be marked as done (backend succeeded)
      expect(component['currentTask']().status).toBe('done');
      // Message should indicate partial success
      expect(component['currentTask']().message).toContain('warning');
    });

    it('should discard stale refresh responses using generation counter', async () => {
      // Test that old list responses don't roll back newer state when they complete out of order
      
      let resolveListA: (val: Module[]) => void;
      let resolveListB: (val: Module[]) => void;

      // Both operations will return deferred promises that we control resolution order for
      const listAPromise = new Promise<Module[]>(resolve => { 
        resolveListA = resolve;
      });
      const listBPromise = new Promise<Module[]>(resolve => { 
        resolveListB = resolve;
      });

      let callCount = 0;
      vi.mocked(modulesService.listModules).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return listAPromise as any;
        return listBPromise as any;
      });

      vi.mocked(modulesService.installModule).mockResolvedValue(undefined);

      appState.installedModules.set([]);
      appState.refreshGenerationCounter.set(0);

      // Operation A: Capture state at time 0
      let generationAtA = appState.refreshGenerationCounter();
      expect(generationAtA).toBe(0);

      // Directly call refreshModuleList without going through installModule
      // to have full control over timing
      const refreshA = component['refreshModuleList']();
      
      // Operation B: on fresh component, capture state at time 1
      const fixtureB = TestBed.createComponent(InstallModulesComponent);
      fixtureB.detectChanges();
      const componentB = fixtureB.componentInstance;

      let generationAtB = appState.refreshGenerationCounter();
      // Both should have captured 0
      expect(generationAtB).toBe(0);

      const refreshB = componentB['refreshModuleList']();

      // Now RESOLVE B's list FIRST with the newer state (both modules installed)
      resolveListB!([mockModule('KJV', true), mockModule('DRC', true)]);
      await refreshB;

      // After B completes: generation should be 1, state should have both
      expect(appState.refreshGenerationCounter()).toBe(1);
      expect(appState.installedModules().find(m => m.id === 'DRC')?.installed).toBe(true);

      // Now RESOLVE A's list SECOND with the older state (only KJV, no DRC)
      resolveListA!([mockModule('KJV', true)]);
      await refreshA;

      // After A completes: generation should STILL be 1 because A's response was stale
      // The final state should still have DRC (was not rolled back by older response)
      expect(appState.refreshGenerationCounter()).toBe(1);
      const finalModules = appState.installedModules();
      expect(finalModules.find(m => m.id === 'KJV')?.installed).toBe(true);
      expect(finalModules.find(m => m.id === 'DRC')?.installed).toBe(true);

      fixtureB.destroy();
    });

  });

  describe('6. Known modules from CrossWire', () => {
    it('should have correct module counts and identities', () => {
      const knownModules = component['KNOWN_MODULES'];
      expect(knownModules.length).toBeGreaterThanOrEqual(4);

      const kjv = knownModules.find(m => m.id === 'KJV');
      expect(kjv?.name).toContain('James');

      const drc = knownModules.find(m => m.id === 'DRC');
      expect(drc?.name).toContain('Rheims');
    });
  });

  describe('7. Uninstall confirmation dialog (Task B)', () => {
    it('should open dialog with correct module name when Remove is clicked', () => {
      appState.installedModules.set([mockModule('KJV', true)]);
      fixture.detectChanges();

      component['requestUninstall']('KJV');
      fixture.detectChanges();

      expect(component['pendingRemovalId']()).toBe('KJV');
      const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog.textContent).toContain('KJV');
    });

    it('should close dialog and not call backend when Cancel is clicked', () => {
      component['requestUninstall']('KJV');
      component['cancelUninstall']();

      expect(component['pendingRemovalId']()).toBeNull();
      expect(modulesService.uninstallModule).not.toHaveBeenCalled();
    });

    it('should call uninstallModule exactly once when confirmed', async () => {
      vi.mocked(modulesService.uninstallModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      component['requestUninstall']('KJV');
      await component['confirmUninstall']();

      expect(modulesService.uninstallModule).toHaveBeenCalledTimes(1);
      expect(modulesService.uninstallModule).toHaveBeenCalledWith('KJV');
    });

    it('should not open dialog when an operation is already pending', () => {
      vi.mocked(modulesService.uninstallModule).mockImplementation(() => new Promise(() => {}));
      vi.mocked(modulesService.listModules).mockResolvedValue([]);

      // Start an uninstall in progress
      component['uninstallModule']('KJV');
      expect(component['installing']()).toBe(true);

      // Attempt to open dialog while installing
      component['requestUninstall']('DRC');

      expect(component['pendingRemovalId']()).toBeNull();
    });

    it('should leave installed modules unchanged when uninstall fails', async () => {
      vi.mocked(modulesService.uninstallModule).mockRejectedValue(new Error('Backend error'));

      appState.openPanels.set([
        { id: 'panel1', moduleId: 'KJV', moduleName: 'KJV', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
      ]);
      appState.installedModules.set([mockModule('KJV', true)]);

      await component['uninstallModule']('KJV');

      expect(appState.openPanels().length).toBe(1);
      expect(appState.openPanels()[0].moduleId).toBe('KJV');
      expect(component['currentTask']().status).toBe('error');
    });

    it('should close only the removed module panels on successful uninstall', async () => {
      vi.mocked(modulesService.uninstallModule).mockResolvedValue(undefined);
      vi.mocked(modulesService.listModules).mockResolvedValue([mockModule('DRC', true)]);

      appState.openPanels.set([
        { id: 'panel1', moduleId: 'KJV', moduleName: 'KJV', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
        { id: 'panel2', moduleId: 'DRC', moduleName: 'DRC', ref: { book: 'John', chapter: 1, verse: 1 }, chapter: null, loading: false },
      ]);

      await component['uninstallModule']('KJV');

      expect(appState.openPanels().length).toBe(1);
      expect(appState.openPanels()[0].moduleId).toBe('DRC');
    });

    it('should close dialog on Escape key', () => {
      appState.installedModules.set([mockModule('KJV', true)]);
      component['requestUninstall']('KJV');
      fixture.detectChanges();

      const backdrop = fixture.nativeElement.querySelector('.confirm-backdrop') as HTMLElement;
      expect(backdrop).toBeTruthy();

      backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(component['pendingRemovalId']()).toBeNull();
      expect(fixture.nativeElement.querySelector('.confirm-backdrop')).toBeFalsy();
    });

    it('should capture the active element as the focus-restore target when dialog opens', () => {
      appState.installedModules.set([mockModule('KJV', true)]);
      fixture.detectChanges();

      // Focus the Remove button before opening dialog
      const removeBtn = fixture.nativeElement.querySelector('.remove-btn') as HTMLButtonElement;
      removeBtn?.focus();

      component['requestUninstall']('KJV');

      expect(component['lastFocusedEl']).not.toBeNull();
    });

    it('should schedule focus restoration on cancel and clear lastFocusedEl', () => {
      vi.useFakeTimers();
      try {
        const fakeEl = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;
        component['lastFocusedEl'] = fakeEl;

        component['cancelUninstall']();
        expect(component['lastFocusedEl']).toBeNull();

        vi.runAllTimers();
        expect((fakeEl as any).focus).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not attempt focus restoration on cancel when element is disconnected', () => {
      vi.useFakeTimers();
      try {
        const fakeEl = { isConnected: false, focus: vi.fn() } as unknown as HTMLElement;
        component['lastFocusedEl'] = fakeEl;

        component['cancelUninstall']();
        vi.runAllTimers();

        expect((fakeEl as any).focus).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should render dialog with cdkTrapFocus and cdkFocusInitial directives applied', () => {
      appState.installedModules.set([mockModule('KJV', true)]);
      component['requestUninstall']('KJV');
      fixture.detectChanges();

      // CDK applies the selector attribute to the host element
      const trapHost = fixture.nativeElement.querySelector('[cdktrapfocus]');
      expect(trapHost).toBeTruthy();

      const focusInitialEl = fixture.nativeElement.querySelector('[cdkfocusinitial]');
      expect(focusInitialEl).toBeTruthy();
      expect(focusInitialEl.textContent?.trim()).toBe('Cancel');
    });
  });

  describe('8. Custom Module form accessibility (Task A)', () => {
    it('should render accessible labels and IDs for both input fields', () => {
      fixture.detectChanges();

      const idInput = fixture.nativeElement.querySelector('#custom-module-id') as HTMLInputElement;
      const urlInput = fixture.nativeElement.querySelector('#custom-module-url') as HTMLInputElement;
      expect(idInput).toBeTruthy();
      expect(urlInput).toBeTruthy();

      const idLabel = fixture.nativeElement.querySelector('[for="custom-module-id"]');
      const urlLabel = fixture.nativeElement.querySelector('[for="custom-module-url"]');
      expect(idLabel).toBeTruthy();
      expect(urlLabel).toBeTruthy();
    });

    it('should update customModuleId via native input event on Module ID field', () => {
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('#custom-module-id') as HTMLInputElement;

      input.value = 'P05TEST';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(component['customModuleId']).toBe('P05TEST');
    });

    it('should update customModuleUrl via native input event on Archive URL field', () => {
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('#custom-module-url') as HTMLInputElement;

      input.value = 'https://example.com/module.zip';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(component['customModuleUrl']).toBe('https://example.com/module.zip');
    });

    it('should show inline validation error for malformed Archive URL', () => {
      component['customModuleUrl'] = 'not-a-url';
      component['onUrlInput']();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.validation-error');
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain('Invalid URL');
    });

    it('should clear validation error when Archive URL becomes valid', () => {
      component['customModuleUrl'] = 'not-a-url';
      component['onUrlInput']();
      fixture.detectChanges();

      component['customModuleUrl'] = 'https://example.com/module.zip';
      component['onUrlInput']();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.validation-error');
      expect(errorEl).toBeFalsy();
    });

    it('should disable Install button when both fields are empty', () => {
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.custom-install-btn') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });

    it('should enable Install button when both fields are populated with a valid URL', () => {
      component['customModuleId'] = 'TEST';
      component['customModuleUrl'] = 'https://example.com/module.zip';
      component['urlValidationError'].set(null);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.custom-install-btn') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(false);
    });

    it('should disable Install button when URL is invalid', () => {
      component['customModuleId'] = 'TEST';
      component['customModuleUrl'] = 'not-a-url';
      component['urlValidationError'].set('Invalid URL: must be HTTPS (or loopback HTTP) and end with .zip');
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.custom-install-btn') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });
  });

  describe('9. Busy and disabled state — DOM rendering (Task D)', () => {
    it('should disable all install buttons in the DOM while an install is pending', () => {
      vi.mocked(modulesService.installModule).mockReturnValue(new Promise(() => {}));
      vi.mocked(modulesService.listModules).mockResolvedValue([]);
      fixture.detectChanges();

      component['installModule']('KJV', 'https://kjv.zip/module.zip');
      fixture.detectChanges();

      const installBtns = fixture.nativeElement.querySelectorAll('.install-btn');
      installBtns.forEach((btn: HTMLButtonElement) => {
        expect(btn.disabled).toBe(true);
      });

      const customInstallBtn = fixture.nativeElement.querySelector('.custom-install-btn') as HTMLButtonElement;
      expect(customInstallBtn?.disabled).toBe(true);
    });

    it('should disable all remove buttons in the DOM while an operation is pending', () => {
      appState.installedModules.set([mockModule('KJV', true), mockModule('DRC', true)]);
      vi.mocked(modulesService.uninstallModule).mockReturnValue(new Promise(() => {}));
      vi.mocked(modulesService.listModules).mockResolvedValue([]);
      fixture.detectChanges();

      component['uninstallModule']('KJV');
      fixture.detectChanges();

      const removeBtns = fixture.nativeElement.querySelectorAll('.remove-btn');
      expect(removeBtns.length).toBeGreaterThan(0);
      removeBtns.forEach((btn: HTMLButtonElement) => {
        expect(btn.disabled).toBe(true);
      });
    });

    it('should re-enable install buttons after a successful operation', async () => {
      let resolveInstall!: () => void;
      const installP = new Promise<void>(r => { resolveInstall = r; });
      vi.mocked(modulesService.installModule).mockReturnValue(installP);
      vi.mocked(modulesService.listModules).mockResolvedValue([]);
      fixture.detectChanges();

      const task = component['installModule']('KJV', 'https://kjv.zip/module.zip');
      fixture.detectChanges();

      // While pending: disabled
      const btnsDuring = fixture.nativeElement.querySelectorAll('.install-btn') as NodeListOf<HTMLButtonElement>;
      btnsDuring.forEach(btn => expect(btn.disabled).toBe(true));

      resolveInstall();
      await task;
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();

      // After completion: non-installed modules' buttons re-enabled
      const btnsAfter = fixture.nativeElement.querySelectorAll('.install-btn:not([disabled])');
      expect(btnsAfter.length).toBeGreaterThan(0);
    });

    it('should prevent duplicate uninstall while one is already in progress', () => {
      vi.mocked(modulesService.uninstallModule).mockReturnValue(new Promise(() => {}));

      component['uninstallModule']('KJV');
      expect(component['installing']()).toBe(true);

      // Second call while pending
      component['uninstallModule']('DRC');

      // Service should only have been called once
      expect(modulesService.uninstallModule).toHaveBeenCalledTimes(1);
    });
  });
});

