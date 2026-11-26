# Vera Theme System

## Overview

Vera uses a hierarchical CSS custom property system for theming. This allows colors to be managed semantically with support for multiple themes while keeping component styles simple and maintainable.

## Theme Architecture

### Three-Layer System

1. **Semantic Tokens** (`--color-*`)
   - Base semantic colors for UI meaning
   - Used across the app for consistent color roles
   - Examples: `--color-bg-app`, `--color-text-primary`, `--color-text-link`

2. **Region Alias Tokens** (region-specific, e.g., `--nav-*`, `--panel-*`)
   - Convenience tokens for specific UI regions
   - Reduce repetition in component styles
   - Examples: `--nav-bg-color`, `--panel-text-color`, `--tab-indicator-active`

3. **Reader Content Tokens** (`--reader-*`)
   - Dedicated to Bible content styling (verses, text, headings, etc.)
   - Reference semantic tokens via `var()` for automatic theme inheritance
   - Independent from the rest of the UI to allow separate theming of reading experience
   - Examples: `--reader-text-color`, `--reader-verse-number-color`, `--reader-selection-bg`

### Theme Selection

Themes are managed by the `ThemeService` and applied to the HTML document root:

```typescript
// In src/app/core/services/theme.service.ts
document.documentElement.setAttribute('data-theme', theme);
```

**Available themes:**
- `vera-dark` (default) — Vera's dark theme

**Theme configuration:**
- **Service**: `src/app/core/services/theme.service.ts` — Registers available themes and manages selection
- **Styles**: `src/styles.css` — Defines all theme token values via `[data-theme="..."]` rule sets
- **Persistence**: Theme preference is saved to localStorage with key `vera-theme`
- **Bootstrap**: ThemeService is injected during app initialization to apply theme before the first render

**To add a theme:** 
1. Register the new theme identifier in `ThemeService` (`AVAILABLE_THEMES` list)
2. Create a new `[data-theme="theme-name"]` rule set in `src/styles.css` with overrides for semantic tokens
3. Region and reader tokens will inherit from semantic tokens via `var()` cascade; override only tokens that differ from defaults
4. No changes needed to component HTML or TypeScript

## Token Categories

### Application Background
- `--color-bg-app` — Main app background (darkest)
- `--color-bg-surface` — Default surface for panels and containers
- `--color-bg-surface-raised` — Elevated surface variant
- `--color-bg-reader` — Bible text reading area
- `--color-bg-commentary` — Commentary panel
- `--color-bg-tab` — Tab bar background
- `--color-bg-input` — Input field background
- `--color-bg-highlight` — Selection/highlight background

### Text Colors
- `--color-text-primary` — Main text color
- `--color-text-secondary` — Secondary text (less contrast)
- `--color-text-tertiary` — Even lighter text
- `--color-text-muted` — Muted/disabled text
- `--color-text-disabled` — Strongly disabled text
- `--color-text-accent` — Semantic accent color (e.g., headers)
- `--color-text-link` — Link/interactive text
- `--color-text-link-hover` — Link on hover

### Reader / Bible Content
- `--reader-bg-color` — Reader background
- `--reader-text-color` — Default verse text
- `--reader-heading-color` — Chapter/section headings
- `--reader-link-color` — Cross-references and links
- `--reader-verse-number-color` — Verse number superscript
- `--reader-selection-bg` — Highlighted verse background
- `--reader-selection-text` — Highlighted verse text color

### Borders
- `--color-border-subtle` — Minimal dividers and borders
- `--color-border-default` — Standard border color
- `--color-border-active` — Active/focus borders (usually accent)

### Status Indicators
- `--color-status-online` — Online/available indicator
- `--color-status-offline` — Offline/unavailable indicator
- `--color-status-warning` — Warning state
- `--color-status-error` — Error state

### Region-Specific Tokens

#### Navigation Rail (`--nav-*`)
- `--nav-bg-color` — Rail background
- `--nav-text-color` — Inactive button text
- `--nav-text-hover` — Hovered/active button text
- `--nav-bg-hover` — Hovered button background
- `--nav-bg-active` — Active button background
- `--nav-border-color` — Right border

#### Panels (`--panel-*`)
- `--panel-bg-color` — Panel background
- `--panel-text-color` — Primary text
- `--panel-text-muted` — Secondary/muted text
- `--panel-border-color` — Panel borders and dividers
- `--panel-hover-bg` — Hover background for items

#### Tabs (`--tab-*`)
- `--tab-bg-color` — Tab bar background
- `--tab-text-color` — Inactive tab text
- `--tab-text-active` — Active tab text
- `--tab-bg-active` — Active tab background
- `--tab-indicator-active` — Active tab indicator line
- `--tab-border-color` — Tab dividers

#### Buttons (`--button-*`)
- `--button-bg-primary` — Primary button background
- `--button-text-primary` — Primary button text
- `--button-bg-secondary` — Secondary button background
- `--button-text-secondary` — Secondary button text
- `--button-hover-secondary` — Secondary button on hover

#### Inputs (`--input-*`)
- `--input-bg-color` — Input field background
- `--input-text-color` — Input text color
- `--input-border-color` — Input border
- `--input-border-focus` — Input border on focus (usually accent)
- `--input-placeholder-color` — Placeholder text

#### Title Bar (`--titlebar-*`)
- `--titlebar-bg-color` — Title bar background
- `--titlebar-text-color` — Title bar text
- `--titlebar-border-color` — Title bar border

#### Status Bar (`--statusbar-*`)
- `--statusbar-bg-color` — Status bar background
- `--statusbar-text-color` — Status bar primary text
- `--statusbar-text-secondary` — Status bar secondary text

