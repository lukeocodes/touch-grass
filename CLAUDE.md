# Touch Grass — Chrome Extension

## Project Description

A Chrome extension that replaces GitHub's contribution graph (green squares on profile pages) with animated grass rendered on a `<canvas>`. Activity level controls grass height/density/color. Mouse interaction makes the grass bend. Days with no activity show brown soil. Uses Manifest V3, content script only — no popup, no background worker.

## File Structure

```
touch-grass/
├── CLAUDE.md          # This file — project instructions
├── manifest.json      # Manifest V3 config
├── content.js         # All extension logic (single file)
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Architecture

- **Single content script** (`content.js`) injected on `github.com/*`
- No popup, no background service worker, no permissions needed
- Canvas overlays the contribution graph table
- DPR-aware rendering for crisp display on Retina screens
- SPA navigation handled via `turbo:load` + `MutationObserver`

## Implementation Checklist

- [x] Create CLAUDE.md
- [x] Create manifest.json (Manifest V3, content script only)
- [x] Create content.js — Lifecycle & Canvas Setup
  - [x] Detect `.js-calendar-graph` container and `td.ContributionCalendar-day` cells
  - [x] Read `data-level` (0-4) and cell positions
  - [x] Create DPR-aware canvas overlay
  - [x] Hide original table (`visibility: hidden`)
  - [x] Handle SPA navigation (`turbo:load` + MutationObserver)
  - [x] Prevent double-init with `data-touch-grass` attribute
  - [x] Cleanup function for teardown
- [x] Grass Data Generation
  - [x] Read colors from DOM (supports dark mode/themes)
  - [x] Generate blade data per cell based on level (0-4)
  - [x] HSL color jitter for natural variation
- [x] Blade Rendering (quadratic bezier shapes)
- [x] Wind Animation (layered sine waves + rAF loop)
  - [x] Pause on `visibilitychange` and `IntersectionObserver`
- [x] Mouse Interaction (push force with spring-back)
- [x] Edge Cases & Polish
  - [x] Theme change detection (MutationObserver on `data-color-mode`)
  - [x] Window resize handling (debounced)
  - [x] Year selector changes
- [x] Create placeholder icons (16, 48, 128px)
- [x] Initialize git repo

## Testing Instructions

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked" and select the `touch-grass/` directory
4. Navigate to any GitHub profile with contributions (e.g., `github.com/torvalds`)
5. The contribution graph should be replaced with animated grass

### Verification Checklist

- [ ] Contribution graph replaced with grass canvas
- [ ] Level-0 cells show soil, level-1 shows single short blade, level-4 shows dense tall grass
- [ ] Grass sways with wind animation
- [ ] Moving mouse over canvas pushes grass aside with smooth spring-back
- [ ] Switching GitHub theme updates grass colors
- [ ] Clicking year selector re-initializes correctly
- [ ] Navigating away and back doesn't break or duplicate the canvas

## Key Technical Details

### GitHub DOM Selectors
- Container: `.js-calendar-graph` (fallback: `.ContributionCalendar`)
- Day cells: `td.ContributionCalendar-day` (fallback: `td[data-level]`)
- Table: `.ContributionCalendar-grid`
- Theme: `document.documentElement.getAttribute('data-color-mode')`

### Grass Blade Data Per Level

| Level | Blades | Height (% of cell) | Thickness | Color Source |
|-------|--------|---------------------|-----------|-------------|
| 0 | 0 | — | — | Soil: brown tint |
| 1 | 1 | 25-35% | 1px | GitHub level-1 computed color |
| 2 | 3-4 | 40-55% | 1-1.5px | GitHub level-2 computed color |
| 3 | 5-7 | 55-75% | 1-2px | GitHub level-3 computed color |
| 4 | 8-12 | 70-100% | 1.5-2px | GitHub level-4 computed color |

### Wind Formula
- Primary: `sin(t * 1.2 + phase) * 0.15`
- Secondary: `sin(t * 2.8 + phase * 1.3) * 0.06`
- Tertiary: `sin(t * 5.1 + phase * 0.7) * 0.02`
