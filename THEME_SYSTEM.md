# Vera Theme System

## Overview

Vera uses a hierarchical CSS custom property system for theming. This allows colors to be managed semantically with support for multiple themes while keeping component styles simple and maintainable.

## Supported Themes

Vera ships with three built-in themes:

| Theme | Description | Use Case |
|-------|-------------|----------|
| **Vera Dark** (default) | Dark background with light text | Evening/low-light reading |
| **Vera Light** | Light background with dark text | Daytime reading |
| **Vera Sepia** | Warm parchment palette with dark brown text | Printed book aesthetic |

### Theme Selection

Users can switch themes via the **Settings → Appearance** panel using the **Change theme** button, which cycles through themes in this order:

```
Vera Dark → Vera Light → Vera Sepia → Vera Dark
```

Clicking the button advances to the next theme. Changes apply immediately without reloading the application.

### Theme Management

Themes are managed by the `ThemeService`:
- **Service**: `src/app/core/services/theme.service.ts` — Registers available themes, manages cycling, and handles persistence
- **Styles**: `src/styles.css` — Defines all theme token values via `[data-theme="..."]` rule sets  
- **UI**: `src/app/features/settings/settings-panel.component.ts/html` — Displays current theme and provides cycling button
- **Persistence**: Theme preference is saved to localStorage with key `vera-theme`
- **Bootstrap**: ThemeService is injected during app initialization to apply theme before the first render

The theme is applied to the HTML document root:
```typescript
document.documentElement.setAttribute('data-theme', theme);
```

### Theme Cycling

The `ThemeService.cycleTheme()` method:
- Derives the next theme from the `AVAILABLE_THEMES` array (single source of truth)
- Uses modulo arithmetic to wrap back to the first theme
- Automatically persists the new theme to localStorage
- Triggers the effect to update `document.documentElement.data-theme`

### Theme Restoration

On app startup, `ThemeService` loads the user's saved preference from localStorage. If the saved value is invalid or missing, it falls back to the default theme (`vera-dark`).

**Legacy migration:** Any saved preference using the old identifier `logos-dark` is automatically migrated to `vera-dark`.

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
  templateUrl: './example.component.html',
  styleUrl: './example.component.scss',
})
export class ExampleComponent {}
```

In `example.component.scss`:
```scss
.example {
  background: var(--panel-bg-color);
  color: var(--panel-text-color);
  border: 1px solid var(--panel-border-color);
}
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
   - **Note**: Some region tokens use independent values for specific UI needs. Light and Sepia themes require explicit status and muted text overrides to maintain WCAG AA contrast against their panel backgrounds.

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

This design minimizes duplication through CSS variable inheritance — new themes typically override only semantic tokens, while region and reader tokens reference them via `var()`. However, some region-specific tokens (such as tab colors, navigation rail backgrounds, and status indicator colors) use independent values to meet contrast and usability requirements. Light and Sepia themes require explicit overrides for status and muted text colors to maintain WCAG AA contrast against their panel backgrounds. Developers implementing a new theme must audit all visual components, not just semantic tokens.

## Vera Dark Theme

The included `vera-dark` theme provides Vera's signature dark mode:
- Very dark app shell (#0f1218)
- Slightly lighter panel surfaces (#1a1f28)
- Soft off-white text (#f0f1f3)
- Muted gray secondary text (#b8c1d1)
- Blue accents (#7ba3d8)
- Subtle borders (#2a3140)

This theme creates high contrast for readability while maintaining a cohesive, low-distraction dark mode experience.

## Vera Light Theme

The `vera-light` theme is optimized for daytime reading with WCAG AA contrast compliance:
- Light off-white app background (#f8f7f5)
- Bright white panel surfaces (#efefed)
- Dark brown primary text (#2a2824)
- Muted text (#6b6056)
- Accent color (#664a24)
- Subtle borders (#dddad4)
- Status colors: Online #0d6a48, Warning #934c00, Error #b91620

**Verified contrast ratios (WCAG AA: 4.5:1 minimum for normal text):**
- Primary text (#2a2824) vs app bg (#f8f7f5): 13.74:1 ✓
- Primary text (#2a2824) vs panel bg (#efefed): 12.78:1 ✓
- Secondary text (#534f47) vs panel bg (#efefed): 7.08:1 ✓
- Tertiary text (#6a6157) vs tab bg (#e8e6e3): 4.87:1 ✓
- Muted text (#6b6056) vs panel bg (#efefed): 5.31:1 ✓
- Status Online (#0d6a48) vs panel bg: 5.75:1 ✓
- Status Warning (#934c00) vs panel bg: 5.57:1 ✓
- Status Error (#b91620) vs panel bg: 5.70:1 ✓

## Vera Sepia Theme

The `vera-sepia` theme provides a warm, parchment-inspired aesthetic for extended reading:
- Warm beige app background (#e9dbc0)
- Light cream panel backgrounds (#e5d6b9)
- Light tan reader background (#f4ead7)
- Dark brown primary text (#3d2f24)
- Medium brown secondary text (#534a3f)
- Muted brown text (#6b5944)
- Warm gold accent (#78552f)
- Subtle tan borders (#c8b697)
- Status colors: Online #315f38, Warning #805000, Error #a43627, Installing #385978

**Verified contrast ratios (WCAG AA: 4.5:1 minimum for normal text):**
- Primary text (#3d2f24) vs app bg (#e9dbc0): 9.42:1 ✓
- Primary text (#3d2f24) vs panel bg (#e5d6b9): 8.99:1 ✓
- Secondary text (#534a3f) vs panel bg (#e5d6b9): 6.06:1 ✓
- Tertiary text (#65574d) vs tab bg (#ddd0ad): 4.53:1 ✓
- Muted text (#6b5944) vs panel bg (#e5d6b9): 4.67:1 ✓
- Status Online (#315f38) vs panel bg: 5.19:1 ✓
- Status Warning (#805000) vs panel bg: 4.78:1 ✓
- Status Error (#a43627) vs panel bg: 4.67:1 ✓

The warm, earthy palette mimics printed book aesthetics, reducing eye strain during long reading sessions while maintaining WCAG AA contrast for accessibility.

## Implementation Guidelines
- Navigation rail icons and labels
- Title bar text
- Status bar indicators
- Settings panel controls and labels
- Input fields and placeholders
- Tab labels and indicators
- Button text and backgrounds
- Commentary panel text
- Verse numbers and selection backgrounds
- Error, warning, and success message indicators
- Keyboard focus outlines

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
- `src/app/app.scss` — App shell and layout region styles
- Component styles — Use region/semantic tokens; examples in nav-rail, reader-panel, library-panel
