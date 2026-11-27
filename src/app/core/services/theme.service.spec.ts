import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    // Clear localStorage before creating service, since ThemeService reads it in constructor
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should start with vera-dark as default theme', () => {
      expect(service.currentTheme()).toBe('vera-dark');
    });

    it('should have three themes registered', () => {
      const themes = service.getAvailableThemes();
      expect(themes.length).toBe(3);
      expect(themes).toContain('vera-dark');
      expect(themes).toContain('vera-light');
      expect(themes).toContain('vera-sepia');
    });
  });

  describe('theme cycling', () => {
    it('should cycle from vera-dark to vera-light', () => {
      service.cycleTheme();
      expect(service.currentTheme()).toBe('vera-light');
    });

    it('should cycle from vera-light to vera-sepia', () => {
      service.cycleTheme(); // dark -> light
      service.cycleTheme(); // light -> sepia
      expect(service.currentTheme()).toBe('vera-sepia');
    });

    it('should cycle from vera-sepia back to vera-dark', () => {
      service.cycleTheme(); // dark -> light
      service.cycleTheme(); // light -> sepia
      service.cycleTheme(); // sepia -> dark
      expect(service.currentTheme()).toBe('vera-dark');
    });

    it('should cycle through all themes in correct order', () => {
      const themes: string[] = [];
      themes.push(service.currentTheme());
      for (let i = 0; i < 3; i++) {
        service.cycleTheme();
        themes.push(service.currentTheme());
      }
      expect(themes).toEqual(['vera-dark', 'vera-light', 'vera-sepia', 'vera-dark']);
    });
  });

  describe('theme service initialization', () => {
    it('should initialize with default theme and persist it', () => {
      // The effect is configured in the constructor to sync theme signal with DOM
      // Unit tests verify the signal contract and persistence
      expect(service.currentTheme()).toBe('vera-dark');
      
      service.setTheme('vera-light');
      expect(service.currentTheme()).toBe('vera-light');
      expect(localStorage.getItem('vera-theme')).toBe('vera-light');
      
      // DOM synchronization (data-theme attribute) is verified in browser/desktop acceptance
    });
  });

  describe('direct theme setting', () => {
    it('should update currentTheme when setTheme is called', () => {
      service.setTheme('vera-light');
      expect(service.currentTheme()).toBe('vera-light');
    });

    it('should not change theme for invalid identifiers', () => {
      service.setTheme('invalid-theme' as any);
      expect(service.currentTheme()).toBe('vera-dark');
    });
  });

  describe('persistence', () => {
    it('should save theme to localStorage when set', () => {
      service.setTheme('vera-light');
      expect(localStorage.getItem('vera-theme')).toBe('vera-light');
      
      service.setTheme('vera-sepia');
      expect(localStorage.getItem('vera-theme')).toBe('vera-sepia');
    });

    it('should restore vera-light theme from localStorage on init', () => {
      localStorage.clear();
      localStorage.setItem('vera-theme', 'vera-light');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ThemeService);
      expect(newService.currentTheme()).toBe('vera-light');
    });

    it('should restore vera-sepia theme from localStorage on init', () => {
      localStorage.clear();
      localStorage.setItem('vera-theme', 'vera-sepia');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ThemeService);
      expect(newService.currentTheme()).toBe('vera-sepia');
    });
  });

  describe('legacy migration', () => {
    it('should migrate legacy logos-dark to vera-dark', () => {
      localStorage.clear();
      localStorage.setItem('vera-theme', 'logos-dark');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ThemeService);
      // The service should detect logos-dark and migrate to vera-dark
      expect(localStorage.getItem('vera-theme')).toBe('vera-dark');
    });
  });

  describe('invalid stored identifiers', () => {
    it('should fall back to default for invalid stored theme', () => {
      localStorage.clear();
      localStorage.setItem('vera-theme', 'invalid-theme');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ThemeService);
      expect(newService.currentTheme()).toBe('vera-dark');
    });
  });

  describe('theme names', () => {
    it('should return correct human-readable names', () => {
      expect(service.getThemeName('vera-dark')).toBe('Vera Dark');
      expect(service.getThemeName('vera-light')).toBe('Vera Light');
      expect(service.getThemeName('vera-sepia')).toBe('Vera Sepia');
    });
  });
});
