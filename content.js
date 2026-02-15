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

  const BLADE_CONFIG = [
    // level 0: soil, no blades
    { count: [0, 0], height: [0, 0], thickness: [0, 0] },
    // level 1: sparse, short
    { count: [1, 1], height: [0.25, 0.35], thickness: [1, 1] },
    // level 2: moderate
    { count: [3, 4], height: [0.40, 0.55], thickness: [1, 1.5] },
    // level 3: lush
    { count: [5, 7], height: [0.55, 0.75], thickness: [1, 2] },
    // level 4: dense, tall
    { count: [8, 12], height: [0.70, 1.0], thickness: [1.5, 2] },
  ];

  const FALLBACK_COLORS = [
    'rgb(22, 27, 34)',    // level 0 (soil bg)
    'rgb(0, 109, 50)',    // level 1
    'rgb(38, 166, 65)',   // level 2
    'rgb(57, 211, 83)',   // level 3
    'rgb(57, 211, 83)',   // level 4
  ];

  const SOIL_COLOR = '#3d2b1f';
  const SOIL_SPECKLE = '#5c4033';
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

  function extractLevelColors(cells) {
    const colors = [...FALLBACK_COLORS];
    const found = [false, false, false, false, false];

    for (const cell of cells) {
      const level = parseInt(cell.getAttribute('data-level'), 10);
      if (level >= 0 && level <= 4 && !found[level]) {
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

  // ── Blade Generation ──────────────────────────────────────────────────

  function generateBlades(cells, containerRect, colors) {
    const allBlades = [];
    const soilRects = [];

    for (const cell of cells) {
      const level = parseInt(cell.getAttribute('data-level'), 10) || 0;
      const rect = cell.getBoundingClientRect();
      const cx = rect.left - containerRect.left;
      const cy = rect.top - containerRect.top;
      const cw = rect.width;
      const ch = rect.height;

      if (level === 0) {
        soilRects.push({ x: cx, y: cy, w: cw, h: ch });
        continue;
      }

      const config = BLADE_CONFIG[level];
      const numBlades = randInt(config.count[0], config.count[1]);

      for (let i = 0; i < numBlades; i++) {
        const heightFrac = rand(config.height[0], config.height[1]);
        const bladeHeight = ch * heightFrac;
        const thickness = rand(config.thickness[0], config.thickness[1]);
        const x = cx + rand(1, cw - 1);
        const baseY = cy + ch;

        allBlades.push({
          x,
          baseY,
          height: bladeHeight,
          thickness,
          color: jitterColor(colors[level], 0.08),
          phaseOffset: rand(0, Math.PI * 2),
          lean: rand(-0.1, 0.1),
          stiffness: rand(0.8, 1.2),
          currentMouseBend: 0,
          targetMouseBend: 0,
        });
      }
    }

    return { blades: allBlades, soilRects };
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  function drawBlade(ctx, blade, windOffset) {
    const { x, baseY, height, thickness, color, lean, currentMouseBend } = blade;
    const totalBend = lean + windOffset + currentMouseBend;
    const tipX = x + totalBend * height;
    const tipY = baseY - height;
    const cpX = x + totalBend * height * 0.5;
    const cpY = baseY - height * 0.6;
    const halfT = thickness / 2;

    ctx.beginPath();
    ctx.moveTo(x - halfT, baseY);
    ctx.quadraticCurveTo(cpX - halfT * 0.3, cpY, tipX, tipY);
    ctx.quadraticCurveTo(cpX + halfT * 0.3, cpY, x + halfT, baseY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawSoil(ctx, soilRects) {
    for (const r of soilRects) {
      ctx.fillStyle = SOIL_COLOR;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // Texture speckles
      ctx.fillStyle = SOIL_SPECKLE;
      const dots = randInt(2, 5);
      for (let i = 0; i < dots; i++) {
        const dx = rand(r.x + 1, r.x + r.w - 1);
        const dy = rand(r.y + 1, r.y + r.h - 1);
        ctx.fillRect(dx, dy, 1, 1);
      }
    }
  }

  function render(ctx, state) {
    const { width, height, blades, soilRects } = state;
    ctx.clearRect(0, 0, width, height);

    drawSoil(ctx, soilRects);

    const t = state.time;
    for (const blade of blades) {
      const p = blade.phaseOffset;
      const s = blade.stiffness;
      const wind =
        Math.sin(t * 1.2 + p) * 0.15 / s +
        Math.sin(t * 2.8 + p * 1.3) * 0.06 / s +
        Math.sin(t * 5.1 + p * 0.7) * 0.02 / s;

      // Spring mouse bend toward target
      blade.currentMouseBend += (blade.targetMouseBend - blade.currentMouseBend) * MOUSE_SPRING;

      drawBlade(ctx, blade, wind);
    }
  }

  // ── Mouse Interaction ─────────────────────────────────────────────────

  function updateMouseInfluence(state, mouseX, mouseY) {
    for (const blade of state.blades) {
      const midX = blade.x;
      const midY = blade.baseY - blade.height * 0.5;
      const dx = midX - mouseX;
      const dy = midY - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MOUSE_RADIUS) {
        const force = (1 - dist / MOUSE_RADIUS) ** 2;
        const direction = dx >= 0 ? 1 : -1;
        blade.targetMouseBend = direction * force * 0.6;
      } else {
        blade.targetMouseBend = 0;
      }
    }
  }

  function clearMouseInfluence(state) {
    for (const blade of state.blades) {
      blade.targetMouseBend = 0;
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
      inst.table.style.visibility = '';
    }

    if (inst.container) {
      inst.container.removeAttribute('data-touch-grass');
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
    const { blades, soilRects } = generateBlades(cells, containerRect, colors);

    // Create canvas
    const dpr = window.devicePixelRatio || 1;
    const w = containerRect.width;
    const h = containerRect.height;

    const canvas = document.createElement('canvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'auto';
    canvas.style.zIndex = '1';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Position container for overlay
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(canvas);

    // Hide original table
    if (table) {
      table.style.visibility = 'hidden';
    }

    // Animation state
    const state = {
      width: w,
      height: h,
      blades,
      soilRects,
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

    // ── Animation Loop ──────────────────────────────────────────────

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

    // ── Mouse Events ────────────────────────────────────────────────

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      updateMouseInfluence(state, mx, my);
    });

    canvas.addEventListener('mouseleave', () => {
      clearMouseInfluence(state);
    });

    // ── Visibility / IntersectionObserver ────────────────────────────

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

    // ── Theme Change Detection ──────────────────────────────────────

    instance.themeObserver = new MutationObserver(() => {
      // Re-extract colors and regenerate blades
      const freshCells = findCells(container);
      if (freshCells.length === 0) return;
      const newColors = extractLevelColors(freshCells);
      const freshContainerRect = container.getBoundingClientRect();
      const freshData = generateBlades(freshCells, freshContainerRect, newColors);
      state.blades = freshData.blades;
      state.soilRects = freshData.soilRects;
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
