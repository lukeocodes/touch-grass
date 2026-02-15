// Touch Grass — Replace GitHub contribution graphs with animated grass
// Single content script: lifecycle, rendering, animation, interaction

(function touchGrass() {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  const SELECTORS = {
    container: '.js-calendar-graph',
    containerFallback: '.ContributionCalendar',
    cells: 'td.ContributionCalendar-day',
    cellsFallback: 'td[data-level]',
    grid: '.ContributionCalendar-grid',
  };

  const MAX_BLADE_HEIGHT = 20;

  // Tuft = one draw call containing multiple blades
  // All levels get same tuft count — height and color differentiate them
  const TUFT_CONFIG = [
    // level 0: bare soil
    { tufts: [0, 0], bladesPerTuft: 0, height: [0, 0] },
    // level 1: short dry stubble
    { tufts: [5, 7], bladesPerTuft: 5, height: [2, 5] },
    // level 2: short grass
    { tufts: [5, 7], bladesPerTuft: 5, height: [5, 10] },
    // level 3: healthy growth
    { tufts: [5, 7], bladesPerTuft: 7, height: [10, 16] },
    // level 4: tall lush grass
    { tufts: [5, 7], bladesPerTuft: 9, height: [14, 20] },
  ];

  const GRAPH_BG = '#3d2b1f';
  const SOIL_COLOR = '#6b4c3b';
  const SOIL_SPECKLE = '#7d5e4e';
  const MOUSE_RADIUS = 30;
  const MOUSE_SPRING = 0.15;

  // ── Utility ────────────────────────────────────────────────────────────

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function parseRGB(str) {
    const m = str.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3]];
  }

  function rgbToHSL(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  }

  function hslToCSS(h, s, l) {
    return `hsl(${(h * 360).toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`;
  }

  function jitterColor(rgbStr, amount) {
    const rgb = parseRGB(rgbStr);
    if (!rgb) return rgbStr;
    const [h, s, l] = rgbToHSL(rgb[0], rgb[1], rgb[2]);
    const jittered = Math.max(0, Math.min(1, l + rand(-amount, amount)));
    return hslToCSS(h, s, jittered);
  }

  function debounce(fn, ms) {
    let id;
    return function (...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── State ──────────────────────────────────────────────────────────────

  let activeInstance = null;

  // ── Color Extraction ───────────────────────────────────────────────────

  const FALLBACK_COLORS = [
    null,                 // level 0 uses soil
    'rgb(0, 109, 50)',
    'rgb(38, 166, 65)',
    'rgb(57, 211, 83)',
    'rgb(57, 211, 83)',
  ];

  function extractLevelColors(cells) {
    const colors = [...FALLBACK_COLORS];
    const found = [true, false, false, false, false]; // skip level 0

    for (const cell of cells) {
      const level = parseInt(cell.getAttribute('data-level'), 10);
      if (level >= 1 && level <= 4 && !found[level]) {
        const bg = getComputedStyle(cell).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          colors[level] = bg;
          found[level] = true;
        }
      }
      if (found.every(Boolean)) break;
    }

    return colors;
  }

  // ── Tuft Generation ─────────────────────────────────────────────────

  function generateTufts(cells, containerRect, colors, yOffset) {
    const allTufts = [];
    const cellRects = [];

    for (const cell of cells) {
      const level = parseInt(cell.getAttribute('data-level'), 10) || 0;
      const rect = cell.getBoundingClientRect();
      const cx = rect.left - containerRect.left;
      const cy = rect.top - containerRect.top + yOffset;
      const cw = rect.width;
      const ch = rect.height;

      cellRects.push({
        x: cx, y: cy, w: cw, h: ch,
        level,
        color: level === 0 ? SOIL_COLOR : colors[level],
      });

      if (level === 0) continue;

      const config = TUFT_CONFIG[level];
      const numTufts = randInt(config.tufts[0], config.tufts[1]);

      for (let t = 0; t < numTufts; t++) {
        // Tuft anchor position — scattered across cell
        const anchorX = cx + rand(0, cw);
        const anchorY = cy + rand(0, ch * 0.4);

        // Lean based on position within cell
        const posInCell = (anchorX - cx) / cw;
        let baseLean;
        if (posInCell < 0.3) {
          const edgeness = 1 - posInCell / 0.3;
          baseLean = rand(-0.3, -0.1) - edgeness * 0.5;
        } else if (posInCell > 0.7) {
          const edgeness = (posInCell - 0.7) / 0.3;
          baseLean = rand(0.1, 0.3) + edgeness * 0.5;
        } else {
          baseLean = rand(-0.2, 0.2);
        }

        // Pre-compute individual blade offsets within this tuft
        const blades = [];
        for (let b = 0; b < config.bladesPerTuft; b++) {
          blades.push({
            dx: rand(-2, 2),
            dy: rand(-1, 1),
            height: Math.min(rand(config.height[0], config.height[1]), MAX_BLADE_HEIGHT),
            thickness: rand(0.8, 1.3),
            leanOffset: rand(-0.15, 0.15),
          });
        }

        allTufts.push({
          x: anchorX,
          baseY: anchorY,
          color: jitterColor(colors[level], 0.08),
          phaseOffset: rand(0, Math.PI * 2),
          lean: baseLean,
          stiffness: rand(0.8, 1.2),
          currentMouseBend: 0,
          targetMouseBend: 0,
          blades,
        });
      }
    }

    return { tufts: allTufts, cellRects };
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  function drawTuft(ctx, tuft, windOffset) {
    const { x, baseY, color, lean, currentMouseBend, blades } = tuft;
    const totalBend = lean + windOffset + currentMouseBend;

    // Build one compound path for all blades in the tuft
    ctx.beginPath();
    for (const b of blades) {
      const bx = x + b.dx;
      const by = baseY + b.dy;
      const bladeLean = totalBend + b.leanOffset;
      const tipX = bx + bladeLean * b.height;
      const tipY = by - b.height;
      const cpX = bx + bladeLean * b.height * 0.5;
      const cpY = by - b.height * 0.6;
      const halfT = b.thickness / 2;

      ctx.moveTo(bx - halfT, by);
      ctx.quadraticCurveTo(cpX - halfT * 0.3, cpY, tipX, tipY);
      ctx.quadraticCurveTo(cpX + halfT * 0.3, cpY, bx + halfT, by);
      ctx.closePath();
    }

    // Dark stroke for contrast, then fill
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCells(ctx, cellRects, graphBounds) {
    // Dark brown fills entire graph area (no white gaps between squares)
    ctx.fillStyle = GRAPH_BG;
    ctx.fillRect(graphBounds.x, graphBounds.y, graphBounds.w, graphBounds.h);

    for (const r of cellRects) {
      // Draw the cell square in its original color
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // Add soil texture speckles for level-0 cells
      if (r.level === 0) {
        ctx.fillStyle = SOIL_SPECKLE;
        const dots = randInt(2, 5);
        for (let i = 0; i < dots; i++) {
          const dx = rand(r.x + 1, r.x + r.w - 1);
          const dy = rand(r.y + 1, r.y + r.h - 1);
          ctx.fillRect(dx, dy, 1, 1);
        }
      }
    }
  }

  function render(ctx, state) {
    const { width, height, tufts, cellRects, graphBounds } = state;
    ctx.clearRect(0, 0, width, height);

    drawCells(ctx, cellRects, graphBounds);

    const t = state.time;
    for (const tuft of tufts) {
      const p = tuft.phaseOffset;
      const s = tuft.stiffness;
      const wind =
        Math.sin(t * 1.2 + p) * 0.15 / s +
        Math.sin(t * 2.8 + p * 1.3) * 0.06 / s +
        Math.sin(t * 5.1 + p * 0.7) * 0.02 / s;

      // Spring mouse bend toward target
      tuft.currentMouseBend += (tuft.targetMouseBend - tuft.currentMouseBend) * MOUSE_SPRING;

      drawTuft(ctx, tuft, wind);
    }
  }

  // ── Mouse Interaction ─────────────────────────────────────────────────

  function updateMouseInfluence(state, mouseX, mouseY) {
    for (const tuft of state.tufts) {
      const dx = tuft.x - mouseX;
      const dy = tuft.baseY - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MOUSE_RADIUS) {
        const force = (1 - dist / MOUSE_RADIUS) ** 2;
        const direction = dx >= 0 ? 1 : -1;
        tuft.targetMouseBend = direction * force * 0.6;
      } else {
        tuft.targetMouseBend = 0;
      }
    }
  }

  function clearMouseInfluence(state) {
    for (const tuft of state.tufts) {
      tuft.targetMouseBend = 0;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  function findContainer() {
    return (
      document.querySelector(SELECTORS.container) ||
      document.querySelector(SELECTORS.containerFallback)
    );
  }

  function findCells(container) {
    const cells = container.querySelectorAll(SELECTORS.cells);
    if (cells.length > 0) return cells;
    return container.querySelectorAll(SELECTORS.cellsFallback);
  }

  function cleanup() {
    if (!activeInstance) return;
    const inst = activeInstance;
    activeInstance = null;

    cancelAnimationFrame(inst.rafId);

    if (inst.canvas && inst.canvas.parentNode) {
      inst.canvas.parentNode.removeChild(inst.canvas);
    }

    if (inst.table) {
      inst.table.style.opacity = '';
      inst.table.style.position = '';
      inst.table.style.zIndex = '';
    }

    if (inst.container) {
      inst.container.removeAttribute('data-touch-grass');
      inst.container.style.overflow = '';
    }

    if (inst.intersectionObserver) {
      inst.intersectionObserver.disconnect();
    }

    if (inst.themeObserver) {
      inst.themeObserver.disconnect();
    }

    if (inst.gridObserver) {
      inst.gridObserver.disconnect();
    }

    window.removeEventListener('resize', inst.resizeHandler);
    document.removeEventListener('visibilitychange', inst.visibilityHandler);
  }

  function setup() {
    cleanup();

    const container = findContainer();
    if (!container) return;
    if (container.getAttribute('data-touch-grass') === 'active') return;

    const cells = findCells(container);
    if (cells.length === 0) return;

    container.setAttribute('data-touch-grass', 'active');

    // Find and hide the grid table
    const table = container.querySelector(SELECTORS.grid) || container.querySelector('table');

    const colors = extractLevelColors(cells);

    // Measure container and cells before hiding
    const containerRect = container.getBoundingClientRect();

    // Headroom for grass to grow above the graph (capped at 20px blades + margin)
    const headroom = MAX_BLADE_HEIGHT + 5;
    const { tufts, cellRects } = generateTufts(cells, containerRect, colors, headroom);

    // Compute bounding box of all cells for the dark brown background fill
    const graphBounds = cellRects.reduce((b, r) => ({
      x: Math.min(b.x, r.x),
      y: Math.min(b.y, r.y),
      r: Math.max(b.r, r.x + r.w),
      b: Math.max(b.b, r.y + r.h),
    }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity });
    graphBounds.w = graphBounds.r - graphBounds.x;
    graphBounds.h = graphBounds.b - graphBounds.y;

    // Create canvas with extra height for headroom
    const dpr = window.devicePixelRatio || 1;
    const w = containerRect.width;
    const h = containerRect.height + headroom;

    const canvas = document.createElement('canvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.position = 'absolute';
    canvas.style.top = -headroom + 'px';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Position container for overlay, allow grass to grow above
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }
    container.style.overflow = 'visible';
    container.appendChild(canvas);

    // Hide original table visually but keep it interactive for tooltips
    if (table) {
      table.style.opacity = '0';
      table.style.position = 'relative';
      table.style.zIndex = '2';
    }

    // Animation state
    const state = {
      width: w,
      height: h,
      tufts,
      cellRects,
      graphBounds,
      time: 0,
      running: true,
    };

    const instance = {
      canvas,
      ctx,
      table,
      container,
      state,
      rafId: null,
      intersectionObserver: null,
      themeObserver: null,
      gridObserver: null,
      resizeHandler: null,
      visibilityHandler: null,
    };

    activeInstance = instance;

    // ── Reduced Motion ──────────────────────────────────────────────

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Render one static frame with no wind or mouse interaction
      render(ctx, state);
    } else {
      // ── Animation Loop ────────────────────────────────────────────

      let lastTime = performance.now();

      function animate(now) {
        if (!state.running) {
          instance.rafId = requestAnimationFrame(animate);
          return;
        }

        const dt = (now - lastTime) / 1000;
        lastTime = now;
        state.time += dt;

        render(ctx, state);
        instance.rafId = requestAnimationFrame(animate);
      }

      instance.rafId = requestAnimationFrame(animate);

      // ── Mouse Events (on container so tooltips still work through the table) ─

      container.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        updateMouseInfluence(state, mx, my);
      });

      container.addEventListener('mouseleave', () => {
        clearMouseInfluence(state);
      });

      // ── Visibility / IntersectionObserver ──────────────────────────

      instance.visibilityHandler = () => {
        state.running = !document.hidden;
        if (state.running) lastTime = performance.now();
      };
      document.addEventListener('visibilitychange', instance.visibilityHandler);

      instance.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            state.running = entry.isIntersecting && !document.hidden;
            if (state.running) lastTime = performance.now();
          }
        },
        { threshold: 0 }
      );
      instance.intersectionObserver.observe(canvas);
    }

    // ── Theme Change Detection ──────────────────────────────────────

    instance.themeObserver = new MutationObserver(() => {
      // Re-extract colors (theme changed) and regenerate
      const freshCells = findCells(container);
      if (freshCells.length === 0) return;
      const newColors = extractLevelColors(freshCells);
      const freshContainerRect = container.getBoundingClientRect();
      const freshData = generateTufts(freshCells, freshContainerRect, newColors, headroom);
      state.tufts = freshData.tufts;
      state.cellRects = freshData.cellRects;
    });
    instance.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode', 'data-dark-theme', 'data-light-theme'],
    });

    // ── Grid Content Change (Year Selector) ─────────────────────────

    instance.gridObserver = new MutationObserver(
      debounce(() => {
        // The graph content was replaced — re-init
        if (activeInstance === instance) {
          setup();
        }
      }, 200)
    );
    instance.gridObserver.observe(container, { childList: true, subtree: true });

    // ── Resize ──────────────────────────────────────────────────────

    instance.resizeHandler = debounce(() => {
      if (activeInstance === instance) {
        setup();
      }
    }, 300);
    window.addEventListener('resize', instance.resizeHandler);
  }

  // ── SPA Navigation ──────────────────────────────────────────────────

  function initIfReady() {
    const container = findContainer();
    if (!container) return;
    if (container.getAttribute('data-touch-grass') === 'active' && activeInstance) return;
    setup();
  }

  // Initial run
  initIfReady();

  // GitHub uses Turbo for SPA navigation
  document.addEventListener('turbo:load', () => {
    initIfReady();
  });

  // Also watch for pjax (older GitHub) and general navigation
  document.addEventListener('pjax:end', () => {
    initIfReady();
  });

  // MutationObserver on <main> for SPA content swaps
  const mainObserver = new MutationObserver(
    debounce(() => {
      initIfReady();
    }, 100)
  );

  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainObserver.observe(mainEl, { childList: true, subtree: true });
  }
})();
