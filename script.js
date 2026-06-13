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

  function skeleton(count) {
    var html = '<div class="skeleton-wrap">';
    for (var i = 0; i < count; i++) {
      html += '<div class="skeleton-card"><div class="skeleton-line h20 w60" style="margin-bottom:10px;"></div><div class="skeleton-line w80" style="margin-bottom:8px;"></div><div class="skeleton-line w40"></div></div>';
    }
    html += '</div>';
    return html;
  }

  function errorBox(msg) {
    return '<div class="error-box"><div class="error-icon">&#9888;</div><div class="error-msg">' + msg + '</div><button class="btn-ghost" onclick="location.reload()">Try Again</button></div>';
  }

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
    container.innerHTML = skeleton(5);
    try {
      var ideas = await Pipeline.generateIdeas(niche);
      state.ideas = ideas;
      saveProject();
      renderIdeas(ideas);
    } catch (err) {
      container.innerHTML = errorBox(err.message || 'Failed to generate ideas.');
    }
  }

  $('regenIdeasBtn').addEventListener('click', function () {
    if (state.niche) fetchIdeas(state.niche);
  });

  /* ── STEP 3: Script ─────────────────────────────────────── */
  function renderScript(script) {
    var container = $('scriptContainer');
    var wordCount = script.wordCount || (script.script ? script.script.split(/\s+/).length : 0);
    container.innerHTML =
      '<div class="script-title-display">' + (script.title || 'Untitled') + '</div>' +
      '<div class="script-meta">' + wordCount + ' words &middot; ' + state.niche + '</div>' +
      '<div class="script-body">' + (script.script || '') + '</div>' +
      '<div class="script-actions">' +
      '<button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText(document.querySelector(\'.script-body\').textContent); showToast(\'Copied!\')">Copy Script</button>' +
      '<button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText(document.querySelector(\'.script-title-display\').textContent); showToast(\'Title copied!\')">Copy Title</button>' +
      '</div>';
  }

  async function fetchScript(topic, niche) {
    var container = $('scriptContainer');
    container.innerHTML = skeleton(2);
    try {
      var script = await Pipeline.generateScript(topic, niche);
      state.script = script;
      saveProject();
      renderScript(script);
    } catch (err) {
      container.innerHTML = errorBox(err.message || 'Failed to generate script.');
    }
  }

  $('scriptBackBtn').addEventListener('click', function () { showStep(2); });
  $('toThumbnailBtn').addEventListener('click', function () {
    showStep(4);
    fetchThumbnail();
  });

  /* ── STEP 4: Thumbnail ──────────────────────────────────── */
  function renderThumbnail(url, prompt, desc) {
    var container = $('thumbnailContainer');
    container.innerHTML =
      '<div class="thumbnail-prompt-box"><strong>AI Prompt:</strong> ' + prompt + '</div>' +
      (url ? '<img class="thumbnail-image" src="' + url + '" alt="AI Generated Thumbnail" loading="lazy" />' : '') +
      (desc ? '<p style="margin-top:12px; font-size:0.85rem; color:var(--text-secondary);">' + desc + '</p>' : '') +
      '<div class="thumbnail-actions">' +
      (url ? '<a class="btn-primary btn-sm" href="' + url + '" download="scriptspark-thumbnail.png">Download</a>' : '') +
      '<button class="btn-ghost btn-sm" id="regenThumbBtn">Regenerate</button>' +
      '</div>';

    $('regenThumbBtn').addEventListener('click', fetchThumbnail);
  }

  async function fetchThumbnail() {
    var container = $('thumbnailContainer');
    container.innerHTML = skeleton(2);
    try {
      var title = state.script?.title || state.selectedIdea || state.niche;
      var scriptText = state.script?.script || '';
      var result = await Pipeline.generateThumbnailPrompt(title, scriptText);
      state.thumbnailPrompt = result;

      var encodedPrompt = encodeURIComponent(result.prompt);
      var seed = Math.floor(Math.random() * 999999);
      var imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?width=1280&height=720&nologo=true&seed=' + seed;
      state.thumbnailUrl = imageUrl;
      saveProject();

      renderThumbnail(imageUrl, result.prompt, result.visualDescription);
    } catch (err) {
      container.innerHTML = errorBox(err.message || 'Failed to generate thumbnail.');
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
