const API_BASE = '/api';

function getToken() {
  try { return localStorage.getItem('ss-session') || ''; } catch (e) { return ''; }
}

function setToken(token) {
  try { localStorage.setItem('ss-session', token); } catch (e) {}
}

function clearToken() {
  try { localStorage.removeItem('ss-session'); } catch (e) {}
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const resp = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const msg = data?.error || `Request failed (${resp.status})`;
    const err = new Error(msg);
    err.status = resp.status;
    err.data = data;
    if (resp.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw err;
  }

  return data;
}

const API = {
  // Auth
  async signup(email, password, displayName) {
    const data = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName })
    });
    if (data.session?.access_token) {
      setToken(data.session.access_token);
    }
    return data;
  },

  async login(email, password) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.session?.access_token) {
      setToken(data.session.access_token);
    }
    return data;
  },

  async logout() {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (_) {}
    clearToken();
  },

  async getMe() {
    return apiRequest('/auth/me');
  },

  async updateProfile(updates) {
    return apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  isLoggedIn() {
    return !!getToken();
  },

  getToken,

  // YouTube
  async getChannelId(url) {
    return apiRequest('/youtube/channel-id', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  },

  async analyzeChannel(channelUrl, channelName, contentType) {
    return apiRequest('/youtube/analyze', {
      method: 'POST',
      body: JSON.stringify({ channelUrl, channelName, contentType })
    });
  },

  async searchCompetitors(niche, targetAudience, language, country) {
    return apiRequest('/youtube/search-competitors', {
      method: 'POST',
      body: JSON.stringify({ niche, targetAudience, language, country })
    });
  },

  // Scripts
  async generateScript({ topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence }) {
    return apiRequest('/scripts/generate', {
      method: 'POST',
      body: JSON.stringify({ topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence })
    });
  },

  async generateIdeas({ niche, channelAnalysis, marketIntelligence, contentType, count }) {
    return apiRequest('/scripts/ideas', {
      method: 'POST',
      body: JSON.stringify({ niche, channelAnalysis, marketIntelligence, contentType, count })
    });
  },

  async factCheck(script, topic) {
    return apiRequest('/scripts/fact-check', {
      method: 'POST',
      body: JSON.stringify({ script, topic })
    });
  },

  async getScriptHistory() {
    return apiRequest('/scripts/history');
  },

  async getScript(id) {
    return apiRequest(`/scripts/history/${id}`);
  },

  async deleteScript(id) {
    return apiRequest(`/scripts/history/${id}`, { method: 'DELETE' });
  },

  // Thumbnails
  async generateThumbnail({ title, niche, topic, analysis }) {
    return apiRequest('/thumbnails/generate', {
      method: 'POST',
      body: JSON.stringify({ title, niche, topic, analysis })
    });
  },

  async getThumbnailHistory() {
    return apiRequest('/thumbnails/history');
  }
};

window.API = API;