#### Commentary (`--commentary-*`)
- `--commentary-bg-color` — Commentary panel background
- `--commentary-text-color` — Commentary text
- `--commentary-border-color` — Commentary borders

#### Scrollbar (`--scrollbar-*`)
- `--scrollbar-track-bg` — Scrollbar track background
- `--scrollbar-thumb-bg` — Scrollbar thumb color
- `--scrollbar-thumb-hover` — Scrollbar thumb on hover

## Usage in Components

### Preferred Pattern
Use semantic or region-specific tokens directly in component styles:

```typescript
@Component({
  selector: 'app-example',
  template: `<div class="example">Content</div>`,
  styles: [`
    .example {
      background: var(--panel-bg-color);
      color: var(--panel-text-color);
      border: 1px solid var(--panel-border-color);
    }
  `],
})
export class ExampleComponent {}
```

### Avoid
- Hardcoding hex colors directly (e.g., `#252933`)
- Using rgba(255,255,255,0.04) repeatedly — use `--panel-hover-bg` or similar instead
- Creating component-specific color variables — reuse region tokens or add new semantic tokens

## Creating a New Theme

**Three steps to add a new theme:**

1. **Register the theme identifier** in `src/app/core/services/theme.service.ts`:
   ```typescript
   export type Theme = 'vera-dark' | 'your-theme';
   const AVAILABLE_THEMES: Theme[] = ['vera-dark', 'your-theme'];
   ```

2. **Define theme tokens** in `src/styles.css` under a new `[data-theme="your-theme"]` rule set:
   ```css
   [data-theme="your-theme"] {
     /* Override semantic tokens that differ from base :root defaults */
     --color-bg-app: #1a1a1a;
     --color-text-primary: #ffffff;
     --color-text-link: #0ea5e9;
     /* ... override other tokens as needed */
   }
   ```

3. **Region and reader tokens inherit automatically** via CSS `var()` references:
   - Region tokens (e.g., `--nav-bg-color`, `--panel-bg-color`) reference semantic tokens using `var(--color-...)`
   - Reader tokens (e.g., `--reader-text-color`, `--reader-bg-color`) reference semantic tokens
   - When a semantic token is overridden in `[data-theme="your-theme"]`, region and reader tokens automatically use the new value
   - **Only override region/reader tokens if they intentionally differ from their semantic base**

**Example inheritance showing semantic tokens → reader tokens:**
```css
/* :root defines reader tokens that reference semantic tokens */
:root {
  --reader-text-color: var(--color-text-secondary);       /* Inherits secondary text */
  --reader-verse-number-color: var(--color-text-muted);   /* Inherits muted text */
  --reader-selection-bg: var(--color-bg-highlight);       /* Inherits highlight background */
}

/* Vera Dark theme overrides semantic tokens */
[data-theme="vera-dark"] {
  --color-text-secondary: #d0d6e0;    /* Light gray text */
  --color-text-muted: #98a3b8;        /* Muted verse numbers */
  --color-bg-highlight: #4a3f1f;      /* Warm gold selection */
  /* Reader tokens automatically cascade to these values */
}

/* Adding a new theme — only override semantic tokens */
[data-theme="vera-light"] {
  --color-text-secondary: #333333;    /* Dark gray text */
  --color-text-muted: #666666;        /* Muted verse numbers */
  --color-bg-highlight: #fff9e6;      /* Light gold selection */
  /* --reader-text-color automatically becomes #333333 */
  /* --reader-verse-number-color automatically becomes #666666 */
  /* --reader-selection-bg automatically becomes #fff9e6 */
}
```

This provides **zero code duplication** — new themes override only semantic tokens, and all region and reader tokens inherit through the `var()` cascade.

## Vera Dark Theme

The included `vera-dark` theme provides Vera's signature dark mode:
- Very dark app shell (#0f1218)
- Slightly lighter panel surfaces (#1a1f28)
- Soft off-white text (#f0f1f3)
- Muted gray secondary text (#b8c1d1)
- Blue accents (#7ba3d8)
- Subtle borders (#2a3140)

This theme creates high contrast for readability while maintaining a cohesive, low-distraction dark mode experience.

## Token Naming Conventions

- **Semantic**: `--color-{role}-{state}` (e.g., `--color-text-primary`, `--color-bg-app`)
- **Region**: `--{region}-{property}` (e.g., `--nav-bg-color`, `--panel-text-color`)
- **Reader**: `--reader-{property}` (e.g., `--reader-text-color`, `--reader-selection-bg`)
- **Utilities**: `--{property}-{variant}` (e.g., `--scrollbar-thumb-bg`)

## Implementation Notes

- **Theme Service** (`src/app/core/services/theme.service.ts`) manages theme state and persistence
- **CSS Custom Properties** (not SCSS variables) allow dynamic theme switching at runtime
- **ThemeService applies themes** to `document.documentElement` on app bootstrap
- **Semantic tokens** are the primary layer — region and reader tokens inherit via `var()` to avoid duplication
- **Fallback colors** cascade through CSS layers — no need to repeat base tokens
- **Deep component styles** (e.g., `.as-split-gutter`) use `::ng-deep` with token variables
- **Future multi-theme support** requires only: (1) new type/constant in ThemeService, (2) new `[data-theme="..."]` rule set in styles.css; no component changes

## Related Files

- `src/app/core/services/theme.service.ts` — Theme management, persistence, and bootstrap
- `src/styles.css` — Global theme tokens and `:root` / `[data-theme]` definitions
- `src/app/app.ts` — Injects ThemeService on app initialization
- `src/app/app.css` — App shell and layout region styles
- Component styles — Use region/semantic tokens; examples in nav-rail, reader-panel, library-panel
