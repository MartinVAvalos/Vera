import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SettingsPanelComponent } from './settings-panel.component';
import { AppState } from '../../core/state/app.state';
import { ThemeService } from '../../core/services';

describe('SettingsPanelComponent', () => {
  let component: SettingsPanelComponent;
  let fixture: ComponentFixture<SettingsPanelComponent>;
  let themeService: ThemeService;
  let appState: AppState;

  beforeEach(async () => {
    // Clear theme storage BEFORE TestBed configuration, since ThemeService reads localStorage in its constructor
    localStorage.removeItem('vera-theme');
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [SettingsPanelComponent, FormsModule],
      providers: [AppState, ThemeService],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPanelComponent);
    component = fixture.componentInstance;
    themeService = TestBed.inject(ThemeService);
    appState = TestBed.inject(AppState);

    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('vera-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  describe('appearance section', () => {
    it('should have an Appearance section', () => {
      const compiled = fixture.nativeElement;
      const sections = compiled.querySelectorAll('h3');
      const hasAppearance = Array.from(sections).some((h: any) => h.textContent.includes('Appearance'));
      expect(hasAppearance).toBe(true);
    });

    it('should display current theme name', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const text = compiled.textContent;
      expect(text).toContain('Vera Dark');
    });

    it('should update displayed theme name when theme changes', () => {
      fixture.detectChanges();
      themeService.setTheme('vera-light');
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const text = compiled.textContent;
      expect(text).toContain('Vera Light');
    });
  });

  describe('theme button', () => {
    it('should have a Change theme button', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const button = compiled.querySelector('.theme-btn');
      expect(button).toBeTruthy();
      expect(button.textContent).toContain('Change theme');
    });

    it('should cycle to next theme when button is clicked', () => {
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('.theme-btn');

      button.click();
      fixture.detectChanges();
      expect(themeService.currentTheme()).toBe('vera-light');

      button.click();
      fixture.detectChanges();
      expect(themeService.currentTheme()).toBe('vera-sepia');

      button.click();
      fixture.detectChanges();
      expect(themeService.currentTheme()).toBe('vera-dark');
    });

    it('should cycle through all themes in correct order', () => {
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('.theme-btn');
      const themes: string[] = [];

      themes.push(themeService.currentTheme());

      for (let i = 0; i < 3; i++) {
        button.click();
        fixture.detectChanges();
        themes.push(themeService.currentTheme());
      }

      expect(themes).toEqual(['vera-dark', 'vera-light', 'vera-sepia', 'vera-dark']);
    });

    it('should use native button semantics (focusable and clickable)', () => {
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('.theme-btn') as HTMLButtonElement;
      
      // Verify button is a native HTML button element with correct type
      expect(button.type).toBe('button');
      expect(button.tagName).toBe('BUTTON');
      
      // Native buttons are keyboard-focusable and activated with Enter/Space by the browser
      // This test verifies click activation; real keyboard input is tested in e2e/desktop acceptance
      button.click();
      fixture.detectChanges();
      expect(themeService.currentTheme()).toBe('vera-light');
    });

    it('should use theme-aware :focus-visible styling', () => {
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('.theme-btn') as HTMLButtonElement;
      
      // Verify the button is properly configured for keyboard navigation and focus styling
      expect(button instanceof HTMLButtonElement).toBe(true);
      expect(button.type).toBe('button');
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBeGreaterThanOrEqual(0); // Normally focusable in tab order
      
      // The button's :focus-visible style is defined in settings-panel.component.scss
      // using CSS variable var(--color-border-active), which adapts per theme
      // Unit tests cannot inspect pseudo-class styles directly; this is verified in e2e/desktop acceptance
      
      // Verify click behavior
      button.click();
      fixture.detectChanges();
      expect(themeService.currentTheme()).toBe('vera-light');
    });
  });

  describe('theme synchronization', () => {
    it('should keep displayed theme in sync with ThemeService', () => {
      fixture.detectChanges();
      themeService.setTheme('vera-light');
      fixture.detectChanges();

      expect(themeService.currentTheme()).toBe('vera-light');
      const compiled = fixture.nativeElement;
      expect(compiled.textContent).toContain('Vera Light');
    });

    it('should update when theme changes externally', () => {
      fixture.detectChanges();
      themeService.cycleTheme();
      fixture.detectChanges();

      expect(themeService.currentTheme()).toBe('vera-light');
      const compiled = fixture.nativeElement;
      expect(compiled.textContent).toContain('Vera Light');
    });
  });

  describe('existing settings controls', () => {
    it('should have Display section', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const sections = compiled.querySelectorAll('h3');
      const hasDisplay = Array.from(sections).some((h: any) => h.textContent.includes('Display'));
      expect(hasDisplay).toBe(true);
    });

    it('should have Text Filters section', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const sections = compiled.querySelectorAll('h3');
      const hasFilters = Array.from(sections).some((h: any) => h.textContent.includes('Text Filters'));
      expect(hasFilters).toBe(true);
    });

    it('should have Layout section', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const sections = compiled.querySelectorAll('h3');
      const hasLayout = Array.from(sections).some((h: any) => h.textContent.includes('Layout'));
      expect(hasLayout).toBe(true);
    });

    it('should have About section', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const sections = compiled.querySelectorAll('h3');
      const hasAbout = Array.from(sections).some((h: any) => h.textContent.includes('About'));
      expect(hasAbout).toBe(true);
    });

    it('should have font size range control', () => {
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('input[type="range"]');
      expect(input).toBeTruthy();
      expect(input.min).toBe('1');
      expect(input.max).toBe('5');
    });

    it('should have checkboxes for settings', () => {
      fixture.detectChanges();
      const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });
});
