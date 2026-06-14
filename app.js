(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const views = document.querySelectorAll('.view');
  let currentView = null;

  let appState = {
    user: null,
    profile: null,
    channelType: null, // 'new' | 'existing'
    contentType: null, // 'shorts' | 'longform'
    has50Videos: null, // true | false
    channelAnalysis: null,
    creatorProfile: null,
    marketIntelligence: null,
    niche: null,
    ideas: [],
    selectedIdea: null,
    script: null,
    thumbnail: null
  };

  function showToast(msg, duration = 3000) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), duration);
  }

  function showView(id) {
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
    const btn = $('loginBtn');
    if (!email || !password) return showToast('Please fill in all fields');

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      await API.login(email, password);
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
    const btn = $('signupBtn');

    if (!email || !password) return showToast('Please fill in all fields');
    if (password.length < 6) return showToast('Password must be at least 6 characters');

    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const data = await API.signup(email, password, displayName);
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
      marketIntelligence: null, niche: null, ideas: [], selectedIdea: null,
      script: null, thumbnail: null
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
      showView('view-channel-type');
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

  // ─── CHANNEL TYPE ─────────────────────────────────────────
  function initChannelType() {
    document.querySelectorAll('.channel-type-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.channel-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        appState.channelType = card.dataset.type;
        setTimeout(() => showView('view-content-type'), 300);
      });
    });
  }

  // ─── CONTENT TYPE ────────────────────────────────────────
  function initContentType() {
    document.querySelectorAll('.content-type-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.content-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        appState.contentType = card.dataset.type;
        if (appState.channelType === 'existing') {
          setTimeout(() => showView('view-has-50'), 300);
        } else {
          setTimeout(() => showView('view-new-channel'), 300);
        }
      });
    });
  }

  // ─── HAS 50 VIDEOS ───────────────────────────────────────
  function initHas50() {
    document.querySelectorAll('.has50-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.has50-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        appState.has50Videos = card.dataset.value === 'yes';
        setTimeout(() => {
          showView(appState.has50Videos ? 'view-channel-url' : 'view-channel-url-simple');
        }, 300);
      });
    });
  }

  // ─── CHANNEL URL (50+ videos) ────────────────────────────
  async function handleChannelAnalysis(e) {
    e.preventDefault();
    const url = $('channelUrl').value.trim();
    const name = $('channelName').value.trim();
    if (!url) return showToast('Channel URL is required');

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
            <button class="btn-primary" id="proceedFromAnalysis">Continue to Script &#8594;</button>
          </div>`;
        results.querySelector('#proceedFromAnalysis')?.addEventListener('click', () => {
          showView('view-niche-analysis');
        });
      }, 4000);
    } catch (err) {
      showError(results, err.message, () => handleChannelAnalysis(e));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyze Channel';
    }
  }

  // ─── CHANNEL URL SIMPLE (under 50 videos) ────────────────
  async function handleSimpleAnalysis(e) {
    e.preventDefault();
    const url = $('channelUrlSimple').value.trim();
    if (!url) return showToast('Channel URL is required');

    const results = $('channelResultsSimple');
    showLoading(results);
    const btn = $('analyzeBtnSimple');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      const data = await withTimeout(API.analyzeChannel(url, '', appState.contentType), 45000);
      appState.channelAnalysis = data.analysis;
      appState.creatorProfile = data.creatorProfile;

      const a = data.analysis;
      results.innerHTML = `
        <div class="analysis-card">
          <div class="analysis-header">
            <img src="${a.channelInfo.thumbnail || ''}" alt="" class="analysis-avatar" onerror="this.style.display='none'">
            <div>
              <h3>${a.channelInfo.name}</h3>
              <div class="analysis-meta">
                <span>&#128065; ${formatNum(a.channelInfo.subscribers)} subscribers</span>
                <span>&#128196; ${formatNum(a.channelInfo.totalViews)} views</span>
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
          </div>
          <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:16px;">
            Based on your current ${a.performance.totalAnalyzed} videos. As you grow, we'll refine your profile.
          </p>
          <button class="btn-primary" id="proceedSimple">Continue to Script &#8594;</button>
        </div>`;
      results.querySelector('#proceedSimple')?.addEventListener('click', () => showView('view-niche-analysis'));
    } catch (err) {
      showError(results, err.message, () => handleSimpleAnalysis(e));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyze Channel';
    }
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
    const results = $('competitorResults');
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
      const niche = appState.niche || appState.channelAnalysis?.channelInfo?.name || 'your niche';
      const ideas = await withTimeout(API.generateIdeas({
        niche,
        channelAnalysis: appState.channelAnalysis?.performance,
        marketIntelligence: appState.marketIntelligence?.marketPatterns,
        contentType: appState.contentType,
        count: 5
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
  async function generateScript(idea) {
    const container = $('scriptContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="script-skeleton">
        <div class="skeleton" style="height:28px;width:60%;margin-bottom:20px;"></div>
        <div class="skeleton" style="height:300px;width:100%;border-radius:12px;"></div>
      </div>`;

    try {
      const script = await withTimeout(API.generateScript({
        topic: idea.title,
        niche: appState.niche || appState.channelAnalysis?.channelInfo?.name || 'general',
        contentType: appState.contentType,
        channelAnalysis: appState.channelAnalysis?.performance,
        creatorProfile: appState.creatorProfile,
        marketIntelligence: appState.marketIntelligence?.marketPatterns
      }), 45000);

      appState.script = script;
      renderScript(script);
    } catch (err) {
      showError(container, err.message, () => generateScript(idea));
    }
  }

  function renderScript(script) {
    const container = $('scriptContainer');
    if (!container) return;
    const body = script.script || '';
    container.innerHTML = `
      <div class="script-title-display">${script.title || 'Untitled'}</div>
      <div class="script-meta">
        ${script.wordCount || body.split(/\s+/).length} words
        &middot; ${appState.contentType === 'shorts' ? 'Shorts' : 'Long Form'}
        ${script.estimatedDuration ? '&middot; ' + script.estimatedDuration : ''}
      </div>
      <div class="script-body">${body}</div>
      <div class="script-actions">
        <button class="btn-ghost btn-sm" id="copyScriptBtn">Copy Script</button>
        <button class="btn-ghost btn-sm" id="factCheckBtn">Fact Check</button>
        <button class="btn-primary btn-sm" id="generateThumbBtn">Generate Thumbnail &#8594;</button>
      </div>`;

    $('copyScriptBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(body);
      showToast('Script copied!');
    });
    $('factCheckBtn')?.addEventListener('click', () => factCheck(body, script.title));
    $('generateThumbBtn')?.addEventListener('click', () => {
      showView('view-thumbnail');
      generateThumbnail(script.title);
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
  async function generateThumbnail(title) {
    const container = $('thumbnailContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="thumbnail-skeleton">
        <div class="skeleton" style="height:28px;width:50%;margin:0 auto 20px;"></div>
        <div class="skeleton" style="width:100%;aspect-ratio:16/9;border-radius:12px;margin-bottom:16px;"></div>
      </div>`;

    try {
      const data = await withTimeout(API.generateThumbnail({
        title,
        niche: appState.niche || appState.channelAnalysis?.channelInfo?.name || 'general',
        analysis: appState.channelAnalysis
      }), 60000);

      appState.thumbnail = data;
      renderThumbnail(data, title);
    } catch (err) {
      showError(container, err.message, () => generateThumbnail(title));
    }
  }

  function renderThumbnail(data, title) {
    const container = $('thumbnailContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="thumbnail-prompt-box">${data.prompt || 'Generating thumbnail...'}</div>
      ${data.imageUrl ? `
        <div class="thumbnail-img-wrap">
          <img src="${data.imageUrl}" alt="Thumbnail" class="thumbnail-image" crossorigin="anonymous" onerror="this.closest('.thumbnail-img-wrap').innerHTML='<p style=\\'padding:40px;color:var(--text-dim);\\'>Image failed to load</p>'">
        </div>` : `
        <div class="thumbnail-placeholder">
          <p>Thumbnail generation is processing. The prompt has been saved.</p>
        </div>`}
      <div class="thumbnail-actions">
        ${data.imageUrl ? `<button class="btn-primary btn-sm" id="downloadThumbBtn">Download</button>` : ''}
        <button class="btn-ghost btn-sm" id="copyPromptBtn">Copy Prompt</button>
        <button class="btn-ghost btn-sm" id="regenThumbBtn">Regenerate</button>
      </div>
      ${data.altImageUrl ? `
        <div style="margin-top:16px;">
          <h4 style="font-size:0.85rem;margin-bottom:8px;">Alternative Version</h4>
          <div class="thumbnail-img-wrap">
            <img src="${data.altImageUrl}" alt="Alternative Thumbnail" class="thumbnail-image" crossorigin="anonymous">
          </div>
        </div>` : ''}`;

    $('downloadThumbBtn')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = data.imageUrl;
      a.download = 'scriptspark-thumbnail.jpg';
      a.click();
    });
    $('copyPromptBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(data.prompt || '');
      showToast('Prompt copied!');
    });
    $('regenThumbBtn')?.addEventListener('click', () => generateThumbnail(title));
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
    appState.ideas = [];
    appState.selectedIdea = null;
    appState.script = null;
    appState.thumbnail = null;
    document.querySelectorAll('.channel-type-card, .content-type-card, .has50-card, .niche-card').forEach(c => c.classList.remove('selected'));
    showView('view-channel-type');
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

    $('loginForm')?.addEventListener('submit', handleLogin);
    $('signupForm')?.addEventListener('submit', handleSignup);
    $('logoutBtn')?.addEventListener('click', handleLogout);
    $('showSignup')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signup'); });
    $('showLogin')?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
    $('authTabLogin')?.addEventListener('click', () => showAuthForm('login'));
    $('authTabSignup')?.addEventListener('click', () => showAuthForm('signup'));

    initChannelType();
    initContentType();
    initHas50();
    initNicheSelection();

    $('channelForm')?.addEventListener('submit', handleChannelAnalysis);
    $('channelFormSimple')?.addEventListener('submit', handleSimpleAnalysis);
    $('newChannelForm')?.addEventListener('submit', handleNewChannelSubmit);

    $('backToContentType')?.addEventListener('click', () => showView('view-content-type'));
    $('backToChannelType')?.addEventListener('click', () => showView('view-channel-type'));
    $('backToHas50')?.addEventListener('click', () => showView('view-has-50'));
    $('backToChannelUrl')?.addEventListener('click', () => showView('view-channel-url'));
    $('backToIdeas')?.addEventListener('click', () => showView('view-ideas'));

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
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  window.app = {
    showView,
    startOver,
    showToast,
    loadDashboard
  };
})();
