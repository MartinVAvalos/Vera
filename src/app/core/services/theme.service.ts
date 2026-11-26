import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'vera-dark';

const AVAILABLE_THEMES: Theme[] = ['vera-dark'];
const THEME_STORAGE_KEY = 'vera-theme';
const DEFAULT_THEME: Theme = 'vera-dark';
const LEGACY_LOGOS_DARK = 'logos-dark'; // For backward compatibility migration

/**
 * ThemeService manages app theme selection and persistence.
 * 
 * - Applies theme to document.documentElement via data-theme attribute
 * - Persists selection to localStorage
 * - Prevents flash of unstyled content during initialization
 * - Falls back to default if stored theme is unavailable
 * - Automatically migrates legacy 'logos-dark' identifiers to 'vera-dark'
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly currentTheme = signal<Theme>(this._loadTheme());

  constructor() {
    // Apply theme reactively whenever it changes
    effect(() => {
      const theme = this.currentTheme();
      document.documentElement.setAttribute('data-theme', theme);
    });
  }

  /**
   * Set the active theme and persist it.
   */
  setTheme(theme: Theme): void {
    if (!AVAILABLE_THEMES.includes(theme)) {
      console.warn(`Unknown theme: ${theme}. Available: ${AVAILABLE_THEMES.join(', ')}`);
      return;
    }
    this.currentTheme.set(theme);
    this._saveTheme(theme);
  }

  /**
   * Get list of available themes.
   */
  getAvailableThemes(): Theme[] {
    return [...AVAILABLE_THEMES];
  }

  /**
   * Load theme from localStorage, falling back to default if unavailable.
   * Implements backward compatibility for legacy 'logos-dark' identifier.
   */
  private _loadTheme(): Theme {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    
    // Migrate legacy 'logos-dark' to 'vera-dark'
    if (stored === LEGACY_LOGOS_DARK) {
      this._saveTheme(DEFAULT_THEME);
      return DEFAULT_THEME;
    }
    
    if (stored && AVAILABLE_THEMES.includes(stored as Theme)) {
      return stored as Theme;
    }
    return DEFAULT_THEME;
  }

  /**
   * Save theme selection to localStorage.
   */
  private _saveTheme(theme: Theme): void {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}
