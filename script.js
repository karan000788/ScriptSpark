/**
 * Creatora — Main application logic.
 * 4-step flow: Niche → Ideas → Script → Thumbnail
 */

(function () {
  'use strict';

  const DEBUG = true;
  function dbg(...args) {
    if (DEBUG) console.log('[App]', ...args);
  }

  /* ── State ──────────────────────────────────────────────── */
  const state = {
    niche: '',
    ideas: [],
    selectedIdea: null,
    script: null,
    thumbnailPrompt: null,
    thumbnailUrl: null
  };

  /* ── Helpers ────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  function openModal(id) {
    var el = $(id);
    el.hidden = false;
    el.classList.remove('is-open');
    void el.offsetWidth;
    el.classList.add('is-open');
  }

  function closeModal(id) {
    var el = $(id);
    el.classList.remove('is-open');
    setTimeout(function () { el.hidden = true; }, 320);
  }
  function showStep(n) { window.showStep(n); }

  function showToast(msg, duration) {
    duration = duration || 3000;
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, duration);
  }

  function withTimeout(promise, ms) {
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('Request timed out')); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  function showErrorCard(container, msg, retryFn) {
    container.innerHTML =
      '<div class="error-card">' +
      '<div style="font-size:32px; margin-bottom:12px;">&#9888;&#65039;</div>' +
      '<p>' + (msg || 'Something went wrong. Please try again.') + '</p>' +
      '<button class="retry-btn">Try Again</button>' +
      '</div>';
    var btn = container.querySelector('.retry-btn');
    if (btn && retryFn) btn.addEventListener('click', retryFn);
  }

  var ideasSkeletonHTML =
    '<div class="ideas-skeleton">' +
    '<div class="skeleton" style="height:28px; width:60%; margin-bottom:24px;"></div>' +
    Array(5).fill(
      '<div class="skeleton-card" style="padding:16px; margin-bottom:12px; border-radius:12px;">' +
      '<div class="skeleton" style="height:14px; width:40px; margin-bottom:8px;"></div>' +
      '<div class="skeleton" style="height:20px; width:90%;"></div>' +
      '</div>'
    ).join('') +
    '</div>';

  var scriptSkeletonHTML =
    '<div class="script-skeleton">' +
    '<div class="skeleton" style="height:28px; width:50%; margin-bottom:20px;"></div>' +
    '<div class="skeleton" style="height:16px; width:100%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:95%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:88%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:92%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:80%; margin-bottom:24px;"></div>' +
    '<div class="skeleton" style="height:16px; width:100%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:91%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:85%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:95%; margin-bottom:24px;"></div>' +
    '<div class="skeleton" style="height:16px; width:78%; margin-bottom:10px;"></div>' +
    '<div class="skeleton" style="height:16px; width:90%;"></div>' +
    '</div>';

  var thumbnailSkeletonHTML =
    '<div class="thumbnail-skeleton">' +
    '<div class="skeleton" style="height:28px; width:45%; margin-bottom:20px; margin-inline:auto;"></div>' +
    '<div class="skeleton" style="width:100%; aspect-ratio:16/9; border-radius:12px; margin-bottom:16px;"></div>' +
    '<div style="display:flex; gap:12px; justify-content:center;">' +
    '<div class="skeleton" style="height:44px; width:140px; border-radius:8px;"></div>' +
    '<div class="skeleton" style="height:44px; width:140px; border-radius:8px;"></div>' +
    '</div>' +
    '</div>';

  /* ── IndexedDB for projects ─────────────────────────────── */
  var db = null;
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('CreatoraDB', 2);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveProject() {
    if (!db) return;
    var store = db.transaction('projects', 'readwrite').objectStore('projects');
    store.put({
      id: 'current',
      niche: state.niche,
      ideas: state.ideas,
      selectedIdea: state.selectedIdea,
      script: state.script,
      thumbnailPrompt: state.thumbnailPrompt,
      thumbnailUrl: state.thumbnailUrl,
      updatedAt: Date.now()
    });
  }

  function loadProject() {
    if (!db) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var store = db.transaction('projects', 'readonly').objectStore('projects');
      var req = store.get('current');
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  }

  function loadProjectsList() {
    if (!db) return Promise.resolve([]);
    return new Promise(function (resolve) {
      var store = db.transaction('projects', 'readonly').objectStore('projects');
      var req = store.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { resolve([]); };
    });
  }

  function deleteProject(id) {
    if (!db) return;
    var store = db.transaction('projects', 'readwrite').objectStore('projects');
    store.delete(id);
  }

  /* ── Settings ───────────────────────────────────────────── */
  function loadSettings() {
    $('groqKey').value = Pipeline.getApiKey() || '';
    $('langSelect').value = Pipeline.getLang() || 'en';
  }

  function openSettings() {
    loadSettings();
    openModal('settingsModal');
  }

  function saveSettings() {
    var key = $('groqKey').value.trim();
    var lang = $('langSelect').value;
    try {
      localStorage.setItem('ss-groq-key', key);
      localStorage.setItem('ss-lang', lang);
    } catch (e) { }
    closeModal('settingsModal');
    showToast('Settings saved');
  }

  /* ── Projects Modal ─────────────────────────────────────── */
  async function openProjects() {
    var list = await loadProjectsList();
    var container = $('projectsList');
    if (!list.length) {
      container.innerHTML = '<p class="modal-hint">No saved projects yet.</p>';
    } else {
      container.innerHTML = list.map(function (p) {
        var d = new Date(p.updatedAt || 0);
        var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        return '<div class="project-card" data-pid="' + p.id + '"><div class="project-title">' + (p.selectedIdea || p.niche || 'Untitled') + '</div><div class="project-meta">' + (p.niche || '') + ' &middot; ' + dateStr + '</div></div>';
      }).join('');
      container.querySelectorAll('.project-card').forEach(function (card) {
        card.addEventListener('click', function () {
          closeModal('projectsModal');
          restoreProject(list.find(function (p) { return p.id === card.dataset.pid; }));
        });
      });
    }
    openModal('projectsModal');
  }

  async function restoreProject(p) {
    if (!p) return;
    state.niche = p.niche || '';
    state.ideas = p.ideas || [];
    state.selectedIdea = p.selectedIdea || null;
    state.script = p.script || null;
    state.thumbnailPrompt = p.thumbnailPrompt || null;
    state.thumbnailUrl = p.thumbnailUrl || null;

    if (state.script) {
      renderScript(state.script);
      showStep(3);
    } else if (state.ideas.length) {
      renderIdeas(state.ideas);
      showStep(2);
    } else if (state.niche) {
      showStep(2);
      fetchIdeas(state.niche);
    } else {
      showStep(1);
    }
  }

  /* ── STEP 1: Niche Selection ────────────────────────────── */
  $('nicheGrid').addEventListener('click', function (e) {
    var card = e.target.closest('.niche-card');
    if (!card) return;
    document.querySelectorAll('.niche-card').forEach(function (c) { c.classList.remove('selected'); });
    card.classList.add('selected');
    state.niche = card.dataset.niche;
    saveProject();
    showStep(2);
    fetchIdeas(state.niche);
  });

  /* ── STEP 2: Topic Ideas ────────────────────────────────── */
  function renderIdeas(ideas) {
    var container = $('ideasContainer');
    container.innerHTML = '<div class="ideas-list">' + ideas.map(function (idea, i) {
      return '<div class="idea-card' + (state.selectedIdea === idea.title ? ' selected' : '') + '" data-idx="' + i + '"><div class="idea-num">' + (i + 1) + '</div><div><div class="idea-title">' + idea.title + '</div><div class="idea-reason">' + (idea.whyViral || '') + '</div></div></div>';
    }).join('') + '</div>';

    container.querySelectorAll('.idea-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = parseInt(card.dataset.idx);
        state.selectedIdea = ideas[idx].title;
        saveProject();
        showStep(3);
        fetchScript(ideas[idx].title, state.niche);
      });
    });
  }

  async function fetchIdeas(niche) {
    var container = $('ideasContainer');
    container.innerHTML = ideasSkeletonHTML;
    if (window.Animations) Animations.showLoading(undefined, 3000);
    if (window.Sound) Sound.click();
    try {
      var ideas = await withTimeout(Pipeline.generateIdeas(niche), 15000);
      state.ideas = ideas;
      saveProject();
      renderIdeas(ideas);
      if (window.Animations) Animations.hideLoading();
      if (window.Sound) Sound.success();
      document.dispatchEvent(new CustomEvent('scriptGenerated'));
    } catch (err) {
      if (window.Animations) Animations.hideLoading();
      showErrorCard(container, 'Something went wrong. Please try again.', function () { fetchIdeas(niche); });
    }
  }

  $('regenIdeasBtn').addEventListener('click', function () {
    if (state.niche) fetchIdeas(state.niche);
  });

  /* ── STEP 3: Script ─────────────────────────────────────── */
  function renderScript(script) {
    var container = $('scriptContainer');
    var wordCount = script.wordCount || (script.script ? script.script.split(/\s+/).length : 0);
    var scriptText = script.script || '';
    var paragraphs = scriptText.split('\n').filter(function (p) { return p.trim(); });
    container.innerHTML =
      '<div class="script-title-display">' + (script.title || 'Untitled') + '</div>' +
      '<div class="script-meta">' + wordCount + ' words &middot; ' + state.niche + '</div>' +
      '<div class="script-body script-typewriter" id="scriptBody"></div>' +
      '<div class="script-actions">' +
      '<button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText(document.querySelector(\'.script-body\').textContent); showToast(\'Copied!\')">Copy Script</button>' +
      '<button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText(document.querySelector(\'.script-title-display\').textContent); showToast(\'Title copied!\')">Copy Title</button>' +
      '</div>';
    if (window.Animations && window.Animations.revealParagraphs) {
      Animations.revealParagraphs($('scriptBody'), paragraphs, 60);
    } else {
      $('scriptBody').textContent = scriptText;
    }
  }

  async function fetchScript(topic, niche) {
    var container = $('scriptContainer');
    container.innerHTML = scriptSkeletonHTML;
    if (window.Animations) Animations.showLoading(undefined, 5000);
    if (window.Sound) Sound.click();
    try {
      var script = await withTimeout(Pipeline.generateScript(topic, niche), 15000);
      state.script = script;
      saveProject();
      renderScript(script);
      if (window.Animations) Animations.hideLoading();
      if (window.Sound) Sound.success();
      document.dispatchEvent(new CustomEvent('scriptGenerated'));
    } catch (err) {
      if (window.Animations) Animations.hideLoading();
      showErrorCard(container, 'Something went wrong. Please try again.', function () { fetchScript(topic, niche); });
    }
  }

  $('scriptBackBtn').addEventListener('click', function () { showStep(2); });
  $('toThumbnailBtn').addEventListener('click', function () {
    showStep(4);
    generateThumbnail(state.selectedIdea || state.script?.title || state.niche, state.niche);
  });

  /* ── STEP 4: Thumbnail (Puter.js) ────────────────────────── */
  function extractImageUrl(response) {
    dbg('Puter raw response type:', typeof response, response);

    if (!response) return null;

    /* Direct HTMLImageElement */
    if (response instanceof HTMLImageElement) {
      dbg('Response is HTMLImageElement, src:', response.src);
      return response.src;
    }

    /* Object with src/url/image_url */
    if (typeof response === 'object') {
      if (response.src) { dbg('Extracted src:', response.src); return response.src; }
      if (response.url) { dbg('Extracted url:', response.url); return response.url; }
      if (response.image_url) { dbg('Extracted image_url:', response.image_url); return response.image_url; }

      /* Try toString */
      var str = String(response);
      if (str.startsWith('http')) { dbg('Extracted via toString:', str); return str; }
    }

    /* Plain string URL */
    if (typeof response === 'string') {
      if (response.startsWith('http') || response.startsWith('data:')) {
        dbg('Response is string URL:', response);
        return response;
      }
    }

    dbg('Could not extract image URL from:', response);
    return null;
  }

  async function generateThumbnail(topic, niche) {
    var container = $('thumbnailContainer');
    container.innerHTML = thumbnailSkeletonHTML;
    if (window.Animations) Animations.showLoading([
      'Generating Image Prompt...',
      'Signing in to Puter...',
      'Creating Thumbnail...'
    ], 8000);
    if (window.Sound) Sound.click();
    try {
      var promptResponse = await withTimeout(Pipeline.generateImagePrompt(topic, niche), 15000);
      var imagePrompt = (promptResponse || '').trim() + ', YouTube thumbnail style, 16:9, high contrast, dramatic';
      dbg('Image prompt:', imagePrompt);

      if (typeof puter === 'undefined') {
        throw new Error('Puter.js SDK not loaded. Check your internet connection or ad blocker.');
      }

      var statusEl = document.querySelector('.loading-status');

      /* Sign in first (opens popup if needed) */
      if (statusEl) statusEl.textContent = 'Signing in to Puter...';
      var signedIn = false;
      try {
        var user = await withTimeout(puter.signIn(), 30000);
        signedIn = !!user;
        dbg('Puter sign-in result:', user);
      } catch (signInErr) {
        dbg('Puter sign-in error:', signInErr);
        /* Continue anyway — txt2img may trigger its own sign-in */
      }

      if (!signedIn) {
        dbg('Puter sign-in not detected, proceeding with txt2img anyway');
      }

      if (statusEl) statusEl.textContent = 'Creating thumbnail...';

      var puterResponse;
      try {
        puterResponse = await withTimeout(puter.ai.txt2img(imagePrompt), 60000);
      } catch (puterErr) {
        dbg('Puter call error:', puterErr);
        if (statusEl) statusEl.textContent = 'Retrying...';
        await new Promise(function (r) { setTimeout(r, 1000); });
        puterResponse = await withTimeout(puter.ai.txt2img(imagePrompt), 60000);
      }

      dbg('Puter response:', puterResponse);

      var imageUrl = extractImageUrl(puterResponse);
      dbg('Extracted image URL:', imageUrl);

      if (!imageUrl) {
        throw new Error('Puter returned an unexpected response. Try again.');
      }

      if (window.Animations) Animations.hideLoading();
      if (window.Sound) Sound.chime();
      document.dispatchEvent(new CustomEvent('thumbnailGenerated'));

      container.innerHTML =
        '<div class="thumbnail-img-wrap" id="thumbImgWrap"></div>' +
        '<div class="thumbnail-actions">' +
        '<button class="btn-primary btn-sm" id="download-btn">Download</button>' +
        '<button class="btn-ghost btn-sm" id="regenThumbBtn">Regenerate</button>' +
        '</div>';

      var wrap = $('thumbImgWrap');
      var img = document.createElement('img');
      img.className = 'thumbnail-image';
      img.id = 'thumbnail-img';
      img.alt = 'AI Generated Thumbnail';
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;

      img.onerror = function () {
        dbg('Image load error for:', imageUrl);
        showErrorCard(container, 'Image loaded but could not display. URL may be blocked by CSP. Try regenerating.', function () {
          generateThumbnail(topic, niche);
        });
      };

      img.onload = function () {
        dbg('Image loaded successfully:', imageUrl);
      };

      wrap.appendChild(img);
      window.currentThumbnailSrc = imageUrl;

      $('download-btn').addEventListener('click', function () {
        if (!window.currentThumbnailSrc) return;
        var a = document.createElement('a');
        a.href = window.currentThumbnailSrc;
        a.download = 'thumbnail.jpg';
        a.click();
      });

      $('regenThumbBtn').addEventListener('click', function () {
        generateThumbnail(topic, niche);
      });

    } catch (err) {
      if (window.Animations) Animations.hideLoading();
      console.error('Thumbnail error:', err);
      dbg('Full error:', err.message, err.stack);

      var msg = err.message || 'Unknown error.';
      var promptText = '';

      /* Try to get the prompt even if image failed */
      try {
        promptText = await Pipeline.generateImagePrompt(topic, niche);
      } catch (_) { /* ignore */ }

      if (err.message && err.message.includes('timed out')) {
        msg = 'Puter took too long. The sign-in popup may be blank or blocked. Please allow popups, disable ad blockers, and try again.';
      } else if (err.message && err.message.includes('Puter.js')) {
        msg = err.message;
      } else if (err.message && err.message.includes('extract image URL') || err.message.includes('unexpected response')) {
        msg = 'Puter returned an unexpected response. The service may be down. Try again later.';
      } else if (err.message && err.message.includes('CSP')) {
        msg = 'Image blocked by Content Security Policy. Trying alternative method...';
      } else if (err.message && err.message.includes('signIn')) {
        msg = 'Puter sign-in failed. The popup may be blocked. Please allow popups for this site.';
      } else if (err.message && err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
        msg = 'Network error. Check your internet connection and try again.';
      }

      /* Show error with prompt fallback */
      container.innerHTML =
        '<div class="error-card">' +
        '<div style="font-size:28px; margin-bottom:8px;">&#9888;&#65039;</div>' +
        '<p style="font-size:0.9rem; margin-bottom:12px;">' + msg + '</p>' +
        (promptText ? '<div style="background:var(--bg-input); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px; text-align:left;"><div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px;">Generated prompt (use manually):</div><div style="font-size:0.8rem; color:var(--text-dim); word-break:break-word;">' + promptText + '</div></div>' : '') +
        '<div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">' +
        (promptText ? '<button class="btn-ghost btn-sm" id="copyPromptBtn">Copy Prompt</button>' : '') +
        '<button class="retry-btn" id="retryThumbBtn">Try Again</button>' +
        '</div>' +
        '</div>';

      var retryBtn = document.getElementById('retryThumbBtn');
      if (retryBtn) retryBtn.addEventListener('click', function () {
        generateThumbnail(topic, niche);
      });

      var copyBtn = document.getElementById('copyPromptBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(promptText);
          showToast('Prompt copied to clipboard!');
        });
      }
    }
  }

  $('thumbBackBtn').addEventListener('click', function () { showStep(3); });
  $('newProjectBtn').addEventListener('click', function () {
    state.niche = '';
    state.ideas = [];
    state.selectedIdea = null;
    state.script = null;
    state.thumbnailPrompt = null;
    state.thumbnailUrl = null;
    document.querySelectorAll('.niche-card').forEach(function (c) { c.classList.remove('selected'); });
    showStep(1);
  });

  /* ── Modal Controls ─────────────────────────────────────── */
  $('settingsLink').addEventListener('click', function (e) { e.preventDefault(); openSettings(); });
  $('closeSettings').addEventListener('click', function () { closeModal('settingsModal'); });
  $('saveSettingsBtn').addEventListener('click', saveSettings);
  $('myProjectsLink').addEventListener('click', function (e) { e.preventDefault(); openProjects(); });
  $('closeProjects').addEventListener('click', function () { closeModal('projectsModal'); });
  $('newProjectBtnModal').addEventListener('click', function () {
    closeModal('projectsModal');
    state.niche = '';
    state.ideas = [];
    state.selectedIdea = null;
    state.script = null;
    state.thumbnailPrompt = null;
    state.thumbnailUrl = null;
    document.querySelectorAll('.niche-card').forEach(function (c) { c.classList.remove('selected'); });
    showStep(1);
  });

  /* Backdrop click-to-close */
  $('settingsModal').addEventListener('click', function (e) { if (e.target === this) closeModal('settingsModal'); });
  $('projectsModal').addEventListener('click', function (e) { if (e.target === this) closeModal('projectsModal'); });

  /* Data export / clear */
  $('exportDataBtn').addEventListener('click', function () {
    openProjects().then(function () {
      loadProjectsList().then(function (list) {
        var blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'creatora-data.json';
        a.click();
      });
    });
  });
  $('clearDataBtn').addEventListener('click', function () {
    if (confirm('Clear all saved data?')) {
      try { localStorage.clear(); } catch (e) { }
      if (db) {
        var store = db.transaction('projects', 'readwrite').objectStore('projects');
        store.clear();
      }
      location.reload();
    }
  });

  $('toggleGroqKey').addEventListener('click', function () {
    var inp = $('groqKey');
    if (inp.type === 'password') { inp.type = 'text'; this.textContent = 'Hide'; }
    else { inp.type = 'password'; this.textContent = 'Show'; }
  });

  /* ── Init ───────────────────────────────────────────────── */
  openDB().then(async function () {
    var saved = await loadProject();
    if (saved && saved.niche) {
      restoreProject(saved);
    } else {
      showStep(1);
    }
  });

  /* ── Stepper click navigation ───────────────────────────── */
  document.querySelectorAll('.step-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var step = parseInt(item.dataset.step);
      if (step >= 1 && step <= 4) showStep(step);
    });
  });

  /* ── Keyboard shortcut ──────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal('settingsModal');
      closeModal('projectsModal');
    }
  });

})();
