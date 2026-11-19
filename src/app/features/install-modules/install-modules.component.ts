import { Component, OnInit, inject, signal, computed, DestroyRef, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { AppState } from '../../core/state/app.state';
import { ModulesService } from '../../core/services';
import { Module } from '../../core/models';

export const KNOWN_MODULES = [
  { id: 'KJV', name: 'King James Version', url: 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip', type: 'Bible' as const },
  { id: 'DRC', name: 'Douay-Rheims Bible', url: 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/DRC.zip', type: 'Bible' as const },
  { id: 'VUL', name: 'Latin Vulgate', url: 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/VUL.zip', type: 'Bible' as const },
  { id: 'WHNU', name: 'Greek NT (WH)', url: 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/WHNU.zip', type: 'Bible' as const },
];

export interface InstallTask {
  id: string;
  status: 'pending' | 'installing' | 'done' | 'error';
  message: string;
}

@Component({
  selector: 'app-install-modules',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  template: `
    <div class="install-modules">
      <h2>Module Manager</h2>

      <div class="available-section">
        <h3>Quick Install</h3>
        <p class="description">Popular SWORD modules ready to download:</p>
        <div class="module-list">
          @for (mod of KNOWN_MODULES; track mod.id) {
            <div class="module-card">
              <div class="module-info">
                <div class="module-name">{{ mod.name }}</div>
                <div class="module-id">{{ mod.id }}</div>
              </div>
              <button
                class="install-btn"
                (click)="installModule(mod.id, mod.url)"
                [disabled]="installing() || isInstalled(mod.id)"
              >
                {{ isInstalled(mod.id) ? 'Installed' : 'Install' }}
              </button>
            </div>
          }
        </div>
      </div>

      <div class="custom-section">
        <h3>Custom Module</h3>
        <div class="custom-install">
          <label for="custom-module-id">Module ID</label>
          <input
            id="custom-module-id"
            name="customModuleId"
            type="text"
            placeholder="e.g., KJV"
            [(ngModel)]="customModuleId"
            [disabled]="installing()"
          />
          <label for="custom-module-url">Archive URL (.zip)</label>
          <input
            id="custom-module-url"
            name="customModuleUrl"
            type="text"
            placeholder="https://example.com/module.zip"
            [(ngModel)]="customModuleUrl"
            (ngModelChange)="onUrlInput()"
            [disabled]="installing()"
          />
          @if (urlValidationError()) {
            <div class="validation-error" role="alert">{{ urlValidationError() }}</div>
          }
          <button
            type="button"
            class="install-btn custom-install-btn"
            (click)="installModule(customModuleId, customModuleUrl)"
            [disabled]="installing() || !customModuleId || !customModuleUrl || !!urlValidationError()"
          >
            Install
          </button>
        </div>
      </div>

      @if (installing()) {
        <div class="status-message installing">
          <div class="spinner"></div>
          {{ currentTask().message || 'Installing...' }}
        </div>
      }

      @if (currentTask().status === 'done') {
        <div class="status-message success">
          ✓ {{ currentTask().message }}
        </div>
      }

      @if (currentTask().status === 'error') {
        <div class="status-message error">
          ✗ {{ currentTask().message }}
        </div>
      }

      <div class="installed-section">
        <h3>Installed Modules</h3>
        <p class="description">Bible, commentary, lexicon, and other module types:</p>
        
        @if (listError()) {
          <div class="status-message error" role="alert">
            <strong>Failed to load modules:</strong>
            <div>{{ listError() }}</div>
            <button (click)="retryLoadModules()" [disabled]="installing()">Retry</button>
          </div>
        }
        
        @if (installedModules().length) {
          <div class="module-list">
            @for (mod of installedModules(); track mod.id) {
              <div class="module-card">
                <div class="module-info">
                  <div class="module-name">{{ mod.name }}</div>
                  <div class="module-id">{{ mod.id }}<span class="module-type"> [{{ mod.module_type }}]</span></div>
                </div>
                <button
                  class="remove-btn"
                  (click)="requestUninstall(mod.id)"
                  [disabled]="installing()"
                  title="Remove module"
                >
                  Remove
                </button>
              </div>
            }
          </div>
        } @else if (!listError()) {
          <p class="muted">No modules installed yet.</p>
        }
      </div>
    </div>

    @if (pendingRemovalId()) {
      <div class="confirm-backdrop" (keydown.escape)="cancelUninstall()">
        <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
             cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <h4 id="confirm-dialog-title" class="confirm-title">Remove {{ pendingRemovalName() }}?</h4>
          <p class="confirm-body">Open passages from this module will be closed.</p>
          <div class="confirm-actions">
            <button type="button" class="confirm-cancel-btn" cdkFocusInitial (click)="cancelUninstall()">
              Cancel
            </button>
            <button type="button" class="confirm-remove-btn" (click)="confirmUninstall()" [disabled]="installing()">
              Remove
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .install-modules {
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
      background: var(--color-surface-base);
      border-radius: 8px;
    }

    h2 {
      color: var(--color-text-primary);
      margin-top: 0;
      margin-bottom: 20px;
      font-size: 18px;
    }

    h3 {
      color: var(--color-text-primary);
      font-size: 14px;
      margin: 16px 0 8px;
    }

    .description {
      color: var(--color-text-muted);
      font-size: 12px;
      margin: 0 0 12px;
    }

    .module-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .module-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      border-radius: 4px;
    }

    .module-info {
      flex: 1;
    }

    .module-name {
      color: var(--color-text-primary);
      font-size: 13px;
      font-weight: 500;
    }

    .module-id {
      color: var(--color-text-muted);
      font-size: 11px;
      margin-top: 2px;
    }

    .module-type {
      color: var(--color-text-muted);
      font-size: 10px;
      font-style: italic;
    }

    .install-btn, .remove-btn {
      background: var(--color-surface-base);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-link);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .install-btn:hover:not(:disabled) {
      border-color: var(--color-text-link);
      background: rgba(var(--color-text-link-rgb), 0.1);
    }

    .remove-btn {
      color: var(--color-text-muted);
    }

    .remove-btn:hover:not(:disabled) {
      color: #d9534f;
      border-color: #d9534f;
    }

    .install-btn:disabled, .remove-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .custom-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border-subtle);
    }

    .custom-install {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    input {
      background: var(--color-surface-tab);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary);
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }

    input:focus {
      border-color: var(--color-text-link);
    }

    input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .status-message {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-message.installing {
      background: rgba(100, 150, 255, 0.1);
      color: #6496ff;
      border: 1px solid rgba(100, 150, 255, 0.3);
    }

    .status-message.success {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
      border: 1px solid rgba(76, 175, 80, 0.3);
    }

    .status-message.error {
      background: rgba(217, 83, 79, 0.1);
      color: #d9534f;
      border: 1px solid rgba(217, 83, 79, 0.3);
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .installed-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border-subtle);
    }

    .muted {
      color: var(--color-text-muted);
      font-size: 12px;
      margin: 0;
    }

    label {
      color: var(--color-text-muted);
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 2px;
      display: block;
    }

    .validation-error {
      color: #d9534f;
      font-size: 11px;
      margin-top: 2px;
    }

    .custom-install-btn {
      margin-top: 4px;
    }

    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .confirm-dialog {
      background: var(--color-surface-base);
      border: 1px solid var(--color-border-subtle);
      border-radius: 8px;
      padding: 20px 24px;
      min-width: 260px;
      max-width: 320px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .confirm-title {
      color: var(--color-text-primary);
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 8px;
    }

    .confirm-body {
      color: var(--color-text-muted);
      font-size: 12px;
      margin: 0 0 16px;
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .confirm-cancel-btn,
    .confirm-remove-btn {
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      border: 1px solid var(--color-border-subtle);
      transition: all 0.2s;
    }

    .confirm-cancel-btn {
      background: var(--color-surface-tab);
      color: var(--color-text-primary);
    }

    .confirm-cancel-btn:hover {
      border-color: var(--color-text-link);
    }

    .confirm-remove-btn {
      background: #d9534f;
      color: #fff;
      border-color: #d9534f;
    }

    .confirm-remove-btn:hover:not(:disabled) {
      background: #c9302c;
      border-color: #c9302c;
    }

    .confirm-remove-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class InstallModulesComponent implements OnInit {
  protected readonly KNOWN_MODULES = KNOWN_MODULES;

  private readonly appState = inject(AppState);
  private readonly modulesService = inject(ModulesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected customModuleId = '';
  protected customModuleUrl = '';

  protected readonly installing = signal(false);
  protected readonly currentTask = signal<InstallTask>({
    id: '',
    status: 'pending',
    message: '',
  });

  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private lastFocusedEl: HTMLElement | null = null;

  protected readonly installedModules = computed(() => {
    const modules = this.appState.installedModules();
    // Defensive check: if modules is undefined or not an array, return empty array
    if (!modules || !Array.isArray(modules)) return [];
    // Show all installed modules: Bible, Commentary, Lexicon, GenBook, Devotional
    // These can all be removed individually through this interface
    return modules.filter(m => m.installed);
  });

  protected readonly listError = signal<string | null>(null);
  protected readonly urlValidationError = signal<string | null>(null);
  protected readonly pendingRemovalId = signal<string | null>(null);
  protected readonly pendingRemovalName = signal<string>('');

  async ngOnInit(): Promise<void> {
    // Register cleanup FIRST, synchronously, before any async operations
    this.destroyRef.onDestroy(() => {
      this.pendingTimers.forEach(timer => clearTimeout(timer));
      this.pendingTimers.clear();
    });

    // Refresh module list on init
    try {
      const modules = await this.modulesService.listModules();
      
      // Guard: only update if component not destroyed
      if (this.destroyRef.destroyed) return;
      
      this.appState.installedModules.set(modules);
      this.listError.set(null);
    } catch (e) {
      // Guard: only update if component not destroyed
      if (this.destroyRef.destroyed) return;
      
      const message = e instanceof Error ? e.message : String(e);
      this.listError.set(`Failed to load modules: ${message}`);
      console.error('Failed to load modules:', e);
    }
  }

  private scheduleTimedStatusClear(delayMs: number = 2000): void {
    // Guard: don't schedule timers if already destroyed
    if (this.destroyRef.destroyed) return;
    
    const timer = setTimeout(() => {
      // Double-check not destroyed before state update
      if (this.destroyRef.destroyed) return;
      
      const current = this.currentTask();
      if (current.status === 'done') {
        this.currentTask.set({ id: '', status: 'pending', message: '' });
      }
      this.pendingTimers.delete(timer);
    }, delayMs);
    this.pendingTimers.add(timer);
  }

  protected onUrlInput(): void {
    const url = this.customModuleUrl;
    if (!url) {
      this.urlValidationError.set(null);
      return;
    }
    this.urlValidationError.set(
      this.isValidModuleUrl(url) ? null : 'Invalid URL: must be HTTPS (or loopback HTTP) and end with .zip'
    );
  }

  protected requestUninstall(id: string): void {
    if (this.installing()) return;
    this.lastFocusedEl = document.activeElement as HTMLElement;
    const mod = this.installedModules().find(m => m.id === id);
    this.pendingRemovalName.set(mod?.name ?? id);
    this.pendingRemovalId.set(id);
  }

  protected cancelUninstall(): void {
    const target = this.lastFocusedEl;
    this.lastFocusedEl = null;
    this.pendingRemovalId.set(null);
    this.pendingRemovalName.set('');
    // Defer focus restoration until after Angular removes the dialog from the DOM
    if (target && !this.destroyRef.destroyed) {
      const t = setTimeout(() => {
        this.pendingTimers.delete(t);
        if (target.isConnected) target.focus();
      }, 0);
      this.pendingTimers.add(t);
    }
  }

  protected async confirmUninstall(): Promise<void> {
    const id = this.pendingRemovalId();
    if (!id) return;
    this.pendingRemovalId.set(null);
    this.pendingRemovalName.set('');
    this.lastFocusedEl = null;
    await this.uninstallModule(id);
    // After removal the original Remove button is gone; focus the first remaining one
    if (!this.destroyRef.destroyed) {
      const t = setTimeout(() => {
        this.pendingTimers.delete(t);
        if (this.destroyRef.destroyed) return;
        const el = this.elementRef.nativeElement.querySelector(
          '.remove-btn:not([disabled])'
        ) as HTMLElement | null;
        el?.focus();
      }, 50);
      this.pendingTimers.add(t);
    }
  }

  protected isInstalled(id: string): boolean {
    return this.installedModules().some(m => m.id === id);
  }

  protected async retryLoadModules(): Promise<void> {
    try {
      const modules = await this.modulesService.listModules();
      
      // Guard: only update if component not destroyed
      if (this.destroyRef.destroyed) return;
      
      this.appState.installedModules.set(modules);
      this.listError.set(null);
    } catch (e) {
      // Guard: only update if component not destroyed
      if (this.destroyRef.destroyed) return;
      
      const message = e instanceof Error ? e.message : String(e);
      this.listError.set(`Failed to load modules: ${message}`);
      console.error('Failed to load modules:', e);
    }
  }

  private async refreshModuleList(): Promise<boolean> {
    // Capture generation at request start to detect stale responses
    const requestGeneration = this.appState.refreshGenerationCounter();

    try {
      const modules = await this.modulesService.listModules();
      
      // Guard: stale response check - only update if this refresh is still current
      // If a newer refresh completed while we were waiting, discard this old response
      if (requestGeneration !== this.appState.refreshGenerationCounter()) {
        return false;
      }
      
      // Update app-global state UNCONDITIONALLY - this must happen even if component is destroyed
      this.appState.installedModules.set(modules);
      
      // Increment generation to signal this refresh is now current
      this.appState.refreshGenerationCounter.set(requestGeneration + 1);
      
      // Only guard the UI error state update
      if (!this.destroyRef.destroyed) {
        this.listError.set(null);
        this.appState.refreshFailed.set(false);
      }
      return true;
    } catch (e) {
      // Update app-global error state
      this.appState.refreshFailed.set(true);
      
      // Only guard the UI error message update
      if (!this.destroyRef.destroyed) {
        const message = e instanceof Error ? e.message : String(e);
        this.listError.set(`Failed to refresh modules: ${message}`);
        console.error('Failed to refresh modules:', e);
      }
      return false;
    }
  }

  protected async installModule(id: string, url: string): Promise<void> {
    // Prevent concurrent installations: if one is already running, return early
    if (this.installing()) return;

    if (!id || !url) return;

    // Validate URL format: must be HTTPS and end with .zip
    if (!this.isValidModuleUrl(url)) {
      this.currentTask.set({
        id,
        status: 'error',
        message: 'Invalid URL: must be HTTPS and end with .zip'
      });
      return;
    }
    
    this.installing.set(true);
    this.currentTask.set({ id, status: 'installing', message: `Installing ${id}...` });

    try {
      // Check if this module already exists (replacement scenario)
      const modules = this.appState.installedModules();
      const isReplacement = modules && Array.isArray(modules) && modules.some(m => m.id === id);

      await this.modulesService.installModule(id, url);

      // Backend mutation is now complete. App-global reconciliation must happen regardless of component destruction.
      // If this module is replacing an existing one, close old panels immediately (not deferred to component state).
      if (isReplacement) {
        this.appState.closeModulePanels(id);
      }

      // Refresh module list; distinguish operation success from refresh failure
      // This MUST happen before the destroy guard to ensure app-global state is updated
      const refreshSuccess = await this.refreshModuleList();

      // Guard: only update component UI if still alive
      if (this.destroyRef.destroyed) return;
      
      if (refreshSuccess) {
        this.currentTask.set({ id, status: 'done', message: `${id} installed successfully` });
      } else {
        // Operation succeeded but refresh failed; show warning but confirm install occurred
        this.currentTask.set({
          id,
          status: 'done',
          message: `${id} installed (warning: could not refresh list)`
        });
      }

      this.customModuleId = '';
      this.customModuleUrl = '';

      // Clear status after a moment
      this.scheduleTimedStatusClear(2000);
    } catch (e) {
      // Backend operation failed; app state is unchanged.
      // Guard: only update component UI if still alive
      if (this.destroyRef.destroyed) return;
      
      const message = e instanceof Error ? e.message : String(e);
      this.currentTask.set({ id, status: 'error', message: `Failed to install: ${message}` });
    } finally {
      if (!this.destroyRef.destroyed) {
        this.installing.set(false);
      }
    }
  }

  private isValidModuleUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Allow HTTPS for all remote resources
      // Allow HTTP only for explicit loopback test endpoints (localhost, 127.0.0.1, ::1)
      const isLoopback = parsed.hostname === 'localhost' || 
                         parsed.hostname === '127.0.0.1' || 
                         parsed.hostname === '::1';
      
      if (parsed.protocol === 'http:' && !isLoopback) {
        return false; // HTTP only allowed for loopback
      }

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false; // Only HTTPS or HTTP allowed
      }

      // Must have a valid hostname
      if (!parsed.hostname || parsed.hostname === '') {
        return false;
      }

      // Check pathname ends with .zip (not query string or hostname)
      const path = parsed.pathname || '/';
      if (!path.toLowerCase().endsWith('.zip')) {
        return false;
      }

      // Policy: query strings are allowed but not required
      // https://example.com/module.zip?version=1 is valid
      // https://kjv.zip/module.zip is valid (hostname is TLD, path is ZIP file)

      return true;
    } catch {
      // Invalid URL syntax
      return false;
    }
  }

  protected async uninstallModule(id: string): Promise<void> {
    // Prevent concurrent operations
    if (this.installing()) return;

    this.installing.set(true);
    this.currentTask.set({ id, status: 'installing', message: `Removing ${id}...` });

    try {
      await this.modulesService.uninstallModule(id);

      // Backend mutation is now complete. App-global reconciliation must happen regardless of component destruction.
      // Close all panels for the removed module, prune history, set valid active panel/ref.
      this.appState.closeModulePanels(id);

      // Refresh module list; distinguish operation success from refresh failure
      // This MUST happen before the destroy guard to ensure app-global state is updated
      const refreshSuccess = await this.refreshModuleList();

      // Guard: only update component UI if still alive
      if (this.destroyRef.destroyed) return;

      if (refreshSuccess) {
        this.currentTask.set({ id, status: 'done', message: `${id} removed` });
      } else {
        // Operation succeeded but refresh failed; show warning but confirm removal occurred
        this.currentTask.set({
          id,
          status: 'done',
          message: `${id} removed (warning: could not refresh list)`
        });
      }

      this.scheduleTimedStatusClear(2000);
    } catch (e) {
      // Backend operation failed; app state is unchanged.
      // Guard: only update component UI if still alive
      if (this.destroyRef.destroyed) return;
      
      const message = e instanceof Error ? e.message : String(e);
      this.currentTask.set({ id, status: 'error', message: `Failed to remove: ${message}` });
    } finally {
      if (!this.destroyRef.destroyed) {
        this.installing.set(false);
      }
    }
  }
}
