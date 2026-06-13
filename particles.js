(function () {
  'use strict';

  var canvas, ctx, w, h, dpr;
  var bgParticles = [];
  var sparkParticles = [];
  var trailParticles = [];
  var animId = null;
  var lastTrailTime = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = window.innerWidth;
    h = window.innerHeight;
    if (canvas) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx && ctx.scale(dpr, dpr);
    }
  }

  function createCanvas(zIndex) {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:' + (zIndex || 99998) + ';';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  /* ── Background floating dust ─────────────────────────── */
  function initBgParticles(count) {
    count = count || 40;
    bgParticles = [];
    for (var i = 0; i < count; i++) {
      bgParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        o: Math.random() * 0.3 + 0.05,
        color: ['rgba(139,92,246,', 'rgba(59,130,246,', 'rgba(0,255,255,'][Math.floor(Math.random() * 3)]
      });
    }
  }

  function updateBgParticles() {
    for (var i = 0; i < bgParticles.length; i++) {
      var p = bgParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
    }
  }

  function drawBgParticles() {
    for (var i = 0; i < bgParticles.length; i++) {
      var p = bgParticles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.o + ')';
      ctx.fill();
    }
  }

  /* ── Spark burst / hover particles ────────────────────── */
  function emitSparks(x, y, count, isBurst) {
    count = count || (isBurst ? 20 : 4);
    var colors = ['#8B5CF6', '#6D28D9', '#3B82F6', '#06B6D4', '#C084FC'];
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = isBurst ? (Math.random() * 4 + 1) : (Math.random() * 1.5 + 0.3);
      sparkParticles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: isBurst ? (Math.random() * 2.5 + 0.8) : (Math.random() * 1.5 + 0.5),
        life: 1,
        decay: isBurst ? (Math.random() * 0.02 + 0.01) : (Math.random() * 0.04 + 0.02),
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: isBurst ? 0.02 : 0
      });
    }
  }

  function emitCelebration(x, y) {
    var colors = ['#8B5CF6', '#3B82F6', '#06B6D4', '#C084FC', '#A78BFA'];
    for (var i = 0; i < 40; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 5 + 1;
      sparkParticles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: Math.random() * 3 + 1,
        life: 1,
        decay: Math.random() * 0.015 + 0.005,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.03
      });
    }
  }

  function updateSparks() {
    for (var i = sparkParticles.length - 1; i >= 0; i--) {
      var p = sparkParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= p.decay;
      if (p.life <= 0) {
        sparkParticles.splice(i, 1);
      }
    }
  }

  function drawSparks() {
    for (var i = 0; i < sparkParticles.length; i++) {
      var p = sparkParticles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Mobile touch trail ───────────────────────────────── */
  function addTrailParticle(x, y) {
    var now = Date.now();
    if (now - lastTrailTime < 30) return;
    lastTrailTime = now;
    var colors = ['#8B5CF6', '#3B82F6', '#06B6D4'];
    trailParticles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      r: Math.random() * 2 + 0.5,
      life: 1,
      decay: Math.random() * 0.06 + 0.03,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
    if (trailParticles.length > 100) trailParticles.splice(0, trailParticles.length - 100);
  }

  function updateTrail() {
    for (var i = trailParticles.length - 1; i >= 0; i--) {
      var p = trailParticles[i];
      p.life -= p.decay;
      if (p.life <= 0) trailParticles.splice(i, 1);
    }
  }

  function drawTrail() {
    for (var i = 0; i < trailParticles.length; i++) {
      var p = trailParticles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life * 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Magic spark wave (directional) ───────────────────── */
  function emitSparkWave(x, y, direction) {
    direction = direction || 1;
    var colors = ['#8B5CF6', '#3B82F6', '#06B6D4', '#C084FC'];
    for (var i = 0; i < 25; i++) {
      var spread = (Math.random() - 0.5) * 1.5;
      var speed = Math.random() * 3 + 2;
      sparkParticles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: direction * speed + spread * 0.5,
        vy: spread,
        r: Math.random() * 2.5 + 1,
        life: 1,
        decay: Math.random() * 0.025 + 0.01,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.01
      });
    }
  }

  /* ── Main loop ────────────────────────────────────────── */
  function loop() {
    ctx.clearRect(0, 0, w, h);
    updateBgParticles();
    drawBgParticles();
    updateSparks();
    drawSparks();
    updateTrail();
    drawTrail();
    animId = requestAnimationFrame(loop);
  }

  function start() {
    if (animId) return;
    createCanvas(99998);
    initBgParticles();
    loop();
    bindUI();
    bindTouch();
  }

  function stop() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  /* ── DOM bindings for spark effects ───────────────────── */
  function bindUI() {
    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('button, a, [role="button"], .niche-card, .idea-card, .step-item');
      if (target) {
        var rect = target.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        emitSparks(cx, cy, 3, false);
      }
    });

    document.addEventListener('click', function (e) {
      var target = e.target.closest('button, a, [role="button"], .niche-card, .idea-card');
      if (target) {
        var rect = target.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        emitSparks(cx, cy, 16, true);
      }
    });

    document.addEventListener('particleCelebrate', function (e) {
      var detail = e.detail || {};
      var x = detail.x || w / 2;
      var y = detail.y || h / 2;
      emitCelebration(x, y);
    });

    document.addEventListener('particleWave', function (e) {
      var detail = e.detail || {};
      emitSparkWave(detail.x || w / 2, detail.y || h / 2, detail.direction || 1);
    });

    document.addEventListener('particleBurst', function (e) {
      var detail = e.detail || {};
      emitSparks(detail.x || w / 2, detail.y || h / 2, detail.count || 20, true);
    });
  }

  function bindTouch() {
    document.addEventListener('touchmove', function (e) {
      var touch = e.touches[0];
      if (touch) addTrailParticle(touch.clientX, touch.clientY);
    }, { passive: true });
  }

  window.Particles = {
    start: start,
    stop: stop,
    emitSparks: emitSparks,
    emitCelebration: emitCelebration,
    emitSparkWave: emitSparkWave,
    addTrailParticle: addTrailParticle
  };

})();
