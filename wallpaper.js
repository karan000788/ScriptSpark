/* =========================================================================
 *  ScriptSpark Wallpaper Engine
 *  Cinematic full-screen animated wallpapers + premium UI behaviour.
 *
 *  10 themes, all Canvas2D (no WebGL deps), single fullscreen canvas, theme
 *  persisted in localStorage, smooth cross-fade on switch.
 *
 *  Public surface:
 *    window.WallpaperEngine.setTheme(id)
 *    window.WallpaperEngine.openGallery()
 *    window.WallpaperEngine.themes        -> [{id,name,description}]
 *    window.WallpaperEngine.current()     -> id string
 *
 *  We never touch app state, business logic or existing DOM nodes — we only
 *  inject a <canvas> behind everything, manage a modal, and wire small
 *  visual-only behaviours (mouse-tilt cards, magnetic buttons).
 * ========================================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "scriptspark.wallpaper.theme";
  const DEFAULT_THEME = "earth";
  const FADE_MS = 700;

  // ---------------------------------------------------------------- helpers
  const isMobile = () =>
    matchMedia("(max-width: 768px)").matches ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const prefersReduced = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  // Power scaling — fewer particles on weak devices.
  const PERF = (() => {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (isMobile() || cores < 4 || mem < 4) return 0.45;
    if (cores >= 8 && mem >= 8) return 1.0;
    return 0.75;
  })();

  // ---------------------------------------------------------------- themes
  const THEMES = [
    { id: "earth",    name: "Earth From Space",   desc: "Realistic rotating Earth, drifting clouds, city lights.", emoji: "🌍" },
    { id: "galaxy",   name: "Deep Space Galaxy",  desc: "Stars, nebula, cosmic rotation, shooting stars.",         emoji: "🌌" },
    { id: "neural",   name: "Neural Network AI",  desc: "Connected nodes pulsing data through the brain.",         emoji: "🧠" },
    { id: "atomic",   name: "Atomic World",       desc: "Orbiting electrons, quantum energy field.",               emoji: "⚛️" },
    { id: "ocean",    name: "Ocean World",        desc: "Waves, light rays, drifting underwater particles.",       emoji: "🌊" },
    { id: "aurora",   name: "Aurora Borealis",    desc: "Northern lights dancing across the atmosphere.",          emoji: "🌠" },
    { id: "lava",     name: "Lava Planet",        desc: "Molten surface, heat distortion, volcanic glow.",         emoji: "🌋" },
    { id: "clouds",   name: "Clouds Above Earth", desc: "Flying through soft clouds with sun rays.",               emoji: "☁️" },
    { id: "cyber",    name: "Cyber Energy",       desc: "Plasma fluid, neon grid, electric distortion.",           emoji: "⚡" },
    { id: "blackhole",name: "Black Hole",         desc: "Gravitational lensing and a glowing accretion disk.",     emoji: "🕳️" },
  ];

  // Theme module registry — populated further down. Declared early so
  // setTheme() can resolve modules at boot time (avoids TDZ).
  const THEME_MODULES = {};

  // ---------------------------------------------------------------- runtime
  const state = {
    canvas: null,
    ctx: null,
    w: 0, h: 0,
    t: 0,                   // seconds
    last: performance.now(),
    raf: 0,
    currentId: null,
    currentTheme: null,     // theme module
    fading: null,           // { from, to, start }
    mouse: { x: 0.5, y: 0.5 },
    parallax: { x: 0, y: 0 },
    paused: false,
  };

  // ---------------------------------------------------------------- canvas
  function ensureCanvas() {
    if (state.canvas) return;
    const c = document.createElement("canvas");
    c.id = "wallpaper-canvas";
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "-10",
      pointerEvents: "none",
      display: "block",
      background: "#050505",
    });
    document.body.prepend(c);
    state.canvas = c;
    state.ctx = c.getContext("2d", { alpha: false, desynchronized: true });
    resize();
    window.addEventListener("resize", resize, { passive: true });

    window.addEventListener("mousemove", (e) => {
      state.mouse.x = e.clientX / window.innerWidth;
      state.mouse.y = e.clientY / window.innerHeight;
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      state.paused = document.hidden;
      if (!state.paused) { state.last = performance.now(); loop(); }
    });
  }
  function resize() {
    const c = state.canvas;
    if (!c) return;
    const r = dpr();
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    c.width  = Math.floor(state.w * r);
    c.height = Math.floor(state.h * r);
    c.style.width  = state.w + "px";
    c.style.height = state.h + "px";
    state.ctx.setTransform(r, 0, 0, r, 0, 0);
    if (state.currentTheme && state.currentTheme.resize)
      state.currentTheme.resize(state.w, state.h);
  }

  // ---------------------------------------------------------------- loop
  function loop() {
    if (state.paused) return;
    const now = performance.now();
    const dt  = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    state.t += dt;

    // smooth parallax tracking
    state.parallax.x += ((state.mouse.x - 0.5) * 30 - state.parallax.x) * 0.04;
    state.parallax.y += ((state.mouse.y - 0.5) * 30 - state.parallax.y) * 0.04;

    const ctx = state.ctx;
    ctx.save();
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, state.w, state.h);

    // Cross-fade between previous and new theme.
    if (state.fading) {
      const k = Math.min(1, (now - state.fading.start) / FADE_MS);
      if (state.fading.from) {
        ctx.globalAlpha = 1 - k;
        state.fading.from.draw(ctx, state.w, state.h, dt, state.t, state.parallax);
      }
      ctx.globalAlpha = k;
      state.fading.to.draw(ctx, state.w, state.h, dt, state.t, state.parallax);
      ctx.globalAlpha = 1;
      if (k >= 1) state.fading = null;
    } else if (state.currentTheme) {
      state.currentTheme.draw(ctx, state.w, state.h, dt, state.t, state.parallax);
    }

    ctx.restore();
    state.raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- API
  function setTheme(id, opts) {
    opts = opts || {};
    const def = THEMES.find((t) => t.id === id) || THEMES[0];
    const mod = THEME_MODULES[def.id];
    if (!mod) return;
    ensureCanvas();
    mod.init && mod.init(state.w, state.h);
    if (state.currentTheme && !opts.silent) {
      state.fading = { from: state.currentTheme, to: mod, start: performance.now() };
    } else {
      state.fading = null;
    }
    state.currentTheme = mod;
    state.currentId = def.id;
    try { localStorage.setItem(STORAGE_KEY, def.id); } catch (e) {}
    document.body.dataset.wallpaper = def.id;
    if (state.paused) { state.paused = false; state.last = performance.now(); loop(); }
    // Notify any open gallery to refresh "active" indicator.
    document.dispatchEvent(new CustomEvent("wallpaper:changed", { detail: { id: def.id } }));
  }

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- gallery
  function buildGallery() {
    if (document.getElementById("wallpaperGallery")) return;
    const root = document.createElement("div");
    root.id = "wallpaperGallery";
    root.className = "wpg-backdrop";
    root.hidden = true;
    root.innerHTML = `
      <div class="wpg-modal" role="dialog" aria-modal="true" aria-labelledby="wpgTitle">
        <div class="wpg-header">
          <h2 id="wpgTitle">🪐 Theme Gallery</h2>
          <button class="wpg-close" aria-label="Close gallery">✕</button>
        </div>
        <p class="wpg-sub">Pick a cinematic wallpaper. Your choice is saved and follows you across every page.</p>
        <div class="wpg-grid">
          ${THEMES.map((t) => `
            <button class="wpg-card" data-theme="${t.id}" type="button">
              <canvas class="wpg-preview" width="320" height="180" aria-hidden="true"></canvas>
              <div class="wpg-meta">
                <div class="wpg-name"><span class="wpg-emoji">${t.emoji}</span>${t.name}</div>
                <div class="wpg-desc">${t.desc}</div>
              </div>
              <div class="wpg-tag">SELECTED</div>
            </button>
          `).join("")}
        </div>
        <div class="wpg-footer">
          <span class="wpg-hint">Tip: hover any preview to see it move live.</span>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const close = () => { root.hidden = true; document.body.classList.remove("wpg-open"); };
    root.querySelector(".wpg-close").addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });

    // Render mini previews — same draw fns, smaller surface.
    const previews = [];
    root.querySelectorAll(".wpg-card").forEach((card) => {
      const id = card.dataset.theme;
      const c = card.querySelector(".wpg-preview");
      const ctx = c.getContext("2d");
      const mod = THEME_MODULES[id];
      mod.init && mod.init(c.width, c.height);
      previews.push({ id, ctx, c, mod, t: Math.random() * 10, hover: false });
      card.addEventListener("mouseenter", () => { previews.find((p) => p.id === id).hover = true; });
      card.addEventListener("mouseleave", () => { previews.find((p) => p.id === id).hover = false; });
      card.addEventListener("click", () => {
        setTheme(id);
        root.querySelectorAll(".wpg-card").forEach((x) => x.classList.toggle("selected", x.dataset.theme === id));
      });
    });

    // mark current
    const markActive = (id) => {
      root.querySelectorAll(".wpg-card").forEach((x) => x.classList.toggle("selected", x.dataset.theme === id));
    };
    markActive(state.currentId);
    document.addEventListener("wallpaper:changed", (e) => markActive(e.detail.id));

    // Lightweight RAF for previews (always animate to feel alive).
    let last = performance.now();
    function previewLoop() {
      const now = performance.now();
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      if (!root.hidden) {
        previews.forEach((p) => {
          // Re-init theme dims if needed for this small canvas.
          p.mod.init && p.mod.init(p.c.width, p.c.height);
          p.t += dt;
          const ctx = p.ctx;
          ctx.save();
          ctx.fillStyle = "#050505";
          ctx.fillRect(0, 0, p.c.width, p.c.height);
          p.mod.draw(ctx, p.c.width, p.c.height, dt, p.t, { x: 0, y: 0 });
          ctx.restore();
        });
      }
      requestAnimationFrame(previewLoop);
    }
    previewLoop();

    // Re-init main theme dims after closing (preview init messed with shared state if any).
    document.addEventListener("wallpaper:changed", () => {
      if (state.currentTheme && state.currentTheme.init)
        state.currentTheme.init(state.w, state.h);
    });
  }

  function openGallery() {
    buildGallery();
    const g = document.getElementById("wallpaperGallery");
    g.hidden = false;
    document.body.classList.add("wpg-open");
    // Ensure main theme refits after preview canvases inited it for their size.
    if (state.currentTheme && state.currentTheme.init)
      state.currentTheme.init(state.w, state.h);
  }

  // ---------------------------------------------------------------- magnetic + tilt
  function wireInteractions() {
    // Mouse-tilt for cards (subtle, GPU-only).
    function tiltOn(selector, maxDeg = 8) {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.tiltWired) return;
        el.dataset.tiltWired = "1";
        el.style.transformStyle = "preserve-3d";
        el.style.willChange = "transform";
        el.addEventListener("mousemove", (e) => {
          const r = el.getBoundingClientRect();
          const cx = (e.clientX - r.left) / r.width  - 0.5;
          const cy = (e.clientY - r.top)  / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${(-cy * maxDeg).toFixed(2)}deg) rotateY(${(cx * maxDeg).toFixed(2)}deg) translateY(-4px)`;
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateY(0)";
        });
      });
    }
    function magneticOn(selector, strength = 0.25) {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.magWired) return;
        el.dataset.magWired = "1";
        el.style.willChange = "transform";
        el.addEventListener("mousemove", (e) => {
          const r = el.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) * strength;
          const dy = (e.clientY - (r.top  + r.height / 2)) * strength;
          el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
        });
        el.addEventListener("mouseleave", () => { el.style.transform = "translate(0,0)"; });
      });
    }

    function rewire() {
      if (prefersReduced() || isMobile()) return;
      tiltOn(".lang-card", 10);
      tiltOn(".format-card", 8);
      tiltOn(".bg-style-card", 6);
      tiltOn(".idea-item", 4);
      magneticOn(".btn-primary", 0.2);
    }
    rewire();
    const mo = new MutationObserver(() => rewire());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    ensureCanvas();
    setTheme(getStored() || DEFAULT_THEME, { silent: true });
    state.last = performance.now();
    loop();
    wireInteractions();
    document.body.classList.add("wallpaper-active");

    // Public API on window
    window.WallpaperEngine = {
      setTheme,
      openGallery,
      themes: THEMES.slice(),
      current: () => state.currentId,
    };

    // Wire the "Themes" nav button if present on this page.
    document.querySelectorAll("[data-open-wallpaper]").forEach((b) => {
      b.addEventListener("click", (e) => { e.preventDefault(); openGallery(); });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // ===================================================================
  //  THEME MODULES — each: { init(w,h)?, resize(w,h)?, draw(ctx,w,h,dt,t,parallax) }
  //  Assigned into THEME_MODULES (declared above THEMES) at module load.
  // ===================================================================

  // ---- 1. EARTH FROM SPACE ----------------------------------------------
  THEME_MODULES.earth = (function () {
    let stars = [], lights = [], clouds = [];
    function init(w, h) {
      const N = Math.floor(420 * PERF);
      stars = Array.from({ length: N }, () => ({
        x: rand(0, w), y: rand(0, h),
        r: rand(0.3, 1.6), tw: rand(0, TAU), s: rand(0.4, 1.2),
      }));
      lights = Array.from({ length: Math.floor(140 * PERF) }, () => ({
        lat: rand(-1.2, 1.2),
        lon: rand(0, TAU),
        b: rand(0.4, 1.0),
      }));
      clouds = Array.from({ length: Math.floor(90 * PERF) }, () => ({
        lat: rand(-1.0, 1.0),
        lon: rand(0, TAU),
        r:  rand(0.05, 0.18),
        a:  rand(0.25, 0.55),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      // space + stars
      stars.forEach((s) => {
        const a = 0.5 + 0.5 * Math.sin(t * s.s + s.tw);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.beginPath(); ctx.arc(s.x + par.x * 0.4, s.y + par.y * 0.4, s.r, 0, TAU); ctx.fill();
      });
      // earth
      const cx = w * 0.55 + par.x * 0.6;
      const cy = h * 0.52 + par.y * 0.6;
      const R  = Math.min(w, h) * 0.42;
      // atmosphere glow
      const halo = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.35);
      halo.addColorStop(0, "rgba(80,180,255,0.55)");
      halo.addColorStop(1, "rgba(80,180,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, TAU); ctx.fill();
      // ocean base
      const ocean = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R);
      ocean.addColorStop(0, "#1d4f87");
      ocean.addColorStop(0.6, "#0d2a4d");
      ocean.addColorStop(1, "#04101c");
      ctx.fillStyle = ocean;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

      // continents via simulated lat/lon noise
      const rot = t * 0.05;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      for (let i = 0; i < (60 * PERF | 0); i++) {
        const lat = (i * 73 % 100) / 100 * Math.PI - Math.PI / 2;
        const lon = (i * 137 % 100) / 100 * TAU + rot;
        const sx = Math.cos(lat) * Math.sin(lon);
        const sy = Math.sin(lat);
        const sz = Math.cos(lat) * Math.cos(lon);
        if (sz < 0) continue;
        const px = cx + sx * R;
        const py = cy + sy * R;
        const sz2 = Math.max(0.2, sz);
        ctx.fillStyle = `rgba(46,${110 + (i % 60)},58,${0.55 * sz2})`;
        ctx.beginPath();
        ctx.arc(px, py, rand(R * 0.04, R * 0.11), 0, TAU);
        ctx.fill();
      }
      // city lights on night side
      lights.forEach((l) => {
        const lon = l.lon + rot;
        const sx = Math.cos(l.lat) * Math.sin(lon);
        const sy = Math.sin(l.lat);
        const sz = Math.cos(l.lat) * Math.cos(lon);
        if (sz > -0.1) return; // night side only
        const px = cx + sx * R;
        const py = cy + sy * R;
        ctx.fillStyle = `rgba(255,200,90,${l.b * 0.7})`;
        ctx.beginPath(); ctx.arc(px, py, 1.2, 0, TAU); ctx.fill();
      });
      // clouds
      clouds.forEach((cd) => {
        const lon = cd.lon + rot * 1.6;
        const sx = Math.cos(cd.lat) * Math.sin(lon);
        const sy = Math.sin(cd.lat);
        const sz = Math.cos(cd.lat) * Math.cos(lon);
        if (sz < 0.05) return;
        const px = cx + sx * R;
        const py = cy + sy * R;
        const sz2 = Math.max(0.2, sz);
        const g = ctx.createRadialGradient(px, py, 0, px, py, R * cd.r);
        g.addColorStop(0, `rgba(255,255,255,${cd.a * sz2})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, R * cd.r, 0, TAU); ctx.fill();
      });
      ctx.restore();

      // terminator (day/night shadow)
      const term = ctx.createRadialGradient(cx - R * 0.6, cy - R * 0.6, R * 0.2, cx, cy, R);
      term.addColorStop(0, "rgba(0,0,0,0)");
      term.addColorStop(0.6, "rgba(0,0,0,0)");
      term.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = term;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }
    return { init, draw, resize: init };
  })();

  // ---- 2. DEEP SPACE GALAXY ---------------------------------------------
  THEME_MODULES.galaxy = (function () {
    let stars = [], shooters = [], nebula = [];
    function init(w, h) {
      const N = Math.floor(950 * PERF);
      stars = Array.from({ length: N }, () => {
        const ang = rand(0, TAU);
        const dist = Math.pow(Math.random(), 1.5) * Math.min(w, h) * 0.7;
        return {
          x: w / 2 + Math.cos(ang) * dist,
          y: h / 2 + Math.sin(ang) * dist,
          r: rand(0.3, 1.8), tw: rand(0, TAU), s: rand(0.6, 2.0),
          ang, dist, hue: rand(180, 320),
        };
      });
      shooters = [];
      nebula = Array.from({ length: 5 }, () => ({
        x: rand(0, w), y: rand(0, h),
        r: rand(180, 360),
        hue: rand(220, 320),
        a: rand(0.10, 0.22),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      // nebula clouds
      nebula.forEach((n, i) => {
        const px = n.x + Math.sin(t * 0.05 + i) * 30 + par.x * 0.8;
        const py = n.y + Math.cos(t * 0.04 + i) * 30 + par.y * 0.8;
        const g = ctx.createRadialGradient(px, py, 0, px, py, n.r);
        g.addColorStop(0, `hsla(${n.hue},80%,55%,${n.a})`);
        g.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, n.r, 0, TAU); ctx.fill();
      });
      // galaxy rotation
      const cx = w / 2, cy = h / 2;
      stars.forEach((s) => {
        s.ang += 0.0008 + 0.0006 / Math.max(0.2, s.dist / 200);
        s.x = cx + Math.cos(s.ang) * s.dist + par.x * 0.3;
        s.y = cy + Math.sin(s.ang) * s.dist + par.y * 0.3;
        const a = 0.4 + 0.6 * Math.sin(t * s.s + s.tw);
        ctx.fillStyle = `hsla(${s.hue},70%,80%,${a * 0.9})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      });
      // shooting stars
      if (Math.random() < 0.012) {
        shooters.push({
          x: rand(0, w), y: rand(0, h * 0.6),
          vx: rand(-600, -260), vy: rand(120, 280),
          life: 1.2,
        });
      }
      shooters = shooters.filter((sh) => sh.life > 0);
      shooters.forEach((sh) => {
        sh.life -= dt;
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x + 120, sh.y - 50);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x + 120, sh.y - 50); ctx.stroke();
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 3. NEURAL NETWORK AI ---------------------------------------------
  THEME_MODULES.neural = (function () {
    let nodes = [], pulses = [];
    function init(w, h) {
      const N = Math.floor(75 * PERF);
      nodes = Array.from({ length: N }, () => ({
        x: rand(0, w), y: rand(0, h),
        vx: rand(-12, 12), vy: rand(-12, 12),
        r: rand(2, 4), tw: rand(0, TAU),
      }));
      pulses = [];
    }
    function draw(ctx, w, h, dt, t, par) {
      // hex grid backdrop
      ctx.strokeStyle = "rgba(124,58,237,0.06)";
      ctx.lineWidth = 1;
      const step = 60;
      for (let x = -step; x < w + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x + par.x * 0.2, 0); ctx.lineTo(x + par.x * 0.2, h); ctx.stroke();
      }
      for (let y = -step; y < h + step; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y + par.y * 0.2); ctx.lineTo(w, y + par.y * 0.2); ctx.stroke();
      }
      // node movement
      nodes.forEach((n) => {
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });
      // connections
      const MAX = 170;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < MAX) {
            const k = 1 - d / MAX;
            ctx.strokeStyle = `rgba(0,212,255,${k * 0.35})`;
            ctx.lineWidth = k * 1.3;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (Math.random() < 0.0006 * PERF) {
              pulses.push({ a, b, p: 0, sp: rand(0.6, 1.4) });
            }
          }
        }
      }
      // pulses
      pulses = pulses.filter((p) => p.p < 1);
      pulses.forEach((p) => {
        p.p += dt * p.sp;
        const x = p.a.x + (p.b.x - p.a.x) * p.p;
        const y = p.a.y + (p.b.y - p.a.y) * p.p;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
        g.addColorStop(0, "rgba(245,166,35,0.95)");
        g.addColorStop(1, "rgba(245,166,35,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill();
      });
      // nodes glow
      nodes.forEach((n) => {
        const a = 0.6 + 0.4 * Math.sin(t * 2 + n.tw);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 16);
        g.addColorStop(0, `rgba(0,212,255,${a})`);
        g.addColorStop(1, "rgba(0,212,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, 16, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, TAU); ctx.fill();
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 4. ATOMIC WORLD --------------------------------------------------
  THEME_MODULES.atomic = (function () {
    let orbits = [], particles = [];
    function init(w, h) {
      const R = Math.min(w, h) * 0.35;
      orbits = [
        { a: R,        b: R * 0.35, tilt: 0,             sp: 0.6, hue: 30  },
        { a: R * 0.85, b: R * 0.4,  tilt: Math.PI / 3,   sp: 0.8, hue: 200 },
        { a: R * 0.95, b: R * 0.3,  tilt: -Math.PI / 3,  sp: 0.7, hue: 280 },
        { a: R * 0.7,  b: R * 0.5,  tilt: Math.PI / 2,   sp: 0.9, hue: 320 },
      ];
      particles = Array.from({ length: Math.floor(120 * PERF) }, () => ({
        x: rand(0, w), y: rand(0, h),
        vx: rand(-15, 15), vy: rand(-15, 15),
        r: rand(0.6, 1.8), tw: rand(0, TAU),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      particles.forEach((p) => {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        const a = 0.4 + 0.6 * Math.sin(t * 1.6 + p.tw);
        ctx.fillStyle = `rgba(0,212,255,${a * 0.5})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      });
      const cx = w / 2 + par.x * 0.5, cy = h / 2 + par.y * 0.5;
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
      ng.addColorStop(0, "rgba(255,220,140,1)");
      ng.addColorStop(0.6, "rgba(245,166,35,0.8)");
      ng.addColorStop(1, "rgba(245,166,35,0)");
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff7e2";
      ctx.beginPath(); ctx.arc(cx, cy, 10 + Math.sin(t * 6) * 2, 0, TAU); ctx.fill();
      orbits.forEach((o, i) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(o.tilt + t * 0.05 * (i % 2 ? -1 : 1));
        ctx.strokeStyle = `hsla(${o.hue},80%,65%,0.35)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, o.a, o.b, 0, 0, TAU); ctx.stroke();
        const ang = t * o.sp + i;
        const ex = Math.cos(ang) * o.a;
        const ey = Math.sin(ang) * o.b;
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 18);
        g.addColorStop(0, `hsla(${o.hue},100%,75%,0.95)`);
        g.addColorStop(1, `hsla(${o.hue},100%,75%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex, ey, 18, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.fill();
        ctx.restore();
      });
      const rp = (t * 90) % 240;
      ctx.strokeStyle = `rgba(0,212,255,${0.4 * (1 - rp / 240)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rp, 0, TAU); ctx.stroke();
    }
    return { init, draw, resize: init };
  })();

  // ---- 5. OCEAN WORLD ---------------------------------------------------
  THEME_MODULES.ocean = (function () {
    let bubbles = [], rays = [];
    function init(w, h) {
      bubbles = Array.from({ length: Math.floor(60 * PERF) }, () => ({
        x: rand(0, w), y: rand(h * 0.3, h),
        r: rand(2, 8), sp: rand(15, 40), tw: rand(0, TAU),
      }));
      rays = Array.from({ length: 7 }, () => ({
        x: rand(w * 0.1, w * 0.9), w: rand(60, 160), o: rand(0, TAU),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#063b66");
      g.addColorStop(0.5, "#0a577a");
      g.addColorStop(1, "#031a2a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      rays.forEach((r) => {
        const x = r.x + Math.sin(t * 0.4 + r.o) * 25 + par.x * 0.4;
        const gx = ctx.createLinearGradient(x, 0, x + r.w, h);
        gx.addColorStop(0, "rgba(180,230,255,0.08)");
        gx.addColorStop(0.5, "rgba(180,230,255,0.18)");
        gx.addColorStop(1, "rgba(180,230,255,0)");
        ctx.fillStyle = gx;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + r.w, 0);
        ctx.lineTo(x + r.w * 2.5, h); ctx.lineTo(x - r.w * 1.5, h);
        ctx.closePath(); ctx.fill();
      });
      ctx.strokeStyle = "rgba(180,230,255,0.4)";
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = h * 0.18 + Math.sin(x * 0.012 + t * (1.2 + k * 0.3)) * (10 + k * 6) + k * 18;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      bubbles.forEach((b) => {
        b.y -= b.sp * dt;
        b.x += Math.sin(t * 1.4 + b.tw) * 0.4;
        if (b.y < -10) { b.y = h + 10; b.x = rand(0, w); }
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 6. AURORA BOREALIS -----------------------------------------------
  THEME_MODULES.aurora = (function () {
    let stars = [];
    function init(w, h) {
      stars = Array.from({ length: Math.floor(220 * PERF) }, () => ({
        x: rand(0, w), y: rand(0, h * 0.6), r: rand(0.3, 1.4), tw: rand(0, TAU),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#020616");
      g.addColorStop(0.6, "#040a22");
      g.addColorStop(1, "#0a0f2a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      stars.forEach((s) => {
        const a = 0.5 + 0.5 * Math.sin(t * 1.2 + s.tw);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      });
      const bands = [
        { hue: 145, baseY: h * 0.32, amp: 60, speed: 0.5, opacity: 0.32 },
        { hue: 175, baseY: h * 0.38, amp: 80, speed: 0.7, opacity: 0.28 },
        { hue: 270, baseY: h * 0.42, amp: 50, speed: 0.4, opacity: 0.22 },
        { hue: 110, baseY: h * 0.46, amp: 90, speed: 0.6, opacity: 0.20 },
      ];
      bands.forEach((b, i) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) {
          const y = b.baseY + Math.sin(x * 0.005 + t * b.speed + i) * b.amp +
                              Math.sin(x * 0.012 - t * (b.speed * 0.7) + i) * (b.amp * 0.5) +
                              par.y * 0.3;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const grad = ctx.createLinearGradient(0, b.baseY - b.amp, 0, h);
        grad.addColorStop(0, `hsla(${b.hue},80%,55%,${b.opacity})`);
        grad.addColorStop(0.5, `hsla(${b.hue + 30},80%,45%,${b.opacity * 0.5})`);
        grad.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = grad; ctx.fill();
      });
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      const y0 = h * 0.78;
      for (let x = 0; x <= w; x += 30) {
        const y = y0 + Math.sin(x * 0.01) * 24 + Math.sin(x * 0.04) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
    return { init, draw, resize: init };
  })();

  // ---- 7. LAVA WORLD ----------------------------------------------------
  THEME_MODULES.lava = (function () {
    let embers = [];
    function init(w, h) {
      embers = Array.from({ length: Math.floor(180 * PERF) }, () => ({
        x: rand(0, w), y: rand(0, h),
        r: rand(0.5, 2.5), vy: rand(-40, -15), tw: rand(0, TAU),
        hue: rand(10, 40),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a0500");
      g.addColorStop(0.55, "#3a0a00");
      g.addColorStop(0.85, "#8a2200");
      g.addColorStop(1, "#ff5e00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // cracks
      ctx.strokeStyle = "rgba(255,180,60,0.7)";
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        let y = h * (0.7 + k * 0.05);
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 20) {
          y += Math.sin(x * 0.02 + t * 0.6 + k) * 1.5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // glow pools
      for (let i = 0; i < 4; i++) {
        const px = w * (0.2 + i * 0.2) + Math.sin(t * 0.3 + i) * 30 + par.x * 0.5;
        const py = h * 0.85 + Math.cos(t * 0.4 + i) * 15 + par.y * 0.3;
        const g2 = ctx.createRadialGradient(px, py, 0, px, py, 220);
        g2.addColorStop(0, "rgba(255,180,60,0.6)");
        g2.addColorStop(0.5, "rgba(255,80,0,0.25)");
        g2.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(px, py, 220, 0, TAU); ctx.fill();
      }
      // embers
      embers.forEach((e) => {
        e.y += e.vy * dt;
        e.x += Math.sin(t * 1.2 + e.tw) * 0.6;
        if (e.y < -10) { e.y = h + 10; e.x = rand(0, w); }
        const a = 0.6 + 0.4 * Math.sin(t * 2 + e.tw);
        ctx.fillStyle = `hsla(${e.hue},100%,65%,${a})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 8. CLOUDS WORLD --------------------------------------------------
  THEME_MODULES.clouds = (function () {
    let puffs = [];
    function init(w, h) {
      puffs = Array.from({ length: Math.floor(28 * PERF) }, () => ({
        x: rand(0, w), y: rand(h * 0.1, h * 0.7),
        r: rand(60, 180), sp: rand(4, 14), o: rand(0.1, 0.35), a: rand(0, TAU),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#5b7fb2");
      g.addColorStop(0.6, "#a9c2e2");
      g.addColorStop(1, "#f3d8b6");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // sun
      const sx = w * 0.78 + par.x * 0.2, sy = h * 0.22 + par.y * 0.2;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120);
      sg.addColorStop(0, "rgba(255,230,160,0.9)");
      sg.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 120, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffeaa3";
      ctx.beginPath(); ctx.arc(sx, sy, 35, 0, TAU); ctx.fill();
      // clouds
      puffs.forEach((p) => {
        p.x += p.sp * dt;
        if (p.x - p.r > w) p.x = -p.r;
        const cx = p.x + par.x * 0.2, cy = p.y + par.y * 0.2;
        for (let k = 0; k < 5; k++) {
          const ox = Math.cos(k * 1.2 + p.a) * p.r * 0.4;
          const oy = Math.sin(k * 1.4) * p.r * 0.18;
          const g2 = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, p.r);
          g2.addColorStop(0, `rgba(255,255,255,${p.o})`);
          g2.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(cx + ox, cy + oy, p.r, 0, TAU); ctx.fill();
        }
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 9. CYBER GRID ----------------------------------------------------
  THEME_MODULES.cyber = (function () {
    let buildings = [], lights = [];
    function init(w, h) {
      buildings = Array.from({ length: 60 }, () => ({
        x: rand(0, w), w: rand(30, 80), h: rand(80, 320),
        hue: Math.random() < 0.5 ? 200 : 320,
      }));
      lights = Array.from({ length: Math.floor(120 * PERF) }, () => ({
        x: rand(0, w), y: rand(0, h * 0.5), sp: rand(80, 200), tw: rand(0, TAU),
      }));
    }
    function draw(ctx, w, h, dt, t, par) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a0014");
      g.addColorStop(0.6, "#1a0224");
      g.addColorStop(1, "#2a0840");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // perspective grid
      ctx.strokeStyle = "rgba(0,212,255,0.4)";
      ctx.lineWidth = 1;
      const horizon = h * 0.55 + par.y * 0.2;
      // horizontal lines
      for (let i = 0; i < 14; i++) {
        const y = horizon + Math.pow(i / 13, 2) * (h - horizon);
        const a = 0.2 + (1 - i / 14) * 0.8;
        ctx.strokeStyle = `rgba(0,212,255,${a * 0.7})`;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // vertical lines converging
      for (let x = 0; x <= w; x += 40) {
        ctx.strokeStyle = "rgba(0,212,255,0.25)";
        ctx.beginPath();
        ctx.moveTo(w / 2 + par.x * 0.3, horizon);
        ctx.lineTo(x + par.x * 0.3, h);
        ctx.stroke();
      }
      // sun
      const sx = w / 2 + par.x * 0.3, sy = horizon - 20;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 140);
      sg.addColorStop(0, "rgba(255,80,200,0.8)");
      sg.addColorStop(0.5, "rgba(255,80,200,0.3)");
      sg.addColorStop(1, "rgba(255,80,200,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 140, 0, TAU); ctx.fill();
      // buildings
      buildings.forEach((b) => {
        const by = h - b.h;
        const grad = ctx.createLinearGradient(b.x, by, b.x, h);
        grad.addColorStop(0, `hsla(${b.hue},80%,30%,1)`);
        grad.addColorStop(1, `hsla(${b.hue},80%,10%,1)`);
        ctx.fillStyle = grad;
        ctx.fillRect(b.x, by, b.w, b.h);
        // windows
        for (let yy = by + 8; yy < h - 8; yy += 12) {
          for (let xx = b.x + 4; xx < b.x + b.w - 4; xx += 8) {
            const on = Math.sin(xx * 0.4 + yy * 0.3 + t * 1.5) > 0.3;
            ctx.fillStyle = on ? `hsla(${b.hue},100%,70%,0.8)` : "rgba(0,0,0,0.4)";
            ctx.fillRect(xx, yy, 3, 4);
          }
        }
      });
      // flying lights
      lights.forEach((l) => {
        l.y += l.sp * dt;
        if (l.y > h) { l.y = 0; l.x = rand(0, w); }
        const a = 0.5 + 0.5 * Math.sin(t * 3 + l.tw);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(l.x, l.y, 1.2, 0, TAU); ctx.fill();
      });
    }
    return { init, draw, resize: init };
  })();

  // ---- 10. BLACK HOLE ----------------------------------------------------
  THEME_MODULES.blackhole = (function () {
    let stars = [];
    function init(w, h) {
      stars = Array.from({ length: Math.floor(800 * PERF) }, () => {
        const ang = rand(0, TAU);
        const dist = Math.pow(Math.random(), 2) * Math.min(w, h) * 0.8;
        return { ang, dist, r: rand(0.3, 1.6), hue: rand(40, 60) };
      });
    }
    function draw(ctx, w, h, dt, t, par) {
      // deep space
      const g = ctx.createRadialGradient(w / 2 + par.x * 0.3, h / 2 + par.y * 0.3, 0, w / 2, h / 2, Math.max(w, h));
      g.addColorStop(0, "#1a0800");
      g.addColorStop(0.4, "#08010a");
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const cx = w / 2 + par.x * 0.3, cy = h / 2 + par.y * 0.3;
      // accretion disk stars swirling
      stars.forEach((s) => {
        s.ang += 0.01 / Math.max(0.3, s.dist / 100);
        const x = cx + Math.cos(s.ang) * s.dist;
        const y = cy + Math.sin(s.ang) * s.dist;
        ctx.fillStyle = `hsla(${s.hue},90%,65%,0.85)`;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
      });
      // event horizon glow
      const eg = ctx.createRadialGradient(cx, cy, 30, cx, cy, 110);
      eg.addColorStop(0, "rgba(0,0,0,1)");
      eg.addColorStop(0.4, "rgba(0,0,0,0.85)");
      eg.addColorStop(0.6, "rgba(255,180,60,0.55)");
      eg.addColorStop(0.75, "rgba(245,166,35,0.25)");
      eg.addColorStop(1, "rgba(245,166,35,0)");
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(cx, cy, 110, 0, TAU); ctx.fill();
      // photon ring
      ctx.strokeStyle = "rgba(255,210,120,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, TAU); ctx.stroke();
      // lensing distortion (concentric warped rings)
      for (let i = 0; i < 5; i++) {
        const rr = 80 + i * 30 + Math.sin(t * 2 + i) * 4;
        ctx.strokeStyle = `rgba(255,160,40,${0.15 - i * 0.025})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      }
    }
    return { init, draw, resize: init };
  })();
})();
