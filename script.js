/**
 * ScriptSpark — Main application logic.
 * 4-step flow: Niche → Ideas → Script → Thumbnail
 */

(function () {
  'use strict';

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
      var req = indexedDB.open('ScriptSparkDB', 2);
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
  async function generateThumbnail(topic, niche) {
    var container = $('thumbnailContainer');
    container.innerHTML = thumbnailSkeletonHTML;
    if (window.Animations) Animations.showLoading(undefined, 6000);
    if (window.Sound) Sound.click();
    try {
      var promptResponse = await withTimeout(Pipeline.generateImagePrompt(topic, niche), 15000);
      var imagePrompt = (promptResponse || '').trim() + ', YouTube thumbnail style, 16:9, high contrast, dramatic';

      if (typeof puter === 'undefined') throw new Error('Puter.js not loaded. Check your internet connection.');

      var img = await puter.ai.txt2img(imagePrompt);

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
      img.className = 'thumbnail-image';
      img.id = 'thumbnail-img';
      img.alt = 'AI Generated Thumbnail';
      wrap.appendChild(img);

      window.currentThumbnailSrc = img.src;

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
      showErrorCard(container, 'Something went wrong. Please try again.', function () {
        generateThumbnail(topic, niche);
      });
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
        a.download = 'scriptspark-data.json';
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
