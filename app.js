(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const views = document.querySelectorAll('.view');
  let currentView = null;

  let appState = {
    user: null,
    profile: null,
    channelType: null,
    contentType: null,
    has50Videos: null,
    channelAnalysis: null,
    creatorProfile: null,
    marketIntelligence: null,
    niche: null,
    channelName: null,
    channelCategory: null,
    language: null,
    ideas: [],
    selectedIdea: null,
    script: null,
    originalScript: null,
    thumbnail: null
  };

  const CATEGORY_EMOJI_MAP = {
    'Dark Mystery': '😱',
    'Finance': '💰',
    'Gaming': '🎮',
    'True Crime': '🔪',
    'Tech': '💻',
    'Technology': '💻',
    'Motivation': '🔥',
    'Education': '📚',
    'History': '🏛',
    'Food': '🍳',
    'Travel': '✈️',
    'Health': '💪',
    'Relationships': '💕',
    'Business': '💼',
    'Mythology': '⚔️',
    'Astrology': '⭐',
    'Science': '🔬',
    'General': '🎬'
  };

  const CATEGORY_NICHE_MAP = {
    'Dark Mystery': 'dark mystery',
    'Finance': 'finance',
    'Gaming': 'gaming',
    'True Crime': 'true crime',
    'Tech': 'tech',
    'Technology': 'tech',
    'Motivation': 'motivation',
    'Education': 'education',
    'History': 'history',
    'Food': 'food',
    'Travel': 'travel',
    'Health': 'health',
    'Relationships': 'relationships',
    'Business': 'business',
    'Mythology': 'mythology',
    'Astrology': 'astrology',
    'Science': 'science',
    'General': null
  };

  function showToast(msg, duration = 3000) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), duration);
  }

  function showView(id, pushState = true) {
    views.forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none';
    });
    const el = $(id);
    if (el) {
      el.style.display = 'block';
      el.classList.add('active');
      el.style.animation = 'slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
      currentView = id;
      if (pushState) {
        history.pushState({ view: id }, '', `#${id}`);
      }
    }
  }

  function showError(container, msg, retryFn) {
    if (!container) return;
    container.innerHTML = `
      <div class="error-card">
        <div style="font-size:32px;margin-bottom:12px;">&#9888;&#65039;</div>
        <p>${msg || 'Something went wrong.'}</p>
        ${retryFn ? '<button class="retry-btn">Try Again</button>' : ''}
      </div>`;
    if (retryFn) {
      container.querySelector('.retry-btn')?.addEventListener('click', retryFn);
    }
  }

  function showLoading(container) {
    if (!container) return;
    container.innerHTML = '<div class="skeleton" style="height:200px;width:100%;border-radius:12px;"></div>';
  }

  function showLoader(msg) {
    let el = document.getElementById('appLoaderOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appLoaderOverlay';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
      document.body.appendChild(el);
      const style = document.createElement('style');
      style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }
    el.innerHTML = '<div style="background:#1a1a2e;padding:28px 36px;border-radius:16px;text-align:center;color:#fff;font-size:1rem;box-shadow:0 8px 40px rgba(0,0,0,0.5);"><div style="width:36px;height:36px;border:3px solid #333;border-top-color:#a78bfa;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 14px;"></div>'+msg+'</div>';
    el.style.display = 'flex';
  }
  function hideLoader() {
    const el = document.getElementById('appLoaderOverlay');
    if (el) el.style.display = 'none';
  }

  function withTimeout(promise, ms = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))
    ]);
  }

  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    el.classList.remove('is-open');
    void el.offsetWidth;
    el.classList.add('is-open');
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('is-open');
    setTimeout(() => { el.hidden = true; }, 320);
  }

  // ─── AUTH ────────────────────────────────────────────────
  async function checkAuth() {
    if (API.isLoggedIn()) {
      try {
        const data = await API.getMe();
        appState.user = data.user;
        appState.profile = data.profile;
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const remember = $('rememberMe')?.checked || false;
    const btn = $('loginBtn');
    if (!email || !password) return showToast('Please fill in all fields');

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      await API.login(email, password, remember);
      appState.user = (await API.getMe()).user;
      showToast('Welcome back!');
      navigateAfterAuth();
    } catch (err) {
      showToast(err.message || 'Login failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const email = $('signupEmail').value.trim();
    const password = $('signupPassword').value;
    const displayName = $('signupName').value.trim() || email.split('@')[0];
    const remember = $('rememberMeSignup')?.checked || false;
    const btn = $('signupBtn');

    if (!email || !password) return showToast('Please fill in all fields');
    if (password.length < 6) return showToast('Password must be at least 6 characters');

    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const data = await API.signup(email, password, displayName, remember);
      if (data.session) {
        appState.user = (await API.getMe()).user;
        showToast('Account created!');
        navigateAfterAuth();
      } else {
        showToast(data.message || 'Check your email for confirmation');
        showView('view-login');
      }
    } catch (err) {
      showToast(err.message || 'Signup failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

  async function handleLogout() {
    await API.logout();
    appState = {
      user: null, profile: null, channelType: null, contentType: null,
      has50Videos: null, channelAnalysis: null, creatorProfile: null,
      marketIntelligence: null, niche: null, channelName: null, channelCategory: null, language: null,
      ideas: [], selectedIdea: null, script: null, originalScript: null,
      thumbnail: null, _recentTitles: null, _recentThumbnails: null,
      _channelVideoCount: null, _channelThumbnailStyle: null, _thumbShortText: null
    };
    showView('view-login');
    showToast('Logged out');
  }

  function navigateAfterAuth() {
    const saved = localStorage.getItem('ss-last-view');
    if (saved) {
      localStorage.removeItem('ss-last-view');
      showView(saved);
    } else {
      showView('view-channel-url');
    }
    updateNavbar();
  }

  function showAuthForm(form) {
    $('loginForm').style.display = form === 'login' ? 'block' : 'none';
    $('signupForm').style.display = form === 'signup' ? 'block' : 'none';
    $('authToggle').innerHTML = form === 'login'
      ? "Don't have an account? <a href='#' id='switchToSignup'>Sign up</a>"
      : "Already have an account? <a href='#' id='switchToLogin'>Sign in</a>";
    document.getElementById('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signup'); });
    document.getElementById('switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
  }

  function updateNavbar() {
    const authSection = $('navbarAuth');
    const userSection = $('navbarUser');
    if (appState.user) {
      if (authSection) authSection.style.display = 'none';
      if (userSection) {
        userSection.style.display = 'flex';
        const name = userSection.querySelector('.user-name');
        if (name) name.textContent = appState.profile?.display_name || appState.user.email || 'User';
      }
    } else {
      if (authSection) authSection.style.display = 'flex';
      if (userSection) userSection.style.display = 'none';
    }
  }

  // ─── CONTENT TYPE ────────────────────────────────────────
  function initContentType() {
    document.querySelectorAll('.content-type-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.content-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        appState.contentType = card.dataset.type;
        setTimeout(() => {
          if (appState.niche || appState.channelCategory || appState.channelAnalysis) {
            showView('view-ideas');
            fetchIdeas();
          } else {
            showView('view-niche-analysis');
          }
        }, 300);
      });
    });
  }

  // ─── CHANNEL URL (Primary Entry) ─────────────────────────
  async function handleChannelAnalysis(e) {
    e.preventDefault();
    const url = $('channelUrl').value.trim();
    const name = $('channelName').value.trim();
    if (!url) return showToast('Channel URL is required');

    appState.channelName = name || appState.channelName || null;

    const results = $('channelResults');
    results.innerHTML = `
      <div class="analysis-loading">
        <div class="loading-spinner"></div>
        <div class="loading-steps">
          <div class="loading-step active">Fetching Channel Data...</div>
          <div class="loading-step">Analyzing Performance...</div>
          <div class="loading-step">Finding Best Videos...</div>
          <div class="loading-step">Building Creator Profile...</div>
        </div>
      </div>`;

    const btn = $('analyzeBtn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      const data = await withTimeout(API.analyzeChannel(url, name, appState.contentType), 60000);
      appState.channelAnalysis = data.analysis;
      appState.creatorProfile = data.creatorProfile;
      appState.channelName = appState.channelName || data.analysis.channelInfo.name;

      if (!appState.channelCategory) {
        const autoFetchData = await API.autoFetchChannel(url).catch(() => null);
        if (autoFetchData && autoFetchData.detectedCategory) {
          appState.channelCategory = autoFetchData.detectedCategory;
          appState._recentTitles = autoFetchData.recentTitles || [];
        }
      }

      const a = data.analysis;
      const steps = results.querySelectorAll('.loading-step');
      steps.forEach((s, i) => setTimeout(() => s.classList.add('done'), (i + 1) * 1500));

      setTimeout(() => {
        results.innerHTML = `
          <div class="analysis-card">
            <div class="analysis-header">
              <img src="${a.channelInfo.thumbnail || ''}" alt="" class="analysis-avatar" onerror="this.style.display='none'">
              <div>
                <h3>${a.channelInfo.name}</h3>
                <div class="analysis-meta">
                  <span>&#128065; ${formatNum(a.channelInfo.subscribers)} subscribers</span>
                  <span>&#128196; ${formatNum(a.channelInfo.totalViews)} views</span>
                  <span>&#127916; ${a.channelInfo.totalVideos} videos</span>
                </div>
              </div>
            </div>
            <div class="analysis-stats">
              <div class="stat-box">
                <div class="stat-value">${formatNum(a.performance.averageViews)}</div>
                <div class="stat-label">Avg Views</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${a.performance.engagementRate}%</div>
                <div class="stat-label">Engagement</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${a.performance.uploadFrequency}</div>
                <div class="stat-label">Upload Freq</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${formatNum(a.channelInfo.totalViews)}</div>
                <div class="stat-label">Total Views</div>
              </div>
            </div>
            ${a.viralTopics?.length ? `
              <div class="analysis-section">
                <h4>Viral Topics</h4>
                <div class="tag-list">${a.viralTopics.slice(0, 8).map(t => `<span class="tag">${t}</span>`).join('')}</div>
              </div>` : ''}
            ${a.bestVideos?.length ? `
              <div class="analysis-section">
                <h4>Best Performing Videos</h4>
                <div class="video-list">${a.bestVideos.slice(0, 3).map(v => `
                  <a href="https://youtube.com/watch?v=${v.videoId}" target="_blank" class="video-item">
                    <span class="video-title">${v.title}</span>
                    <span class="video-views">${formatNum(v.views)} views</span>
                  </a>`).join('')}
                </div>
              </div>` : ''}
            <button class="btn-primary" id="proceedFromAnalysis">Continue to Format Selection &#8594;</button>
          </div>`;
        results.querySelector('#proceedFromAnalysis')?.addEventListener('click', () => {
          showView('view-content-type');
        });
      }, 4000);
    } catch (err) {
      showError(results, err.message, () => handleChannelAnalysis(e));
      $('channelFallbackFields').style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Fetch Channel';
    }
  }

  // ─── AUTO FETCH CHANNEL ────────────────────────────────
  let autoFetchTimeout = null;
  function setupAutoFetch(inputId, bannerId) {
    const input = $(inputId);
    if (!input) return;
    input.addEventListener('input', function() {
      clearTimeout(autoFetchTimeout);
      this.dataset.autoFetchDone = 'false';
      $('channelDetectCard').style.display = 'none';
    });
    input.addEventListener('blur', function() {
      const url = this.value.trim();
      if (!url || this.dataset.autoFetchDone === 'true') return;
      clearTimeout(autoFetchTimeout);
      autoFetchTimeout = setTimeout(() => doAutoFetch(url, bannerId), 800);
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const url = this.value.trim();
        if (!url || this.dataset.autoFetchDone === 'true') return;
        clearTimeout(autoFetchTimeout);
        doAutoFetch(url, bannerId);
      }
    });
  }

  async function doAutoFetch(url, bannerId) {
    const banner = $(bannerId);
    if (!banner) return;
    banner.innerHTML = '<div style="padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);text-align:center;font-size:0.85rem;color:var(--text-muted);">🔍 Fetching channel info...</div>';
    try {
      const data = await withTimeout(API.autoFetchChannel(url), 15000);
      appState.channelName = data.name;
      appState.channelCategory = data.detectedCategory;
      appState._channelVideoCount = data.totalVideos || 0;
      if (data.recentTitles && data.recentTitles.length) {
        appState._recentTitles = data.recentTitles;
      }
      if (data.recentThumbnails && data.recentThumbnails.length) {
        appState._recentThumbnails = data.recentThumbnails;
        API.detectThumbnailStyle(data.recentTitles).then(style => {
          appState._channelThumbnailStyle = style;
        }).catch(() => {});
      }
      const catEmoji = CATEGORY_EMOJI_MAP[data.detectedCategory] || '🎬';
      const nicheMatch = CATEGORY_NICHE_MAP[data.detectedCategory];
      if (nicheMatch) appState.niche = nicheMatch;

      banner.innerHTML = '';
      const detectCard = $('channelDetectCard');
      detectCard.style.display = 'block';
      detectCard.innerHTML = `
        <div class="analysis-card" style="padding:20px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:8px;">✅</div>
          <h3 style="margin-bottom:4px;">Channel Detected</h3>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:center;margin:12px 0;font-size:0.9rem;">
            <span>📺 <strong>${data.name}</strong></span>
            <span>🎭 Category: ${catEmoji} ${data.detectedCategory}</span>
            <span>📊 Videos: ${data.totalVideos || 'N/A'} · Subscribers: ${data.subscribers ? formatNum(data.subscribers) : 'N/A'}</span>
          </div>
          ${data.recentTitles?.length ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">Recent: ${data.recentTitles.slice(0, 3).join(' · ')}${data.recentTitles.length > 3 ? '...' : ''}</div>` : ''}
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
            <button class="btn-primary btn-sm" id="confirmChannelBtn">Looks correct? Continue →</button>
            <button class="btn-ghost btn-sm" id="changeChannelBtn">Wrong? Enter manually</button>
          </div>
        </div>`;
      detectCard.querySelector('#confirmChannelBtn').addEventListener('click', () => {
        $('channelUrlFormCard').style.display = 'none';
        detectCard.style.display = 'none';
        banner.innerHTML = `<div style="padding:10px 14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:var(--r);font-size:0.82rem;color:var(--success);display:flex;align-items:center;gap:8px;">✅ ${data.name} · ${catEmoji} ${data.detectedCategory} · ${data.totalVideos || '?'} videos</div>`;
        showView('view-content-type');
      });
      detectCard.querySelector('#changeChannelBtn').addEventListener('click', () => {
        detectCard.style.display = 'none';
        $('channelFallbackFields').style.display = 'block';
      });
      const nameInput = $('channelName');
      if (nameInput && !nameInput.value) nameInput.value = data.name;
    } catch (err) {
      banner.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--r);font-size:0.82rem;color:var(--error);display:flex;align-items:center;gap:8px;">⚠️ Couldn't fetch channel data. You can enter details manually.</div>`;
      $('channelFallbackFields').style.display = 'block';
    }
  }

  // ─── MANUAL FALLBACK / NEW CHANNEL ───────────────────────
  function showManualChannelForm() {
    $('channelUrlFormCard').style.display = 'none';
    $('channelDetectCard').style.display = 'none';
    const fallback = $('channelFallbackFields');
    fallback.style.display = 'block';
    fallback.querySelector('#manualChannelConfirm')?.addEventListener('click', function(e) {
      e.preventDefault();
      const name = $('manualChannelName')?.value.trim();
      const cat = $('manualChannelCategory')?.value;
      if (!name) return showToast('Please enter a channel name');
      appState.channelName = name;
      appState.channelCategory = cat || 'General';
      const nicheMatch = CATEGORY_NICHE_MAP[cat];
      if (nicheMatch) appState.niche = nicheMatch;
      fallback.style.display = 'none';
      showToast('Channel info saved');
      setTimeout(() => {
        if (!appState.contentType) {
          showView('view-content-type');
        } else if (!appState.niche) {
          showView('view-niche-analysis');
        } else {
          showView('view-ideas');
          fetchIdeas();
        }
      }, 300);
    });
    fallback.querySelector('#manualChannelSkip')?.addEventListener('click', function() {
      fallback.style.display = 'none';
      appState.channelCategory = 'General';
      appState.channelName = 'Your Channel';
      showView('view-niche-analysis');
    });
  }

  // ─── NEW CHANNEL ─────────────────────────────────────────
  async function handleNewChannelSubmit(e) {
    e.preventDefault();
    const niche = $('newNiche').value.trim();
    const audience = $('newAudience').value.trim();
    const language = $('newLanguage').value;
    const country = $('newCountry').value.trim();

    if (!niche) return showToast('Please enter your niche');

    appState.niche = niche;
    appState.language = language;
    const results = $('newChannelResults');
    results.innerHTML = `
      <div class="analysis-loading">
        <div class="loading-spinner"></div>
        <div class="loading-steps">
          <div class="loading-step active">Searching Top Channels...</div>
          <div class="loading-step">Analyzing Competitors...</div>
          <div class="loading-step">Finding Viral Patterns...</div>
          <div class="loading-step">Building Market Intelligence...</div>
        </div>
      </div>`;

    const btn = $('newChannelBtn');
    btn.disabled = true;
    btn.textContent = 'Researching...';

    try {
      const data = await withTimeout(API.searchCompetitors(niche, audience, language, country), 60000);
      appState.marketIntelligence = data;

      const mi = data;
      setTimeout(() => {
        results.innerHTML = `
          <div class="analysis-card">
            <div class="analysis-section">
              <h4>Market Intelligence Report</h4>
              <div class="analysis-stats">
                <div class="stat-box">
                  <div class="stat-value">${mi.topChannels?.length || 0}</div>
                  <div class="stat-label">Competitors Found</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${formatNum(mi.marketPatterns?.averageSubscribers || 0)}</div>
                  <div class="stat-label">Avg Subscribers</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${formatNum(mi.marketPatterns?.averageViews || 0)}</div>
                  <div class="stat-label">Avg Views</div>
                </div>
              </div>
            </div>
            ${mi.topChannels?.length ? `
              <div class="analysis-section">
                <h4>Top Competitors</h4>
                <div class="competitor-list">${mi.topChannels.slice(0, 5).map(c => `
                  <div class="competitor-item">
                    <span>${c.name}</span>
                    <span style="color:var(--text-muted);font-size:0.8rem;">${formatNum(c.subscribers)} subs</span>
                  </div>`).join('')}
                </div>
              </div>` : ''}
            ${mi.marketPatterns?.viralTopics?.length ? `
              <div class="analysis-section">
                <h4>Trending Topics in Your Niche</h4>
                <div class="tag-list">${mi.marketPatterns.viralTopics.slice(0, 12).map(t => `<span class="tag">${t}</span>`).join('')}</div>
              </div>` : ''}
            <button class="btn-primary" id="proceedFromIntel">Generate Content Ideas &#8594;</button>
          </div>`;
        results.querySelector('#proceedFromIntel')?.addEventListener('click', () => {
          showView('view-ideas');
          fetchIdeas();
        });
      }, 4000);
    } catch (err) {
      showError(results, err.message, () => handleNewChannelSubmit(e));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Research Niche';
    }
  }

  // ─── IDEAS ───────────────────────────────────────────────
  async function fetchIdeas() {
    const container = $('ideasContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="ideas-skeleton">
        ${Array(5).fill('<div class="skeleton" style="height:60px;margin-bottom:10px;border-radius:12px;"></div>').join('')}
      </div>`;

    try {
      const niche = appState.niche || appState.channelCategory || appState.channelAnalysis?.channelInfo?.name || 'your niche';
      const ideas = await withTimeout(API.generateIdeas({
        niche,
        channelAnalysis: appState.channelAnalysis?.performance,
        marketIntelligence: appState.marketIntelligence?.marketPatterns,
        contentType: appState.contentType,
        count: 5,
        recentTitles: appState._recentTitles || []
      }), 30000);

      appState.ideas = ideas;
      container.innerHTML = `<div class="ideas-list">${ideas.map((idea, i) => `
        <div class="idea-card" data-idx="${i}">
          <div class="idea-num">${i + 1}</div>
          <div>
            <div class="idea-title">${idea.title}</div>
            <div class="idea-reason">${idea.whyViral || idea.hook || ''}</div>
          </div>
        </div>`).join('')}
      </div>`;

      container.querySelectorAll('.idea-card').forEach(card => {
        card.addEventListener('click', () => {
          const idx = parseInt(card.dataset.idx);
          appState.selectedIdea = ideas[idx];
          showView('view-script');
          generateScript(ideas[idx]);
        });
      });
    } catch (err) {
      showError(container, err.message, fetchIdeas);
    }
  }

  // ─── SCRIPT GENERATION ──────────────────────────────────
  function checkScriptQuality(scriptText, channelName) {
    const issues = [];
    if (/have you ever stopped to think/i.test(scriptText)) {
      issues.push('weak generic hook');
    }
    if (channelName && scriptText.toLowerCase().indexOf(channelName.toLowerCase()) === -1) {
      issues.push('channel name not used in CTA');
    }
    const timestamps = (scriptText.match(/\[\d+:\d+\]/g) || []).length;
    if (timestamps > 8) {
      issues.push('too many fake timestamps (' + timestamps + ')');
    }
    const lines = scriptText.split('\n').filter(function(l) { return l.trim(); }).length;
    if (lines < 15) {
      issues.push('too short (' + lines + ' lines)');
    }
    if (!/\bHOOK\b/i.test(scriptText)) issues.push('missing HOOK section');
    if (!/\bCTA\b/i.test(scriptText)) issues.push('missing CTA section');
    return issues;
  }

  async function generateScript(idea) {
    const container = $('scriptContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="script-skeleton">
        <div class="skeleton" style="height:28px;width:60%;margin-bottom:20px;"></div>
        <div class="skeleton" style="height:300px;width:100%;border-radius:12px;"></div>
      </div>`;

    try {
      const lang = appState.language || $('newLanguage')?.value || 'en';
      const channelName = appState.channelName;
      const apiParams = {
        topic: idea.title,
        niche: appState.niche || appState.channelAnalysis?.channelInfo?.name || 'general',
        contentType: appState.contentType,
        channelAnalysis: appState.channelAnalysis?.performance,
        creatorProfile: appState.creatorProfile,
        marketIntelligence: appState.marketIntelligence?.marketPatterns,
        channelName: channelName,
        channelCategory: appState.channelCategory,
        language: lang
      };

      window.Animations?.showLoading([
        'Analyzing Topic...',
        'Researching Trends...',
        'Writing Hook...',
        'Building Story...',
        'Optimizing Script...'
      ], 40000);

      const script = await withTimeout(API.generateScript(apiParams), 45000);
      const issues = checkScriptQuality(script.script || '', channelName);

      window.Animations?.hideLoading();

      if (issues.length > 0) {
        showToast('Quality: ' + issues.join(', ') + ' — regenerating...');
        window.Animations?.showLoading([
          'Analyzing Topic...',
          'Researching Trends...',
          'Writing Hook...',
          'Building Story...',
          'Optimizing Script...'
        ], 40000);
        const retry = await withTimeout(API.generateScript(apiParams), 45000);
        window.Animations?.hideLoading();
        const retryIssues = checkScriptQuality(retry.script || '', channelName);
        if (retryIssues.length > 0) {
          showToast('Regenerated with ' + retryIssues.length + ' issue(s) remaining');
        }
        appState.script = retry;
        appState.originalScript = retry.script || '';
        renderScript(retry);
      } else {
        appState.script = script;
        appState.originalScript = script.script || '';
        renderScript(script);
      }
    } catch (err) {
      window.Animations?.hideLoading();
      showError(container, err.message, () => generateScript(idea));
    }
  }

  function formatTitle(topic, channelName) {
    const catEmoji = CATEGORY_EMOJI_MAP[appState.channelCategory] || '🎬';
    const chName = channelName || appState.channelName || appState.channelAnalysis?.channelInfo?.name || appState.creatorProfile?.bestTopics?.[0] || 'Creatora';
    const prefix = `${topic} ${catEmoji}`;
    const maxPrefixLen = 60;
    const truncatedPrefix = prefix.length > maxPrefixLen ? prefix.slice(0, maxPrefixLen - 1) + '…' : prefix;
    return `${truncatedPrefix} | ${chName}`;
  }

  function estimateReadTime(text, isShorts) {
    if (isShorts) return '~60 sec Shorts';
    const words = text.trim().split(/\s+/).length;
    const mins = Math.max(1, Math.round(words / 150));
    return `~${mins} min video`;
  }

  function renderScript(script) {
    const container = $('scriptContainer');
    if (!container) return;
    const body = script.script || '';
    const wordCount = script.wordCount || body.split(/\s+/).length;
    const readTime = estimateReadTime(body, appState.contentType === 'shorts');
    const isShorts = appState.contentType === 'shorts';
    const channelName = appState.channelName || appState.channelAnalysis?.channelInfo?.name || '';
    const formattedTitle = formatTitle(script.title || 'Untitled', channelName);

    const savedBody = localStorage.getItem('ss-edited-script-body');
    const savedTitle = localStorage.getItem('ss-edited-script-title');
    const displayBody = savedBody || body;
    const displayTitle = savedTitle || formattedTitle;

    container.innerHTML = `
      <div class="script-editor-toolbar">
        <button class="btn-ghost btn-sm script-tool-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
        <button class="btn-ghost btn-sm script-tool-btn" data-cmd="italic" title="Italic"><em>I</em></button>
        <span style="color:var(--border);width:1px;height:20px;background:var(--border);display:inline-block;"></span>
        <button class="btn-ghost btn-sm script-tool-btn" data-cmd="clear" title="Clear Formatting">Clear</button>
        <button class="btn-ghost btn-sm script-tool-btn" data-cmd="reset" title="Reset to Original">Reset</button>
        <span style="flex:1;"></span>
        <span class="script-word-count" style="font-size:0.75rem;color:var(--text-muted);padding:4px 8px;">${wordCount} words · ${readTime}</span>
      </div>
      <div class="script-title-edit" style="margin-bottom:12px;">
        <input type="text" id="scriptTitleInput" value="${displayTitle.replace(/"/g, '&quot;')}" style="width:100%;padding:12px 14px;background:white;border:1px solid #ddd;border-radius:8px;color:#111;font-size:1.05rem;font-weight:700;outline:none;" />
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="font-size:0.7rem;color:var(--text-muted);">Topic chars: <span id="titleCharCount">${(displayTitle.split(' | ')[0] || displayTitle).length}</span>/60 before |</span>
          <span style="font-size:0.7rem;color:var(--text-muted);">Format: Topic ${CATEGORY_EMOJI_MAP[appState.channelCategory] || '🎬'} | ChannelName</span>
        </div>
      </div>
      <textarea id="scriptEditor" style="width:100%;min-height:400px;padding:20px;background:white;color:#111;border:1px solid #ddd;border-radius:8px;font-size:15px;line-height:1.8;font-family:'Inter','SF Mono',monospace;resize:vertical;box-shadow:0 4px 20px rgba(0,0,0,0.08);">${displayBody.replace(/</g, '&lt;')}</textarea>
      <div class="sticky-bottom-bar">
        <button class="btn-ghost btn-sm" id="copyScriptBtn">📋 Copy Script</button>
        <button class="btn-ghost btn-sm" id="copyTitleBtn">📋 Copy Title</button>
        <button class="btn-ghost btn-sm" id="copyTopicBtn">📋 Copy Topic</button>
        <button class="btn-ghost btn-sm" id="factCheckBtn">Fact Check</button>
        <button class="btn-primary btn-sm" id="regenerateIdeasBtn">🔄 Regenerate Ideas</button>
        <button class="btn-primary btn-sm" id="generateThumbBtn">Generate Thumbnail &#8594;</button>
      </div>`;

    const editor = $('scriptEditor');
    const titleInput = $('scriptTitleInput');
    const charCount = $('titleCharCount');

    const autoSave = () => {
      if (editor) localStorage.setItem('ss-edited-script-body', editor.value);
      if (titleInput) localStorage.setItem('ss-edited-script-title', titleInput.value);
      appState.script.script = editor?.value || body;
      if (charCount && titleInput) {
        const beforePipe = titleInput.value.split(' | ')[0] || titleInput.value;
        charCount.textContent = beforePipe.length;
      }
    };

    editor?.addEventListener('input', autoSave);
    titleInput?.addEventListener('input', autoSave);

    container.querySelectorAll('.script-tool-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const cmd = this.dataset.cmd;
        if (cmd === 'bold') {
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const selected = editor.value.substring(start, end);
          if (selected) {
            editor.value = editor.value.substring(0, start) + '**' + selected + '**' + editor.value.substring(end);
            editor.selectionStart = start + 2;
            editor.selectionEnd = end + 2;
            editor.focus();
            autoSave();
          }
        } else if (cmd === 'italic') {
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const selected = editor.value.substring(start, end);
          if (selected) {
            editor.value = editor.value.substring(0, start) + '*' + selected + '*' + editor.value.substring(end);
            editor.selectionStart = start + 1;
            editor.selectionEnd = end + 1;
            editor.focus();
            autoSave();
          }
        } else if (cmd === 'clear') {
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          let selected = editor.value.substring(start, end);
          if (selected) {
            selected = selected.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
            editor.value = editor.value.substring(0, start) + selected + editor.value.substring(end);
            autoSave();
          }
        } else if (cmd === 'reset') {
          if (confirm('Reset to the original generated script? Your edits will be lost.')) {
            editor.value = body;
            titleInput.value = formattedTitle;
            if (charCount) charCount.textContent = formattedTitle.length;
            localStorage.removeItem('ss-edited-script-body');
            localStorage.removeItem('ss-edited-script-title');
            autoSave();
          }
        }
      });
    });

    $('copyScriptBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(editor?.value || body);
      showToast('✅ Script copied!');
    });
    $('copyTitleBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(titleInput?.value || formattedTitle);
      showToast('✅ Title copied!');
    });
    $('copyTopicBtn')?.addEventListener('click', () => {
      const topic = appState.selectedIdea?.title || script.title || '';
      navigator.clipboard.writeText(topic);
      showToast('✅ Topic copied!');
    });
    $('factCheckBtn')?.addEventListener('click', () => factCheck(editor?.value || body, script.title));
    $('generateThumbBtn')?.addEventListener('click', () => {
      showView('view-thumbnail');
      generateThumbnail(titleInput?.value || formattedTitle);
    });
    $('regenerateIdeasBtn')?.addEventListener('click', () => {
      localStorage.removeItem('ss-edited-script-body');
      localStorage.removeItem('ss-edited-script-title');
      showView('view-ideas');
      fetchIdeas();
    });
  }

  // ─── FACT CHECK ──────────────────────────────────────────
  async function factCheck(script, title) {
    const container = $('factCheckResults');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<div class="skeleton" style="height:100px;border-radius:12px;"></div>';

    try {
      const result = await withTimeout(API.factCheck(script, title), 30000);
      container.innerHTML = `
        <div class="fact-check-card">
          <div class="fact-header">
            <span>Fact Check Results</span>
            <span class="fact-score" style="color:${result.accuracy_score > 80 ? 'var(--success)' : result.accuracy_score > 50 ? 'var(--accent)' : 'var(--error)'}">
              ${result.accuracy_score || '?'}/100
            </span>
          </div>
          ${result.questionable_claims?.length ? `
            <div class="fact-section">
              <h5>Claims Needing Verification</h5>
              ${result.questionable_claims.map(c => `
                <div class="fact-claim">
                  <div class="claim-concern">${c.claim || c.concern || ''}</div>
                  ${c.suggested_correction ? `<div class="claim-correction">Suggested: ${c.suggested_correction}</div>` : ''}
                  ${c.suggested_source ? `<div class="claim-source">Source: ${c.suggested_source}</div>` : ''}
                </div>`).join('')}
            </div>` : ''}
          ${result.overall_assessment ? `<p style="margin-top:12px;font-size:0.85rem;color:var(--text-dim);">${result.overall_assessment}</p>` : ''}
        </div>`;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--text-dim);font-size:0.85rem;">Fact-check unavailable: ${err.message}</p>`;
    }
  }

  // ─── THUMBNAIL ───────────────────────────────────────────
  const THUMB_TEXT_COLORS = {
    'Dark Mystery': '#FF0000',
    'True Crime': '#FF4444',
    'Finance': '#00FF88',
    'Gaming': '#00FFFF',
    'Motivation': '#FFD700',
    'Education': '#4A90E2',
    'History': '#C9A84C',
    'Technology': '#00CFFF',
    'Tech': '#00CFFF',
    'Health': '#7ED321',
    'Food': '#FF6B35',
    'Travel': '#F5A623',
    'Relationships': '#FF6B9D',
    'Business': '#FFFFFF',
    'Mythology': '#9B59B6',
    'Astrology': '#C39BD3',
    'General': '#FFFFFF',
    'Default': '#FFFFFF'
  };

  const THUMB_BG_COLORS = {
    'Dark Mystery': '#1a0a2e',
    'True Crime': '#1a0a1a',
    'Finance': '#0a2e1a',
    'Gaming': '#0a0a2e',
    'Motivation': '#2e1a0a',
    'Education': '#0a1a2e',
    'History': '#2e1a0a',
    'Technology': '#0a0a1a',
    'Tech': '#0a0a1a',
    'Health': '#0a2e0a',
    'Food': '#2e1a0a',
    'Travel': '#1a2e2e',
    'Relationships': '#2e0a1a',
    'Business': '#1a1a2e',
    'Mythology': '#1a0a2e',
    'Astrology': '#0a0a2e',
    'General': '#1a1a2e',
    'Default': '#1a1a2e'
  };

  // ─── UNIVERSAL HIGH-CTR YOUTUBE THUMBNAIL GENERATION SYSTEM ──
  // Adaptive 4-option strategy engine — analyzes content then generates optimized prompts

  function buildThumbnailStrategies(topic, channelCategory) {
    var cat = channelCategory || 'Default';

    // ── STEP 1: CONTENT ANALYSIS ─────────────────────────────
    var lowerTopic = topic.toLowerCase();
    var isTech = /tech|ai|computer|software|app|digital|code|program|data|robot|gadget|phone|machine/i.test(lowerTopic);
    var isFinance = /finance|money|invest|stock|crypto|bitcoin|earn|wealth|budget|saving|profit|credit|loan|bank/i.test(lowerTopic);
    var isHealth = /health|fitness|weight|workout|exercise|diet|nutrition|yoga|meditation|muscle|fat/i.test(lowerTopic);
    var isGaming = /gaming|game|gta|pubg|fortnite|minecraft|gamer|gameplay|roblox/i.test(lowerTopic);
    var isEducation = /learn|study|course|skill|tutorial|guide|how to|tips|lesson|class|teach|explain/i.test(lowerTopic);
    var isMystery = /mystery|unsolved|truth|hidden|secret|conspiracy|paranormal|haunted|strange|weird|dark|horror|scary/i.test(lowerTopic);
    var isTravel = /travel|wander|explore|journey|destination|visit|trip|vacation|adventure/i.test(lowerTopic);
    var isSuccess = /success|achieve|win|earn|make money|become|transform|change|growth|result|before|after/i.test(lowerTopic);
    var isFood = /food|cook|recipe|tasty|delicious|meal|kitchen|bake|chef|restaurant/i.test(lowerTopic);
    var isRelationships = /relationship|love|dating|marriage|partner|breakup|friend|social/i.test(lowerTopic);
    var isBusiness = /business|entrepreneur|startup|market|sales|marketing|brand|CEO|founder/i.test(lowerTopic);
    var isScience = /science|physics|chemistry|biology|space|universe|nature|discovery|experiment/i.test(lowerTopic);

    // Determine primary emotion based on topic analysis
    var primaryEmotion, faceExpression, humanDesc, colorScheme, videoType;

    if (isMystery || isScience) {
      primaryEmotion = 'curiosity';
      faceExpression = 'wide curious eyes, slightly raised eyebrows, intrigued expression';
      humanDesc = 'person with curious discovery expression, eyes locked on something off-screen';
      colorScheme = ['#8B5CF6','#0a0a1a','#fff'];
    } else if (isFinance || isSuccess || isBusiness) {
      primaryEmotion = 'achievement';
      faceExpression = 'confident smirk, determined eyes, self-assured expression, power pose';
      humanDesc = 'confident professional with power pose, sharp suit or business attire, successful aura';
      colorScheme = (isFinance ? ['#00FF88','#0a1a0a','#FFD700'] : ['#FFD700','#1a1a2e','#fff']);
    } else if (isTech) {
      primaryEmotion = 'surprise';
      faceExpression = 'mind-blown expression, wide eyes, mouth slightly open in awe, focused';
      humanDesc = 'modern tech person with futuristic setup, blue screen glow on face, focused expression';
      colorScheme = ['#00CFFF','#0a0a1a','#fff'];
    } else if (isGaming) {
      primaryEmotion = 'excitement';
      faceExpression = 'intense competitive eyes, high energy reaction, adrenaline rush';
      humanDesc = 'gamer with intense focus, neon RGB lighting reflecting on face, competitive energy';
      colorScheme = ['#00FFFF','#0a0a2e','#FF00FF'];
    } else if (isHealth) {
      primaryEmotion = 'inspiration';
      faceExpression = 'determined hopeful eyes, sweat on skin, gritted teeth, transformation energy';
      humanDesc = 'fit athletic person mid-workout or showing transformation results, sweat, muscle definition';
      colorScheme = ['#FF6B35','#0a1a0a','#fff'];
    } else if (isEducation) {
      primaryEmotion = 'curiosity';
      faceExpression = 'lightbulb moment expression, eyes lighting up, enlightened smile';
      humanDesc = 'student or expert with aha moment expression, bright clear background';
      colorScheme = ['#4A90E2','#0a1a2e','#fff'];
    } else if (isTravel) {
      primaryEmotion = 'wonder';
      faceExpression = 'amazed awe-inspired expression, eyes wide with wonder, joyful';
      humanDesc = 'traveler exploring a breathtaking location, natural golden light on face';
      colorScheme = ['#F5A623','#1a2e2e','#fff'];
    } else if (isFood) {
      primaryEmotion = 'satisfaction';
      faceExpression = 'surprised delighted expression, eyes wide, mouth watering, pure joy';
      humanDesc = 'person reacting to amazing food, delighted expression, warm lighting';
      colorScheme = ['#FF6B35','#1a0a00','#fff'];
    } else if (isRelationships) {
      primaryEmotion = 'hope';
      faceExpression = 'warm empathetic eyes, gentle caring smile, emotional connection';
      humanDesc = 'person with warm emotional expression, soft natural lighting';
      colorScheme = ['#FF6B9D','#1a0a0a','#fff'];
    } else {
      // Fallback to category-based
      var fallbackMap = {
        'Dark Mystery': { emo: 'curiosity', face: 'scared wide eyes, raised brows, fearful expression', human: 'fearful person in dark atmosphere', colors: ['#FF0000','#0a0a1a','#fff'] },
        'True Crime': { emo: 'shock', face: 'shocked expression, intense stare, serious concern', human: 'shocked person in crime scene atmosphere', colors: ['#FF4444','#0a0a0a','#fff'] },
        'Finance': { emo: 'achievement', face: 'confident smirk, determined eyes, power pose', human: 'confident professional in suit', colors: ['#00FF88','#0a1a0a','#FFD700'] },
        'Gaming': { emo: 'excitement', face: 'intense focused eyes, competitive rage, high energy', human: 'gamer with intense focus', colors: ['#00FFFF','#0a0a2e','#FF00FF'] },
        'Motivation': { emo: 'inspiration', face: 'determined hopeful eyes, inspiring gaze upward', human: 'inspired person looking toward future', colors: ['#FFD700','#1a0a00','#fff'] },
        'Education': { emo: 'curiosity', face: 'curious raised eyebrow, lightbulb moment expression', human: 'student or expert with lightbulb moment', colors: ['#4A90E2','#0a1a2e','#fff'] },
        'Technology': { emo: 'surprise', face: 'mind-blown expression, shocked eyes', human: 'tech professional with screen glow', colors: ['#00CFFF','#0a0a1a','#fff'] },
        'Health': { emo: 'inspiration', face: 'determined hopeful expression', human: 'athletic person with transformation energy', colors: ['#7ED321','#0a1a0a','#fff'] },
        'Default': { emo: 'curiosity', face: 'curious raised eyebrow, intense intrigued eyes', human: 'curious person with intrigued expression', colors: ['#8B5CF6','#0a0a1a','#fff'] }
      };
      var f = fallbackMap[cat] || fallbackMap['Default'];
      primaryEmotion = f.emo;
      faceExpression = f.face;
      humanDesc = f.human;
      colorScheme = f.colors;
    }

    var negativePrompt = 'blurry, low quality, cluttered composition, multiple focal points, unrealistic face, plastic skin, distorted anatomy, extra fingers, low contrast, boring expression, tiny subject, busy background, watermark, logo, text in image, cropped subject';

    var topicWords = topic.split(/\s+/).filter(function(w){return w.length>2}).slice(0,3).join(' ').toUpperCase();
    var shortText = topicWords;

    function buildPrompt(type, promptBody) {
      var qualityBase = ', photorealistic, 8k, DSLR quality, professional lighting, cinematic depth, high detail, sharp focus, realistic skin, realistic eyes, professional color grading, modern YouTube thumbnail style, high contrast, mobile optimized, 16:9 composition';
      var spacing = ', subject occupies 40-70 percent of frame, space at bottom for text overlay, no text in image';
      var parenthetical = ' ' + promptBody + qualityBase + spacing;
      return parenthetical;
    }

    // ── STEP 2: GENERATE 4 ADAPTIVE STRATEGIES ────────────
    var strategies = [
      {
        id: 'face',
        label: '👤 Face Expression',
        desc: 'Close-up emotional face — highest CTR for personality-driven content',
        prompt: buildPrompt('face', 'Extreme close-up portrait of ' + humanDesc + ' with ' + faceExpression + ', dramatic cinematic rim lighting from one side, dark atmospheric background with subtle vignette, sharp focus on eyes, skin texture visible, related to ' + topic),
        text: shortText,
        type: 'human-centric'
      },
      {
        id: 'mystery',
        label: '❓ Mystery Hook',
        desc: 'Curiosity gap — viewer must click to find out what happened',
        prompt: buildPrompt('mystery', 'Cinematic mysterious scene related to ' + topic + ', partial reveal composition, dramatic shadows obscuring key elements, single dramatic light source creating suspense, fog or smoke atmosphere, sense of mystery and revelation, curiosity gap visual'),
        text: shortText.slice(0, 2) + '?',
        type: 'mystery-centric'
      },
      {
        id: 'result',
        label: '🏆 Result / Transformation',
        desc: 'Show the outcome — what the viewer will achieve or witness',
        prompt: buildPrompt('result', 'Dramatic transformation or stunning result scene related to ' + topic + ', epic before and after moment, visible achievement outcome, golden hour or dramatic cinematic lighting, sense of accomplishment and success, inspirational composition, wow factor'),
        text: isFinance || isSuccess ? 'GAIN' : (isHealth ? 'BEFORE→AFTER' : shortText),
        type: 'result-centric'
      },
      {
        id: 'object',
        label: (isGaming ? '🎮' : isTech ? '💻' : isFood ? '🍽️' : '🎯') + ' ' + (isGaming ? 'Game Action' : isTech ? 'Tech Focus' : isFood ? 'Food Shot' : 'Object Focus'),
        desc: (isGaming ? 'Game scene or character' : isTech ? 'The device or technology' : isFood ? 'The food itself' : 'The product or subject') + ' — lets the subject speak',
        prompt: buildPrompt('object', (isGaming ? 'Intense gaming moment or scene from ' : isTech ? 'Detailed close-up of modern technology related to ' : isFood ? 'Delicious mouth-watering food photography related to ' : 'Detailed close-up of the main subject related to ') + topic + ', product photography style, clean background, dramatic lighting, highly detailed, sharp focus on main subject, professional commercial quality, 8k detail'),
        text: shortText,
        type: 'object-centric'
      }
    ];

    strategies.forEach(function(s) {
      s.colorPalette = colorScheme;
      s.emotion = primaryEmotion;
      s.faceExpression = faceExpression;
      s.negativePrompt = negativePrompt;
    });

    return strategies;
  }

  function generateThumbnailURL(strategy, topic) {
    var fullPrompt = strategy.prompt;
    var url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(fullPrompt) + '?width=1280&height=720&nologo=true&enhance=true';
    return url;
  }

  async function loadThumbnailAsImage(imgUrl) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Image load failed')); };
      img.src = imgUrl;
    });
  }

  async function generateThumbnail(title) {
    var container = $('thumbnailContainer');
    if (!container) return;
    container.innerHTML =
      '<div class="thumbnail-skeleton">' +
        '<div class="skeleton" style="height:28px;width:50%;margin:0 auto 20px;"></div>' +
        '<div class="skeleton" style="width:100%;aspect-ratio:16/9;border-radius:12px;margin-bottom:16px;"></div>' +
      '</div>';

    try {
      var channelCategory = appState.channelCategory;
      var channelName = appState.channelName || appState.channelAnalysis?.channelInfo?.name || '';

      var strategies = buildThumbnailStrategies(title, channelCategory);
      var thumbText = generateShortTextLocally(title);
      try {
        var thumbTextData = await API.generateThumbnailText(title, channelCategory);
        if (thumbTextData && thumbTextData.thumbText) thumbText = thumbTextData.thumbText;
      } catch (e) {}

      var urls = strategies.map(function(s) { return generateThumbnailURL(s, title); });

      container.innerHTML =
        '<div id="thumbGridLoading" style="text-align:center;padding:40px 20px;">' +
          '<div style="width:36px;height:36px;border:3px solid #333;border-top-color:#a78bfa;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 14px;"></div>' +
          '<p style="color:var(--text-dim);margin-top:12px;">Generating 4 AI thumbnail concepts...</p>' +
        '</div>' +
        '<div id="thumbOptionsGrid" style="display:none;"></div>' +
        '<div id="thumbSelectedArea" style="display:none;"></div>';

      var images = await Promise.all(urls.map(function(url) {
        return loadThumbnailAsImage(url).catch(function() { return null; });
      }));

      var gridItems = '';
      for (var i = 0; i < strategies.length; i++) {
        var s = strategies[i];
        var imgData = images[i];
        var imgHtml = imgData
          ? '<img src="' + urls[i] + '" alt="' + s.label + '" style="width:100%;height:100%;object-fit:cover;display:block;" crossorigin="anonymous" />'
          : '<div class="thumb-option-failed">Generation failed</div>';
        gridItems +=
          '<div class="thumb-option" data-idx="' + i + '" data-url="' + urls[i] + '" data-type="' + s.id + '">' +
            '<div class="thumb-option-preview">' + imgHtml + '</div>' +
            '<div class="thumb-option-info">' +
              '<div class="thumb-option-label">' + s.label + '</div>' +
              '<div class="thumb-option-desc">' + s.desc + '</div>' +
            '</div>' +
          '</div>';
      }

      var loading = $('thumbGridLoading');
      if (loading) loading.remove();
      var grid = $('thumbOptionsGrid');
      if (grid) {
        grid.style.display = '';
        grid.innerHTML = '<div class="thumb-grid-header"><h3 style="font-size:1rem;font-weight:700;margin:0;">Choose Your Thumbnail Style</h3><p style="font-size:0.8rem;color:var(--text-dim);margin:4px 0 0 0;">Click one to select and edit</p></div><div class="thumb-grid">' + gridItems + '</div>';
        grid.querySelectorAll('.thumb-option').forEach(function(el) {
          el.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            selectThumbnailOption(idx, title, channelName, channelCategory, strategies, urls, images, thumbText);
          });
        });
      }
    } catch (err) {
      showError(container, '⚠️ Servers are busy right now. Please try again in 2 minutes.', function() { generateThumbnail(title); });
    }
  }

  var _selectedThumbData = { canvas: null, url: null, text: '', color: '', fontSize: 96 };

  function selectThumbnailOption(idx, topic, channelName, channelCategory, strategies, urls, images, thumbText) {
    var strategy = strategies[idx];
    var imgUrl = urls[idx];
    var container = $('thumbnailContainer');
    if (!container) return;

    var selectedArea = $('thumbSelectedArea');
    if (!selectedArea) return;

    var defaultColor = (strategy.colorPalette && strategy.colorPalette[0]) || '#FFFFFF';
    var shortText = thumbText || strategy.text || generateShortTextLocally(topic);

    selectedArea.style.display = '';
    selectedArea.innerHTML =
      '<div class="thumb-selected-wrap">' +
        '<h4 style="font-size:1rem;font-weight:700;margin:0 0 12px 0;">' + strategy.label + '</h4>' +
        '<div class="thumbnail-img-wrap">' +
          '<canvas id="thumbnailCanvas" width="1280" height="720" style="width:100%;height:auto;aspect-ratio:16/9;border-radius:var(--r-lg);display:block;"></canvas>' +
        '</div>' +
        '<div id="thumbnailActions">' +
          '<div class="thumbnail-actions">' +
            '<button class="btn-primary btn-sm" id="downloadThumbBtn">⬇️ Download Thumbnail</button>' +
            '<button class="btn-ghost btn-sm" id="backToGridBtn">⬅️ Back to Options</button>' +
          '</div>' +
          '<div class="thumb-edit-panel">' +
            '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">✏️ Thumbnail Text Overlay</h4>' +
            '<label for="thumbTextInput">Overlay Text (max 3 words)</label>' +
            '<input type="text" id="thumbTextInput" value="' + shortText.replace(/"/g, '&quot;') + '" maxlength="30" />' +
            '<label for="thumbColorInput">Text Color</label>' +
            '<input type="color" id="thumbColorInput" value="' + defaultColor + '" />' +
            '<label for="thumbFontSize">Font Size: <span id="thumbFontSizeLabel">96</span>px</label>' +
            '<input type="range" id="thumbFontSize" min="36" max="120" value="96" />' +
            '<div class="form-actions" style="margin-top:12px;">' +
              '<button class="btn-primary btn-sm" id="regenCanvasBtn">🔄 Update</button>' +
              '<button class="btn-ghost btn-sm" id="autoGenTextBtn">✨ Auto Text</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var fullPrompt = strategy.prompt;

    _selectedThumbData = { canvas: null, url: imgUrl, text: shortText, color: defaultColor, fontSize: 96 };

    loadAndDrawThumbnailCanvas(imgUrl, shortText, null, 96, channelName);

    $('downloadThumbBtn')?.addEventListener('click', function() {
      if (_selectedThumbData.canvas) {
        var link = document.createElement('a');
        link.download = 'thumbnail_' + (channelName || 'creator') + '_' + topic.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40) + '.png';
        link.href = _selectedThumbData.canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Downloaded!');
      }
    });

    $('backToGridBtn')?.addEventListener('click', function() {
      selectedArea.style.display = 'none';
      selectedArea.innerHTML = '';
      var grid = $('thumbOptionsGrid');
      if (grid) grid.style.display = '';
      window.scrollTo({ top: container.offsetTop - 20, behavior: 'smooth' });
    });

    $('regenCanvasBtn')?.addEventListener('click', function() {
      var newText = ($('thumbTextInput') && $('thumbTextInput').value) || shortText;
      var newColor = ($('thumbColorInput') && $('thumbColorInput').value) || defaultColor;
      var newSize = parseInt(($('thumbFontSize') && $('thumbFontSize').value) || '96');
      _selectedThumbData.text = newText;
      _selectedThumbData.color = newColor;
      _selectedThumbData.fontSize = newSize;
      loadAndDrawThumbnailCanvas(imgUrl, newText, newColor, newSize, channelName);
    });

    $('autoGenTextBtn')?.addEventListener('click', async function() {
      var btn = $('autoGenTextBtn');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      try {
        var res = await API.generateThumbnailText(topic, channelCategory);
        if (res && res.thumbText) {
          appState._thumbShortText = res.thumbText;
          var input = $('thumbTextInput');
          if (input) input.value = res.thumbText.replace(/"/g, '&quot;');
          var updBtn = $('regenCanvasBtn');
          if (updBtn) updBtn.click();
        }
      } catch (e) {
        showToast('Could not generate text');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Auto Text';
      }
    });

    $('thumbFontSize')?.addEventListener('input', function() {
      var lbl = $('thumbFontSizeLabel');
      if (lbl) lbl.textContent = this.value;
    });
  }

  function generateShortTextLocally(title) {
    var clean = title.split('|')[0].trim();
    var words = clean.replace(/[^\w\s]/g, '').split(/\s+/).filter(function(w){return w.length > 2});
    return words.slice(0, 3).join(' ').toUpperCase();
  }

  function getThumbCategoryColor() {
    var cat = appState.channelCategory || 'Default';
    return THUMB_TEXT_COLORS[cat] || THUMB_TEXT_COLORS['Default'];
  }

  function loadAndDrawThumbnailCanvas(imgUrl, text, textColor, fontSize, channelName) {
    var canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    var ctx = canvas.getContext('2d');
    var cat = appState.channelCategory || 'Default';
    var bgColor = THUMB_BG_COLORS[cat] || THUMB_BG_COLORS['Default'];
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 1280, 720);
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      ctx.drawImage(img, 0, 0, 1280, 720);
      var grad = ctx.createLinearGradient(0, 720, 0, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.85)');
      grad.addColorStop(0.35, 'rgba(0,0,0,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);
      drawThumbText(ctx, text, textColor, fontSize, channelName);
      _selectedThumbData.canvas = canvas;
      var destCanvas = $('thumbnailCanvas');
      if (destCanvas) {
        var dCtx = destCanvas.getContext('2d');
        dCtx.clearRect(0, 0, 1280, 720);
        dCtx.drawImage(canvas, 0, 0, 1280, 720);
      }
    };
    img.onerror = function() {
      drawThumbText(ctx, text, textColor, fontSize, channelName);
      _selectedThumbData.canvas = canvas;
      var destCanvas = $('thumbnailCanvas');
      if (destCanvas) {
        var dCtx = destCanvas.getContext('2d');
        dCtx.clearRect(0, 0, 1280, 720);
        dCtx.drawImage(canvas, 0, 0, 1280, 720);
      }
    };
    img.src = imgUrl;
  }

  function drawThumbText(ctx, text, textColor, fontSize, channelName) {
    var cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    var words = cleanText.split(/\s+/).filter(Boolean);
    var maxWords = 3;
    var shortText = words.slice(0, maxWords).join(' ').toUpperCase();
    if (!shortText) return;
    var fs = fontSize || 96;
    var cat = appState.channelCategory || 'Default';
    var defaultColor = THUMB_TEXT_COLORS[cat] || THUMB_TEXT_COLORS['Default'];
    var color = textColor || defaultColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = '900 ' + fs + 'px "Impact","Anton",sans-serif';
    var x = 40;
    var y = 720 - 80;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    ctx.fillText(shortText, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = fs / 12;
    ctx.lineJoin = 'round';
    ctx.strokeText(shortText, x, y);
    ctx.fillStyle = color;
    ctx.fillText(shortText, x, y);
    ctx.font = '18px Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    if (channelName) {
      ctx.fillText('@' + channelName, 1260, 710);
    }
  }

  function renderThumbnail(topic, channelName, channelCategory, thumbnailText) {
    generateThumbnail(topic);
  }

  // ─── COMPETITOR ANALYSIS ─────────────────────────────────
  function sanitizeOutput(text, competitorName, userChannelName) {
    if (!text) return text;
    if (competitorName && userChannelName) {
      const regex = new RegExp(competitorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return text.replace(regex, userChannelName);
    }
    return text;
  }

  async function findCompetitors() {
    const niche = appState.niche || appState.channelAnalysis?.channelInfo?.name || '';
    if (!niche) return showToast('Please set your niche first');

    const nicheDisplay = $('competitorNicheDisplay');
    if (nicheDisplay) nicheDisplay.textContent = niche;
    const listContainer = $('competitorList');
    if (!listContainer) return console.error('competitorList element not found');
    const resultsContainer = $('competitorResults');
    if (resultsContainer) resultsContainer.innerHTML = '';
    const btn = $('findCompetitorsBtn');
    if (!btn) return console.error('findCompetitorsBtn not found');
    btn.disabled = true;
    btn.textContent = 'Searching...';
    listContainer.innerHTML = '<div class="analysis-loading" style="padding:20px;"><div class="loading-spinner"></div><p style="color:var(--text-dim);font-size:0.85rem;margin-top:12px;">Finding top channels in your niche...</p></div>';

    try {
      const audience = appState.channelAnalysis?.performance?.audience || appState.creatorProfile?.audienceTone || '';
      const language = appState.language || 'en';
      const data = await withTimeout(API.searchCompetitors(niche, audience, language, ''), 45000);
      var channels = [];
      if (data && data.topChannels) channels = data.topChannels;
      if (!channels.length) {
        listContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:12px;">No competitors found. Try a different niche or add one manually.</p>';
        btn.disabled = false;
        btn.textContent = 'Find My Competitors';
        return;
      }
      var itemsHtml = channels.slice(0, 6).map(function(ch) {
        var name = ch.title || ch.channelTitle || ch.name || 'Unknown';
        var thumb = ch.thumbnail || (ch.thumbnails && ch.thumbnails.default && ch.thumbnails.default.url) || '';
        var chUrl = ch.channelId ? 'https://www.youtube.com/channel/' + ch.channelId : '';
        var avatarHtml = thumb
          ? '<img src="' + thumb + '" alt="" onerror="this.style.display=\'none\'" />'
          : '<div class="competitor-list-avatar">' + name.charAt(0).toUpperCase() + '</div>';
        return '<div class="competitor-list-item" data-url="' + chUrl + '">' + avatarHtml + '<span>' + name + '</span></div>';
      }).join('');
      listContainer.innerHTML = '<div style="margin-top:12px;"><span class="insight-label" style="display:block;margin-bottom:8px;">Click a channel to analyze:</span><div class="competitor-list">' + itemsHtml + '</div></div>';

      listContainer.querySelectorAll('.competitor-list-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var url = this.dataset.url;
          if (url) analyzeCompetitor(url);
        });
      });
    } catch (err) {
      console.error('findCompetitors error:', err);
      listContainer.innerHTML = '<div style="padding:12px;text-align:center;"><p style="color:var(--error);font-size:0.85rem;">' + err.message + '</p></div>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Find My Competitors';
    }
  }

  async function analyzeCompetitor(url) {
    if (!url) return showToast('No competitor channel selected');

    const userChannelName = appState.channelName || '';
    const userUrl = userChannelName ? userChannelName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const enteredName = url.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (userUrl && userUrl.length > 3 && enteredName.includes(userUrl)) {
      return showToast("That's your own channel! Please select a competitor channel.");
    }

    const resultsContainer = $('competitorResults');
    if (!resultsContainer) return console.error('competitorResults element not found');
    resultsContainer.innerHTML = '<div class="analysis-loading" style="padding:20px;"><div class="loading-spinner"></div><p style="color:var(--text-dim);font-size:0.85rem;margin-top:12px;">Analyzing competitor channel...</p></div>';

    try {
      const data = await withTimeout(API.analyzeCompetitor(url, userChannelName), 45000);

      if (!data || !data.insights) {
        resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.85rem;"><p>Could not analyze this channel. Try another one.</p><button class="btn-ghost btn-sm" style="margin-top:8px;" onclick="window.app.retryCompetitor()">Try Again</button></div>';
        return;
      }

      const competitorName = data.competitorName || '';
      const competitorVideos = data.competitorVideos || [];
      const insights = data.insights || {};

      const safeName = competitorName || '';

      const sanitizedInsights = {
        commonTopics: (insights.commonTopics || []).map(function(t) { return sanitizeOutput(t, safeName, userChannelName); }),
        titlePatterns: (insights.titlePatterns || []).map(function(t) { return sanitizeOutput(t, safeName, userChannelName); }),
        emotionType: insights.emotionType || 'curiosity',
        avgTitleLength: insights.avgTitleLength || 'medium',
        languageStyle: insights.languageStyle || 'English',
        contentGaps: (insights.contentGaps || []).map(function(g) { return sanitizeOutput(g, safeName, userChannelName); }),
        thumbnailStyle: insights.thumbnailStyle || 'mixed',
        hookWords: (insights.hookWords || []).map(function(w) { return sanitizeOutput(w, safeName, userChannelName); }),
        whatIsWorking: sanitizeOutput(insights.whatIsWorking || '', safeName, userChannelName)
      };

      var videosHtml = '';
      if (competitorVideos.length) {
        var thumbs = competitorVideos.slice(0, 10).map(function(v) {
          var src = v.thumbnailUrl || '';
          return '<img src="' + src + '" alt="Video thumbnail" loading="lazy" onerror="this.style.display=\'none\'" />';
        }).join('');
        videosHtml = '<div style="margin-top:12px;"><span class="insight-label" style="display:block;margin-bottom:8px;">&#127916; Recent Videos (style reference only)</span><div class="thumbnail-strip">' + thumbs + '</div></div>';
      }

      resultsContainer.innerHTML =
        '<div class="competitor-results">' +
          '<div class="premium-preview-banner">&#9889; This feature is FREE during beta. It will become a premium feature soon — use it while you can!</div>' +
          '<div class="competitor-insights">' +
            '<h4>&#128269; Competitor Channel Analysis</h4>' +
            '<div class="insight-grid">' +
              '<div class="insight-card"><span class="insight-label">&#127919; Common Topics</span><div class="tag-list">' + sanitizedInsights.commonTopics.map(function(t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128221; Title Patterns</span><div class="tag-list">' + sanitizedInsights.titlePatterns.map(function(t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128578; Emotion Type</span><div class="insight-value">' + sanitizedInsights.emotionType + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128207; Title Length</span><div class="insight-value">' + sanitizedInsights.avgTitleLength + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128266; Language</span><div class="insight-value">' + sanitizedInsights.languageStyle + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128444; Thumbnail Style</span><div class="insight-value">' + sanitizedInsights.thumbnailStyle + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128218; Content Gaps (Your Opportunity)</span><div class="tag-list">' + sanitizedInsights.contentGaps.map(function(g) { return '<span class="tag">' + g + '</span>'; }).join('') + '</div></div>' +
              '<div class="insight-card"><span class="insight-label">&#128240; Hook Words</span><div class="tag-list">' + sanitizedInsights.hookWords.map(function(w) { return '<span class="tag">' + w + '</span>'; }).join('') + '</div></div>' +
              '<div class="insight-card insight-full"><span class="insight-label">&#128200; What\'s Working</span><div class="insight-text">' + sanitizedInsights.whatIsWorking + '</div></div>' +
            '</div>' +
            videosHtml +
            '<p style="font-size:0.72rem;color:var(--text-muted);margin-top:16px;">&#9432; Analysis is for inspiration only. All generated content is 100% original and tailored to your channel.</p>' +
          '</div>' +
        '</div>';
    } catch (err) {
      console.error('analyzeCompetitor error:', err);
      var errContainer = $('competitorResults');
      if (errContainer) {
        errContainer.innerHTML = '<div style="padding:16px;text-align:center;"><p style="color:var(--error);font-size:0.85rem;">' + err.message + '</p><button class="btn-ghost btn-sm" style="margin-top:8px;" onclick="window.app.retryCompetitor()">Try Again</button></div>';
      }
    }
  }

  function retryCompetitor() {
    findCompetitors();
  }

  // ─── NICHE ANALYSIS ──────────────────────────────────────
  function initNicheSelection() {
    const grid = $('nicheGrid');
    if (!grid) return;
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.niche-card');
      if (!card) return;
      grid.querySelectorAll('.niche-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      appState.niche = card.dataset.niche;
      setTimeout(() => {
        showView('view-ideas');
        fetchIdeas();
      }, 300);
    });
  }

  // ─── START OVER ──────────────────────────────────────────
  function startOver() {
    appState.channelType = null;
    appState.contentType = null;
    appState.has50Videos = null;
    appState.channelAnalysis = null;
    appState.creatorProfile = null;
    appState.marketIntelligence = null;
    appState.niche = null;
    appState.channelName = null;
    appState.channelCategory = null;
    appState.language = null;
    appState.ideas = [];
    appState.selectedIdea = null;
    appState.script = null;
    appState.originalScript = null;
    appState.thumbnail = null;
    appState._recentTitles = null;
    appState._recentThumbnails = null;
    appState._channelVideoCount = null;
    appState._channelThumbnailStyle = null;
    appState._thumbShortText = null;
    $('channelUrlFormCard').style.display = 'block';
    $('channelDetectCard').style.display = 'none';
    $('channelFallbackFields').style.display = 'none';
    $('channelResults').innerHTML = '';
    $('autoFetchBanner').innerHTML = '';
    $('channelUrl').value = '';
    $('channelName').value = '';
    document.querySelectorAll('.content-type-card, .niche-card').forEach(c => c.classList.remove('selected'));
    localStorage.removeItem('ss-edited-script-body');
    localStorage.removeItem('ss-edited-script-title');
    showView('view-channel-url');
  }

  // ─── HELPERS ─────────────────────────────────────────────
  function formatNum(n) {
    if (!n) return '0';
    n = parseInt(n);
    if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // ─── DASHBOARD ───────────────────────────────────────────
  async function loadDashboard() {
    const container = $('dashboardContent');
    if (!container) return;
    container.innerHTML = '<div class="skeleton" style="height:300px;border-radius:12px;"></div>';

    try {
      const [scripts, thumbnails] = await Promise.all([
        API.getScriptHistory().catch(() => []),
        API.getThumbnailHistory().catch(() => [])
      ]);

      container.innerHTML = `
        <div class="dash-stats">
          <div class="dash-stat-card">
            <div class="dash-stat-value">${scripts.length}</div>
            <div class="dash-stat-label">Scripts Generated</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-value">${thumbnails.length}</div>
            <div class="dash-stat-label">Thumbnails Created</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-value">${appState.channelAnalysis?.channelInfo?.subscribers ? formatNum(appState.channelAnalysis.channelInfo.subscribers) : '--'}</div>
            <div class="dash-stat-label">Channel Subs</div>
          </div>
        </div>
        ${scripts.length ? `
          <div class="dash-section">
            <h3>Recent Scripts</h3>
            <div class="dash-list">${scripts.slice(0, 5).map(s => `
              <div class="dash-item">
                <div class="dash-item-title">${s.title || 'Untitled'}</div>
                <div class="dash-item-meta">${s.niche || ''} &middot; ${s.word_count || 0} words</div>
              </div>`).join('')}
            </div>
          </div>` : ''}
        ${!scripts.length && !thumbnails.length ? `
          <div class="dash-empty">
            <p>No content yet. Start by analyzing your channel or generating a script!</p>
            <button class="btn-primary" id="dashStartBtn">Create Your First Script</button>
          </div>` : ''}
        <button class="btn-primary" id="dashNewBtn" style="margin-top:20px;">Create New Script</button>`;

      $('dashStartBtn')?.addEventListener('click', startOver);
      $('dashNewBtn')?.addEventListener('click', startOver);
    } catch (_) {
      container.innerHTML = '<p style="color:var(--text-dim);">Failed to load dashboard</p>';
    }
  }

  // ─── INIT ────────────────────────────────────────────────
  async function init() {
    const isLoggedIn = await checkAuth();
    if (isLoggedIn && !window._justLoggedIn) {
      const displayName = appState.profile?.display_name || appState.user?.email || 'User';
      setTimeout(() => showToast('Welcome back, ' + displayName + '!'), 500);
    }

    $('loginForm')?.addEventListener('submit', handleLogin);
    $('signupForm')?.addEventListener('submit', handleSignup);
    $('logoutBtn')?.addEventListener('click', handleLogout);
    $('showSignup')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signup'); });
    $('showLogin')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
    $('authTabLogin')?.addEventListener('click', () => showAuthForm('login'));
    $('authTabSignup')?.addEventListener('click', () => showAuthForm('signup'));

    initContentType();
    initNicheSelection();
    setupAutoFetch('channelUrl', 'autoFetchBanner');

    $('channelForm')?.addEventListener('submit', handleChannelAnalysis);
    $('newChannelForm')?.addEventListener('submit', handleNewChannelSubmit);
    $('newChannelLink')?.addEventListener('click', (e) => { e.preventDefault(); $('channelUrlFormCard').style.display = 'none'; $('newChannelFormCard').style.display = 'block'; });
    $('showUrlFallback')?.addEventListener('click', (e) => { e.preventDefault(); showManualChannelForm(); });

    $('findCompetitorsBtn')?.addEventListener('click', findCompetitors);

    $('backToContentType')?.addEventListener('click', () => { appState.contentType = null; showView('view-channel-url'); });
    $('backToNiche')?.addEventListener('click', () => { showView('view-channel-url'); });
    $('backToIdeas')?.addEventListener('click', () => {
      if (!appState.niche && !appState.channelCategory) {
        showView('view-niche-analysis');
      } else {
        showView('view-content-type');
      }
    });
    $('startOverBtn')?.addEventListener('click', startOver);
    $('logoLink')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-dashboard'); loadDashboard(); });

    if (isLoggedIn) {
      navigateAfterAuth();
    } else {
      showView('view-login');
      showAuthForm('login');
    }

    if ($('view-dashboard')) {
      window.addEventListener('viewchange', (e) => {
        if (e.detail?.view === 'view-dashboard') loadDashboard();
      });
    }

    document.addEventListener('auth:expired', () => {
      showToast('Session expired. Please login again.');
      showView('view-login');
    });

    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.view) {
        showView(e.state.view, false);
      } else {
        if (API.isLoggedIn()) {
          showView('view-channel-url', false);
        } else {
          showView('view-login', false);
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  window.app = {
    showView,
    startOver,
    showToast,
    loadDashboard,
    retryCompetitor,
    findCompetitors,
    analyzeCompetitor
  };
})();
