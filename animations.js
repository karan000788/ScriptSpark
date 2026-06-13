(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Loading Overlay ─────────────────────────────────── */
  var overlayEl, progressEl, statusEl, percentEl;

  var loadingStages = [
    'Analyzing Niche...',
    'Generating Ideas...',
    'Researching Trends...',
    'Writing Hook...',
    'Building Story...',
    'Optimizing Retention...',
    'Generating Thumbnail...'
  ];

  function createOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'ai-loading-overlay';
    overlayEl.innerHTML =
      '<div class="loading-orb"></div>' +
      '<div class="loading-neural"></div>' +
      '<div class="loading-content">' +
      '<div class="loading-percent">0%</div>' +
      '<div class="loading-progress-track"><div class="loading-progress-fill"></div></div>' +
      '<div class="loading-status">Initializing...</div>' +
      '</div>';
    document.body.appendChild(overlayEl);
    progressEl = overlayEl.querySelector('.loading-progress-fill');
    statusEl = overlayEl.querySelector('.loading-status');
    percentEl = overlayEl.querySelector('.loading-percent');
    overlayEl.style.display = 'none';
  }

  function showLoading(stages, totalDuration) {
    if (prefersReduced) return;
    stages = stages || loadingStages;
    totalDuration = totalDuration || 4000;
    createOverlay();
    overlayEl.style.display = 'flex';
    overlayEl.style.opacity = '0';
    requestAnimationFrame(function () { overlayEl.style.opacity = '1'; });

    var startTime = Date.now();
    var stageInterval = totalDuration / stages.length;
    var currentStage = 0;

    function update() {
      var elapsed = Date.now() - startTime;
      var progress = Math.min(elapsed / totalDuration, 1);
      var pct = Math.round(progress * 100);
      if (percentEl) percentEl.textContent = pct + '%';
      if (progressEl) progressEl.style.width = pct + '%';

      var stageIdx = Math.min(Math.floor(progress * stages.length), stages.length - 1);
      if (stageIdx !== currentStage) {
        currentStage = stageIdx;
        if (statusEl) statusEl.textContent = stages[currentStage];
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    // Animate neural lines
    var neuralEl = overlayEl.querySelector('.loading-neural');
    if (neuralEl) {
      var neuralCanvas = document.createElement('canvas');
      neuralCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      neuralEl.appendChild(neuralCanvas);
      drawNeuralLines(neuralCanvas);
    }

    update();
    window._loadingStart = startTime;
    window._loadingDuration = totalDuration;
  }

  function drawNeuralLines(canvasEl) {
    var ctx = canvasEl.getContext('2d');
    var w = canvasEl.offsetWidth;
    var h = canvasEl.offsetHeight;
    if (!w || !h) return;
    canvasEl.width = w;
    canvasEl.height = h;
    var nodes = [];
    for (var i = 0; i < 8; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
        if (nodes[i].x < 0 || nodes[i].x > w) nodes[i].vx *= -1;
        if (nodes[i].y < 0 || nodes[i].y > h) nodes[i].vy *= -1;
      }
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = 'rgba(139,92,246,' + ((1 - dist / 150) * 0.3) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(nodes[i].x, nodes[i].y, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.5)';
        ctx.fill();
      }
      if (overlayEl && overlayEl.style.display !== 'none') {
        requestAnimationFrame(draw);
      }
    }
    draw();
  }

  function hideLoading() {
    if (!overlayEl) return;
    overlayEl.style.opacity = '0';
    setTimeout(function () {
      overlayEl.style.display = 'none';
    }, 400);
  }

  /* ── Page Transition ─────────────────────────────────── */
  function transitionPage(url) {
    if (prefersReduced) { window.location = url; return; }
    var veil = document.createElement('div');
    veil.style.cssText = 'position:fixed;inset:0;z-index:99997;background:#05050A;pointer-events:none;opacity:0;transition:opacity 0.5s ease;';
    document.body.appendChild(veil);
    requestAnimationFrame(function () {
      veil.style.opacity = '1';
    });
    setTimeout(function () {
      window.location = url;
    }, 500);
  }

  /* ── Typewriter Effect ───────────────────────────────── */
  function typewriter(container, text, speed, cb) {
    if (prefersReduced) {
      container.textContent = text;
      if (cb) cb();
      return;
    }
    speed = speed || 20;
    var index = 0;
    container.textContent = '';
    container.style.visibility = 'visible';

    function type() {
      if (index < text.length) {
        container.textContent += text.charAt(index);
        index++;
        setTimeout(type, speed + Math.random() * 10);
      } else {
        if (cb) cb();
      }
    }
    type();
  }

  /* ── Paragraph reveal ────────────────────────────────── */
  function revealParagraphs(container, paragraphs, delay) {
    if (prefersReduced) {
      container.innerHTML = paragraphs.join('\n\n');
      return;
    }
    delay = delay || 80;
    container.innerHTML = '';
    container.style.visibility = 'visible';
    var total = 0;
    paragraphs.forEach(function (text, i) {
      var p = document.createElement('p');
      p.style.cssText = 'opacity:0;transform:translateY(10px);transition:opacity 0.5s ease, transform 0.5s ease;margin-bottom:12px;';
      p.textContent = text;
      container.appendChild(p);
      setTimeout(function () {
        p.style.opacity = '1';
        p.style.transform = 'translateY(0)';
      }, i * delay);
      total = i;
    });
  }

  /* ── Card stagger entrance ───────────────────────────── */
  function staggerReveal(selector, delay) {
    delay = delay || 60;
    var els = document.querySelectorAll(selector);
    els.forEach(function (el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      setTimeout(function () {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * delay);
    });
  }

  /* ── Scroll reveal (IntersectionObserver) ────────────── */
  function initScrollReveal() {
    if (prefersReduced) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 0.7s cubic-bezier(0.34,1.56,0.64,1), transform 0.7s cubic-bezier(0.34,1.56,0.64,1)';
      observer.observe(el);
    });
  }

  /* ── Button micro-interactions ───────────────────────── */
  function initButtonInteractions() {
    document.querySelectorAll('button, .btn-primary, .btn-ghost').forEach(function (btn) {
      btn.addEventListener('mousedown', function () {
        this.style.transform = 'scale(0.95)';
      });
      btn.addEventListener('mouseup', function () {
        this.style.transform = '';
      });
      btn.addEventListener('mouseleave', function () {
        this.style.transform = '';
      });
    });
  }

  /* ── 3D Card Tilt ────────────────────────────────────── */
  function initCardTilt(selector) {
    if (prefersReduced || ('ontouchstart' in window)) return;
    document.querySelectorAll(selector).forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = this.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        this.style.transform = 'perspective(800px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateY(-4px)';
        this.style.boxShadow = (-x * 20) + 'px ' + (-y * 20) + 'px 40px rgba(139,92,246,0.1)';
      });
      card.addEventListener('mouseleave', function () {
        this.style.transform = '';
        this.style.boxShadow = '';
      });
    });
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    initScrollReveal();
    initButtonInteractions();
  }

  window.Animations = {
    showLoading: showLoading,
    hideLoading: hideLoading,
    transitionPage: transitionPage,
    typewriter: typewriter,
    revealParagraphs: revealParagraphs,
    staggerReveal: staggerReveal,
    initScrollReveal: initScrollReveal,
    initCardTilt: initCardTilt,
    init: init
  };

})();
