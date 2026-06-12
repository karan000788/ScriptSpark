// ============================================================
//  ScriptSpark.in — AI YouTube Video Generator for India
//  Pure frontend. Pexels video backgrounds, IndexedDB storage,
//  scene editor, retention-optimised scripts in 10 Indian langs.
// ============================================================

// ============================================================
//  Security utilities
// ============================================================
const security = {
  // HTML escape: safe to use inside innerHTML strings
  escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/`/g, "&#96;");
  },
  // Strip control chars (except \n \r \t) and zero-width
  sanitizeText(s, maxLen = 5000) {
    if (s == null) return "";
    const cleaned = String(s)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "");
    return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
  },
  // Read first few bytes of a File to verify its actual type
  async sniffFileType(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arr = new Uint8Array(reader.result).slice(0, 12);
        // PNG: 89 50 4E 47
        if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return resolve("image/png");
        // JPEG: FF D8 FF
        if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return resolve("image/jpeg");
        // WebP: RIFF....WEBP
        if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 &&
            arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50) return resolve("image/webp");
        // GIF: GIF8
        if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x38) return resolve("image/gif");
        // MP3: ID3 or 0xFF 0xFB/0xF3/0xF2
        if ((arr[0] === 0x49 && arr[1] === 0x44 && arr[2] === 0x33) ||
            (arr[0] === 0xFF && (arr[1] & 0xE0) === 0xE0)) return resolve("audio/mpeg");
        // WAV: RIFF....WAVE
        if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 &&
            arr[8] === 0x57 && arr[9] === 0x41 && arr[10] === 0x56 && arr[11] === 0x45) return resolve("audio/wav");
        // OGG: OggS
        if (arr[0] === 0x4F && arr[1] === 0x67 && arr[2] === 0x67 && arr[3] === 0x53) return resolve("audio/ogg");
        // M4A/MP4: ftyp
        if (arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) return resolve("audio/mp4");
        resolve("application/octet-stream");
      };
      reader.onerror = () => resolve("application/octet-stream");
      reader.readAsArrayBuffer(file.slice(0, 12));
    });
  },
  // Strip EXIF + other metadata by re-encoding through a canvas
  async stripImageMetadata(file, maxSide = 1280) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxSide) {
        const r = maxSide / Math.max(w, h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.9));
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  // ---- AES-GCM encryption (for Pexels API key) ----
  async getOrCreateKey() {
    let b64Key = localStorage.getItem("__ssk");
    if (b64Key) {
      try {
        const raw = Uint8Array.from(atob(b64Key), c => c.charCodeAt(0));
        return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
      } catch {}
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    let s = "";
    raw.forEach((b) => s += String.fromCharCode(b));
    localStorage.setItem("__ssk", btoa(s));
    return key;
  },
  async encryptString(plain) {
    if (!plain) return "";
    try {
      const key = await this.getOrCreateKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder().encode(plain);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
      // pack: [12-byte iv][ciphertext]
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv, 0); out.set(ct, iv.length);
      let s = "";
      out.forEach((b) => s += String.fromCharCode(b));
      return "enc:" + btoa(s);
    } catch {
      return plain; // graceful fallback
    }
  },
  async decryptString(packed) {
    if (!packed) return "";
    if (!packed.startsWith("enc:")) return packed; // legacy / unencrypted
    try {
      const key = await this.getOrCreateKey();
      const bin = Uint8Array.from(atob(packed.slice(4)), c => c.charCodeAt(0));
      const iv = bin.slice(0, 12);
      const ct = bin.slice(12);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
      return new TextDecoder().decode(pt);
    } catch {
      return "";
    }
  },
  // Prototype-pollution guard for imported project JSON
  sanitizeProject(obj) {
    if (obj == null || typeof obj !== "object") return null;
    const banned = ["__proto__", "constructor", "prototype"];
    const safe = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      if (banned.includes(k)) continue;
      const v = obj[k];
      safe[k] = (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Blob))
        ? this.sanitizeProject(v)
        : v;
    }
    return safe;
  },
  // Storage quota check (returns { usage, quota, pct })
  async storageInfo() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0, pct: e.quota ? (e.usage / e.quota) : 0 };
      } catch {}
    }
    return { usage: 0, quota: 0, pct: 0 };
  },
};

// ============================================================
//  App State
// ============================================================
const state = {
  // Project
  projectId: null,
  projectName: "",

  // Input
  lang: null,
  langName: null,
  niche: "",
  brief: "",
  userTitle: "",
  audience: "",
  format: null,        // "shorts" | "long"
  duration: 60,

  // Output
  ideas: [],
  pickedIdea: null,
  title: "",
  script: null,
  music: [],
  scenes: [],          // editable scene list (for editor)
  storyboard: [],
  videoBlob: null,
  videoUrl: null,

  // Customisation
  userFace: null,
  userFaceImg: null,
  userVoice: null,
  voiceName: null,
  voiceDuration: 0,
  bgStyle: "videos",   // "videos" | "photos" | "animated" | "solid"
  transition: "fade",  // "fade" | "slide" | "zoom" | "none"
  selectedVoiceURI: null,

  // Settings (from IndexedDB)
  pexelsKey: "",

  // Anti-repetition memory (kept across regenerations within a session so
  // hitting "Regenerate Script" doesn't hand you the same hook again).
  recentScript: { hooks: [], bodies: [], intros: [], outros: [] },

  // New pipeline data
  competitorInsights: null,
  imagePrompts: [],
  sceneScore: null,
  selectedMusicTrack: null,
  voiceoverEnabled: true,
  voiceoverRate: 0.9,
  voiceoverPitch: 1.0,

  // Enriched content data
  videoStyle: null,
  researchNotes: null,
  emotionalArc: null,
  titleThumbnailData: null,
  voiceDirection: null,
  musicDirection: null,
};

// Pick a value from `arr` that isn't in `recentBucket` if possible.
// Records the choice so the next call avoids it for a while.
function pickFresh(arr, recentBucket, memorySize = 6) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const pool = arr.filter((x) => x && !recentBucket.includes(x));
  const choice = pool.length ? pool[Math.floor(Math.random() * pool.length)]
                              : arr[Math.floor(Math.random() * arr.length)];
  recentBucket.push(choice);
  while (recentBucket.length > memorySize) recentBucket.shift();
  return choice;
}

// ============================================================
//  DOM helpers
// ============================================================
const $ = (id) => document.getElementById(id);
const stepperItems = document.querySelectorAll(".step-item");
const stepViews = document.querySelectorAll(".step-view");

function showToast(msg, ms = 2400) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), ms);
}

function goToStep(n) {
  stepViews.forEach((v) => {
    const num = Number(v.id.replace("step-", ""));
    v.hidden = num !== n;
    v.classList.toggle("active", num === n);
  });
  // Map internal step IDs to stepper data-step values
  const internalToStepper = {1:1, 2:2, 7:6, 8:7, 9:8};
  const ds = internalToStepper[n] || n;
  stepperItems.forEach((li) => {
    const num = Number(li.dataset.step);
    li.classList.toggle("active", num === ds);
    // Mark as done if the stepper item's internal step is before current
    const itemInternal = {1:1, 2:2, 6:7, 7:8, 8:9}[num] || num;
    li.classList.toggle("done", itemInternal < n);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Auto-save whenever step changes
  saveProjectDebounced();
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ---------- Error handling ----------
// Wrap any async click handler so errors are surfaced to the user, not silent.
function safe(fn) {
  return async function (e) {
    const btn = e?.currentTarget;
    const wasLoading = btn?.classList?.contains("loading");
    try {
      return await fn.call(this, e);
    } catch (err) {
      console.error("[ScriptSpark error]", err);
      const msg = (err && err.message) ? err.message : String(err);
      showToast("❌ " + msg, 5000);
      // Re-enable button if it was in loading state
      if (btn) {
        btn.classList.remove("loading");
        btn.disabled = false;
      }
      // Throw again so console + devtools see it
      throw err;
    }
  };
}

// Global safety net for uncaught errors
window.addEventListener("error", (e) => {
  console.error("[Global error]", e.error || e.message);
  // Don't toast for tiny script errors that aren't user-facing
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled promise rejection]", e.reason);
  const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || "Unknown error");
  showToast("❌ " + msg, 5000);
  e.preventDefault();
});

// ============================================================
//  THEME
// ============================================================
function applyTheme(opt) {
  document.documentElement.setAttribute('data-theme', opt);
  document.body.dataset.theme = opt;
  document.body.classList.toggle("dark", opt === "dark");
  document.body.classList.toggle("light", opt === "light");
  try { localStorage.setItem("ss-theme", opt); } catch (e) {}
  
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.textContent = opt === 'dark' ? '☀️' : '🌙';
  }

  // Notify the wallpaper engine so it can swap to a theme-appropriate wallpaper
  document.dispatchEvent(new CustomEvent("appThemeChanged", { detail: { theme: opt } }));
}

const toggleBtn = document.getElementById('theme-toggle-btn');
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    let current = document.documentElement.getAttribute('data-theme');
    if(!current) current = localStorage.getItem("ss-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

(() => {
  let saved = "dark";
  try { saved = localStorage.getItem("ss-theme") || "dark"; } catch (e) {}
  applyTheme(saved);
})();

// ============================================================
//  IndexedDB — local project storage (no server)
// ============================================================
const DB_NAME = "ScriptSparkDB";
const DB_VERSION = 1;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("projects")) {
        const s = db.createObjectStore("projects", { keyPath: "id" });
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function dbClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

const saveProjectDebounced = debounce(async () => {
  if (!state.lang && !state.niche) return; // don't save empty state
  try {
    if (!state.projectId) state.projectId = "p_" + Date.now();
    if (!state.projectName) {
      state.projectName = state.title || state.niche || state.brief?.slice(0, 30) || "Untitled";
    }
    const proj = {
      id: state.projectId,
      name: state.projectName,
      updatedAt: Date.now(),
      state: { ...state, videoBlob: null, videoUrl: null, userFaceImg: null }, // don't save blob
    };
    await dbPut("projects", proj);
  } catch (e) {
    console.warn("Save failed:", e);
  }
}, 800);

async function saveSettings() {
  try {
    // Encrypt API keys at rest with AES-GCM (key in localStorage)
    const encPexels = await security.encryptString(state.pexelsKey || "");
    await dbPut("settings", { key: "pexelsKey", value: encPexels });
    const encGroq = await security.encryptString(state.groqKey || "");
    await dbPut("settings", { key: "groqKey", value: encGroq });
    await dbPut("settings", { key: "selectedVoiceURI", value: state.selectedVoiceURI });
  } catch (e) {
    console.warn("Settings save failed:", e);
  }
}
async function loadSettings() {
  try {
    const pk = await dbGet("settings", "pexelsKey");
    if (pk) state.pexelsKey = await security.decryptString(pk.value);
    const gk = await dbGet("settings", "groqKey");
    if (gk) state.groqKey = await security.decryptString(gk.value);
    const sv = await dbGet("settings", "selectedVoiceURI");
    if (sv) state.selectedVoiceURI = sv.value;
  } catch (e) {
    console.warn("Settings load failed:", e);
  }
}

// ============================================================
//  Pexels API — free stock videos
// ============================================================
async function pexelsSearchVideos(query, perPage = 8) {
  if (!state.pexelsKey) throw new Error("Pexels API key not set");
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${state.format === "shorts" ? "portrait" : "landscape"}&size=medium`;
  const resp = await fetch(url, { headers: { Authorization: state.pexelsKey } });
  if (!resp.ok) throw new Error("Pexels " + resp.status);
  const data = await resp.json();
  return data.videos || [];
}

function pickBestVideoFile(videos) {
  // Pick the smallest HD file (under 30MB) for fast loading
  const candidates = [];
  for (const v of videos) {
    if (!v.video_files) continue;
    for (const f of v.video_files) {
      if (f.file_type !== "video/mp4") continue;
      if (f.width < 480 || f.width > 1920) continue;
      candidates.push(f);
    }
  }
  if (!candidates.length) return null;
  // Prefer HD, then medium
  candidates.sort((a, b) => {
    const aw = Math.abs(a.width - 1280);
    const bw = Math.abs(b.width - 1280);
    return aw - bw;
  });
  return candidates[0];
}

async function loadVideoFile(url) {
  // Fetch as blob, then create object URL for <video>
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Video fetch failed");
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

async function loadVideoElement(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Video load failed"));
    v.src = url;
  });
}

// ============================================================
//  Modals — Help / Settings / Projects
// ============================================================
const _helpBtn = document.getElementById("helpBtn");
if (_helpBtn) _helpBtn.addEventListener("click", () => ($("helpModal").hidden = false));
const _closeHelp = document.getElementById("closeHelp");
if (_closeHelp) _closeHelp.addEventListener("click", () => ($("helpModal").hidden = true));
const _helpModal = document.getElementById("helpModal");
if (_helpModal) _helpModal.addEventListener("click", (e) => {
  if (e.target.id === "helpModal") _helpModal.hidden = true;
});

// Settings modal
$("settingsLink").addEventListener("click", async (e) => {
  e.preventDefault();
  await loadSettings();
  $("pexelsKey").value = state.pexelsKey || "";
  if($("groqKey")) $("groqKey").value = state.groqKey || localStorage.getItem("groqKey") || "";
  populateVoices();
  $("settingsModal").hidden = false;
});
$("closeSettings").addEventListener("click", () => ($("settingsModal").hidden = true));
$("settingsModal").addEventListener("click", (e) => {
  if (e.target.id === "settingsModal") $("settingsModal").hidden = true;
});
$("togglePexelsKey").addEventListener("click", () => {
  const inp = $("pexelsKey");
  inp.type = inp.type === "password" ? "text" : "password";
});
$("saveSettingsBtn").addEventListener("click", safe(async (e) => {
  const btn = e.currentTarget;
  btn.classList.add("loading"); btn.disabled = true;
  try {
    state.pexelsKey = $("pexelsKey").value.trim();
    state.groqKey = $("groqKey") ? $("groqKey").value.trim() : "";
    state.selectedVoiceURI = $("voiceSelect").value || null;
    // Also persist to localStorage as fallback
    localStorage.setItem("groqKey", state.groqKey);
    localStorage.setItem("pexelsKey", state.pexelsKey);
    await saveSettings();
    showToast("✅ Settings saved");
    $("settingsModal").hidden = true;
    saveProjectDebounced();
    populateInlineVoiceSelector();
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}));
$("testVoiceBtn").addEventListener("click", () => {
  const v = $("voiceSelect").value;
  if (!v) return showToast("⚠️ No voice selected");
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("नमस्ते, यह आपकी आवाज़ का परीक्षण है।");
    const voice = window.speechSynthesis.getVoices().find((x) => x.voiceURI === v);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : "en-IN";
    window.speechSynthesis.speak(u);
  } catch (e) {
    showToast("❌ Test failed: " + e.message);
  }
});
$("exportDataBtn").addEventListener("click", async () => {
  const projects = await dbGetAll("projects");
  const settings = {
    pexelsKey: state.pexelsKey,
    selectedVoiceURI: state.selectedVoiceURI,
  };
  const data = JSON.stringify({ projects, settings }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "scriptspark-export.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
  showToast("✅ Data exported");
});
$("clearDataBtn").addEventListener("click", async () => {
  if (!confirm("This will delete ALL your projects and settings from this browser. Continue?")) return;
  await dbClear("projects");
  await dbClear("settings");
  state.pexelsKey = ""; state.selectedVoiceURI = null;
  showToast("🗑️ All data cleared");
});
// Projects modal
$("myProjectsLink").addEventListener("click", async (e) => {
  e.preventDefault();
  await renderProjectsList();
  $("projectsModal").hidden = false;
});

// Brand home: reload the dashboard (reset to step 1, keep theme + settings)
$("brandHome").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    if (state.videoUrl) { try { URL.revokeObjectURL(state.videoUrl); } catch {} }
    state.currentProjectId = null;
    state.step = 0;
    state.title = "";
    state.pickedIdea = null;
    state.scenes = [];
    state.scriptText = "";
    state.musicMood = null;
    state.duration = 60;
    state.userFace = null;
    state.userFaceImg = null;
    state.userVoice = null;
    state.userVoiceAudio = null;
    state.videoUrl = null;
    if (typeof $("facePreview") !== "undefined" && $("facePreview")) {
      $("facePreview").hidden = true;
      $("facePreview").src = "";
    }
    if ($("faceEmpty")) $("faceEmpty").hidden = false;
    if ($("clearFaceBtn")) $("clearFaceBtn").hidden = true;
    if ($("voiceSample")) $("voiceSample").value = "";
    if ($("bgv")) $("bgv").src = "";

    renderEditor && renderEditor();
    renderIdeas && (state.ideas = [], renderIdeas());
    if ($("userTitle")) $("userTitle").value = "";
    if ($("brief")) $("brief").value = "";
    if ($("audience")) $("audience").value = "";
    if ($("timeLimit")) $("timeLimit").value = 1;
    if ($("finalTitle")) $("finalTitle").textContent = "";

    goToStep(1);
    saveProjectDebounced();
    showToast("🏠 Dashboard reset");
  } catch (err) {
    console.error("[brandHome]", err);
    showToast("❌ Could not reset: " + (err.message || err));
  }
});
$("closeProjects").addEventListener("click", () => ($("projectsModal").hidden = true));
$("projectsModal").addEventListener("click", (e) => {
  if (e.target.id === "projectsModal") $("projectsModal").hidden = true;
});
$("newProjectBtn").addEventListener("click", () => {
  if (confirm("Start a brand-new project? Your current draft will be saved to Projects.")) {
    state.projectId = null;
    state.projectName = "";
    Object.assign(state, {
      lang: null, langName: null, niche: "", brief: "", userTitle: "", audience: "",
      format: null, duration: 60, ideas: [], pickedIdea: null, title: "",
      script: null, music: [], scenes: [], storyboard: [],
      videoBlob: null, videoUrl: null, userFace: null, userFaceImg: null,
      userVoice: null, voiceName: null, voiceDuration: 0,
    });
    $("nicheInput").value = "";
    $("topicBrief").value = "";
    $("userTitle").value = "";
    $("targetAudience").value = "";
    $("projectsModal").hidden = true;
    goToStep(1);
  }
});

async function renderProjectsList() {
  const list = $("projectsList");
  const projects = (await dbGetAll("projects")).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!projects.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div>No projects yet. Start by picking a language!</div>`;
    return;
  }
  list.innerHTML = projects.map((p) => {
    const date = new Date(p.updatedAt);
    const ago = timeAgo(date);
    return `
      <div class="project-item" data-id="${p.id}">
        <div class="project-thumb">${p.state.format === "shorts" ? "📱" : "🎥"}</div>
        <div class="project-info">
          <div class="project-title">${escapeHtml(p.name || "Untitled")}</div>
          <div class="project-meta">${p.state.langName || "—"} · ${p.state.format || "—"} · ${ago}</div>
        </div>
        <div class="project-actions">
          <button data-act="open" title="Open">▶</button>
          <button data-act="delete" class="danger" title="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".project-item").forEach((item) => {
    const id = item.dataset.id;
    item.addEventListener("click", async (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "delete") {
        e.stopPropagation();
        if (confirm("Delete this project?")) {
          await dbDelete("projects", id);
          renderProjectsList();
        }
        return;
      }
      // Open
      const p = await dbGet("projects", id);
      if (!p) return;
      Object.assign(state, p.state);
      // Restore UI from state
      $("nicheInput").value = state.niche || "";
      $("topicBrief").value = state.brief || "";
      $("userTitle").value = state.userTitle || "";
      $("targetAudience").value = state.audience || "";
      $("projectsModal").hidden = true;
      // Jump to the latest relevant step
      if (state.scenes && state.scenes.length) goToStep(8);
      else if (state.script) goToStep(7);
      else if (state.ideas && state.ideas.length) goToStep(6);
      else if (state.niche) goToStep(2);
      else if (state.lang) goToStep(1);
      else goToStep(1);
      showToast("📂 Project loaded");
    });
  });
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// ============================================================
//  Voice picker
// ============================================================
function populateVoices() {
  const sel = $("voiceSelect");
  if (!sel) return;
  const voices = window.speechSynthesis.getVoices();
  const target = langToBcp(state.lang);
  const matching = voices.filter((v) => v.lang === target || v.lang.startsWith(state.lang || "en"));
  const others = voices.filter((v) => !matching.includes(v));
  sel.innerHTML = `<option value="">— System default —</option>` +
    matching.map((v) => `<option value="${v.voiceURI}">✓ ${v.name} (${v.lang})</option>`).join("") +
    others.map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join("");
  if (state.selectedVoiceURI) sel.value = state.selectedVoiceURI;
}

// ============================================================
//  Inline voice model selector (rendered on Step 6)
// ============================================================
function populateInlineVoiceSelector() {
  const container = document.getElementById("inlineVoiceSelect");
  if (!container) return;
  if (!("speechSynthesis" in window)) {
    container.innerHTML = `<p class="voice-unavailable">Web Speech API not supported in this browser.</p>`;
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    container.innerHTML = `<p class="voice-unavailable">Loading voices…</p>`;
    return;
  }
  const targetLang = langToBcp(state.lang);
  const langCode = state.lang || "en";

  const matching = voices.filter((v) => v.lang === targetLang || v.lang.startsWith(langCode));
  const englishFallback = voices.filter((v) => v.lang.startsWith("en") && !matching.includes(v)).slice(0, 3);
  const displayVoices = [...matching, ...englishFallback].slice(0, 6);

  if (displayVoices.length === 0) {
    container.innerHTML = `<p class="voice-unavailable">No voices found for ${state.langName || langCode}. Install language packs in your device settings.</p>`;
    return;
  }

  container.innerHTML = displayVoices.map((v) => {
    const isMatch = v.lang === targetLang || v.lang.startsWith(langCode);
    const displayName = v.name.length > 20 ? v.name.slice(0, 20) + "…" : v.name;
    return `
      <button class="voice-model-card ${state.selectedVoiceURI === v.voiceURI ? "selected" : ""}"
              data-uri="${security.escapeHtml(v.voiceURI)}"
              data-name="${security.escapeHtml(v.name)}"
              data-lang="${security.escapeHtml(v.lang)}"
              type="button">
        <span class="voice-flag">${isMatch ? "✅" : "🌐"}</span>
        <span class="voice-name">${security.escapeHtml(displayName)}</span>
        <span class="voice-lang-tag">${security.escapeHtml(v.lang)}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".voice-model-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedVoiceURI = card.dataset.uri;
      container.querySelectorAll(".voice-model-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      const label = document.getElementById("inlineVoiceLabel");
      if (label) label.textContent = card.dataset.name + " · " + card.dataset.lang;
      // Keep the legacy select in sync too
      const sel = $("voiceSelect");
      if (sel) sel.value = state.selectedVoiceURI;
      saveProjectDebounced();
    });
  });

  // Set initial label
  const label = document.getElementById("inlineVoiceLabel");
  if (label) {
    if (state.selectedVoiceURI) {
      const selected = displayVoices.find((v) => v.voiceURI === state.selectedVoiceURI);
      if (selected) label.textContent = selected.name + " · " + selected.lang;
    } else {
      label.textContent = "No voice selected (will use system default)";
    }
  }
}

document.getElementById("inlineTestVoiceBtn")?.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) return showToast("⚠️ Web Speech not supported");
  const voice = (typeof getSelectedVoice === "function") ? getSelectedVoice() : null;
  let testText = state.script && state.script.hook && state.script.hook.text;
  if (!testText) testText = state.niche ? `${state.niche} — ${(state.brief || "आज हम इस topic के बारे में बात करेंगे").slice(0, 60)}` : "नमस्ते, यह आपकी आवाज़ का परीक्षण है।";
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(testText);
    if (voice) utter.voice = voice;
    utter.lang = voice ? voice.lang : langToBcp(state.lang);
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
    showToast("🔊 Testing voice: " + (voice?.name || "default"));
  } catch (e) {
    showToast("❌ Test failed: " + e.message);
  }
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    populateVoices();
    populateInlineVoiceSelector();
  };
}

function langToBcp(code) {
  const map = {
    en: "en-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN",
    bn: "bn-IN", mr: "mr-IN", gu: "gu-IN", pa: "pa-IN",
    ml: "ml-IN", kn: "kn-IN",
  };
  return map[code] || "en-IN";
}

function getSelectedVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (state.selectedVoiceURI) {
    const v = voices.find((x) => x.voiceURI === state.selectedVoiceURI);
    if (v) return v;
  }
  const code = langToBcp(state.lang);
  return voices.find((v) => v.lang === code)
      || voices.find((v) => v.lang.startsWith(state.lang || "en"))
      || voices.find((v) => v.lang.startsWith("en"))
      || voices[0];
}

// ============================================================
//  STEP 1: Language
// ============================================================
const langMeta = {
  hi: { name: "Hindi",    native: "हिन्दी"   },
  en: { name: "English",  native: "English"  },
  ta: { name: "Tamil",    native: "தமிழ்"    },
  te: { name: "Telugu",   native: "తెలుగు"   },
  bn: { name: "Bengali",  native: "বাংলা"    },
  mr: { name: "Marathi",  native: "मराठी"    },
  gu: { name: "Gujarati", native: "ગુજરાતી" },
  pa: { name: "Punjabi",  native: "ਪੰਜਾਬੀ"   },
  ml: { name: "Malayalam",native: "മലയാളം"  },
  kn: { name: "Kannada",  native: "ಕನ್ನಡ"    },
};

document.querySelectorAll(".lang-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".lang-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    state.lang = card.dataset.lang;
    state.langName = langMeta[state.lang].name;
    showToast(`✅ ${langMeta[state.lang].native} selected`);
    saveProjectDebounced();
    setTimeout(() => goToStep(2), 350);
  });
});

// ============================================================
//  STEP 2: Niche
// ============================================================
document.querySelectorAll(".chip-suggest").forEach((chip) => {
  chip.addEventListener("click", () => {
    $("nicheInput").value = chip.textContent.replace(/^[^\w]+/, "").trim();
    $("nicheInput").focus();
  });
});

// Sanitize text inputs on paste/typing (strip control chars, cap length)
["nicheInput", "topicBrief", "userTitle", "targetAudience"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const max = parseInt(el.getAttribute("maxlength"), 10) || 2000;
    const cleaned = security.sanitizeText(el.value, max);
    if (cleaned !== el.value) el.value = cleaned;
  });
});

$("nicheInput").addEventListener("input", () => saveProjectDebounced());

// Step 2 → Step 3 (Topic → Brief)
const _toBrief = $("toBriefBtn");
if (_toBrief) {
  _toBrief.addEventListener("click", () => {
    const v = $("nicheInput").value.trim();
    if (!v) return showToast("⚠️ Please enter a topic first");
    if (v.length < 3) return showToast("⚠️ Topic is too short — be a bit more specific");
    state.niche = v;
    saveProjectDebounced();
    goToStep(3);
    // Fire-and-forget: load AI brief suggestions in the background
    loadBriefSuggestions().catch((e) => console.warn("loadBriefSuggestions:", e));
  });
}

// Step 3 → Step 4 (Brief → Format)
const _toFormatFromBrief = $("toFormatBtn");
if (_toFormatFromBrief) {
  _toFormatFromBrief.addEventListener("click", () => {
    const brief = ($("topicBrief")?.value || "").trim();
    state.brief = brief;
    state.userTitle = ($("userTitle")?.value || "").trim();
    state.audience = ($("targetAudience")?.value || "").trim();
    if (brief.length < 10) {
      return showToast("⚠️ Please add a brief (at least ~10 characters) so we can write a great script");
    }
    saveProjectDebounced();
    goToStep(4);
  });
}

// ============================================================
//  STEP 3: Brief
// ============================================================
$("topicBrief").addEventListener("input", () => {
  state.brief = $("topicBrief").value;
  saveProjectDebounced();
});
$("userTitle").addEventListener("input", () => {
  state.userTitle = $("userTitle").value;
  saveProjectDebounced();
});
$("targetAudience").addEventListener("input", () => {
  state.audience = $("targetAudience").value;
  saveProjectDebounced();
});

// Restore on load
setTimeout(() => {
  $("topicBrief").value = state.brief || "";
  $("userTitle").value = state.userTitle || "";
  $("targetAudience").value = state.audience || "";
}, 50);

// ============================================================
//  STEP 4: Format + Time
// ============================================================
document.querySelectorAll(".format-card").forEach((card) => {
  card.addEventListener("click", () => {
    try {
      document.querySelectorAll(".format-card").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-checked", "true");
      state.format = card.dataset.format;
      if (state.format === "shorts") {
        state.duration = 60;
        $("timeCard").hidden = true;
        $("toIdeasBtn").querySelector(".btn-label").textContent = "Generate Viral Ideas ✨";
      } else {
        $("timeCard").hidden = false;
        state.duration = Math.max(1, Math.min(60, Number($("timeLimit").value) || 8)) * 60;
        $("toIdeasBtn").querySelector(".btn-label").textContent = `Generate ${$("timeLimit").value || 8} min Video Ideas ✨`;
      }
      saveProjectDebounced();
      const label = state.format === "shorts" ? "📱 YouTube Shorts (60s, vertical)" : `🎥 Long Video (${Math.round(state.duration / 60)} min, horizontal)`;
      showToast(`✅ ${label} selected — generating ideas…`);
      // Briefly highlight the choice, then auto-advance to ideas step
      setTimeout(() => {
        // Double-click guard: only advance if this format is still selected
        if (!card.classList.contains("selected")) return;
        $("toIdeasBtn").click();
      }, 650);
    } catch (e) {
      showToast("❌ Could not select format: " + e.message);
    }
  });
});

$("timeLimit").addEventListener("input", () => {
  const m = Math.max(1, Math.min(60, Number($("timeLimit").value) || 8));
  $("toIdeasBtn").querySelector(".btn-label").textContent = `Generate ${m} min Video Ideas ✨`;
  state.duration = m * 60;
  saveProjectDebounced();
});

$("toIdeasBtn")?.addEventListener("click", safe(async (e) => {
  if (!state.format) return showToast("⚠️ Please choose Shorts or Long video");
  if (state.format === "long" && (!$("timeLimit").value || $("timeLimit").value < 1))
    return showToast("⚠️ Enter a valid duration");

  const btn = $("toIdeasBtn");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    state.ideas = await generateIdeas(state.niche, state.lang, state.format, state.duration);
    renderIdeas();
    goToStep(6);
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}));

// ============================================================
//  NEW FLOW: Generate button → Generation screen → Full pipeline
// ============================================================
const _generateBtn = $("generateBtn");
if (_generateBtn) {
  _generateBtn.addEventListener("click", safe(async (e) => {
    const v = $("nicheInput").value.trim();
    if (!v) return showToast("⚠️ Please enter a topic first");
    if (v.length < 3) return showToast("⚠️ Topic is too short — be a bit more specific");
    state.niche = v;
    saveProjectDebounced();

    const btn = $("generateBtn");
    btn.classList.add("loading");
    btn.disabled = true;
    try {
      await runScriptPipeline();
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }));

  // Category chip click → show topic suggestions
  document.querySelectorAll("#nicheChips .chip-suggest").forEach((chip) => {
    chip.addEventListener("click", () => {
      const niche = chip.dataset.niche || chip.textContent.replace(/[^\w\s]/g, "").trim();
      state.nicheCategory = niche;
      $("nicheInput").value = niche;
      showTopicSuggestions(niche);
    });
  });

  // Refresh suggestions button
  if ($("refreshSuggestions")) $("refreshSuggestions").addEventListener("click", () => {
    if (state.nicheCategory) showTopicSuggestions(state.nicheCategory);
  });
}

// ============================================================
//  TOPIC SUGGESTION SYSTEM — YouTube-style trending topics
// ============================================================
async function showTopicSuggestions(category) {
  const container = $("topicSuggestions");
  const list = $("suggestionList");
  const label = $("suggestionCategory");
  if (!container || !list) return;

  container.hidden = false;
  label.textContent = category;
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">🤖 Analyzing trending topics...</div>';

  try {
    const groqKey = state.groqKey || localStorage.getItem("groqKey") || "";
    if (!groqKey) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Add a Groq API key in Settings for AI suggestions</div>';
      return;
    }

    const prompt = `You are a YouTube content strategist specializing in viral faceless videos.

Category: "${category}"

Generate 6 viral video topic ideas that would perform well on YouTube. Each topic should:
- Be specific and curiosity-driven
- Follow successful YouTube title patterns
- Create a knowledge gap that makes people want to click
- Be suitable for a faceless documentary-style video

Return ONLY a JSON array of objects (no markdown, no explanation):
[
  {"title": "specific viral video title", "description": "1-2 sentence hook description", "search_volume": "high|medium|low", "competition": "low|medium|high"},
  ...
]

Examples of good topics:
- "The Lost City Found Under Antarctic Ice"
- "Why This Math Problem Took 300 Years to Solve"
- "The Company That Almost Controlled the Internet"`;

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 1500
      })
    });

    if (!resp.ok) throw new Error("API request failed");
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    let topics;
    try {
      topics = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      // Fallback topics
      topics = [
        { title: `The Untold Story of ${category}`, description: "Discover what they never told you", search_volume: "high", competition: "low" },
        { title: `Why ${category} Changed Everything`, description: "The moment that changed history", search_volume: "high", competition: "medium" },
        { title: `The Dark Secret Behind ${category}`, description: "Nobody talks about this", search_volume: "medium", competition: "low" },
      ];
    }

    // Render suggestion cards
    list.innerHTML = topics.map((t, i) => `
      <div class="suggestion-card" style="padding:12px 16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-weight:600;font-size:0.95rem;margin-bottom:4px;">${escapeHtml(t.title)}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);">${escapeHtml(t.description || "")}</div>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:6px;background:${t.search_volume === 'high' ? 'rgba(46,213,115,0.15)' : 'rgba(255,255,255,0.05)'};color:${t.search_volume === 'high' ? '#2ED573' : 'var(--text-muted)'};">${t.search_volume || 'medium'} search</span>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:6px;background:${t.competition === 'low' ? 'rgba(46,213,115,0.15)' : 'rgba(255,255,255,0.05)'};color:${t.competition === 'low' ? '#2ED573' : 'var(--text-muted)'};">${t.competition || 'medium'} competition</span>
        </div>
      </div>
    `).join("");

    // Add click handlers to suggestion cards
    list.querySelectorAll(".suggestion-card").forEach((card, i) => {
      card.addEventListener("click", () => {
        const topic = topics[i];
        $("nicheInput").value = topic.title;
        state.niche = topic.title;
        // Auto-click generate
        $("generateBtn").click();
      });
    });

  } catch (e) {
    console.warn("[TopicSuggestions] Failed:", e);
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Could not load suggestions. Type your topic above.</div>';
  }
}

// ============================================================
//  SCRIPT PIPELINE — generates script and shows it to user
// ============================================================
async function runScriptPipeline() {
  state.brief = state.niche;
  if ($("topicBrief")) $("topicBrief").value = state.brief;

  // Auto-fill format
  const selectedLength = document.querySelector("#lengthChips .opt-chip.selected");
  const lengthVal = selectedLength ? selectedLength.dataset.length : "medium";
  if (lengthVal === "short") {
    state.format = "shorts";
    state.duration = 60;
  } else if (lengthVal === "long") {
    state.format = "long";
    state.duration = 20 * 60;
  } else {
    state.format = "long";
    state.duration = 8 * 60;
  }

  if (!state.audience || !state.audience.trim()) {
    state.audience = autoDetectAudience(state.niche, state.lang);
  }

  // Show generation screen
  $("genTopicLabel").textContent = `Creating script about "${state.niche}"...`;
  goToStep(5);
  startGenerationAnimation();

  try {
    // Run pipeline steps 1-7 (up to script generation)
    const groqKey = state.groqKey || localStorage.getItem("groqKey") || "";
    if (!groqKey) throw new Error("Please add a Groq API key in Settings");

    // Step 1: Analyze topic
    updateGenerationProgress(0.07, "Step 1/7: Analyzing topic...");
    const analysis = await PIPELINE.analyzeTopic(state.niche, state.lang);

    // Step 2: Research
    updateGenerationProgress(0.14, "Step 2/7: Researching topic...");
    const research = await PIPELINE.researchTopic(state.niche, analysis.niche, analysis.recommended_angle);

    // Step 3: Find angle
    updateGenerationProgress(0.28, "Step 3/7: Finding best angle...");
    const angle = await PIPELINE.findBestAngle(state.niche, research, analysis.niche);

    // Step 4: Create title
    updateGenerationProgress(0.42, "Step 4/7: Creating viral title...");
    const titles = await PIPELINE.createViralTitle(state.niche, angle, analysis.niche);

    // Step 5: Story structure
    updateGenerationProgress(0.56, "Step 5/7: Building story structure...");
    const storyStructure = await PIPELINE.createStoryStructure(state.niche, research, angle, analysis.niche);

    // Step 6: Write script
    updateGenerationProgress(0.70, "Step 6/7: Writing high-retention script...");
    const script = await PIPELINE.writeScript(titles, research, angle, storyStructure, analysis.niche, state.lang, state.duration);

    // Step 7: Scene breakdown
    updateGenerationProgress(0.85, "Step 7/7: Creating scene breakdown...");
    const scenes = await PIPELINE.createSceneBreakdown(script.script, titles, analysis.niche, state.duration);

    // Store results
    state.nicheAnalysis = analysis;
    state.researchNotes = research;
    state.videoAngle = angle;
    state.title = titles.recommended_title || state.niche;
    state.titleThumbnailData = titles;
    state.storyStructure = storyStructure;
    state.fullScript = script.script;
    state.script = {
      hook: { text: script.hook || "", seconds: 5 },
      intro: { text: script.script?.slice(0, 200) || "", seconds: 10 },
      body: [{ heading: "Main Content", lines: [script.script || ""], seconds: Math.max(30, (script.estimated_duration_sec || 120) - 15) }],
      outro: { text: "Thanks for watching.", seconds: 10 }
    };

    // Map scenes
    if (scenes.scenes && scenes.scenes.length > 0) {
      state.scenes = scenes.scenes.map((s, i) => ({
        heading: `Scene ${i + 1}`,
        text: s.narration || "",
        seconds: s.duration_sec || 8,
        kind: i === 0 ? "hook" : i === scenes.scenes.length - 1 ? "outro" : "body",
        bg: null,
        visual_prompt: s.visual_prompt,
        camera_angle: s.camera_angle,
        camera_movement: s.camera_movement,
        mood: s.mood,
        transition: s.transition,
        music_mood: s.music_mood
      }));
    } else {
      state.scenes = generateFallbackScenes(script.script, state.format, state.duration);
    }
    state.storyboard = state.scenes;

    // Store scene data for later video generation
    state.pipelineSceneData = scenes;
    state.pipelineResearch = research;
    state.pipelineAngle = angle;
    state.pipelineTitles = titles;
    state.pipelineStory = storyStructure;
    state.pipelineScript = script;

    updateGenerationProgress(1.0, "Script complete!");
    stopGenerationAnimation();
    await new Promise(r => setTimeout(r, 400));

    // Show script to user
    renderScriptPreview();
    goToStep(7);
    showToast("✅ Script ready! Review it below.");

  } catch (err) {
    stopGenerationAnimation();
    console.error("Script pipeline failed:", err);
    showToast("❌ " + (err.message || "Generation failed"), 5000);
    goToStep(2);
  }
}

// Render script preview in step-7
function renderScriptPreview() {
  const titleEl = $("finalTitle");
  const scriptEl = $("finalScript");
  if (titleEl) titleEl.textContent = state.title || state.niche;
  if (scriptEl) scriptEl.innerHTML = formatFullScript(state.fullScript || "");
}

function formatFullScript(text) {
  if (!text) return '<span style="color:var(--text-muted);">No script generated yet.</span>';
  // Split into paragraphs and format nicely
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return paragraphs.map(p => `<p style="margin-bottom:12px;line-height:1.7;">${escapeHtml(p.trim())}</p>`).join("");
}

// ============================================================
//  STEP 5: Ideas
// ============================================================
function emojiForNiche(niche = "") {
  const n = niche.toLowerCase();
  if (/money|finance|stock|crypto|business|invest/.test(n)) return ["💰","📈","🤑","💸","🏦"];
  if (/psycholog|mind|brain|trick|hack/.test(n))          return ["🧠","🤯","😈","🌀","💭"];
  if (/food|cook|recipe|street/.test(n))                   return ["🍳","🍜","🌶️","😋","🥘"];
  if (/fit|gym|workout|health|yoga/.test(n))               return ["💪","🏋️","🔥","🥗","🧘"];
  if (/tech|ai|app|phone|gadget|code/.test(n))             return ["📱","🤖","💻","⚡","🛠️"];
  if (/game|gaming/.test(n))                               return ["🎮","🕹️","🏆","💥","🐉"];
  if (/travel|trip|place|visit/.test(n))                   return ["✈️","🌍","🏝️","🗺️","📸"];
  if (/study|education|exam|learn/.test(n))                return ["📚","🎓","✏️","🧠","💡"];
  if (/love|relation|breakup|date/.test(n))                return ["❤️","💔","💑","😢","🥰"];
  if (/movie|film|review|celeb/.test(n))                   return ["🎬","⭐","📺","🍿","🎭"];
  return ["🔥","✨","💥","🚀","⚡","💎","🎯","🌟","👀","🤯"];
}

function titlePatternsByLang(lang, niche) {
  // Hook templates — varied and specific
  const t = {
    hi: [
      `{N} का सच जो कोई नहीं बताता 🤯`,
      `मैंने {N} पर {X} रुपये कमाए 💰`,
      `{N} की ये 1 गलती सब करते हैं ⚠️`,
      `99% लोग {N} के बारे में ये नहीं जानते 😱`,
      `{N} सीखो — सिर्फ {X} मिनट में ⏱️`,
      `Doctor ने बताया {N} का राज 🩺`,
      `{N} बंद करो वरना पछताओगे 🚫`,
      `{N} के {X} टिप्स जो बदल देंगे आपकी ज़िंदगी 🧠`,
    ],
    en: [
      `The Truth About {N} Nobody Tells You 🤯`,
      `I Made ₹{X} With {N} 💰`,
      `This 1 {N} Mistake Will Ruin You ⚠️`,
      `99% Don't Know This About {N} 😱`,
      `Master {N} in Just {X} Minutes ⏱️`,
      `Doctors Hate This {N} Trick 🩺`,
      `Stop Doing {N} Right Now 🚫`,
      `{X} {N} Tips That Changed My Life 🧠`,
    ],
    ta: [
      `{N} பற்றிய உண்மை 🤯`,
      `{N} மூலம் ₹{X} சம்பாதித்தேன் 💰`,
      `{N} செய்யும் 1 தவறு ⚠️`,
      `99% பேர் அறியாத {N} ரகசியம் 😱`,
    ],
    te: [
      `{N} నిజం ఇదే 🤯`,
      `{N} తో ₹{X} సంపాదించాను 💰`,
      `{N} లో 1 తప్పు ⚠️`,
      `99% మందికి తెలియని {N} 😱`,
    ],
    bn: [
      `{N} এর সত্য 🤯`,
      `{N} দিয়ে ₹{X} আয় 💰`,
      `{N} এর 1 ভুল ⚠️`,
      `99% মানুষ জানে না {N} 😱`,
    ],
    mr: [
      `{N} चे सत्य 🤯`,
      `{N} मुळे ₹{X} कमावले 💰`,
      `{N} ची 1 चूक ⚠️`,
      `99% लोकांना माहीत नाही {N} 😱`,
    ],
    gu: [
      `{N} નું સત્ય 🤯`,
      `{N} થી ₹{X} કમાવ્યા 💰`,
      `{N} ની 1 ભૂલ ⚠️`,
      `99% લોકો જાણતા નથી {N} 😱`,
    ],
    pa: [
      `{N} ਦਾ ਸੱਚ 🤯`,
      `{N} ਨਾਲ ₹{X} ਕਮਾਏ 💰`,
      `{N} ਦੀ 1 ਗਲਤੀ ⚠️`,
      `99% ਲੋਕ ਨਹੀਂ ਜਾਣਦੇ {N} 😱`,
    ],
    ml: [
      `{N} യുടെ സത്യം 🤯`,
      `{N} വഴി ₹{X} സമ്പാദിച്ചു 💰`,
      `{N} ലെ 1 തെറ്റ് ⚠️`,
      `99% അറിയാത്ത {N} 😱`,
    ],
    kn: [
      `{N} ನ ಸತ್ಯ 🤯`,
      `{N} ನಿಂದ ₹{X} ಗಳಿಸಿದೆ 💰`,
      `{N} ನಲ್ಲಿ 1 ತಪ್ಪು ⚠️`,
      `99% ಜನರಿಗೆ ತಿಳಿಯದ {N} 😱`,
    ],
  };
  return t[lang] || t.en;
}

function fillTemplate(tpl, niche, x) {
  return tpl.replace("{N}", niche).replace("{X}", String(x));
}

async function generateIdeas(niche, lang, format, durationSec) {
  // Small delay so the loading state is visible even if AI is super fast
  await new Promise((r) => setTimeout(r, 250));

  const durLabel = format === "shorts" ? "60 sec Shorts" : `${Math.round(durationSec / 60)} min video`;
  const makeIdea = (title) => ({
    title,
    hook: hookForLang(lang, niche, state.brief),
    cta: ctaForLang(lang),
    emoji: pickRandom(emojiForNiche(niche)),
    durLabel,
  });

  // 1) Try AI first — produce 5 specific titles from the brief
  let aiTitles = null;
  try {
    const titles = await generateIdeasWithAI(niche, lang, format, durationSec);
    if (Array.isArray(titles) && titles.length) aiTitles = titles;
  } catch (e) {
    console.warn("AI ideas failed, using template fallback:", e);
  }

  // 2) Build the final list. User-provided title (if any) always goes first,
  //    then AI titles, then template fallback to fill any remaining slots.
  const userTitle = state.userTitle && state.userTitle.trim();
  const ideas = [];
  const used = new Set();
  if (userTitle) { ideas.push(makeIdea(userTitle)); used.add(userTitle); }

  if (aiTitles) {
    for (const t of aiTitles) {
      if (ideas.length >= 5) break;
      const cleaned = String(t).trim();
      if (!cleaned || used.has(cleaned)) continue;
      ideas.push(makeIdea(cleaned));
      used.add(cleaned);
    }
  }

  // 3) Template fallback to top up to 5 ideas
  const patterns = titlePatternsByLang(lang, niche);
  const moneyOptions = [1000, 5000, 10000, 50000, 100000, 1000000];
  const minOptions = [1, 2, 3, 5, 7, 10];
  const usedIdx = new Set();
  let safety = 0;
  while (ideas.length < 5 && safety < 60) {
    safety++;
    const idx = Math.floor(Math.random() * patterns.length);
    if (usedIdx.size >= patterns.length) usedIdx.clear();
    if (usedIdx.has(idx)) continue;
    usedIdx.add(idx);
    const tpl = patterns[idx];
    const x = format === "shorts" ? pickRandom(minOptions) : pickRandom(moneyOptions);
    const title = fillTemplate(tpl, niche, x);
    if (used.has(title)) continue;
    ideas.push(makeIdea(title));
    used.add(title);
  }
  return ideas.slice(0, 5);
}

function hookForLang(lang, niche, brief) {
  // Use brief if provided for a more specific hook
  if (brief && brief.trim()) {
    const snippets = {
      hi: `रुकिए! ${niche} के बारे में ${truncate(brief, 60)} — ये जानकर आपका दिमाग हिल जाएगा 😱`,
      en: `Wait! About ${niche}: ${truncate(brief, 60)} — this will blow your mind 😱`,
    };
    return snippets[lang] || snippets.en;
  }
  const map = {
    hi: `रुकिए! ${niche} के बारे में ये जानकर आपका दिमाग हिल जाएगा 😱`,
    en: `Wait! This about ${niche} will blow your mind 😱`,
    ta: `நில்லுங்கள்! ${niche} பற்றி இது உங்களை ஆச்சரியப்படுத்தும் 😱`,
    te: `ఆగండి! ${niche} గురించి ఇది మిమ్మల్ని ఆశ్చర్యపరుస్తుంది 😱`,
    bn: `থামো! ${niche} সম্পর্কে এটি আপনাকে অবাক করবে 😱`,
    mr: `थांबा! ${niche} बद्दल हे तुम्हाला आश्चर्यचकित करेल 😱`,
    gu: `રોકો! ${niche} વિશે આ તમને આશ્ચર્યચકિત કરશે 😱`,
    pa: `ਰੁਕੋ! ${niche} ਬਾਰੇ ਇਹ ਤੁਹਾਨੂੰ ਹੈਰਾਨ ਕਰ ਦੇਵੇਗਾ 😱`,
    ml: `നിർത്തൂ! ${niche} എന്നതിനെക്കുറിച്ചുള്ള ഇത് നിങ്ങളെ അത്ഭുതപ്പെടുത്തും 😱`,
    kn: `ನಿಲ್ಲಿ! ${niche} ಬಗ್ಗೆ ಇದು ನಿಮ್ಮನ್ನು ಅಚ್ಚರಿಗೊಳಿಸುತ್ತದೆ 😱`,
  };
  return map[lang] || map.en;
}

function ctaForLang(lang) {
  // Backwards-compat shim — buildScript now uses ctasForLang() to get the
  // full pool, but other callers (storyboard, ideas, downloads) still want
  // a single string so we hand them a fresh pick.
  const pool = ctasForLang(lang);
  return pickFresh(pool, state.recentScript.outros, 4);
}

function ctasForLang(lang) {
  const map = {
    hi: [
      `अगर ये काम का लगा तो 👍 LIKE, 🔔 SUBSCRIBE ज़रूर करें — नीचे कमेंट में बताओ आपको क्या सीखना है!`,
      `अगर एक भी point नया लगा — 🔔 SUBSCRIBE दबाओ, यही मेरी मेहनत का बदला है। और comment में बताओ अगला video किस पर बनाऊँ?`,
      `अब आपकी बारी — comment में बताओ इन में से कौनसी बात आपने पहले से try की है। 👍 LIKE दबाना मत भूलना।`,
      `Channel पर अभी कोई हो — तुरंत 🔔 SUBSCRIBE कर लो, अगला video और भी powerful आ रहा है। तब तक comment में अपना सवाल छोड़ जाओ।`,
      `Honestly अगर ये video आपके लिए useful था — एक छोटा सा 👍 दबा देना, मुझे और ऐसे topics बनाने का motivation मिलेगा।`,
      `रुको — जाने से पहले एक काम करो: 🔔 SUBSCRIBE और bell icon दोनों दबाओ। अगला video miss नहीं होना चाहिए।`,
    ],
    en: [
      `If this helped, smash 👍 LIKE, hit 🔔 SUBSCRIBE & comment what you want to learn next!`,
      `Hit subscribe if even ONE point hit different. Drop a comment with the topic you want me to break down next.`,
      `Your turn — comment which of these you've already tried, and which one you'll try this week. Don't forget the like 👍`,
      `Quick favour — if this saved you time, smash subscribe. The next video drops 2x more value than this one.`,
      `Before you scroll — bell + subscribe. Your future self will thank you when the next one lands.`,
      `Honest ask: if you got value, hit like. Costs you zero, helps me keep these free forever.`,
    ],
    ta: [
      `பயனுள்ளதாக இருந்தால் 👍 LIKE, 🔔 SUBSCRIBE செய்யுங்கள்!`,
      `ஒரே ஒரு point புதிதாக இருந்தால் — SUBSCRIBE கட்டாயம். அடுத்த video இதை விட powerful வரப்போகுது.`,
      `Comment-ல சொல்லுங்க: இதுல எது already try பண்ணினீங்க, எது புதுசா இருந்துச்சு?`,
    ],
    te: [
      `ఉపయోగపడితే 👍 LIKE, 🔔 SUBSCRIBE నొక్కండి!`,
      `ఒక్క point నైనా కొత్తగా అనిపిస్తే — SUBSCRIBE తప్పక. తదుపరి video ఇంకా powerful.`,
      `Comment చేయండి: ఏది already try చేశారు, ఏది ఈ వారం try చేస్తారు?`,
    ],
    bn: [
      `সাহায্যকারী হলে 👍 LIKE, 🔔 SUBSCRIBE করুন!`,
      `একটাও পয়েন্ট নতুন লেগেছে — SUBSCRIBE অবশ্যই। পরের ভিডিও আরও powerful।`,
      `Comment-এ বলুন: কোনটা আগে try করেছেন, কোনটা এই সপ্তাহে করবেন?`,
    ],
    mr: [
      `उपयुक्त वाटल्यास 👍 LIKE, 🔔 SUBSCRIBE करा!`,
      `एक तरी point नवीन वाटला — SUBSCRIBE नक्की. पुढचा video यापेक्षा भारी.`,
      `Comment मध्ये सांगा: कोणतं already try केलंय, कोणतं या आठवड्यात करणार?`,
    ],
    gu: [
      `ઉપયોગી લાગ્યું તો 👍 LIKE, 🔔 SUBSCRIBE કરો!`,
      `એક પણ point નવો લાગ્યો — તો SUBSCRIBE પાક્કે. આગળનો video આથી પણ powerful આવી રહ્યો છે, અને comment માં કહો કયો topic બતાવું.`,
      `Honestly, જો આ video useful લાગ્યો — એક નાનું 👍 દબાવી દો, બસ.`,
      `Comment માં કહો: આમાંથી કયું already try કર્યું છે, અને કયું આ અઠવાડિયે try કરશો?`,
      `જતા પહેલા એક કામ કરો — 🔔 SUBSCRIBE અને bell icon બંને દબાવો. આગળનો video miss ન થાય.`,
    ],
    pa: [
      `ਫਾਇਦੇਮੰਦ ਲੱਗਿਆ ਤਾਂ 👍 LIKE, 🔔 SUBSCRIBE ਕਰੋ!`,
      `ਇੱਕ ਵੀ point ਨਵਾਂ ਲੱਗਿਆ — SUBSCRIBE ਜ਼ਰੂਰ। ਅਗਲਾ video ਹੋਰ ਵੀ ਜ਼ਬਰਦਸਤ।`,
    ],
    ml: [
      `ഉപകാരപ്പെട്ടാൽ 👍 LIKE, 🔔 SUBSCRIBE ചെയ്യൂ!`,
      `ഒരൊറ്റ point പുതുതായി തോന്നിയാൽ — SUBSCRIBE തീർച്ച. അടുത്ത video കൂടുതൽ powerful.`,
    ],
    kn: [
      `ಉಪಯೋಗವಾಗಿದ್ದರೆ 👍 LIKE, 🔔 SUBSCRIBE ಮಾಡಿ!`,
      `ಒಂದು point ಆದರೂ ಹೊಸದಾಗಿ ಕಂಡರೆ — SUBSCRIBE ಖಂಡಿತ. ಮುಂದಿನ video ಇನ್ನೂ powerful.`,
    ],
  };
  return map[lang] || map.en;
}

function renderIdeas() {
  const grid = $("ideasGrid");
  grid.innerHTML = state.ideas.map((idea, i) => `
    <div class="idea-item">
      <div class="idea-content">
        <div class="idea-title">${idea.emoji} ${escapeHtml(idea.title)}</div>
        <div class="idea-hook">${escapeHtml(idea.hook)} · <span class="badge-inline">${idea.durLabel}</span></div>
      </div>
      <button class="idea-use-btn" data-idx="${i}">Use This →</button>
    </div>
  `).join("");

  grid.querySelectorAll(".idea-use-btn").forEach((b) => {
    b.addEventListener("click", safe(async () => {
      b.classList.add("loading");
      b.disabled = true;
      try {
        const idx = Number(b.dataset.idx);
        state.pickedIdea = state.ideas[idx];
        await buildScriptAndMusic();
        goToStep(7);
      } finally {
        b.classList.remove("loading");
        b.disabled = false;
      }
    }));
  });
}

$("regenIdeasBtn").addEventListener("click", safe(async (e) => {
  const btn = $("regenIdeasBtn");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    state.ideas = await generateIdeas(state.niche, state.lang, state.format, state.duration);
    renderIdeas();
    showToast("🔄 New ideas generated");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}));

// ============================================================
//  AI Script & Ideas generation (Anthropic Claude)
// ============================================================
async function callClaude(system, user, maxTokens = 1500) {
  const body = {
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: system || "" },
      { role: "user", content: user }
    ],
  };
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (state.groqKey || localStorage.getItem('groqKey')) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Groq API error " + response.status);
  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================================
//  COMPETITOR ANALYSIS — deep competitive intelligence
// ============================================================
async function analyzeCompetitors(topic, lang) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const style = state.videoStyle || "auto";
  const system = [
    "You are an elite YouTube competitive intelligence analyst with 10+ years of experience studying viral content across Indian YouTube.",
    "You analyze what makes top-performing videos dominate their niches.",
    "You think like a data scientist combined with a content strategist.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `DEEP COMPETITIVE ANALYSIS for topic: "${topic}"`,
    `Language: ${langName}`,
    `Video Style: ${style}`,
    `Niche: ${state.niche || "general"}`,
    "",
    "Analyze the YouTube landscape for this topic and return comprehensive intelligence:",
    "",
    '{',
    '  "topic_analysis": {',
    '    "core_subject": "What this video is REALLY about (deeper than surface level)",',
    '    "search_intent": "What viewers are actually looking for when they search this",',
    '    "knowledge_level": "beginner|intermediate|advanced — what level is the audience",',
    '    "emotional_driver": "What emotional need does this topic fulfill",',
    '    "trending_angle": "The most current/timely angle on this topic right now"',
    '  },',
    '  "audience_analysis": {',
    '    "primary_demographic": "age, gender, location, interests",',
    '    "pain_points": ["specific problems they face related to this topic"],',
    '    "desires": ["what they hope to achieve or learn"],',
    '    " objections": ["reasons they might click away"],',
    '    "consumption_habits": "when/how they watch — mobile, commute, late night"',
    '  },',
    '  "top_hooks": ["5 specific opening hooks that would stop scrollers for THIS topic"],',
    '  "content_gaps": ["3-5 things NO existing video covers well — this is your opportunity"],',
    '  "viral_angles": [',
    '    {"angle": "specific video angle", "why_it_works": "psychological reason", "example_title": "sample title"},',
    '    {"angle": "second angle", "why_it_works": "reason", "example_title": "title"}',
    '  ],',
    '  "emotional_triggers": ["primary emotions to target — be specific"],',
    '  "thumbnail_patterns": ["what visual elements top thumbnails use for this topic"],',
    '  "avg_video_length": "short|medium|long with reasoning",',
    '  "viral_structure": "How the top-performing video is structured — specific beat-by-beat breakdown",',
    '  "comment_sentiment": "What viewers complain about or wish was covered",',
    '  "recommended_style": "documentary|storytelling|horror|educational|tech|news|motivational — which works BEST for this specific topic and why"',
    '}',
    "",
    "Be SPECIFIC. Generic analysis is useless. Reference actual patterns, actual viewer behavior, actual content gaps.",
    "Think like you're briefing a top YouTube creator before they film.",
  ].join("\n");
  try {
    const text = await callClaude(system, user, 1500);
    return parseAIClaimingJSON(text);
  } catch (e) {
    console.warn("Competitor analysis failed:", e);
    return null;
  }
}

// ============================================================
//  QUALITY GATE — professional-grade script review
// ============================================================
async function qualityGateReview(scriptJSON, brief, topic) {
  const niche = state.niche || "";
  const langName = state.langName || "English";
  const videoStyle = state.videoStyle || "auto";
  const system = [
    "You are a senior YouTube content director who reviews scripts before they go into production.",
    "You've reviewed scripts for channels with 50M+ subscribers.",
    "You have zero tolerance for lazy AI writing, vague claims, or generic content.",
    "Your job is to identify weak points and rewrite them with specific, compelling content.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `REVIEW THIS SCRIPT for a ${langName} YouTube video about "${topic}"`,
    `Niche: ${niche}`,
    `Style: ${videoStyle}`,
    "",
    "QUALITY CHECKLIST — every point must pass ALL of these:",
    "",
    "1. SPECIFICITY TEST:",
    "   - Does each body point contain a REAL fact, number, date, name, or specific example?",
    "   - Would removing this point make the video meaningfully worse?",
    "   - If a point is vague → REWRITE with specific evidence",
    "",
    "2. ANTI-AI TEST:",
    "   - No template phrases: 'amateurs ignore', 'pros obsess', 'game changer', 'in this video', 'let\\'s dive in'",
    "   - No filler sentences that could be deleted without losing meaning",
    "   - No claims without delivery ('one thing to remember' with no actual thing)",
    "   - No topic title repetition as if it were information",
    "",
    "3. HOOK TEST:",
    "   - Is the opening line so strong that skipping it feels wrong?",
    "   - Does it start MID-ACTION or with a SHOCKING FACT, not a greeting?",
    "   - Would you personally stop scrolling for this hook?",
    "",
    "4. FLOW TEST:",
    "   - Does each body point create desire to hear the NEXT point?",
    "   - Is there a pattern interrupt every 30-45 seconds?",
    "   - Does the emotional arc build (curiosity → evidence → revelation → action)?",
    "",
    "5. CTA TEST:",
    "   - Is the call to action specific to THIS video's content?",
    "   - Does it feel like genuine advice, not a sales pitch?",
    "",
    `Script to review: ${JSON.stringify(scriptJSON)}`,
    `Original topic/brief: ${brief || topic}`,
    "",
    "For EACH point that fails any test:",
    "- Rewrite it with specific, compelling content",
    "- Reference real facts, real numbers, real examples about the topic",
    "- Make it feel like a human expert wrote it, not an AI",
    "",
    "Return the FULL corrected script JSON with the same structure.",
    "If the script is already excellent, return it unchanged.",
  ].join("\n");
  try {
    const text = await callClaude(system, user, 3500);
    const reviewed = parseAIClaimingJSON(text);
    return clampScriptAIResponse(reviewed, scriptJSON);
  } catch (e) {
    console.warn("Quality gate review failed:", e);
    return scriptJSON;
  }
}

// ============================================================
//  IMAGE PROMPT GENERATOR — cinematic director-level scene prompts
// ============================================================
async function generateImagePrompts(scenes, topic, lang) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const videoStyle = state.videoStyle || "auto";
  const niche = state.niche || "";

  const system = [
    "You are a cinematic visual director and DP (Director of Photography) for top YouTube channels.",
    "You think in frames, lighting, camera movement, and visual storytelling.",
    "You know exactly what B-roll footage will make each scene feel cinematic.",
    "You design prompts that work for stock video search (Pexels, Pixabay) AND AI video generation.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");

  const sceneData = scenes.map((s, i) => ({
    scene: i + 1,
    text: s.text || s.lines?.[0] || "",
    seconds: s.seconds,
    type: i === 0 ? "hook" : i === 1 ? "intro" : i === scenes.length - 1 ? "outro" : "body",
  }));

  const user = [
    `CINEMATIC VISUAL DIRECTION for a ${langName} YouTube video about "${topic}"`,
    `Niche: ${niche}`,
    `Video Style: ${videoStyle}`,
    "",
    "For EACH scene, create a complete visual direction package:",
    "",
    '{',
    '  "pexels_search_query": "3-6 word specific search term that will find relevant stock footage. Be VERY specific — e.g. not just \'city\' but \'mumbai street rain night crowded\' or \'person typing laptop coffee shop\'",',
    '  "cinematic_prompt": "A detailed 1-2 sentence shot description: camera angle (wide/medium/close-up/extreme close-up/overhead/drone/tracking), lighting (golden hour/blue hour/neon/natural/studio), color mood (warm/cool/desaturated/vibrant), movement (static/pan/tilt/dolly/handheld/steadicam), subject action. Make it feel like a frame from a documentary.",',
    '  "visual_mood": "single word for the visual mood of this scene (e.g. tense/mysterious/hopeful/dramatic/serene/energetic/melancholic/triumphant)",',
    '  "text_overlay": "The 8-12 most impactful words from this scene for on-screen text. These should be the words that, if read alone, make someone want to watch.",',
    '  "overlay_style": {',
    '    "position": "top|center|bottom|lower-third",',
    '    "animation": "fade|typewriter|slide-up|zoom-punch|none",',
    '    "font_weight": "bold|extra-bold"',
    '  },',
    '  "transition": "crossfade|wipe|zoom-cut|jump-cut|dip-to-black|none",',
    '  "color_grading": "teal-orange|warm-film|cold-documentary|high-contrast|vintage|modern-clean"',
    '}',
    "",
    "VISUAL DIRECTION RULES:",
    "- The hook scene MUST have the most visually striking prompt — this is what shows in the thumbnail preview",
    "- Match visual intensity to emotional intensity of the script",
    "- Use CONTRAST between scenes (dark→bright, close→wide, still→moving)",
    "- Reference real visual styles: 'like a Vice documentary', 'like a Netflix true crime intro', 'like a National Geographic shot'",
    "- For mystery/horror: use low-key lighting, shadows, Dutch angles, fog",
    "- For finance/business: use clean, modern, corporate aesthetics",
    "- For history: use warm, aged, archival feel",
    "- For tech: use neon, futuristic, clean gradients",
    "",
    "Return a JSON array of these objects, one per scene.",
  ].join("\n");
  try {
    const text = await callClaude(system, user, 2500);
    const prompts = parseAIClaimingJSON(text);
    return Array.isArray(prompts) ? prompts : [];
  } catch (e) {
    console.warn("Image prompt generation failed:", e);
    return scenes.map(() => ({
      pexels_search_query: topic.split(" ").slice(0, 3).join(" "),
      cinematic_prompt: "Cinematic establishing shot, natural lighting, slow movement",
      visual_mood: "neutral",
      text_overlay: "",
      overlay_style: { position: "center", animation: "fade", font_weight: "bold" },
      transition: "crossfade",
      color_grading: "modern-clean",
    }));
  }
}

// ============================================================
//  TITLE & THUMBNAIL GENERATOR — viral title + thumbnail concepts
// ============================================================
async function generateTitleAndThumbnails(topic, lang, niche, scriptTitle) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const videoStyle = state.videoStyle || "auto";
  const system = [
    "You are a YouTube title and thumbnail strategist who has helped videos cross 100M views.",
    "You understand the psychology of the click — what makes a human finger tap.",
    "You know that 70% of a video's success is determined by title + thumbnail before anyone watches a single second.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `Generate 5 viral title options and 3 thumbnail concepts for a ${langName} YouTube video about "${topic}"`,
    `Niche: ${niche}`,
    `Style: ${videoStyle}`,
    `AI-generated title: ${scriptTitle || "none"}`,
    "",
    "TITLE RULES:",
    "- Each title must be under 60 characters (YouTube truncates after that)",
    "- Create specific curiosity — not 'You won't believe' but something the viewer CAN'T guess",
    "- Use numbers when they add specificity (not just '5 tips' but '₹47,000 in 30 days')",
    "- Mix title styles: question, number-based, contrast, story-drop, bold claim",
    "- Write in the EXACT language requested",
    "- No clickbait that can't be delivered — the video must PAY OFF the title",
    "",
    "THUMBNAIL RULES:",
    "- Describe 3 distinct thumbnail concepts that would work with this topic",
    "- Each concept should use a different visual strategy",
    "- Reference: face expressions, text placement, color contrast, background imagery",
    "- Thumbnail text must be under 5 words, readable on mobile",
    "- Colors must pop — use complementary colors, high contrast",
    "",
    "Return JSON:",
    '{',
    '  "titles": [',
    '    {',
    '      "title": "<title text under 60 chars>",',
    '      "style": "question|number|contrast|story|bold|list",',
    '      "curiosity_gap": "what the viewer can\'t resist finding out",',
    '      "click_potential": "low|medium|high|viral"',
    '    }',
    '  ],',
    '  "thumbnails": [',
    '    {',
    '      "concept": "concept name",',
    '      "description": "detailed visual description of the thumbnail",',
    '      "face_expression": "specific expression if face is used (shock/curiosity/excitement/focus)",',
    '      "text_on_thumbnail": "text to overlay (max 5 words)",',
    '      "color_scheme": "dominant colors",',
    '      "background": "background imagery description",',
    '      "best_for": "which title this pairs with (index)"',
    '    }',
    '  ],',
    '  "recommended_title_index": 0,',
    '  "recommended_thumbnail_index": 0',
    '}',
  ].join("\n");
  try {
    const text = await callClaude(system, user, 1200);
    return parseAIClaimingJSON(text);
  } catch (e) {
    console.warn("Title/thumbnail generation failed:", e);
    return null;
  }
}

// ============================================================
//  VOICE DIRECTION — professional voice-over direction
// ============================================================
async function generateVoiceDirection(script, lang, niche) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const system = [
    "You are a voice-over director who has directed narration for top YouTube documentaries and Netflix series.",
    "You understand pacing, emphasis, breath control, and emotional delivery.",
    "You give specific, actionable direction that a narrator can follow.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `Create voice-over direction for this ${langName} YouTube script about "${state.niche || 'the topic'}"`,
    "",
    `Script hook: "${script.hook?.text || ''}"`,
    `Script intro: "${script.intro?.text || ''}"`,
    `Script body points: ${(script.body || []).map((b) => b.lines?.[0] || '').join(' | ')}`,
    `Script CTA: "${script.outro?.text || ''}"`,
    "",
    "Provide voice direction for the FULL script:",
    "",
    '{',
    '  "overall_tone": "The overall vocal tone — e.g. urgent whisper, confident storyteller, investigative journalist, excited friend",',
    '  "pacing": {',
    '    "hook": "speed and delivery style for the hook (e.g. fast, whispered, mid-sentence)",',
    '    "intro": "speed and delivery for the intro",',
    '    "body": "general body pacing pattern",',
    '    "outro": "speed and delivery for the CTA"',
    '  },',
    '  "key_emphasis_words": ["3-5 words or phrases that should receive special vocal emphasis throughout the script"],',
    '  "breathing_points": ["2-3 natural spots where the narrator should take a visible pause for dramatic effect"],',
    '  "emotional_peaks": ["which scenes should have heightened emotion and what emotion"],',
    '  "volume_dynamics": "how volume should shift — e.g. whisper hook → normal intro → build through body → strong CTA",',
    '  "reference_style": "A real YouTube channel or narrator style to emulate — e.g. like Vice documentaries, like Netflix Explained, like BBC Earth narration"',
    '}',
  ].join("\n");
  try {
    const text = await callClaude(system, user, 800);
    return parseAIClaimingJSON(text);
  } catch (e) {
    console.warn("Voice direction generation failed:", e);
    return null;
  }
}

// ============================================================
//  MUSIC SUGGESTION ENGINE — mood/genre-aware music curation
// ============================================================
async function suggestMusicWithAI(topic, emotion, format, lang) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const niche = state.niche || "";
  const videoStyle = state.videoStyle || "auto";
  const system = [
    "You are a music supervisor for YouTube content — you match background music to video mood, pacing, and emotional arc perfectly.",
    "You understand that music is 50% of a video's emotional impact.",
    "You know the difference between music that enhances vs music that distracts.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `Select the perfect background music for this ${langName} YouTube video:`,
    `Topic: ${topic}`,
    `Niche: ${niche}`,
    `Video Style: ${videoStyle}`,
    `Format: ${format}`,
    `Primary Emotion: ${emotion || "engaging"}`,
    "",
    "MUSIC SELECTION RULES:",
    "- Match BPM to video pacing (educational = 80-100, documentary = 90-110, motivational = 110-130, horror = 60-80)",
    "- Music should evolve with the video's emotional arc",
    "- Avoid lyrics unless they're instrumental versions",
    "- For Indian content: consider instruments like sitar, tabla, flute for cultural texture",
    "- For documentary: orchestral + ambient",
    "- For mystery/horror: minimal, dissonant, ambient drones",
    "- For tech: electronic, synth, modern",
    "",
    "Return JSON:",
    '{',
    '  "tracks": [',
    '    {',
    '      "name": "specific track name from Pixabay/YouTube Audio Library",',
    '      "mood": "primary mood — one word",',
    '      "genre": "specific genre (not just \'ambient\' but \'cinematic ambient with piano\')",',
    '      "bpm": "slow|medium|fast",',
    '      "source": "pixabay|youtube_audio_library",',
    '      "search_url": "direct search URL for this track type",',
    '      "why": "specific reason this track matches this video\'s emotional arc",',
    '      "best_for": "hook|body|outro|full_video",',
    '      "volume_profile": "should it start soft and build? stay consistent? dip during narration?"',
    '    }',
    '  ],',
    '  "recommended": 0,',
    '  "music_direction": "Overall direction for how music should be used throughout the video — e.g. \'Start with silence for 2 seconds, then ambient pad, build to full orchestral at the 3rd body point, dip for CTA\'"',
    '}',
  ].join("\n");
  try {
    const text = await callClaude(system, user, 800);
    return parseAIClaimingJSON(text);
  } catch (e) {
    console.warn("AI music suggestion failed:", e);
    return null;
  }
}

// ============================================================
//  VOICEOVER ENGINE — Web Speech API wrapper
// ============================================================
function getVoicesForLang(lang) {
  const langCodes = {
    hi: ["hi-IN"], en: ["en-IN", "en-US"], ta: ["ta-IN"], te: ["te-IN"],
    bn: ["bn-IN"], mr: ["mr-IN"], gu: ["gu-IN"], pa: ["pa-IN"],
    ml: ["ml-IN"], kn: ["kn-IN"],
  };
  const codes = langCodes[lang] || ["en-IN", "en-US"];
  const allVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return allVoices.filter((v) => codes.some((c) => v.lang.startsWith(c.split("-")[0])));
}

function createVoiceoverUtterance(text, lang, rate, pitch) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang || "en-IN";
  utter.rate = rate || 0.9;
  utter.pitch = pitch || 1.0;
  utter.volume = 1.0;
  const voices = getVoicesForLang(lang);
  if (voices.length) {
    const googleVoice = voices.find((v) => v.name.includes("Google"));
    utter.voice = googleVoice || voices[0];
  }
  return utter;
}

function measureVoiceoverDuration(text, lang) {
  return new Promise((resolve) => {
    const utter = createVoiceoverUtterance(text, lang);
    utter.onend = () => resolve(0);
    utter.onerror = () => resolve(0);
    if (window.speechSynthesis) {
      speechSynthesis.speak(utter);
      setTimeout(() => {
        try { speechSynthesis.cancel(); } catch(e) {}
        const wordCount = text.split(/\s+/).length;
        const baseDuration = wordCount * 0.35;
        resolve(Math.max(2, baseDuration));
      }, 100);
    } else {
      const wordCount = text.split(/\s+/).length;
      resolve(Math.max(2, wordCount * 0.35));
    }
  });
}

// ============================================================
//  DETECT MOOD from topic keywords
// ============================================================
function detectMoodFromTopic(topic) {
  const t = String(topic || "").toLowerCase();
  const map = {
    energetic: ["fitness","gym","workout","exercise","sports","dance","energy"],
    mysterious: ["psychology","mystery","secret","dark","unknown","truth","crime"],
    motivational: ["success","money","career","study","motivation","business","growth"],
    calm: ["meditation","yoga","sleep","anxiety","mental health","peace","relax"],
    hype: ["trending","viral","facts","shocking","india","roast","challenge"],
    emotional: ["love","relationship","family","life","story","emotion","heart"],
  };
  for (const [mood, words] of Object.entries(map)) {
    if (words.some((w) => t.includes(w))) return mood;
  }
  return "motivational";
}

function parseAIClaimingJSON(text) {
  // Robustly extract JSON from Claude's reply — strip markdown fences,
  // trim any prose around the JSON, then parse.
  let t = String(text == null ? "" : text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.search(/[\[{]/);
  const lastObj = t.lastIndexOf("}");
  const lastArr = t.lastIndexOf("]");
  const last = Math.max(lastObj, lastArr);
  if (first >= 0 && last > first) t = t.slice(first, last + 1).trim();
  return JSON.parse(t);
}

function clampScriptAIResponse(parsed, fallback) {
  // Defensive: if AI returns slightly wrong shape, normalise to
  // the same structure buildScript() produces.
  // Handle both old (outro) and new (cta) field names from AI.
  // Also preserves enriched metadata fields (research_notes, emotional_arc).
  const ctaText = parsed?.cta || parsed?.outro?.text || "";
  const out = {
    hook:  { text: String(parsed?.hook?.text  || fallback.hook.text  || ""), seconds: Math.max(2, Math.min(8, Number(parsed?.hook?.seconds) || 3)) },
    intro: { text: String(parsed?.intro?.text || fallback.intro.text || ""), seconds: Math.max(4, Math.min(20, Number(parsed?.intro?.seconds) || 8)) },
    body:  Array.isArray(parsed?.body) && parsed.body.length
      ? parsed.body.map((b, i) => ({
          heading: String(b?.heading || fallback.body[i]?.heading || `Point ${i + 1}`),
          lines: Array.isArray(b?.lines) && b.lines.length ? b.lines.map((l) => String(l)) : [String(b?.text || b?.lines || "")],
          seconds: Math.max(3, Math.min(60, Number(b?.seconds) || fallback.body[i]?.seconds || 12)),
        }))
      : fallback.body,
    outro: { text: String(ctaText || fallback.outro.text || ""), seconds: Math.max(3, Math.min(20, Number(parsed?.outro?.seconds) || 8)) },
  };
  // Preserve metadata if provided
  if (parsed?.research_notes) out.research_notes = String(parsed.research_notes);
  if (parsed?.emotional_arc) out.emotional_arc = String(parsed.emotional_arc);
  return out;
}

async function generateScriptWithAI(niche, brief, audience, lang, format, durationSec) {
  const isShorts = format === "shorts";
  const bodyCount = isShorts ? 4 : Math.max(5, Math.round(durationSec / 25));
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || lang || "English";
  const safeBrief = String(brief || niche || "").trim();
  const safeAudience = String(audience || "general Indian audience").trim();
  const safeNiche = String(niche || "").trim();
  const videoStyle = state.videoStyle || "auto";
  const competitors = state.competitorInsights;

  // Build competitor context for the prompt
  let competitorContext = "";
  if (competitors) {
    const parts = [];
    if (competitors.topic_analysis) {
      parts.push(`Topic deep-dive: ${JSON.stringify(competitors.topic_analysis)}`);
    }
    if (competitors.audience_analysis) {
      parts.push(`Audience deep-dive: ${JSON.stringify(competitors.audience_analysis)}`);
    }
    if (competitors.content_gaps?.length) {
      parts.push(`Content gaps to exploit: ${competitors.content_gaps.join("; ")}`);
    }
    if (competitors.viral_angles?.length) {
      parts.push(`Viral angles identified: ${competitors.viral_angles.map((a) => a.angle).join("; ")}`);
    }
    if (competitors.recommended_style) {
      parts.push(`Best style for this topic: ${competitors.recommended_style}`);
    }
    if (competitors.viral_structure) {
      parts.push(`Winning structure: ${competitors.viral_structure}`);
    }
    if (parts.length) competitorContext = "\n\nCOMPETITIVE INTELLIGENCE:\n" + parts.join("\n");
  }

  // Anti-repetition memory
  const avoidList = [
    ...state.recentScript.hooks,
    ...state.recentScript.intros,
    ...state.recentScript.outros,
    ...state.recentScript.bodies,
  ].filter(Boolean).slice(-12);

  // ── Niche-specific style instructions ──
  const nicheStyleMap = {
    horror: "STYLE: Horror/Mystery. Build dread through atmosphere. Use sensory details — sounds, shadows, temperature. Never explain the scary thing directly — let the viewer's imagination do the work. Reference real locations, real cases, real evidence. The tone is investigative journalist meets horror storyteller.",
    mystery: "STYLE: Investigation/Mystery. Present clues like a detective building a case. Use rhetorical questions. Reveal information in layers. Reference real evidence, real documents, real witness accounts. The viewer should feel like they're solving the mystery alongside you.",
    crime: "STYLE: True Crime Investigation. Factual, evidence-based storytelling. Reference real court documents, real timelines, real witness testimony. Build tension through chronological reveal. Never sensationalize — let the facts speak. The tone is documentary narrator.",
    history: "STYLE: Documentary Storytelling. Transport the viewer to the era. Use specific dates, names, amounts, locations. Build context before revealing the main event. Connect historical events to modern consequences. The tone is National Geographic meets BBC Documentary.",
    finance: "STYLE: Authority + Education. Present specific numbers, real case studies, actual returns. Reference real companies, real market events. Explain complex concepts simply but never dumb down. The tone is Bloomberg meets a trusted financial advisor.",
    business: "STYLE: Case Study Analysis. Reference real companies, real revenue numbers, real decisions. Break down WHY things worked, not just WHAT happened. Use before/after frameworks. The tone is Harvard Business Review meets YouTube.",
    tech: "STYLE: Explanation + Curiosity. Explain HOW things work at a specific level. Reference real specs, real benchmarks, real comparisons. Build from simple to complex. The tone is MKBHD meets a tech documentary.",
    education: "STYLE: Engaging Teaching. Break complex topics into digestible chunks. Use analogies, visual metaphors, real examples. Test the viewer's understanding with questions. The tone is the best teacher you ever had.",
    fitness: "STYLE: Results + Science. Reference real studies, real transformation data, specific rep ranges and timings. Use before/after frameworks. The tone is a knowledgeable personal trainer.",
    food: "STYLE: Cultural + Sensory. Describe flavors, textures, aromas. Reference real regions, real techniques, real ingredients. Connect food to culture and history. The tone is food documentary.",
    gaming: "STYLE: Energetic + Entertaining. Fast-paced delivery. Reference real game mechanics, real strategies, real community moments. The tone is your most entertaining friend who happens to be a gaming expert.",
    travel: "STYLE: Exploration Storytelling. Transport the viewer through sensory details — sounds of markets, taste of street food, feel of ancient stone. Reference real locations, real costs, real logistics. The tone is Anthony Bourdain meets a travel vlog.",
    documentary: "STYLE: Cinematic Documentary. Every scene should feel like a film. Use visual language that evokes specific imagery. Build emotional arcs through information reveal. Reference real footage, real events, real people. The tone is David Attenborough meets Vice.",
    storytelling: "STYLE: Narrative Storytelling. Structure like a short film — character, conflict, resolution. Use specific sensory details. Build empathy through personal moments. The tone is a master storyteller at a campfire.",
    news: "STYLE: News Analysis. Present multiple perspectives. Reference real sources, real data, real expert opinions. Analyze WHY something matters, not just WHAT happened. The tone is investigative journalist.",
    motivational: "STYLE: Inspiration through Evidence. Don't just motivate — prove WHY the viewer can succeed. Reference real transformation stories, real data, real frameworks. The tone is a coach who has actually done it.",
  };

  const styleInstruction = videoStyle !== "auto" && nicheStyleMap[videoStyle]
    ? nicheStyleMap[videoStyle]
    : (nicheStyleMap[DetectNicheFromTopic(niche)] || nicheStyleMap["documentary"]);

  const systemPrompt = [
    "You are an elite YouTube content strategist, viral documentary writer, and storytelling specialist.",
    "You have produced content for channels with 10M+ subscribers across Indian YouTube.",
    "You think like a film director, write like a bestselling author, and analyze like a data scientist.",
    "",
    "CORE RULES:",
    "1. The user's brief/topic is a DIRECTION ONLY — never repeat it verbatim in the script.",
    "2. Your job is to RESEARCH and WRITE the ACTUAL CONTENT. If the topic is '7-minute abs', write the ACTUAL 7 exercises, ACTUAL seconds per exercise, ACTUAL muscle groups, ACTUAL common mistakes.",
    "3. SPECIFIC > VAGUE. Always. A script with no real information = FAILED output.",
    "4. Every claim must be backed by a specific fact, number, name, date, or example.",
    "5. Write in the EXACT language requested. Mix natural code-switching only where native speakers actually do it.",
    "6. NEVER use: 'amateurs ignore', 'pros obsess', 'plot twist', 'write it down', 'yes really', 'game changer', 'in this video we will', 'without further ado', 'let\'s dive in'.",
    "7. The hook must be so strong that skipping it feels physically uncomfortable.",
    "8. Every 30-45 seconds, there must be a pattern interrupt — a question, a reveal, a shift in tone, a direct callout.",
    "9. Use SENSORY LANGUAGE. Make the viewer SEE, HEAR, FEEL, TASTE the content.",
    "10. End with a CTA that feels like genuine advice from a friend, not a sales pitch.",
    "",
    styleInstruction,
    "",
    "EMOTIONAL ARC STRUCTURE:",
    "- Opens with FEAR/CURIOSITY/SHOCK (win the first 3 seconds or lose forever)",
    "- Builds with INTRIGUE/SPECIFIC EVIDENCE (give them reasons to keep watching)",
    "- Peaks with REVELATION/INSIGHT (the payoff they've been waiting for)",
    "- Ends with EMPOWERMENT/ACTION (make them feel changed by watching)",
    "",
    "Return ONLY valid JSON. No markdown, no code fences, no explanation.",
  ].join("\n");

  const userPrompt = [
    `Create a complete YouTube video package for:`,
    "",
    `📌 TOPIC: ${safeNiche}`,
    `📝 DIRECTION: ${safeBrief}`,
    `👥 AUDIENCE: ${safeAudience}`,
    `🌐 LANGUAGE: ${langName} (code: ${lang})`,
    `📐 FORMAT: ${isShorts ? "YouTube Shorts (MUST be under 60 seconds total — every word counts)" : `Long-form video (${Math.round(durationSec / 60)} minutes — build a complete experience)`}`,
    `🎯 BODY POINTS NEEDED: ${bodyCount}`,
    competitorContext,
    avoidList.length
      ? `\n🚫 DO NOT REUSE these recently used lines:\n${avoidList.map((s) => `  - "${s}"`).join("\n")}\n`
      : "",
    "",
    "Now, as an elite YouTube strategist, create the complete script.",
    "",
    "REQUIREMENTS FOR EACH BODY POINT:",
    "- Use a DIFFERENT rhetorical shape (contrarian, numeric, story, warning, how-to, question, mistake, reveal, contrast, action, case study, before/after)",
    "- Include at least ONE specific fact, number, statistic, or real-world example",
    "- Maximum 2-3 sentences per point — spoken naturally, not written formally",
    "- Each point must create a desire to hear the NEXT point",
    "",
    "Return this JSON structure:",
    '{',
    '  "title": "<viral YouTube title — specific, curiosity-driven, with emoji>",',
    '  "hook": {',
    '    "text": "<scroll-stopping opening — max 10 words, start mid-action or shocking fact>",',
    '    "seconds": 3',
    '  },',
    '  "intro": {',
    '    "text": "<set stakes + promise specific payoff in 1-2 sentences>",',
    '    "seconds": 8',
    '  },',
    `  "body": [`,
    `    {`,
    `      "heading": "Point 1",`,
    `      "lines": ["<what the presenter SAYS — with real facts, numbers, specific examples>"],`,
    `      "seconds": ${isShorts ? 8 : 15}`,
    `    }`,
    `    // ... ${bodyCount} points total, each with a DIFFERENT rhetorical shape`,
    `  ],`,
    '  "cta": "<genuine, specific call to action — reference something from the video>",',
    '  "research_notes": "<1-2 sentences about what research informed this script>",',
    '  "emotional_arc": "<brief description of the emotional journey: what the viewer feels at start, middle, end>"',
    '}',
    "",
    "QUALITY GATE (check before responding):",
    "- Would YOU stop scrolling for this hook? If not, rewrite it.",
    "- Does every body point give a SPECIFIC fact or example? If not, add one.",
    "- Does the script feel like a friend telling you something amazing, or like an AI wrote it?",
    "- Is the CTA specific to THIS video's content, not generic?",
    `- Total duration target: ${isShorts ? "under 60 seconds" : Math.round(durationSec / 60) + " minutes"}`,
  ].join("\n");

  // More tokens for comprehensive output
  const maxTokens = isShorts ? 1600 : Math.min(5000, 2000 + bodyCount * 250);
  const text = await callClaude(systemPrompt, userPrompt, maxTokens);
  const parsed = parseAIClaimingJSON(text);

  // Store research notes and emotional arc if provided
  if (parsed.research_notes) state.researchNotes = parsed.research_notes;
  if (parsed.emotional_arc) state.emotionalArc = parsed.emotional_arc;

  // Normalise against the template fallback
  const out = clampScriptAIResponse(parsed, buildScript());

  // Anti-repetition tracking
  try {
    if (out.hook?.text)  state.recentScript.hooks.push(out.hook.text);
    if (out.intro?.text) state.recentScript.intros.push(out.intro.text);
    if (out.outro?.text) state.recentScript.outros.push(out.outro.text);
    (out.body || []).forEach((b) => {
      (b.lines || []).forEach((l) => state.recentScript.bodies.push(String(l)));
    });
    const cap = (a, n) => { while (a.length > n) a.shift(); };
    cap(state.recentScript.hooks, 8);
    cap(state.recentScript.intros, 4);
    cap(state.recentScript.outros, 4);
    cap(state.recentScript.bodies, 20);
  } catch (e) { /* non-fatal */ }

  return out;
}

// Detect niche from topic keywords for style matching
function DetectNicheFromTopic(topic) {
  const t = String(topic || "").toLowerCase();
  if (/horror|ghost|haunted|paranormal|scary|bhoot|डरावन|आत्मा|haunting|mystery|crime|murder|true crime/.test(t)) return "horror";
  if (/mystery|unsolved|secret|hidden|mysterious/.test(t)) return "mystery";
  if (/crime|murder|case|investigation|police|forensic/.test(t)) return "crime";
  if (/history|historical|ancient|empire|king|war|battle|dynasty|वंश|इतिहास/.test(t)) return "history";
  if (/finance|money|invest|stock|crypto|business|income|earn|wealth|paise|paisa|पैसा|कमाई/.test(t)) return "finance";
  if (/startup|business|company|revenue|profit|entrepreneur|व्यापार/.test(t)) return "business";
  if (/tech|ai|app|phone|gadget|code|software|computer|digital|robot|machine learning|टेक|एआई/.test(t)) return "tech";
  if (/study|education|exam|learn|school|college|padhai|पढ़ाई|परीक्षा|exam|upsc|jee|neet/.test(t)) return "education";
  if (/fit|gym|workout|health|yoga|diet|exercise|abs|muscle|वर्कआउट|स्वास्थ्य/.test(t)) return "fitness";
  if (/food|cook|recipe|street|eat|taste|cuisine|restaurant|खाना|रेसिपी|स्वाद/.test(t)) return "food";
  if (/game|gaming|esport|pubg|freefire|valorant|minecraft/.test(t)) return "gaming";
  if (/travel|trip|place|visit|tourism|country|city|explore|यात्रा|घूमना/.test(t)) return "travel";
  if (/love|relation|breakup|date|marriage|dating|pyaar|प्यार|रिश्ते/.test(t)) return "love";
  if (/news|political|government|minister|election|politics|राजनीति/.test(t)) return "news";
  if (/motivational|success|inspire|mindset|discipline|habit/.test(t)) return "motivational";
  if (/documentary|real story|true story|actual/.test(t)) return "documentary";
  return "documentary";
}

async function generateIdeasWithAI(niche, lang, format, durationSec) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || lang || "English";
  const audience = String(state.audience || "general Indian audience").trim();
  const brief = String(state.brief || niche || "").trim();
  const videoStyle = state.videoStyle || "auto";
  const system = [
    "You are an elite YouTube content strategist who has generated viral titles for channels with 10M+ subscribers.",
    "You understand that the title is 70% of a video's success.",
    "You create titles that exploit specific curiosity gaps — not generic clickbait.",
    "You write in the EXACT language requested.",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join(" ");
  const user = [
    `Generate 5 viral YouTube title ideas for a ${langName} video about:`,
    `Topic: ${brief}`,
    `Niche: ${niche}`,
    `Audience: ${audience}`,
    `Format: ${format === "shorts" ? "YouTube Shorts (60s)" : `Long-form (${Math.round(durationSec / 60)} min)`}`,
    `Style: ${videoStyle}`,
    "",
    "TITLE STRATEGY:",
    "- Each title must be under 60 characters",
    "- Each title must use a DIFFERENT psychological trigger:",
    "  1. Curiosity gap ('The one thing about X nobody tells you')",
    "  2. Specificity ('₹47,000 in 30 days — here's exactly how')",
    "  3. Contrast/contrarian ('Why everything you know about X is wrong')",
    "  4. Story drop ('I tried X for 30 days — what happened shocked me')",
    "  5. Authority ('Doctors/Experts/Insiders reveal X')",
    "- No generic titles. Every title must feel specific to THIS topic.",
    "- Use numbers, specifics, or concrete details when possible.",
    "",
    "Return a JSON array of 5 title strings.",
  ].join("\n");
  const text = await callClaude(system, user, 600);
  const titles = parseAIClaimingJSON(text);
  if (!Array.isArray(titles)) throw new Error("AI ideas: expected JSON array");
  return titles.filter((t) => typeof t === "string" && t.trim()).slice(0, 5);
}

// ============================================================
//  Brief suggestions (Step 3) — AI-generated, mood-themed
// ============================================================
function detectNicheMood(niche) {
  const n = String(niche || "").toLowerCase();
  if (/horror|ghost|haunted|paranormal|dark|scary|bhoot|डरावन|आत्मा|haunting|mystery|crime|murder|true crime|डार्क/.test(n)) return "horror";
  if (/money|finance|stock|invest|crypto|business|income|earn|paise|paisa|पैसा|कमाई|व्यापार/.test(n)) return "finance";
  if (/tech|ai|app|phone|gadget|code|software|computer|digital|टेक|एआई/.test(n)) return "tech";
  if (/food|cook|recipe|street|eat|taste|खाना|रेसिपी|स्वाद/.test(n)) return "food";
  if (/fit|gym|workout|health|yoga|diet|exercise|वर्कआउट|स्वास्थ्य/.test(n)) return "fitness";
  if (/love|relation|breakup|date|marriage|pyaar|प्यार|रिश्ते/.test(n)) return "love";
  if (/study|education|exam|learn|school|college|padhai|पढ़ाई|परीक्षा/.test(n)) return "education";
  return "default";
}

async function generateBriefSuggestionsWithAI(niche, lang, mood) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const moodInstructions = {
    horror: "These are for dark mystery / horror content. Each suggestion should feel eerie, suspenseful, or shocking. Use dramatic language. Like real Indian dark mystery YouTube channels.",
    finance: "These are for finance / money content. Suggestions should feel high-stakes, aspirational, or cautionary. Use numbers where possible.",
    tech: "These are for tech content. Suggestions should feel cutting-edge, surprising, or practical.",
    food: "These are for food content. Suggestions should feel mouth-watering, specific, and cultural.",
    fitness: "These are for fitness content. Suggestions should feel motivational and result-focused.",
    love: "These are for relationship content. Suggestions should feel relatable and emotionally engaging.",
    education: "These are for education content. Suggestions should feel helpful, clear, and student-focused.",
    default: "Make the suggestions interesting, specific to the niche, and clickable.",
  };

  const systemPrompt = `You are an expert Indian YouTube content strategist. You write brief video concept suggestions that help creators know exactly what their video should cover. Each suggestion is 1-2 sentences, specific, interesting, and feels authentic for the niche. You write in the EXACT language requested. Return ONLY valid JSON, no markdown.`;

  const userPrompt = [
    `Niche: ${niche}`,
    `Language: ${langName} (code: ${lang})`,
    `Mood type: ${mood}`,
    `${moodInstructions[mood] || moodInstructions.default}`,
    ``,
    `Generate 4 brief video concept suggestions for a YouTube video in this niche.`,
    `Each suggestion is a 1-2 sentence description of what the video should cover.`,
    `They should be SPECIFIC to "${niche}", not generic.`,
    `They should feel authentic to the mood: ${mood}.`,
    `Write them in ${langName}.`,
    ``,
    `Return ONLY a JSON array of 4 strings. No explanation, no markdown.`,
    `Example format: ["Suggestion 1", "Suggestion 2", "Suggestion 3", "Suggestion 4"]`,
  ].join("\n");

  const text = await callClaude(systemPrompt, userPrompt, 500);
  const parsed = parseAIClaimingJSON(text);
  if (!Array.isArray(parsed)) throw new Error("Expected array");
  return parsed.filter((s) => typeof s === "string" && s.trim()).slice(0, 4);
}

function getFallbackBriefSuggestions(niche, lang, mood) {
  const en = {
    horror: [
      `The real unsolved mystery of ${niche} that still haunts investigators today.`,
      `What actually happened at ${niche} — the truth the mainstream media won't tell you.`,
      `${niche}: A true story so terrifying, you'll want to sleep with the lights on.`,
      `The dark secret behind ${niche} that has been buried for decades.`,
    ],
    finance: [
      `The 5 money rules of ${niche} that rich people never tell you about.`,
      `How I made ₹50,000 in 30 days with ${niche} — and exactly how you can too.`,
      `3 ${niche} mistakes that keep middle-class Indians broke forever.`,
      `${niche} in 2025: the strategy top earners are quietly using.`,
    ],
    tech: [
      `The 5 ${niche} tools no one told you about — the last one is a game changer.`,
      `I tested every popular ${niche} tool for 30 days. Here's what actually works.`,
      `${niche} in 2025: features Apple/Google don't want you to know.`,
      `Stop using ${niche} the wrong way. Do this instead.`,
    ],
    food: [
      `The secret ${niche} recipe that street vendors don't want you to know.`,
      `I tried 10 famous ${niche} places in a single day — only one was worth it.`,
      `${niche} hack: how restaurants make ₹1000 meals for ₹100.`,
      `5-minute ${niche} recipe that will ruin restaurant food for you forever.`,
    ],
    fitness: [
      `The 7-minute ${niche} routine that gave me visible abs in 30 days.`,
      `I tried ${niche} for 60 days straight — here's what actually changed.`,
      `The biggest ${niche} myth personal trainers will never admit.`,
      `${niche}: 3 exercises gyms don't want you to know about.`,
    ],
    love: [
      `The 5 relationship patterns that quietly destroy every couple in India.`,
      `If your partner does these 3 things, they're emotionally checked out.`,
      `How to spot a toxic relationship in the first 30 days — real signs.`,
      `${niche}: the conversation that saves 90% of failing marriages.`,
    ],
    education: [
      `The study method toppers use that nobody teaches in school.`,
      `How to score 95%+ in exams without studying 10 hours a day.`,
      `The one subject students struggle with most — and a 3-step fix.`,
      `${niche}: the note-making system that cut my revision time in half.`,
    ],
    default: [
      `The 5 things about ${niche} that nobody talks about — but everyone should know.`,
      `I spent 30 days learning ${niche} and here's the truth.`,
      `${niche} for beginners: the 3 mistakes almost everyone makes.`,
      `Why ${niche} is exploding in 2025 — and how you can benefit from it.`,
    ],
  };
  const hi = {
    horror: [
      `${niche} की वो सच्ची घटना जो आज भी अनसुलझी है — रात को अकेले मत देखना।`,
      `भारत की सबसे डरावनी जगह और ${niche} से जुड़ा वो राज जो सरकार छुपाती है।`,
      `${niche} — जब एक आम इंसान ने कुछ ऐसा देखा जिस पर कोई यकीन नहीं करेगा।`,
      `${niche} की सच्ची कहानी: science भी explain नहीं कर सकता जो हुआ।`,
    ],
    finance: [
      `${niche} के 5 पैसे के नियम जो अमीर लोग कभी नहीं बताते।`,
      `मैंने ${niche} से 30 दिन में ₹50,000 कमाए — और तुम भी कमा सकते हो।`,
      `${niche} की 3 सबसे बड़ी गलतियाँ जो middle-class को हमेशा गरीब रखती हैं।`,
      `2025 में ${niche}: अमीर लोग चुपचाप यही strategy इस्तेमाल कर रहे हैं।`,
    ],
    tech: [
      `${niche} के 5 tools जो किसी ने नहीं बताए — आखिरी वाला game changer है।`,
      `मैंने 30 दिन हर मशहूर ${niche} tool try किया — क्या actually काम करता है?`,
      `2025 में ${niche}: Apple/Google नहीं चाहते कि आप ये जानें।`,
      `${niche} गलत तरीके से use करना बंद करो — ये करो।`,
    ],
    food: [
      `${niche} का वो secret recipe जो street vendors नहीं बताना चाहते।`,
      `मैंने एक दिन में 10 मशहूर ${niche} जगह try कीं — सिर्फ एक worth थी।`,
      `${niche} hack: restaurants ₹1000 का खाना कैसे ₹100 में बनाते हैं।`,
      `5 मिनट की ${niche} recipe जो restaurant का खाना बर्बाद कर देगी।`,
    ],
    fitness: [
      `7 मिनट की ${niche} routine जिसने 30 दिन में visible abs दिए।`,
      `मैंने 60 दिन लगातार ${niche} किया — actually क्या बदला।`,
      `${niche} की सबसे बड़ी myth जो personal trainers कभी नहीं मानेंगे।`,
      `${niche}: 3 exercises जो gyms नहीं चाहते कि आप जानें।`,
    ],
    love: [
      `5 relationship patterns जो चुपचाप हर couple को बर्बाद करते हैं।`,
      `अगर आपका partner ये 3 चीज़ें करे, तो वो emotionally बाहर है।`,
      `Toxic relationship को पहले 30 दिन में कैसे पहचानें — real signs।`,
      `${niche}: वो conversation जो 90% failing marriages बचा सकती है।`,
    ],
    education: [
      `Toppers का study method जो school में कोई नहीं सिखाता।`,
      `10 घंटे पढ़े बिना exams में 95%+ कैसे लाएं।`,
      `वो subject जिसमें students सबसे ज़्यादा struggle करते हैं — 3-step fix।`,
      `${niche}: note-making system जिसने मेरा revision time आधा कर दिया।`,
    ],
    default: [
      `${niche} के बारे में 5 बातें जो कोई नहीं बताता — पर सबको पता होनी चाहिए।`,
      `मैंने 30 दिन ${niche} सीखने में बिताए — ये रहा सच।`,
      `Beginners के लिए ${niche}: 3 गलतियाँ जो almost सब करते हैं।`,
      `2025 में ${niche} क्यों explode हो रहा है — और आप कैसे फायदा उठा सकते हैं।`,
    ],
  };
  const gu = {
    horror: [
      `${niche} ની એ સાચી ઘટના જે આજે પણ ઉકેલાઈ નથી — એકલા ન જુઓ.`,
      `ભારતની સૌથી ડરામણી જગ્યા અને ${niche} નો એ રાજ જે સરકાર છુપાવે છે.`,
      `${niche} — જ્યારે એક સામાન્ય માણસે કંઈક એવું જોયું જેના પર કોઈ વિશ્વાસ ન કરે.`,
      `${niche} ની સાચી વાર્તા: science પણ explain ન કરી શકે જે થયું.`,
    ],
    finance: [
      `${niche} ના 5 પૈસાના નિયમો જે ધનિક લોકો ક્યારેય નથી કહેતા.`,
      `મેં ${niche} થી 30 દિવસમાં ₹50,000 કમાવ્યા — તમે પણ કમાઈ શકો.`,
      `${niche} ની 3 સૌથી મોટી ભૂલો જે middle-class ને કાયમ ગરીબ રાખે છે.`,
      `2025 માં ${niche}: ધનિક લોકો ચૂપચાપ આ જ strategy વાપરે છે.`,
    ],
    tech: [
      `${niche} ના 5 tools જે કોઈએ નથી કહ્યા — છેલ્લું game changer છે.`,
      `મેં 30 દિવસ દરેક મશહૂર ${niche} tool અજમાવ્યું — ખરેખર શું કામ કરે છે?`,
      `2025 માં ${niche}: Apple/Google નથી ઈચ્છતા કે તમે આ જાણો.`,
      `${niche} ખોટી રીતે વાપરવાનું બંધ કરો — આ કરો.`,
    ],
    food: [
      `${niche} ની એ secret recipe જે street vendors નથી કહેવા માંગતા.`,
      `મેં એક દિવસમાં 10 જાણીતી ${niche} જગ્યાઓ try કરી — ફક્ત એક worth હતી.`,
      `${niche} hack: restaurants ₹1000 નું ખાવાનું ₹100 માં કેવી રીતે બનાવે છે.`,
      `5 મિનિટની ${niche} recipe જે restaurant નું ખાવાનું બગાડી દેશે.`,
    ],
    fitness: [
      `7 મિનિટની ${niche} routine જેણે 30 દિવસમાં abs આપ્યા.`,
      `મેં 60 દિવસ ${niche} કર્યું — ખરેખર શું બદલાયું.`,
      `${niche} ની સૌથી મોટી myth જે trainers ક્યારેય નથી માનતા.`,
      `${niche}: 3 exercises જે gyms નથી ઈચ્છતા તમે જાણો.`,
    ],
    love: [
      `5 relationship patterns જે ચૂપચાપ દરેક couple ને બરબાદ કરે છે.`,
      `જો partner આ 3 વાતો કરે, તો તે emotionally બહાર છે.`,
      `Toxic relationship ને પહેલા 30 દિવસમાં કેવી રીતે ઓળખવી — real signs.`,
      `${niche}: એ વાતચીત જે 90% failing marriages બચાવી શકે છે.`,
    ],
    education: [
      `Toppers ની study method જે school માં કોઈ નથી શીખવતું.`,
      `10 કલાક ભણ્યા વિના 95%+ કેવી રીતે લાવવું.`,
      `એ subject જેમાં students સૌથી વધુ struggle કરે છે — 3-step fix.`,
      `${niche}: note-making system જેણે મારો revision time અડધો કર્યો.`,
    ],
    default: [
      `${niche} વિશે 5 વાતો જે કોઈ નથી કહેતું — પણ બધાએ જાણવું જોઈએ.`,
      `મેં 30 દિવસ ${niche} શીખવામાં ગાળ્યા — આ રહ્યો સત્ય.`,
      `Beginners માટે ${niche}: 3 ભૂલો જે almost બધા કરે છે.`,
      `2025 માં ${niche} કેમ explode થઈ રહ્યું છે — અને તમે કેવી રીતે ફાયદો લઈ શકો.`,
    ],
  };

  const table = { hi, en, gu };
  const langTable = table[lang] || en;
  return (langTable[mood] || langTable.default).slice(0, 4);
}

function renderBriefSuggestions(suggestions, mood) {
  const container = document.getElementById("briefSuggestions");
  if (!container) return;
  const moodEmojis = {
    horror: "👻", finance: "💰", tech: "🤖", food: "🍳",
    fitness: "💪", love: "❤️", education: "📚", default: "✨",
  };
  const emoji = moodEmojis[mood] || "✨";
  container.innerHTML = `
    <div class="brief-suggestions-label">${emoji} Tap a suggestion or write your own:</div>
    <div class="brief-chips">
      ${suggestions.map((s, i) => `
        <button class="brief-chip" data-idx="${i}" type="button">
          ${security.escapeHtml(s)}
        </button>
      `).join("")}
    </div>
  `;
  container.querySelectorAll(".brief-chip").forEach((chip, i) => {
    chip.addEventListener("click", () => {
      const ta = document.getElementById("topicBrief");
      if (ta) {
        ta.value = suggestions[i];
        state.brief = suggestions[i];
        container.querySelectorAll(".brief-chip").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        ta.focus();
        saveProjectDebounced();
      }
    });
  });
}

async function loadBriefSuggestions() {
  const container = document.getElementById("briefSuggestions");
  if (!container) return;
  container.hidden = false;
  container.innerHTML = `<div class="brief-suggestion-loading">✨ Generating ideas for <b>${security.escapeHtml(state.niche)}</b>…</div>`;

  const niche = state.niche || "";
  const mood = detectNicheMood(niche);
  container.dataset.mood = mood;

  try {
    const suggestions = await generateBriefSuggestionsWithAI(niche, state.lang, mood);
    renderBriefSuggestions(suggestions, mood);
  } catch (e) {
    console.warn("AI brief suggestions failed, using fallback:", e);
    const suggestions = getFallbackBriefSuggestions(niche, state.lang, mood);
    renderBriefSuggestions(suggestions, mood);
  }
}

// ============================================================
//  STEP 6: Script + Music + Customisation
// ============================================================
// ============================================================
//  STEP 6: Script + Music + Customisation
// ============================================================

// Rich, varied pools for the fallback (template) scriptwriter.
// We keep many phrasings per language so back-to-back regenerations and
// scene-by-scene body points don't feel like the same Mad-Libs.
// Anti-repetition is handled by pickFresh() against state.recentScript.
function hookPoolForLang(lang, niche, brief) {
  const b = (brief && brief.trim()) ? truncate(brief.trim(), 60) : niche;
  const pools = {
    en: [
      `Stop scrolling — ${niche} is about to make sense in 60 seconds.`,
      `Most people get ${niche} completely wrong. Here's the actual truth.`,
      `If you remember ONE thing about ${niche} this year, make it this.`,
      `Nobody warned me about ${niche} — so I'm warning you.`,
      `${niche}: the part nobody on YouTube is honest about.`,
      `I wasted 2 years on ${niche} before I learned this in 90 seconds.`,
      `You're 30 seconds away from changing how you think about ${niche}.`,
      `${niche} is rigged — and once you see how, you can't unsee it.`,
      `The ${niche} mistake costing you the most money? You're probably making it right now.`,
      `Watch this before your next ${niche} decision. Seriously.`,
      `${niche} in 2026 is nothing like ${niche} in 2024. Here's what changed.`,
      `Three things about ${niche} they don't put in the YouTube tutorials.`,
      `${niche}: ${b} — and what nobody says next.`,
      `Pause whatever you're doing. This about ${niche} is more useful than your last hour of scrolling.`,
      `I tested ${niche} for 30 days so you don't have to. The result shocked me.`,
      `If ${niche} feels confusing, that's because it's designed to.`,
      `${niche} but with zero filler — exactly what works, exactly what doesn't.`,
      `You've been lied to about ${niche}. Let me prove it in under a minute.`,
      `${niche} explained the way I wish someone had explained it to me.`,
      `Forget everything you Googled about ${niche}. Start with this.`,
    ],
    hi: [
      `रुक! ${niche} समझने में बस 60 सेकंड लगेंगे — पर ये life बदल सकता है।`,
      `${niche} के बारे में जो आपको बताया गया — वो आधा सच है। पूरा सुनो।`,
      `${niche} के बारे में अगर इस साल एक बात याद रखो — तो ये वाली।`,
      `मुझे ${niche} पर किसी ने warning नहीं दी — इसलिए मैं तुम्हें दे रहा हूँ।`,
      `${niche}: वो हिस्सा जिस पर YouTube पर कोई honest नहीं है।`,
      `मैंने ${niche} में 2 साल बर्बाद किए जो ये बात 90 सेकंड में मिल जाती।`,
      `अगले 30 सेकंड में आप ${niche} को बिल्कुल अलग नज़र से देखोगे।`,
      `${niche} का game fixed है — एक बार देख लोगे तो भूल नहीं पाओगे।`,
      `${niche} में सबसे बड़ी गलती जो आप अभी कर रहे हो — और पता भी नहीं।`,
      `अगला ${niche} वाला decision लेने से पहले ये एक minute देख लो।`,
      `2026 का ${niche}, 2024 के ${niche} से बिल्कुल अलग है। क्या बदला, सुनो।`,
      `${niche} की 3 बातें जो tutorials में कोई नहीं डालता।`,
      `${niche} पर ${b} — और आगे क्या होता है, कोई नहीं कहता।`,
      `जो कर रहे हो रोको। ये ${niche} वाली बात पिछले 1 घंटे की scrolling से ज़्यादा useful है।`,
      `मैंने 30 दिन ${niche} test किया ताकि तुम्हें न करना पड़े। Result हिला देगा।`,
      `${niche} confusing लगता है क्योंकि उसे confusing बनाया गया है।`,
      `${niche} — zero filler. सिर्फ जो काम करता है और जो नहीं।`,
      `${niche} पर तुम्हें झूठ बोला गया है। 1 minute में साबित कर देता हूँ।`,
      `${niche} वैसे समझाऊँगा जैसे मुझे कोई समझाता काश।`,
      `${niche} पर Google जो भी पढ़ा — भूल जाओ। शुरुआत यहाँ से करो।`,
    ],
    gu: [
      `રોકો — ${niche} 60 સેકન્ડમાં સમજાવી દઉં, life બદલાઈ શકે છે.`,
      `${niche} વિશે જે કહેવાય છે એ અડધું સત્ય છે. પૂરું સાંભળો.`,
      `${niche} વિશે આ વર્ષે એક વાત યાદ રાખવી હોય — તો આ વાળી.`,
      `${niche} પર કોઈએ warning નહોતી આપી — હું આપું છું.`,
      `${niche}: એ ભાગ જેના પર YouTube પર કોઈ honest નથી.`,
      `મેં ${niche} માં 2 વર્ષ બગાડ્યા જે આ વાત 90 સેકન્ડમાં મળી જાત.`,
      `આગામી 30 સેકન્ડમાં ${niche} ને તદ્દન અલગ રીતે જોશો.`,
      `${niche} નો game fixed છે — એક વાર જોઈ લેશો તો ભૂલશો નહીં.`,
      `${niche} ની સૌથી મોટી ભૂલ જે અત્યારે કરી રહ્યા છો — અને ખબર પણ નથી.`,
      `${niche} નો આગળનો decision લેતા પહેલા આ 1 minute જુઓ.`,
      `2026 નો ${niche}, 2024 ના ${niche} થી તદ્દન અલગ છે. શું બદલાયું?`,
      `${niche} ની 3 વાતો જે tutorials માં કોઈ નથી મૂકતું.`,
      `${niche} પર ${b} — અને આગળ શું થાય છે, કોઈ નથી કહેતું.`,
      `જે કરો છો રોકો. આ ${niche} વાળી વાત છેલ્લા 1 કલાકના scrolling કરતા વધારે useful છે.`,
      `${niche} confusing લાગે છે કારણ કે એને confusing બનાવ્યું છે.`,
      `${niche} — zero filler. ફક્ત જે કામ કરે છે અને જે નથી કરતું.`,
      `${niche} પર તમને જૂઠું કહેવાયું છે. 1 minute માં સાબિત કરું.`,
      `${niche} એ રીતે સમજાવીશ જે રીતે કોઈએ મને સમજાવ્યું હોત તો સારું થાત.`,
    ],
    ta: [
      `நில்லுங்க — ${niche} 60 விநாடியில் புரியும், life மாற்றும்.`,
      `${niche} பத்தி சொல்றது அரை உண்மை. முழுசா கேளுங்க.`,
      `${niche} பத்தி இந்த வருஷம் ஒரே ஒரு விஷயம் ஞாபகம் வச்சுக்கணுன்னா — இதை.`,
      `${niche} ல நான் 2 வருஷம் waste பண்ணினேன், இது 90 விநாடியில கிடைச்சிருந்தா...`,
      `${niche} ன game fixed-ஆ இருக்கு. ஒரு தடவ பாத்தீங்கன்னா மறக்க முடியாது.`,
      `${niche} ல நீங்க இப்போ பண்ற பெரிய mistake — தெரியாமலேயே.`,
      `${niche} ன 3 விஷயம் — tutorial-ல யாரும் சொல்லாதது.`,
    ],
    te: [
      `ఆగండి — ${niche} 60 secs లో అర్థమవుతుంది, life మారిపోతుంది.`,
      `${niche} గురించి చెప్పేది సగం నిజం. పూర్తిగా వినండి.`,
      `${niche} గురించి ఈ ఏడాది ఒక్క విషయం గుర్తుంచుకోవాలంటే — ఇదే.`,
      `${niche} లో నేను 2 ఏళ్ళు waste చేశాను, ఇది 90 secs లో దొరికి ఉంటే...`,
      `${niche} game fixed. ఒక్కసారి చూస్తే మర్చిపోలేరు.`,
      `${niche} లో మీరు ఇప్పుడు చేస్తున్న పెద్ద mistake — తెలియకుండానే.`,
    ],
    bn: [
      `থামুন — ${niche} 60 সেকেন্ডে বুঝিয়ে দেব, life বদলাতে পারে।`,
      `${niche} নিয়ে যা বলা হয় তা অর্ধেক সত্য। পুরোটা শুনুন।`,
      `${niche} নিয়ে এই বছর একটা জিনিস মনে রাখতে হলে — এটাই।`,
      `${niche}-এ আমি 2 বছর নষ্ট করেছি যা এই কথা 90 সেকেন্ডে পেয়ে যেতাম।`,
      `${niche} game fixed। একবার দেখলে ভুলতে পারবেন না।`,
      `${niche}-এ আপনি এখন যে বড় mistake করছেন — জানেনই না।`,
    ],
    mr: [
      `थांब — ${niche} 60 सेकंदात समजावून सांगतो, life बदलू शकतं.`,
      `${niche} बद्दल जे सांगतात ते अर्धं सत्य आहे. पूर्ण ऐक.`,
      `${niche} बद्दल या वर्षात एक गोष्ट लक्षात ठेवायची असेल — हीच.`,
      `${niche} मध्ये मी 2 वर्ष वाया घालवली, ही गोष्ट 90 सेकंदात मिळाली असती तर...`,
      `${niche} game fixed आहे. एकदा बघितलं तर विसरू शकत नाही.`,
      `${niche} मध्ये तू आत्ता करत असलेली मोठी mistake — माहीतच नाही.`,
    ],
    pa: [
      `ਰੁਕੋ — ${niche} 60 ਸਕਿੰਟ ਵਿੱਚ ਸਮਝਾ ਦਿੰਦਾ ਹਾਂ, life ਬਦਲ ਸਕਦੀ ਹੈ।`,
      `${niche} ਬਾਰੇ ਜੋ ਦੱਸਿਆ ਜਾਂਦਾ ਹੈ ਉਹ ਅੱਧਾ ਸੱਚ ਹੈ। ਪੂਰਾ ਸੁਣੋ।`,
      `${niche} ਬਾਰੇ ਇਸ ਸਾਲ ਇੱਕ ਗੱਲ ਯਾਦ ਰੱਖਣੀ ਹੈ — ਤਾਂ ਇਹ।`,
      `${niche} ਵਿੱਚ 2 ਸਾਲ ਬਰਬਾਦ ਕੀਤੇ ਜੋ ਇਹ ਗੱਲ 90 ਸਕਿੰਟ ਵਿੱਚ ਮਿਲ ਜਾਂਦੀ।`,
      `${niche} game fixed ਹੈ। ਇੱਕ ਵਾਰ ਵੇਖੋਗੇ ਤਾਂ ਭੁੱਲ ਨਹੀਂ ਸਕੋਗੇ।`,
    ],
    ml: [
      `നിർത്തൂ — ${niche} 60 സെക്കൻഡിൽ മനസ്സിലാക്കാം, life മാറും.`,
      `${niche} കുറിച്ച് പറയുന്നത് പകുതി സത്യം. പൂർണ്ണമായി കേൾക്കൂ.`,
      `${niche} കുറിച്ച് ഈ വർഷം ഒരു കാര്യം ഓർക്കണമെങ്കിൽ — ഇത്.`,
      `${niche}-ൽ ഞാൻ 2 വർഷം പാഴാക്കി — ഇത് 90 സെക്കൻഡിൽ കിട്ടിയിരുന്നെങ്കിൽ...`,
      `${niche} game fixed. ഒരിക്കൽ കണ്ടാൽ മറക്കാനാവില്ല.`,
    ],
    kn: [
      `ನಿಲ್ಲಿ — ${niche} 60 ಸೆಕೆಂಡ್‌ಗಳಲ್ಲಿ ಅರ್ಥವಾಗುತ್ತದೆ, life ಬದಲಾಗಬಹುದು.`,
      `${niche} ಬಗ್ಗೆ ಹೇಳುವುದು ಅರ್ಧ ಸತ್ಯ. ಪೂರ್ಣ ಕೇಳಿ.`,
      `${niche} ಬಗ್ಗೆ ಈ ವರ್ಷ ಒಂದು ವಿಷಯ ನೆನಪಿಡಬೇಕಾದರೆ — ಇದನ್ನು.`,
      `${niche} ಯಲ್ಲಿ 2 ವರ್ಷ ವ್ಯರ್ಥವಾಯ್ತು — ಇದು 90 ಸೆಕೆಂಡ್‌ಗಳಲ್ಲಿ ಸಿಕ್ಕಿದ್ದರೆ...`,
      `${niche} game fixed. ಒಮ್ಮೆ ನೋಡಿದರೆ ಮರೆಯಲು ಸಾಧ್ಯವಿಲ್ಲ.`,
    ],
  };
  return (pools[lang] || pools.en).filter(Boolean);
}

function introPoolForLang(lang, niche, brief, audience) {
  const hasBrief = brief && brief.trim().length > 8;
  const b = hasBrief ? truncate(brief.trim(), 110) : "";
  const aud = (audience && audience.trim()) ? audience.trim() : "";
  const pools = {
    en: hasBrief ? [
      `Quick context: in this video I'm breaking down ${b}. No fluff, no filler — just the parts that change your decisions today.`,
      `Real talk — most ${niche} videos waste your first 30 seconds. I'll respect your time and cut straight to ${b}.`,
      `Here's what we're doing: I'll walk you through ${b}, you walk out actually able to use it. Three minutes total.`,
      `If you only watch one ${niche} video this week, this is it. We're covering ${b} — the version no one explains right.`,
      `Before we start — yes, I tested this on myself. So everything you hear about ${b} comes from real results, not just theory.`,
    ] : [
      `In the next few minutes I'll show you what actually works in ${niche} — the part I wish I'd known a year ago.`,
      `I'm going to break ${niche} into stuff you can use today, ${aud ? "specifically for " + aud + ", " : ""}with zero filler.`,
      `If you've ever felt lost in ${niche}, this video is the map. Bookmark it — you'll come back.`,
      `Quick promise: by the end of this video, you'll see ${niche} differently than you do right now. Let's go.`,
      `Forget the textbook take on ${niche}. Here's the version that actually works in the real world.`,
    ],
    hi: hasBrief ? [
      `Quick context — इस video में ${b} पर बात करेंगे। कोई filler नहीं, कोई time waste नहीं। बस वो parts जो आज से आपके decisions बदल देंगे।`,
      `सच कहूँ — ज़्यादातर ${niche} videos पहले 30 second waste कर देते हैं। मैं seedha मुद्दे पे आता हूँ: ${b}.`,
      `देखो plan ये है — मैं ${b} समझाऊँगा, तुम actually use कर पाओगे। तीन मिनट में।`,
      `अगर इस हफ्ते एक ही ${niche} video देखना है — तो यही। ${b} — वो version जो कोई सही explain नहीं करता।`,
      `Start करने से पहले — हाँ, मैंने खुद try किया है। तो जो भी ${b} पर सुनोगे, real results से आ रहा है, सिर्फ theory नहीं।`,
    ] : [
      `अगले कुछ मिनट में मैं ${niche} में जो actually काम करता है वो दिखाऊँगा — वो बात जो एक साल पहले काश पता होती।`,
      `मैं ${niche} को ऐसे parts में तोड़ूँगा जो आज से use कर पाओ${aud ? " — खासकर " + aud + " के लिए" : ""}, zero filler।`,
      `अगर ${niche} में कभी lost feel हुआ हो — ये video map है। Bookmark कर लो, वापस आओगे।`,
      `Quick promise: video खत्म होते-होते ${niche} को अलग नज़र से देखोगे। चलो शुरू करें।`,
      `${niche} पर textbook वाली बात भूल जाओ। ये version है जो real world में काम करता है।`,
    ],
    gu: hasBrief ? [
      `Quick context — આ video માં ${b} પર વાત કરીશું. કોઈ filler નહીં, કોઈ time waste નહીં. ફક્ત એ parts જે આજથી તમારા decisions બદલી દેશે.`,
      `સાચું કહું — મોટાભાગના ${niche} videos પહેલા 30 second waste કરી દે છે. હું સીધી મુદ્દા પર આવું છું: ${b}.`,
      `Plan આ છે — હું ${b} સમજાવીશ, તમે actually use કરી શકશો. ત્રણ મિનિટ માં.`,
      `આ અઠવાડિયે એક જ ${niche} video જોવો છે — તો આ. ${b} — એ version જે કોઈ બરાબર explain નથી કરતું.`,
      `Start કરતા પહેલા — હા, મેં જાતે try કર્યું છે. તો જે પણ ${b} પર સાંભળશો, real results માંથી આવી રહ્યું છે.`,
    ] : [
      `આગામી થોડી મિનિટ માં ${niche} માં જે actually કામ કરે છે એ બતાવીશ — એ વાત જે એક વર્ષ પહેલા કાશ ખબર હોત.`,
      `${niche} ને એવા parts માં તોડીશ જે આજથી use કરી શકો${aud ? " — ખાસ કરીને " + aud + " માટે" : ""}, zero filler.`,
      `${niche} માં ક્યારેય lost feel થયું હોય — આ video map છે. Bookmark કરી લો, પાછા આવશો.`,
      `Quick promise: video પૂરો થતા-થતા ${niche} ને અલગ નજરે જોશો. ચાલો શરૂ કરીએ.`,
      `${niche} પર textbook વાળી વાત ભૂલી જાઓ. આ એ version છે જે real world માં કામ કરે છે.`,
    ],
    ta: [`அடுத்த சில நிமிஷத்துல ${niche} ல எது actually வேலை செய்யுதோ அத காட்டுவேன் — filler இல்ல.`, `${niche} இந்த video க்கு பிறகு வேற மாதிரி purchase ஆகும். Promise.`],
    te: [`తదుపరి కొన్ని నిమిషాల్లో ${niche} లో ఏది actually పనిచేస్తుందో చూపిస్తాను — filler లేకుండా.`, `${niche} ఈ video తర్వాత మీకు వేరేలా అర్థమవుతుంది. Promise.`],
    bn: [`পরের কয়েক মিনিটে ${niche}-এ যা actually কাজ করে দেখাব — filler নেই।`, `${niche} এই video-র পরে আপনার কাছে অন্যরকম মনে হবে। Promise.`],
    mr: [`पुढच्या काही मिनिटात ${niche} मध्ये जे actually चालतं ते दाखवतो — filler नाही.`, `${niche} या video नंतर तुम्हाला वेगळं वाटेल. Promise.`],
    pa: [`ਅਗਲੇ ਕੁਝ ਮਿੰਟਾਂ ਵਿੱਚ ${niche} ਵਿੱਚ ਜੋ actually ਕੰਮ ਕਰਦਾ ਹੈ ਉਹ ਦਿਖਾਵਾਂਗਾ — filler ਨਹੀਂ।`, `${niche} ਇਸ video ਤੋਂ ਬਾਅਦ ਵੱਖਰਾ ਲੱਗੇਗਾ। Promise।`],
    ml: [`അടുത്ത കുറച്ച് മിനിറ്റിൽ ${niche}-ൽ എന്താണ് actually പ്രവർത്തിക്കുന്നതെന്ന് കാണിക്കാം — filler ഇല്ല.`, `${niche} ഈ video കഴിഞ്ഞാൽ വ്യത്യസ്തമായി തോന്നും. Promise.`],
    kn: [`ಮುಂದಿನ ಕೆಲವು ನಿಮಿಷಗಳಲ್ಲಿ ${niche} ನಲ್ಲಿ ಯಾವುದು actually ಕೆಲಸ ಮಾಡುತ್ತದೆ ಎಂದು ತೋರಿಸುತ್ತೇನೆ — filler ಇಲ್ಲ.`, `${niche} ಈ video ನಂತರ ಭಿನ್ನವಾಗಿ ಕಾಣುತ್ತದೆ. Promise.`],
  };
  return (pools[lang] || pools.en).filter(Boolean);
}

// Body-point pool. Each entry uses a different rhetorical "shape"
// (contrarian / numeric / story / warning / how-to / question / mistake /
// reveal / contrast / action) so a 5–10-point script doesn't feel like
// the same sentence template repeated.
function bodyPointPoolForLang(lang, niche) {
  const pools = {
    en: [
      `Most ${niche} advice on YouTube is recycled from 2019. Here's the 2026 version that actually moves the needle.`,
      `The 80/20 of ${niche}: ignore the noise, focus on these two levers and you'll outperform 90% of people.`,
      `Last month I watched a beginner outperform a 5-year veteran in ${niche}. The difference came down to one habit.`,
      `Warning — the biggest ${niche} trap looks like a shortcut. It's the slowest route possible.`,
      `Quick how-to: open whatever ${niche} tool you use, and do this exact 3-step move. Takes 60 seconds, saves hours.`,
      `Ask yourself one question before your next ${niche} move: "Is this momentum, or is this just motion?"`,
      `The mistake costing most people money in ${niche} isn't strategy — it's pace. They go too fast, then quit.`,
      `Reveal: the top 1% in ${niche} don't have secret tools. They have boring consistency. That's the whole edge.`,
      `Contrast: amateurs in ${niche} chase trends; pros build systems. Five minutes of systems beats five hours of trends.`,
      `Do this today — pick the one ${niche} task you've been avoiding and finish it before lunch. The compound effect is wild.`,
      `Numbers: studies show 73% of ${niche} attempts fail in the first 30 days. The fix is in the second week, not the first.`,
      `Real story — a friend tried ${niche} the "smart" way for a year and got nowhere. The dumb obvious way got results in two months.`,
      `Pattern interrupt: stop optimising. Start finishing. ${niche} rewards completion, not perfection.`,
      `If your ${niche} setup feels comfortable, you're already losing. Comfort is the early signal of plateau.`,
      `Skip every ${niche} course that promises "fast". Real fast comes from doing the slow basics extremely well.`,
    ],
    hi: [
      `${niche} पर YouTube के 90% advice 2019 के recycled हैं। 2026 का version ये है, जो actually result देता है।`,
      `${niche} का 80/20 — शोर ignore करो, इन दो levers पे focus करो, 90% लोगों से आगे निकल जाओगे।`,
      `पिछले महीने मैंने एक beginner को 5 साल के veteran से आगे जाते देखा ${niche} में। Difference एक habit का था।`,
      `Warning — ${niche} का सबसे बड़ा trap shortcut जैसा दिखता है। पर ये सबसे slow रास्ता है।`,
      `Quick how-to — जो भी ${niche} tool use करते हो खोलो, और ये 3-step move करो। 60 सेकंड में घंटे बच जाते हैं।`,
      `अपने आप से एक सवाल पूछो ${niche} वाला अगला कदम लेने से पहले — "ये momentum है या सिर्फ motion?"`,
      `${niche} में लोगों के पैसे जो mistake खा रही है वो strategy नहीं — pace है। तेज़ जाते हैं, फिर छोड़ देते हैं।`,
      `Reveal — ${niche} के top 1% के पास secret tools नहीं हैं। उनके पास boring consistency है। पूरा edge यही है।`,
      `Contrast — amateurs ${niche} में trends के पीछे भागते हैं; pros systems बनाते हैं। 5 minute systems > 5 घंटे trends।`,
      `आज ये करो — ${niche} का वो एक काम जो avoid कर रहे हो, lunch से पहले खत्म करो। Compound effect जबरदस्त है।`,
      `Numbers — 73% ${niche} attempts पहले 30 दिन में fail होते हैं। Fix दूसरे हफ्ते में होता है, पहले में नहीं।`,
      `Real story — एक दोस्त ने ${niche} "smart" तरीके से एक साल try किया, कुछ नहीं हुआ। Dumb obvious तरीके से 2 महीने में result।`,
      `Pattern interrupt — optimize करना बंद करो, finish करना शुरू करो। ${niche} completion को reward करता है, perfection को नहीं।`,
      `${niche} setup comfortable लग रहा है तो हार चुके हो। Comfort plateau का पहला signal है।`,
      `हर ${niche} course skip करो जो "fast" promise करे। Real fast slow basics को extremely well करने से आता है।`,
    ],
    gu: [
      `${niche} પર YouTube ના 90% advice 2019 ના recycled છે. 2026 નો version આ છે, જે actually result આપે છે.`,
      `${niche} નો 80/20 — અવાજ ignore કરો, આ બે levers પર focus કરો, 90% લોકોથી આગળ નીકળશો.`,
      `ગયા મહિને એક beginner ને 5 વર્ષના veteran થી આગળ જતો જોયો ${niche} માં. Difference એક habit નો હતો.`,
      `Warning — ${niche} નો સૌથી મોટો trap shortcut જેવો દેખાય છે. પણ આ સૌથી slow રસ્તો છે.`,
      `Quick how-to — જે પણ ${niche} tool વાપરો છો ખોલો, અને આ 3-step move કરો. 60 સેકન્ડમાં કલાકો બચે છે.`,
      `${niche} નો આગળનો કદમ લેતા પહેલા જાતને એક પ્રશ્ન પૂછો — "આ momentum છે કે ફક્ત motion?"`,
      `${niche} માં લોકોના પૈસા જે mistake ખાય છે એ strategy નથી — pace છે. ઝડપથી જાય છે, પછી છોડી દે છે.`,
      `Reveal — ${niche} ના top 1% પાસે secret tools નથી. એમની પાસે boring consistency છે. આખો edge એ જ છે.`,
      `Contrast — amateurs ${niche} માં trends પાછળ ભાગે છે; pros systems બનાવે છે. 5 minute systems > 5 કલાક trends.`,
      `આજે આ કરો — ${niche} નું એ એક કામ જે avoid કરો છો, lunch પહેલા પૂરું કરો. Compound effect જબરદસ્ત છે.`,
      `Numbers — 73% ${niche} attempts પ્રથમ 30 દિવસમાં fail થાય છે. Fix બીજા અઠવાડિયામાં થાય છે.`,
      `Real story — એક મિત્રએ ${niche} "smart" રીતે એક વર્ષ try કર્યું, કંઈ ન થયું. Dumb obvious રીતે 2 મહિનામાં result.`,
      `Pattern interrupt — optimize કરવાનું બંધ કરો, finish કરવાનું શરૂ કરો. ${niche} completion ને reward આપે છે.`,
      `${niche} setup comfortable લાગે છે તો હારી ગયા છો. Comfort plateau નો પ્રથમ signal છે.`,
      `દરેક ${niche} course skip કરો જે "fast" promise આપે. Real fast slow basics ને extremely well કરવાથી આવે છે.`,
    ],
    ta: [
      `${niche} ல YouTube-ல 90% advice 2019 recycled. 2026 version இது தான், actually result கொடுக்கும்.`,
      `${niche} ன 80/20 — noise ignore பண்ணு, இந்த 2 levers focus பண்ணு, 90% பேருக்கு முன்னாடி போவ.`,
      `${niche} ல beginner-கூட veteran-ஐ outperform பண்ணுவாங்க, ஒரே ஒரு habit தான் difference.`,
      `Warning — ${niche} ன பெரிய trap shortcut மாதிரி தெரியும். ஆனா இது தான் slow route.`,
      `${niche} ல top 1% பேருக்கு secret tool இல்ல. Boring consistency தான். Edge அது தான்.`,
      `${niche} setup comfortable-ஆ feel ஆனா — already loss-ல இருக்கீங்க.`,
    ],
    te: [
      `${niche} పై YouTube లో 90% advice 2019 recycled. 2026 version ఇది, actually result ఇస్తుంది.`,
      `${niche} 80/20 — noise ignore చేయండి, ఈ 2 levers focus చేయండి, 90% మంది కంటే ముందుంటారు.`,
      `${niche} లో beginner కూడా veteran ని outperform చేస్తాడు, ఒక్క habit difference.`,
      `Warning — ${niche} పెద్ద trap shortcut లా కనిపిస్తుంది. కానీ ఇది slow route.`,
      `${niche} లో top 1% కి secret tool లేదు. Boring consistency ఉంది. Edge అదే.`,
    ],
    bn: [
      `${niche} নিয়ে YouTube-এ 90% advice 2019-এর recycled। 2026 version এটাই, actually result দেয়।`,
      `${niche}-এর 80/20 — noise ignore করুন, এই 2 levers-এ focus করুন, 90% মানুষের চেয়ে এগিয়ে।`,
      `${niche}-এ beginner-ও veteran-কে outperform করে, একটাই habit difference।`,
      `Warning — ${niche}-এর বড় trap shortcut-এর মতো দেখায়। কিন্তু এটাই slow route।`,
      `${niche}-এ top 1%-এর secret tool নেই। Boring consistency আছে। Edge সেটাই।`,
    ],
    mr: [
      `${niche} वर YouTube वर 90% advice 2019 recycled. 2026 version हे आहे, actually result देतं.`,
      `${niche} चं 80/20 — noise ignore कर, या 2 levers वर focus कर, 90% लोकांच्या पुढे जाशील.`,
      `${niche} मध्ये beginner सुद्धा veteran ला outperform करतो, एकच habit चा difference.`,
      `Warning — ${niche} चा मोठा trap shortcut सारखा दिसतो. पण हा slow route आहे.`,
      `${niche} मध्ये top 1% कडे secret tool नाही. Boring consistency आहे. Edge तेच.`,
    ],
    pa: [
      `${niche} ਉੱਤੇ YouTube ਉੱਤੇ 90% advice 2019 recycled ਹੈ। 2026 version ਇਹ ਹੈ, actually result ਦਿੰਦਾ ਹੈ।`,
      `${niche} ਦਾ 80/20 — noise ignore ਕਰੋ, ਇਹਨਾਂ 2 levers ਉੱਤੇ focus ਕਰੋ, 90% ਲੋਕਾਂ ਤੋਂ ਅੱਗੇ।`,
      `${niche} ਵਿੱਚ beginner ਵੀ veteran ਨੂੰ outperform ਕਰਦਾ ਹੈ, ਇੱਕ ਹੀ habit ਦਾ difference।`,
      `Warning — ${niche} ਦਾ ਵੱਡਾ trap shortcut ਵਾਂਗ ਦਿਖਦਾ ਹੈ। ਪਰ ਇਹ slow route ਹੈ।`,
    ],
    ml: [
      `${niche}-ൽ YouTube-ലെ 90% advice 2019-ലെ recycled. 2026 version ഇതാണ്, actually result തരും.`,
      `${niche}-ന്റെ 80/20 — noise ignore ചെയ്യൂ, ഈ 2 levers focus ചെയ്യൂ, 90% പേർക്ക് മുൻപിൽ.`,
      `${niche}-ൽ beginner പോലും veteran-നെ outperform ചെയ്യും, ഒറ്റ habit difference.`,
      `Warning — ${niche}-ന്റെ വലിയ trap shortcut പോലെ കാണപ്പെടും. പക്ഷേ ഇത് slow route ആണ്.`,
    ],
    kn: [
      `${niche} ಮೇಲೆ YouTube ನಲ್ಲಿ 90% advice 2019 recycled. 2026 version ಇದು, actually result ಕೊಡುತ್ತದೆ.`,
      `${niche} ನ 80/20 — noise ignore ಮಾಡಿ, ಈ 2 levers focus ಮಾಡಿ, 90% ಜನರಿಗಿಂತ ಮುಂದೆ.`,
      `${niche} ನಲ್ಲಿ beginner ಸಹ veteran ನನ್ನು outperform ಮಾಡುತ್ತಾನೆ, ಒಂದೇ habit difference.`,
      `Warning — ${niche} ನ ದೊಡ್ಡ trap shortcut ತರಹ ಕಾಣುತ್ತದೆ. ಆದರೆ ಇದು slow route.`,
    ],
  };
  return (pools[lang] || pools.en).filter(Boolean);
}

function buildScript() {
  const { niche, brief, audience, lang, format, duration } = state;
  // (Pool-based, anti-repetition build — see hookPoolForLang/etc.)
  const totalSec = duration;
  const isShorts = format === "shorts";

  const bodyCount = isShorts ? 4 : Math.max(5, Math.min(20, Math.round(totalSec / 25)));
  const hookSec   = isShorts ? 3  : 5;
  const introSec  = isShorts ? 4  : Math.min(15, Math.round(totalSec * 0.08));
  const ctaSec    = isShorts ? 6  : Math.min(20, Math.round(totalSec * 0.08));
  const bodyTotal = Math.max(10, totalSec - hookSec - introSec - ctaSec);
  const perBody   = Math.max(4, Math.round(bodyTotal / bodyCount));

  const labels = {
    hi: { hook: "🪝 1-Sec Hook", intro: "🚀 Intro", outro: "🎯 Outro", body: (i) => `💡 Point ${i}` },
    en: { hook: "🪝 1-Sec Hook", intro: "🚀 Intro", outro: "🎯 Outro", body: (i) => `💡 Point ${i}` },
    ta: { hook: "🪝 ஹூக்", intro: "🚀 அறிமுகம்", outro: "🎯 முடிவு", body: (i) => `💡 புள்ளி ${i}` },
    te: { hook: "🪝 హుక్", intro: "🚀 పరిచయం", outro: "🎯 ముగింపు", body: (i) => `💡 పాయింట్ ${i}` },
    bn: { hook: "🪝 হুক", intro: "🚀 ভূমিকা", outro: "🎯 সমাপ্তি", body: (i) => `💡 পয়েন্ট ${i}` },
    mr: { hook: "🪝 हुक", intro: "🚀 परिचय", outro: "🎯 समापन", body: (i) => `💡 मुद्दा ${i}` },
    gu: { hook: "🪝 હૂક", intro: "🚀 પરિચય", outro: "🎯 સમાપ્તિ", body: (i) => `💡 મુદ્દો ${i}` },
    pa: { hook: "🪝 ਹੁੱਕ", intro: "🚀 ਜਾਣ-ਪਛਾਣ", outro: "🎯 ਅੰਤ", body: (i) => `💡 ਪੌਇੰਟ ${i}` },
    ml: { hook: "🪝 ഹൂക്ക്", intro: "🚀 ആമുഖം", outro: "🎯 അന്ത്യം", body: (i) => `💡 പോയിന്റ് ${i}` },
    kn: { hook: "🪝 ಹೂಕ್", intro: "🚀 ಪರಿಚಯ", outro: "🎯 ಕೊನೆ", body: (i) => `💡 ಪಾಯಿಂಟ್ ${i}` },
  };
  const L = labels[lang] || labels.en;

  // Pull fresh, varied content for every regeneration.
  const hookList  = hookPoolForLang(lang, niche, brief);
  const introList = introPoolForLang(lang, niche, brief, audience);
  const outroList = ctasForLang(lang);

  const hookText  = pickFresh(hookList,  state.recentScript.hooks,  8);
  const introText = pickFresh(introList, state.recentScript.intros, 4);
  const outroText = pickFresh(outroList, state.recentScript.outros, 4);

  // Generate body points SPECIFICALLY from the brief/audience
  const bodyPoints = generateBodyPointsFromBrief(niche, brief, audience, lang, bodyCount);

  const body = bodyPoints.map((snippet, i) => ({
    heading: L.body(i + 1),
    lines: [snippet],
    seconds: perBody,
  }));

  return {
    hook:  { text: hookText,  seconds: hookSec },
    intro: { text: introText, seconds: introSec },
    body,
    outro: { text: outroText, seconds: ctaSec },
  };
}

// Generate body points specifically from the brief.
// Key principle: every point uses a DIFFERENT rhetorical shape so the
// script doesn't sound like the same sentence with a number prefix.
function generateBodyPointsFromBrief(niche, brief, audience, lang, count) {
  const framers = bodyFramersForLang(lang);

  if (brief && brief.trim().length > 10) {
    const parts = brief
      .split(/[.!?\n,;—–]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    if (parts.length >= 1) {
      const points = [];
      // Shuffle a copy of the framers so two regenerations don't open
      // with the same shape every time.
      const order = framers.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        const base   = parts[i % parts.length];
        const framer = order[i % order.length];
        points.push(framer(base, niche));
      }
      return points;
    }
  }

  // No brief — pull from the rich, varied fallback pool.
  const pool = bodyPointPoolForLang(lang, niche);
  const bucket = state.recentScript.bodies;
  const out = [];
  for (let i = 0; i < count; i++) out.push(pickFresh(pool, bucket, 10));
  return out;
}

// Each framer takes a raw idea string and re-skins it as a specific
// rhetorical move — question, contrarian, numeric, story, warning, etc.
// Same idea, ten different sounding sentences.
function bodyFramersForLang(lang) {
  const en = [
    (s) => `Here's the part most people skip — ${s.toLowerCase()}.`,
    (s) => `Real talk: ${s}. That's it. That's the move.`,
    (s) => `Ask yourself this — ${s.toLowerCase()}? Most people can't answer honestly.`,
    (s) => `The counterintuitive truth — ${s.toLowerCase()}. Sounds wrong, works anyway.`,
    (s) => `One number to remember: ${s}. Write it down.`,
    (s) => `Picture this — ${s.toLowerCase()}. Now imagine doing it for 30 days straight.`,
    (s) => `Warning sign — if you're not doing this, you're already behind: ${s.toLowerCase()}.`,
    (s) => `Quick action — ${s}. Try it before the end of this video. I dare you.`,
    (s) => `Contrast — amateurs ignore this, pros obsess over it: ${s.toLowerCase()}.`,
    (s) => `Plot twist — ${s.toLowerCase()}. Yes, really. I checked twice.`,
  ];
  const hi = [
    (s) => `ये वो हिस्सा है जो ज़्यादातर लोग skip करते हैं — ${s}.`,
    (s) => `Real talk — ${s}. बस इतना ही। यही move है।`,
    (s) => `अपने आप से पूछो — ${s}? ज़्यादातर लोग honestly जवाब नहीं दे पाते।`,
    (s) => `Counterintuitive सच — ${s}. गलत लगता है, फिर भी काम करता है।`,
    (s) => `एक number याद रखो — ${s}. लिख लो।`,
    (s) => `सोचो — ${s}. अब imagine करो 30 दिन लगातार ये करना।`,
    (s) => `Warning sign — अगर ये नहीं कर रहे, तो पीछे हो: ${s}.`,
    (s) => `Quick action — ${s}. इस video के खत्म होने से पहले try करो।`,
    (s) => `Contrast — amateurs इसे ignore करते हैं, pros इस पर obsess करते हैं: ${s}.`,
    (s) => `Plot twist — ${s}. हाँ, सच में। मैंने दो बार check किया।`,
  ];
  const gu = [
    (s) => `આ એ ભાગ છે જે મોટાભાગના લોકો skip કરે છે — ${s}.`,
    (s) => `Real talk — ${s}. બસ આટલું જ. એ જ move છે.`,
    (s) => `તમારી જાતને પૂછો — ${s}? મોટાભાગના લોકો honestly જવાબ નથી આપી શકતા.`,
    (s) => `Counterintuitive સત્ય — ${s}. ખોટું લાગે છે, છતાં કામ કરે છે.`,
    (s) => `એક number યાદ રાખો — ${s}. લખી લો.`,
    (s) => `વિચારો — ${s}. હવે imagine કરો 30 દિવસ સતત આ કરવાનું.`,
    (s) => `Warning sign — જો આ નથી કરી રહ્યા, તો પાછળ છો: ${s}.`,
    (s) => `Quick action — ${s}. આ video પૂરો થાય એ પહેલા try કરો.`,
    (s) => `Contrast — amateurs ignore કરે છે, pros આના પર obsess કરે છે: ${s}.`,
    (s) => `Plot twist — ${s}. હા, ખરેખર. મેં બે વાર check કર્યું.`,
  ];
  const fallback = en;
  const map = { en, hi, gu };
  return map[lang] || fallback;
}

function prefixByLang(lang) {
  const m = {
    hi: ["पहला — ", "दूसरा — ", "तीसरा — ", "चौथा — ", "पाँचवाँ — ", "छठा — ", "सातवाँ — ", "आठवाँ — ", "नौवाँ — ", "दसवाँ — "],
    en: ["First, ", "Second, ", "Third, ", "Fourth, ", "Fifth, ", "Sixth, ", "Seventh, ", "Eighth, ", "Ninth, ", "Tenth, "],
  };
  return (m[lang] || m.en)[Math.floor(Math.random() * 10)] || "";
}

// Add this helper — returns ALL prefixes as array
function prefixByLangAll(lang) {
  const m = {
    hi: ["पहला — ", "दूसरा — ", "तीसरा — ", "चौथा — ", "पाँचवाँ — ", "छठा — ", "सातवाँ — ", "आठवाँ — "],
    en: ["First, ", "Second, ", "Third, ", "Fourth, ", "Fifth, ", "Sixth, ", "Seventh, ", "Eighth, "],
    gu: ["પ્રથમ — ", "બીજું — ", "ત્રીજું — ", "ચોથું — ", "પાંચમું — ", "છઠ્ઠું — "],
  };
  return m[lang] || m.en;
}

function suggestMusic(niche, lang) {
  const moodByNiche = (n) => {
    const s = n.toLowerCase();
    if (/money|finance|business|invest/.test(s)) return "inspiring";
    if (/psycholog|mind|trick|hack/.test(s))    return "dark";
    if (/food|cook|recipe/.test(s))               return "upbeat";
    if (/fit|gym|workout/.test(s))                return "energetic";
    if (/tech|ai|app|gadget/.test(s))             return "futuristic";
    if (/game|gaming/.test(s))                    return "epic";
    if (/travel|trip|place/.test(s))              return "happy";
    if (/study|education|learn/.test(s))          return "calm";
    if (/love|relation/.test(s))                  return "emotional";
    if (/movie|review|celeb/.test(s))             return "cinematic";
    return "trending";
  };
  const mood = moodByNiche(niche);

  const library = {
    inspiring: [
      { name: "Inspiring Cinematic",   src: "Pixabay",        url: "https://pixabay.com/music/search/genre/inspiring/" },
      { name: "Motivational Uplift",   src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?genre=cinematic" },
      { name: "Success Story",         src: "Pixabay",        url: "https://pixabay.com/music/search/success/" },
    ],
    dark: [
      { name: "Dark Mystery",          src: "Pixabay",        url: "https://pixabay.com/music/search/dark/" },
      { name: "Suspense Tension",      src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=dark" },
      { name: "Trap Dark",             src: "Pixabay",        url: "https://pixabay.com/music/search/genre/hip-hop/" },
    ],
    upbeat: [
      { name: "Happy Upbeat",          src: "Pixabay",        url: "https://pixabay.com/music/search/genre/pop/" },
      { name: "Cooking Vibes",         src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=happy" },
      { name: "Feel Good Pop",         src: "Pixabay",        url: "https://pixabay.com/music/search/feel%20good/" },
    ],
    energetic: [
      { name: "Workout Energy",        src: "Pixabay",        url: "https://pixabay.com/music/search/workout/" },
      { name: "Gym Motivation",        src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=inspirational" },
      { name: "Beast Mode",            src: "Pixabay",        url: "https://pixabay.com/music/search/beast/" },
    ],
    futuristic: [
      { name: "Future Tech",           src: "Pixabay",        url: "https://pixabay.com/music/search/technology/" },
      { name: "Cyber Synth",           src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=inspiring" },
      { name: "AI Pulse",              src: "Pixabay",        url: "https://pixabay.com/music/search/ai/" },
    ],
    epic: [
      { name: "Epic Cinematic",        src: "Pixabay",        url: "https://pixabay.com/music/search/epic/" },
      { name: "Gaming Trap",           src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?genre=hip-hop" },
      { name: "Boss Battle",           src: "Pixabay",        url: "https://pixabay.com/music/search/gaming/" },
    ],
    happy: [
      { name: "Travel Vlog Music",     src: "Pixabay",        url: "https://pixabay.com/music/search/travel/" },
      { name: "Summer Pop",            src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=happy" },
      { name: "Adventure Time",        src: "Pixabay",        url: "https://pixabay.com/music/search/adventure/" },
    ],
    calm: [
      { name: "Lo-fi Study",           src: "Pixabay",        url: "https://pixabay.com/music/search/lofi/" },
      { name: "Calm Focus",            src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=calm" },
      { name: "Ambient Peace",         src: "Pixabay",        url: "https://pixabay.com/music/search/ambient/" },
    ],
    emotional: [
      { name: "Emotional Piano",       src: "Pixabay",        url: "https://pixabay.com/music/search/emotional/" },
      { name: "Sad Love",              src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=sad" },
      { name: "Heart Strings",         src: "Pixabay",        url: "https://pixabay.com/music/search/sad/" },
    ],
    cinematic: [
      { name: "Movie Trailer",         src: "Pixabay",        url: "https://pixabay.com/music/search/cinematic/" },
      { name: "Dramatic Score",        src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?genre=cinematic" },
      { name: "Epic Strings",          src: "Pixabay",        url: "https://pixabay.com/music/search/strings/" },
    ],
    trending: [
      { name: "Trending Now 2026",     src: "Pixabay",        url: "https://pixabay.com/music/search/trending/" },
      { name: "Viral Hits",            src: "YouTube Audio",  url: "https://www.youtube.com/audiolibrary/music?mood=inspirational" },
      { name: "Creator Favourite",     src: "Pixabay",        url: "https://pixabay.com/music/search/creator/" },
    ],
  };

  let tracks = library[mood] || library.trending;
  const bonus = {
    hi: { name: "Bollywood Lo-fi",  src: "Pixabay", url: "https://pixabay.com/music/search/bollywood/" },
    ta: { name: "South Indian Beat",src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    te: { name: "Tollywood Beat",   src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    bn: { name: "Bangla Folk Pop",  src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    pa: { name: "Punjabi Bhangra",  src: "Pixabay", url: "https://pixabay.com/music/search/punjabi/" },
    mr: { name: "Maharashtra Folk", src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    gu: { name: "Gujarati Garba",   src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    ml: { name: "Mollywood Melody", src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
    kn: { name: "Sandalwood Beat",  src: "Pixabay", url: "https://pixabay.com/music/search/indian/" },
  };
  if (bonus[lang]) tracks = [bonus[lang], ...tracks];
  return tracks.slice(0, 4);
}

// ============================================================
//  Auto-fill title + audience (called from buildScriptAndMusic)
// ============================================================
async function autoGenerateTitle(niche, lang, brief) {
  const langName = state.langName || (langMeta[lang] && langMeta[lang].name) || "English";
  const videoStyle = state.videoStyle || "auto";
  const system = [
    "You are an elite YouTube title strategist.",
    "You create titles that make people physically unable to scroll past.",
    "You understand curiosity gaps, specificity, and psychological triggers.",
    "Return ONLY the title text, nothing else. No quotes, no explanation.",
  ].join(" ");
  const user = [
    `Write ONE viral YouTube title for a video about: ${brief || niche}`,
    `Language: ${langName}`,
    `Niche: ${niche}`,
    `Style: ${videoStyle}`,
    "",
    "TITLE RULES:",
    "- Under 60 characters",
    "- Must create a curiosity gap the viewer CAN'T resist",
    "- Use specific numbers/details when possible",
    "- Start with a hook word (This, Why, How, The, I, etc.)",
    "- No clickbait that can't be delivered",
    "",
    "Return ONLY the title text.",
  ].join("\n");
  const text = await callClaude(system, user, 80);
  return String(text || "")
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .split(/\r?\n/)[0]
    .slice(0, 120);
}

function autoDetectAudience(niche, lang) {
  const mood = typeof detectNicheMood === "function" ? detectNicheMood(niche) : "default";
  const en = {
    horror:    "18-35 year old Indians who love dark mysteries, paranormal stories, and unsolved crimes",
    finance:   "18-40 year old Indians looking to earn, save, or invest money smartly",
    tech:      "18-30 year old Indians interested in AI, gadgets, and the latest technology",
    food:      "Indian food lovers aged 16-40 who enjoy recipes, street food, and restaurant reviews",
    fitness:   "Indians aged 16-35 who want to get fit, lose weight, or build a workout routine",
    love:      "Indians aged 18-30 navigating relationships, dating, and marriage",
    education: "Indian students aged 14-24 preparing for exams or studying smarter",
    default:   "General Indian YouTube audience aged 18-35",
  };
  const hi = {
    horror:    "18-35 साल के भारतीय युवा जो dark mystery और सच्ची कहानियाँ पसंद करते हैं",
    finance:   "18-40 साल के भारतीय जो पैसे कमाना, बचाना या smart invest करना चाहते हैं",
    tech:      "AI और technology में interested 18-30 साल के भारतीय",
    food:      "16-40 साल के भारतीय जो recipes, street food और restaurant reviews पसंद करते हैं",
    fitness:   "16-35 साल के भारतीय जो fit होना, weight lose करना या workout routine बनाना चाहते हैं",
    love:      "18-30 साल के भारतीय जो relationships, dating और marriage समझ रहे हैं",
    education: "14-24 साल के भारतीय students जो exams की तैयारी कर रहे हैं",
    default:   "18-35 साल का general Indian YouTube audience",
  };
  const gu = {
    horror:    "18-35 વર્ષના ભારતીય યુવાનો જેઓ dark mystery અને ખરી વાર્તાઓ પસંદ કરે છે",
    finance:   "18-40 વર્ષના ભારતીયો જેઓ પૈસા કમાવવા, બચાવવા કે invest કરવા માંગે છે",
    tech:      "AI અને technology માં interested 18-30 વર્ષના ભારતીયો",
    food:      "16-40 વર્ષના ભારતીયો જેઓ recipes, street food અને restaurant reviews પસંદ કરે છે",
    fitness:   "16-35 વર્ષના ભારતીયો જેઓ fit થવા, weight ઘટાડવા કે workout routine બનાવવા માંગે છે",
    love:      "18-30 વર્ષના ભારતીયો જેઓ relationships, dating અને marriage સમજે છે",
    education: "14-24 વર્ષના ભારતીય students જેઓ exams ની તૈયારી કરે છે",
    default:   "18-35 વર્ષનો general Indian YouTube audience",
  };
  const table = { hi, en, gu };
  const langTable = table[lang] || en;
  return (langTable[mood] || langTable.default);
}

async function buildScriptAndMusic() {
  state.title = state.pickedIdea.title;

  // Auto-fill title if not provided (or AI didn't pick a good one)
  if (!state.title || !state.title.trim() || state.title.trim().length < 4) {
    try {
      const autoTitle = await autoGenerateTitle(state.niche, state.lang, state.brief);
      if (autoTitle) {
        state.title = autoTitle;
        if (state.pickedIdea) state.pickedIdea.title = autoTitle;
        if ($("finalTitle")) $("finalTitle").textContent = `${state.pickedIdea?.emoji || "🎬"} ${state.title}`;
      }
    } catch (e) {
      console.warn("Auto title generation failed:", e);
      if (!state.title) state.title = state.niche + " — " + (state.brief || "").slice(0, 40);
    }
  }

  // Auto-fill audience if not provided
  if (!state.audience || !state.audience.trim()) {
    state.audience = autoDetectAudience(state.niche, state.lang);
  }

  // STEP 1: Deep competitive intelligence
  try {
    showToast("🔍 Analyzing competitor videos…");
    state.competitorInsights = await analyzeCompetitors(state.niche, state.lang);
  } catch (e) {
    console.warn("Competitor analysis failed:", e);
    state.competitorInsights = null;
  }

  // STEP 2: Generate elite script
  try {
    showToast("✍️ Writing your script with AI…");
    state.script = await generateScriptWithAI(
      state.niche, state.brief, state.audience,
      state.lang, state.format, state.duration
    );
  } catch (e) {
    console.warn("AI script generation failed, using template fallback:", e);
    state.script = buildScript();
  }

  // STEP 3: Professional quality gate
  try {
    showToast("🔍 Running quality check…");
    state.script = await qualityGateReview(state.script, state.brief, state.niche);
  } catch (e) {
    console.warn("Quality gate failed:", e);
  }

  // STEP 4: Generate cinematic image prompts
  try {
    showToast("🎬 Generating cinematic scene prompts…");
    const allScenes = [
      { text: state.script.hook.text, seconds: state.script.hook.seconds },
      { text: state.script.intro.text, seconds: state.script.intro.seconds },
      ...state.script.body.map((b) => ({ text: b.lines[0] || "", seconds: b.seconds })),
      { text: state.script.outro.text, seconds: state.script.outro.seconds },
    ];
    state.imagePrompts = await generateImagePrompts(allScenes, state.niche, state.lang);
  } catch (e) {
    console.warn("Image prompt generation failed:", e);
    state.imagePrompts = [];
  }

  // STEP 5: Generate viral titles + thumbnail concepts
  try {
    showToast("🎯 Creating viral titles & thumbnails…");
    state.titleThumbnailData = await generateTitleAndThumbnails(
      state.niche, state.lang, state.niche, state.title
    );
    // If AI generated better titles, offer the best one
    if (state.titleThumbnailData?.titles?.length) {
      const bestIdx = state.titleThumbnailData.recommended_title_index || 0;
      const bestTitle = state.titleThumbnailData.titles[bestIdx];
      if (bestTitle && bestTitle.title && bestTitle.title.length > state.title.length) {
        state.title = bestTitle.title;
        state.pickedIdea.title = bestTitle.title;
      }
    }
  } catch (e) {
    console.warn("Title/thumbnail generation failed:", e);
    state.titleThumbnailData = null;
  }

  // STEP 6: Generate voice-over direction
  try {
    state.voiceDirection = await generateVoiceDirection(state.script, state.lang, state.niche);
  } catch (e) {
    console.warn("Voice direction generation failed:", e);
    state.voiceDirection = null;
  }

  // STEP 7: AI music suggestion
  try {
    const mood = detectMoodFromTopic(state.niche);
    const musicResult = await suggestMusicWithAI(state.niche, mood, state.format, state.lang);
    if (musicResult && musicResult.tracks) {
      state.selectedMusicTrack = musicResult.tracks[musicResult.recommended || 0] || null;
      state.musicDirection = musicResult.music_direction || null;
    }
  } catch (e) {
    console.warn("AI music suggestion failed:", e);
  }

  // Fallback music suggestions
  state.music = suggestMusic(state.niche, state.lang);

  // Populate the inline voice model selector on Script step
  populateInlineVoiceSelector();

  // ── Render everything ──
  $("finalTitle").textContent = `${state.pickedIdea.emoji || "🎬"} ${state.title}`;
  const text = formatScriptForDisplay(state.script);
  $("finalScript").innerHTML = text;

  $("musicList").innerHTML = state.music.map((m) => {
    const safeUrl = /^https?:\/\//i.test(m.url || "") ? escapeHtml(m.url) : "#";
    const safeSrc = escapeHtml(m.src || "");
    return `
    <a class="music-item" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
      <span class="music-note">🎵</span>
      <span class="music-name">${escapeHtml(m.name)}</span>
      <span class="music-source">${safeSrc} · Free</span>
    </a>
  `;
  }).join("");

  // Populate competitor insights card
  try {
    const insights = state.competitorInsights;
    const card = $("competitorInsightsCard");
    const body = $("competitorInsightsBody");
    if (insights && card && body) {
      card.hidden = false;
      let html = '<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">';

      if (insights.topic_analysis) {
        html += `<div style="background:rgba(79,140,255,0.08);border:1px solid rgba(79,140,255,0.2);border-radius:8px;padding:12px;"><b style="color:var(--accent);font-size:0.85rem;">📌 Topic Analysis:</b><div style="margin-top:6px;font-size:0.85rem;color:var(--text-secondary);">`;
        if (insights.topic_analysis.core_subject) html += `<div><b>Core Subject:</b> ${escapeHtml(insights.topic_analysis.core_subject)}</div>`;
        if (insights.topic_analysis.search_intent) html += `<div><b>Search Intent:</b> ${escapeHtml(insights.topic_analysis.search_intent)}</div>`;
        if (insights.topic_analysis.trending_angle) html += `<div><b>Trending Angle:</b> ${escapeHtml(insights.topic_analysis.trending_angle)}</div>`;
        html += '</div></div>';
      }

      if (insights.audience_analysis) {
        html += `<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:12px;"><b style="color:#8B5CF6;font-size:0.85rem;">👥 Audience Analysis:</b><div style="margin-top:6px;font-size:0.85rem;color:var(--text-secondary);">`;
        if (insights.audience_analysis.primary_demographic) html += `<div><b>Target:</b> ${escapeHtml(insights.audience_analysis.primary_demographic)}</div>`;
        if (insights.audience_analysis.pain_points?.length) html += `<div><b>Pain Points:</b> ${insights.audience_analysis.pain_points.map((p) => escapeHtml(p)).join(", ")}</div>`;
        if (insights.audience_analysis.desires?.length) html += `<div><b>Desires:</b> ${insights.audience_analysis.desires.map((d) => escapeHtml(d)).join(", ")}</div>`;
        html += '</div></div>';
      }

      if (insights.content_gaps?.length) {
        html += `<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:12px;"><b style="color:#22c55e;font-size:0.85rem;">🎯 OPPORTUNITY — Gap Nobody Has Filled:</b><ul style="margin:4px 0 0 18px;font-size:0.88rem;color:var(--text-secondary);">${insights.content_gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul></div>`;
      }

      if (insights.viral_angles?.length) {
        html += `<div><b style="color:var(--accent);font-size:0.85rem;">🔥 Viral Angles:</b><ul style="margin:4px 0 0 18px;font-size:0.88rem;color:var(--text-secondary);">${insights.viral_angles.map((a) => `<li><b>${escapeHtml(a.angle)}</b> — ${escapeHtml(a.why_it_works || "")}</li>`).join("")}</ul></div>`;
      }

      if (insights.emotional_triggers?.length) {
        html += `<div><b style="color:var(--accent);font-size:0.85rem;">Emotional Triggers:</b> <span style="font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(insights.emotional_triggers.join(", "))}</span></div>`;
      }

      if (insights.recommended_style) {
        html += `<div style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.2);border-radius:8px;padding:12px;"><b style="color:#eab308;font-size:0.85rem;">🎬 Recommended Style:</b> <span style="font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(insights.recommended_style)}</span></div>`;
      }

      if (insights.viral_structure) {
        html += `<div><b style="color:var(--accent);font-size:0.85rem;">Viral Structure:</b> <span style="font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(insights.viral_structure)}</span></div>`;
      }

      html += '</div>';
      body.innerHTML = html;
    }
  } catch (e) { console.warn("Render competitor insights:", e); }

  // Populate AI music card
  try {
    const aiMusicEl = $("aiMusicList");
    if (aiMusicEl && state.selectedMusicTrack) {
      const t = state.selectedMusicTrack;
      const safeUrl = /^https?:\/\//i.test(t.search_url || "") ? escapeHtml(t.search_url) : "#";
      aiMusicEl.innerHTML = `
        <div class="music-item" style="border-color:var(--accent);">
          <span class="music-note">🎵</span>
          <span class="music-name">${escapeHtml(t.name || "AI Suggested")}</span>
          <span class="music-source" style="background:var(--accent-soft);color:var(--accent);">AI Recommended · ${escapeHtml(t.mood || "")}</span>
        </div>
        ${t.why ? `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;font-style:italic;">"${escapeHtml(t.why)}"</p>` : ""}
        ${state.musicDirection ? `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;"><b>Music Direction:</b> ${escapeHtml(state.musicDirection)}</p>` : ""}
      `;
    }
  } catch (e) { console.warn("Render AI music:", e); }

  // Build initial scenes list for editor (if not already built)
  if (!state.scenes || !state.scenes.length) {
    state.scenes = buildScenesFromScript();
  }
  saveProjectDebounced();
}

// Generate fallback scenes from raw script text when pipeline scene breakdown fails
function generateFallbackScenes(scriptText, format, totalDuration) {
  const text = scriptText || "No script available";
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const sceneCount = Math.max(3, Math.min(12, Math.ceil(totalDuration / 10)));
  const secPerScene = Math.max(4, Math.round(totalDuration / sceneCount));
  const scenes = [];
  const perScene = Math.ceil(sentences.length / sceneCount);

  for (let i = 0; i < sceneCount; i++) {
    const chunk = sentences.slice(i * perScene, (i + 1) * perScene).join(" ").trim();
    const kind = i === 0 ? "hook" : i === sceneCount - 1 ? "outro" : "body";
    scenes.push({
      kind,
      heading: kind === "hook" ? "🪝 HOOK" : kind === "outro" ? "🎯 CTA" : `Scene ${i + 1}`,
      text: chunk || `Scene ${i + 1}`,
      seconds: secPerScene,
      hue: (i * 45) % 360,
      bg: null,
      transition: i > 0 ? "fade" : "none"
    });
  }
  return scenes;
}

function buildScenesFromScript() {
  const s = state.script;
  const out = [];
  out.push({ kind: "hook",   heading: "🪝 HOOK",   text: s.hook.text,   seconds: s.hook.seconds,   hue: 0 });
  out.push({ kind: "intro",  heading: "🚀 INTRO",  text: s.intro.text,  seconds: s.intro.seconds,  hue: 90 });
  s.body.forEach((b, i) => {
    out.push({ kind: "body",   heading: b.heading,  text: b.lines[0] || "", seconds: b.seconds, hue: 60 * (i + 2) });
  });
  out.push({ kind: "outro",  heading: "🎯 CTA",    text: s.outro.text,  seconds: s.outro.seconds,  hue: 240 });
  return out;
}


// ============================================================
//  GENERATION SCREEN — animated progress while AI works
// ============================================================
const genStages = [
  { id: "analyze",       label: "Analyzing Topic", duration: 1000 },
  { id: "research",      label: "Researching Topic", duration: 1200 },
  { id: "angle",         label: "Finding Best Angle", duration: 800 },
  { id: "title",         label: "Creating Viral Title", duration: 700 },
  { id: "thumbnail",     label: "Thumbnail Concepts", duration: 600 },
  { id: "story",         label: "Building Story Structure", duration: 800 },
  { id: "script",        label: "Writing High-Retention Script", duration: 1500 },
  { id: "scenes",        label: "Creating Scene Breakdown", duration: 900 },
  { id: "visualprompts", label: "Creating Visual Prompts", duration: 800 },
  { id: "visualassets",  label: "Generating Visual Assets", duration: 3000 },
  { id: "voiceover",     label: "Generating Voiceover", duration: 1200 },
  { id: "music",         label: "Selecting Background Music", duration: 600 },
  { id: "assembly",      label: "Assembling Video", duration: 2000 },
];

let _genAnimFrame = null;
let _genStartTime = 0;
let _genTotalDuration = genStages.reduce((s, g) => s + g.duration, 0);

function startGenerationAnimation() {
  _genStartTime = Date.now();
  const bar = $("genProgressBar");
  const pctEl = $("genProgressPct");
  const etaEl = $("genProgressEta");
  const stages = document.querySelectorAll("#genStages .gen-stage");

  // Reset all stages
  stages.forEach((el) => { el.classList.remove("active", "done"); });
  if (bar) bar.style.width = "0%";
  if (pctEl) pctEl.textContent = "0%";
  if (etaEl) etaEl.textContent = "Estimating...";

  let currentStageIdx = 0;
  let stageStartTime = _genStartTime;

  function tick() {
    const elapsed = Date.now() - _genStartTime;
    const pct = Math.min(100, Math.round((elapsed / _genTotalDuration) * 100));

    // Update progress bar
    if (bar) bar.style.width = pct + "%";
    if (pctEl) pctEl.textContent = pct + "%";

    // Update ETA
    if (etaEl) {
      const remaining = Math.max(0, _genTotalDuration - elapsed);
      etaEl.textContent = remaining > 1000 ? `~${Math.ceil(remaining / 1000)}s remaining` : "Almost done...";
    }

    // Update stage highlights
    let accumulated = 0;
    for (let i = 0; i < genStages.length; i++) {
      accumulated += genStages[i].duration;
      const el = stages[i];
      if (!el) continue;
      if (elapsed < accumulated) {
        // This is the current active stage
        el.classList.add("active");
        el.classList.remove("done");
        // Mark all previous as done
        for (let j = 0; j < i; j++) {
          stages[j].classList.remove("active");
          stages[j].classList.add("done");
        }
        break;
      } else if (i === genStages.length - 1) {
        // All stages complete
        el.classList.remove("active");
        el.classList.add("done");
        for (let j = 0; j < i; j++) {
          stages[j].classList.remove("active");
          stages[j].classList.add("done");
        }
      }
    }

    if (pct < 100) {
      _genAnimFrame = requestAnimationFrame(tick);
    }
  }
  _genAnimFrame = requestAnimationFrame(tick);
}

function stopGenerationAnimation() {
  if (_genAnimFrame) cancelAnimationFrame(_genAnimFrame);
  _genAnimFrame = null;
  // Set to 100%
  const bar = $("genProgressBar");
  const pctEl = $("genProgressPct");
  const etaEl = $("genProgressEta");
  if (bar) bar.style.width = "100%";
  if (pctEl) pctEl.textContent = "100%";
  if (etaEl) etaEl.textContent = "Complete!";
  // Mark all stages done
  document.querySelectorAll("#genStages .gen-stage").forEach((el) => {
    el.classList.remove("active");
    el.classList.add("done");
  });
}

// Update generation progress from the new pipeline
function updateGenerationProgress(progress, message) {
  const bar = $("genProgressBar");
  const pctEl = $("genProgressPct");
  const etaEl = $("genProgressEta");
  const stages = document.querySelectorAll("#genStages .gen-stage");

  const pct = Math.min(100, Math.round(progress * 100));
  if (bar) bar.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
  if (etaEl) etaEl.textContent = message || "";

  // Map progress to stage highlighting
  const stageIdx = Math.min(Math.floor(progress * stages.length), stages.length - 1);
  stages.forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i < stageIdx) el.classList.add("done");
    else if (i === stageIdx) el.classList.add("active");
  });
}

// Full pipeline: generation screen → ideas → script → navigate to script page
function formatScriptForDisplay(s) {
  const out = [];
  out.push(`<b>${s.hook.seconds}s · ${escapeHtml(s.hook.text)}</b>`);
  out.push(`<br><br><b>${s.intro.seconds}s · ${escapeHtml(s.intro.text)}</b>`);
  s.body.forEach((b) => {
    out.push(`<br><br><b>${b.seconds}s · ${escapeHtml(b.heading)}</b>`);
    b.lines.forEach((l) => out.push(`<br>· ${escapeHtml(l)}`));
  });
  out.push(`<br><br><b>${s.outro.seconds}s · ${escapeHtml(s.outro.text)}</b>`);
  return out.join("");
}

$("regenTitleBtn").addEventListener("click", safe(async (e) => {
  const newIdeas = await generateIdeas(state.niche, state.lang, state.format, state.duration);
  const choice = pickRandom(newIdeas);
  state.title = choice.title;
  state.pickedIdea = { ...state.pickedIdea, ...choice, title: choice.title, emoji: choice.emoji };
  $("finalTitle").textContent = `${choice.emoji} ${choice.title}`;
  showToast("🔄 New title generated");
  saveProjectDebounced();
}));

$("regenScriptBtn").addEventListener("click", safe(async (e) => {
  try {
    showToast("✍️ Writing your script with AI…");
    state.script = await generateScriptWithAI(
      state.niche, state.brief, state.audience,
      state.lang, state.format, state.duration
    );
  } catch (err) {
    console.warn("AI script generation failed, using template fallback:", err);
    state.script = buildScript();
  }
  $("finalScript").innerHTML = formatScriptForDisplay(state.script);
  state.scenes = buildScenesFromScript();
  showToast("🔄 New script generated");
  saveProjectDebounced();
}));

$("copyTitleBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("finalTitle").textContent.trim()); showToast("📋 Title copied"); }
  catch (e) { showToast("❌ Copy failed"); }
});

$("copyScriptBtn").addEventListener("click", async () => {
  const t = $("finalScript").innerText;
  try { await navigator.clipboard.writeText(t); showToast("📋 Script copied"); }
  catch (e) { showToast("❌ Copy failed"); }
});

if ($("downloadScriptBtn")) $("downloadScriptBtn").addEventListener("click", () => {
  if (!state.script) return;
  const text = [
    `TITLE: ${state.title}`,
    `LANGUAGE: ${state.langName}`,
    `NICHE: ${state.niche}`,
    `BRIEF: ${state.brief || "—"}`,
    `AUDIENCE: ${state.audience || "—"}`,
    `FORMAT: ${state.format.toUpperCase()} (${state.format === "shorts" ? "60s" : formatTime(state.duration)})`,
    "",
    "==== SCRIPT ====",
    `[0-${state.script.hook.seconds}s] HOOK: ${state.script.hook.text}`,
    `[${state.script.hook.seconds}-${state.script.hook.seconds + state.script.intro.seconds}s] INTRO: ${state.script.intro.text}`,
    ...state.script.body.flatMap((b, i) => {
      const start = state.script.hook.seconds + state.script.intro.seconds + i * b.seconds;
      return [
        `[${start}-${start + b.seconds}s] ${b.heading}:`,
        ...b.lines.map((l) => `  - ${l}`),
      ];
    }),
    `OUTRO: ${state.script.outro.text}`,
    "",
    "==== MUSIC (Copyright-Free) ====",
    ...state.music.map((m) => `- ${m.name} (${m.src}): ${m.url}`),
  ].join("\n");
  downloadFile(text, `${slug(state.title)}-script.txt`, "text/plain");
});

// "Edit Scenes" button on script step → goes to editor (step 8)
$("toEditorBtn").addEventListener("click", () => {
  if (!state.scenes || !state.scenes.length) state.scenes = buildScenesFromScript();
  renderEditor();
  goToStep(8);
});

// "Make My Video" button on script step → goes straight to render (step 9)
// Back/Next navigation for step-7 (customization)
if ($("customBackBtn")) $("customBackBtn").addEventListener("click", () => {
  goToStep(7);
});
if ($("customNextBtn")) $("customNextBtn").addEventListener("click", () => {
  if (!state.scenes || !state.scenes.length) state.scenes = buildScenesFromScript();
  renderEditor();
  goToStep(8);
});

// Back navigation for step-8 (editor)
if ($("editorBackBtn")) $("editorBackBtn").addEventListener("click", () => {
  goToStep(7);
});

// Script review navigation (step-7)
if ($("scriptBackBtn")) $("scriptBackBtn").addEventListener("click", () => {
  goToStep(2);
});
if ($("scriptNextBtn")) $("scriptNextBtn").addEventListener("click", safe(async (e) => {
  // Generate visual assets in background while user customizes
  showToast("🎨 Generating visual assets...");
  try {
    if (state.pipelineSceneData && state.pipelineSceneData.scenes) {
      const niche = state.nicheAnalysis?.niche || "general";
      const visualPrompts = await PIPELINE.createVisualPrompts(state.pipelineSceneData.scenes, niche);
      state.imagePrompts = visualPrompts.visual_prompts;

      // Generate images
      state.visualAssets = await PIPELINE.generateVisualAssets(
        visualPrompts.visual_prompts,
        state.pipelineSceneData.scenes,
        state.format
      );

      // Attach assets to scenes
      if (state.visualAssets && state.scenes) {
        state.scenes.forEach((scene, i) => {
          const asset = state.visualAssets[i];
          if (asset && asset.el) {
            scene.bg = { type: "image", el: asset.el };
          }
        });
      }

      // Generate voiceover
      state.voiceovers = await PIPELINE.generateVoiceover(
        state.pipelineSceneData.scenes,
        state.lang,
        niche
      );

      // Select music
      state.selectedMusicTrack = await PIPELINE.selectBackgroundMusic(
        niche,
        state.pipelineSceneData.scenes[0]?.music_mood || "ambient",
        state.duration
      );

      showToast("✅ Visuals ready! Customize your video.");
    }
  } catch (e) {
    console.warn("[ScriptNext] Asset generation failed:", e);
    showToast("⚠️ Some assets failed, video will use fallbacks");
  }
  goToStep(8);
}));

// ============================================================
//  STEP 5 EXTENSION (Step 6): Customisation (face, voice, bg style)
// ============================================================
document.querySelectorAll(".bg-style-card").forEach((c) => {
  c.addEventListener("click", () => {
    document.querySelectorAll(".bg-style-card").forEach((x) => x.classList.remove("selected"));
    c.classList.add("selected");
    state.bgStyle = c.dataset.bg;
    saveProjectDebounced();
  });
});

const faceDrop = $("faceDrop");
const faceInput = $("faceInput");
const faceEmpty = $("faceEmpty");
const facePreview = $("facePreview");
const clearFaceBtn = $("clearFaceBtn");

if (faceDrop) {
  faceDrop.addEventListener("click", () => faceInput.click());
  ["dragenter", "dragover"].forEach((e) =>
    faceDrop.addEventListener(e, (ev) => { ev.preventDefault(); faceDrop.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((e) =>
    faceDrop.addEventListener(e, (ev) => { ev.preventDefault(); faceDrop.classList.remove("dragover"); })
  );
  faceDrop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) loadFace(f);
  });
  faceInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) loadFace(f);
  });
}

async function loadFace(file) {
  try {
    if (!file.type.startsWith("image/")) return showToast("⚠️ Please pick an image file");
    if (file.size > 10 * 1024 * 1024) return showToast("⚠️ Image too large (max 10 MB)");
    // Verify it's actually an image (magic-number sniff) + strip EXIF
    const sniffed = await security.sniffFileType(file);
    if (!sniffed.startsWith("image/")) return showToast("⚠️ That file isn't a valid image");
    showToast("🛡️ Stripping image metadata…");
    const safe = await security.stripImageMetadata(file);
    if (!safe) return showToast("❌ Could not process image");
    const reader = new FileReader();
    reader.onload = () => {
      state.userFace = reader.result;
      facePreview.src = state.userFace;
      facePreview.hidden = false;
      faceEmpty.hidden = true;
      clearFaceBtn.hidden = false;
      const img = new Image();
      img.onload = () => { state.userFaceImg = img; };
      img.onerror = () => showToast("❌ Could not load that image");
      img.src = state.userFace;
      showToast("✅ Face added — metadata stripped for privacy");
      saveProjectDebounced();
    };
    reader.onerror = () => showToast("❌ Failed to read image file");
    reader.readAsDataURL(safe);
  } catch (e) {
    showToast("❌ Face upload failed: " + e.message);
  }
}

if (clearFaceBtn) {
  clearFaceBtn.addEventListener("click", () => {
    state.userFace = null;
    state.userFaceImg = null;
    facePreview.hidden = true;
    facePreview.src = "";
    faceEmpty.hidden = false;
    faceInput.value = "";
    clearFaceBtn.hidden = true;
    showToast("🗑️ Face removed");
    saveProjectDebounced();
  });
}

const voiceDrop = $("voiceDrop");
const voiceInput = $("voiceInput");
const voiceEmpty = $("voiceEmpty");
const voiceLoaded = $("voiceLoaded");
const voiceName = $("voiceName");
const voiceMeta = $("voiceMeta");
const playVoiceBtn = $("playVoiceBtn");
const clearVoiceBtn = $("clearVoiceBtn");

if (voiceDrop) {
  voiceDrop.addEventListener("click", (e) => {
    if (e.target === playVoiceBtn) return;
    voiceInput.click();
  });
  ["dragenter", "dragover"].forEach((e) =>
    voiceDrop.addEventListener(e, (ev) => { ev.preventDefault(); voiceDrop.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((e) =>
    voiceDrop.addEventListener(e, (ev) => { ev.preventDefault(); voiceDrop.classList.remove("dragover"); })
  );
  voiceDrop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) loadVoice(f);
  });
  voiceInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) loadVoice(f);
  });
}

let voiceAudioEl = null;
async function loadVoice(file) {
  if (!file.type.startsWith("audio/")) return showToast("⚠️ Please pick an audio file");
  if (file.size > 20 * 1024 * 1024) return showToast("⚠️ Audio too large (max 20 MB)");
  // Magic-number sniff — make sure the file is really an audio file
  const sniffed = await security.sniffFileType(file);
  if (!sniffed.startsWith("audio/")) return showToast("⚠️ That file isn't a valid audio file");
  state.voiceName = file.name;
  voiceName.textContent = file.name;
  voiceEmpty.hidden = true;
  voiceLoaded.hidden = false;
  clearVoiceBtn.hidden = false;

  const url = URL.createObjectURL(file);
  if (voiceAudioEl) voiceAudioEl.pause();
  voiceAudioEl = new Audio(url);
  voiceAudioEl.addEventListener("loadedmetadata", () => {
    state.voiceDuration = voiceAudioEl.duration;
    voiceMeta.textContent = `${formatTime(voiceAudioEl.duration)} · ${(file.size/1024).toFixed(0)} KB`;
  });

  try {
    const buf = await file.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    state.userVoice = await ac.decodeAudioData(buf.slice(0));
    try { ac.close(); } catch (e) {}
    showToast("✅ Voice sample loaded — will mix softly into your video");
  } catch (e) {
    showToast("⚠️ Could not decode audio: " + e.message);
  }
}

if (playVoiceBtn) {
  playVoiceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!voiceAudioEl) return;
    voiceAudioEl.currentTime = 0;
    voiceAudioEl.play();
  });
}

if (clearVoiceBtn) {
  clearVoiceBtn.addEventListener("click", () => {
    state.userVoice = null;
    state.voiceName = null;
    state.voiceDuration = 0;
    if (voiceAudioEl) { voiceAudioEl.pause(); voiceAudioEl = null; }
    voiceEmpty.hidden = false;
    voiceLoaded.hidden = true;
    voiceInput.value = "";
    clearVoiceBtn.hidden = true;
    showToast("🗑️ Voice removed");
    saveProjectDebounced();
  });
}

// ============================================================
//  STEP 7: Scene Editor
// ============================================================
function renderEditor() {
  const list = $("editorList");
  if (!list) return;
  list.innerHTML = state.scenes.map((scene, i) => {
    const hue = Number(scene.hue) || 0;
    const sec = Math.max(1, Math.min(120, Math.round(Number(scene.seconds) || 5)));
    return `
    <div class="editor-scene" data-idx="${i}">
      <div class="editor-scene-preview" style="background: linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 35%));">
        <span class="scene-tag">${i + 1}/${state.scenes.length}</span>
        ${escapeHtml(truncate(String(scene.heading || "").replace(/[^\w\s]/g, ""), 18))}
      </div>
      <div class="editor-scene-body">
        <div class="editor-scene-heading">${escapeHtml(String(scene.heading || ""))}</div>
        <textarea class="editor-scene-text" data-field="text" rows="2" maxlength="1000">${escapeHtml(String(scene.text || ""))}</textarea>
        <div class="editor-scene-meta">
          <span>⏱️</span>
          <input type="number" class="editor-scene-secs" data-field="seconds" min="1" max="120" value="${sec}" />
          <span>sec</span>
        </div>
      </div>
      <div class="editor-scene-actions">
        <button data-act="up" title="Move up">↑</button>
        <button data-act="down" title="Move down">↓</button>
        <button data-act="regen" title="Regenerate text">🔄</button>
        <button data-act="del" class="danger" title="Delete">✕</button>
      </div>
    </div>
  `;
  }).join("");

  // Wire up edits
  list.querySelectorAll(".editor-scene").forEach((el) => {
    const idx = Number(el.dataset.idx);
    el.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        const val = field === "seconds" ? Math.max(1, Number(input.value) || 1) : input.value;
        state.scenes[idx][field] = val;
        saveProjectDebounced();
      });
    });
    el.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => handleSceneAction(idx, btn.dataset.act));
    });
  });
}

async function handleSceneAction(idx, act) {
  return safe(async () => {
    if (act === "up" && idx > 0) {
      [state.scenes[idx - 1], state.scenes[idx]] = [state.scenes[idx], state.scenes[idx - 1]];
      renderEditor(); saveProjectDebounced();
    } else if (act === "down" && idx < state.scenes.length - 1) {
      [state.scenes[idx + 1], state.scenes[idx]] = [state.scenes[idx], state.scenes[idx + 1]];
      renderEditor(); saveProjectDebounced();
    } else if (act === "del") {
      if (!confirm("Delete this scene?")) return;
      state.scenes.splice(idx, 1);
      renderEditor(); saveProjectDebounced();
    } else if (act === "regen") {
      const scene = state.scenes[idx];
      const newText = await regenerateSceneText(scene);
      scene.text = newText;
      renderEditor(); saveProjectDebounced();
      showToast("🔄 Scene text regenerated");
    }
  })();
}

async function regenerateSceneText(scene) {
  // Use brief + scene kind to generate fresh text
  const lang = state.lang;
  const niche = state.niche;
  const brief = state.brief || "";
  const templates = {
    hook: {
      hi: [
        `${niche} के बारे में ये ज़रूर जानो! 😱`,
        `रुको! ${niche} का सच सुनो 🤯`,
        `99% लोग ${niche} में ये गलती करते हैं ⚠️`,
        `${niche} सीखने का सबसे आसान तरीका 💡`,
        `मैंने ${niche} पर कितना कमाया — सुनो! 💰`,
      ],
      en: [
        `You NEED to know this about ${niche}! 😱`,
        `Stop! The truth about ${niche} 🤯`,
        `99% make this ${niche} mistake ⚠️`,
        `The easiest way to learn ${niche} 💡`,
        `I earned so much with ${niche} — listen! 💰`,
      ],
    },
    intro: {
      hi: [`आज मैं ${niche} के बारे में बात करूंगा`, `${niche} पर एक quick guide`, `चलो ${niche} समझते हैं`],
      en: [`Today we're talking about ${niche}`, `A quick guide to ${niche}`, `Let's understand ${niche}`],
    },
    body: {
      hi: [
        `${niche} में सबसे ज़रूरी बात — consistency।`,
        `${niche} के लिए सही audience चुनो।`,
        `${niche} में पहले 1 second में hook दो।`,
        `${niche} में हर 7 second पर pattern break।`,
        `${niche} में story बताओ, facts नहीं।`,
        `${niche} में clear CTA ज़रूरी है।`,
        `${niche} में comments पढ़ो और reply करो।`,
        `${niche} में CTR और retention बढ़ाओ।`,
        `${niche} के top creators को follow करो।`,
        `${niche} में 2-3 videos/week डालो।`,
        brief ? `${truncate(brief, 50)}` : `${niche} में unique angle ढूंढो।`,
      ],
      en: [
        `Most important in ${niche} — consistency.`,
        `Pick the right audience for ${niche}.`,
        `1-second hook in ${niche} is critical.`,
        `Pattern break every 7 seconds in ${niche}.`,
        `Tell stories, not facts in ${niche}.`,
        `Clear CTA is essential in ${niche}.`,
        `Read & reply to comments in ${niche}.`,
        `Boost CTR and retention in ${niche}.`,
        `Follow top creators in ${niche}.`,
        `Post 2-3 videos/week in ${niche}.`,
        brief ? `${truncate(brief, 50)}` : `Find a unique angle in ${niche}.`,
      ],
    },
    outro: {
      hi: [
        `👍 Like, 🔔 Subscribe, कमेंट करो!`,
        `अगर पसंद आया तो share करो!`,
        `नीचे बताओ — अगला topic क्या हो?`,
      ],
      en: [
        `👍 Like, 🔔 Subscribe, comment below!`,
        `If you liked this, share it!`,
        `Tell me in comments — what's next?`,
      ],
    },
  };
  const t = (templates[scene.kind] && templates[scene.kind][lang]) || (templates[scene.kind] && templates[scene.kind].en) || [`${niche}`];
  return pickRandom(t);
}

$("addSceneBtn").addEventListener("click", () => {
  const newScene = {
    kind: "body",
    heading: `💡 Point ${state.scenes.length - 3}`,
    text: "नया पॉइंट जोड़ें...",
    seconds: 8,
    hue: Math.floor(Math.random() * 360),
  };
  // Insert before outro
  const outroIdx = state.scenes.findIndex((s) => s.kind === "outro");
  if (outroIdx >= 0) state.scenes.splice(outroIdx, 0, newScene);
  else state.scenes.push(newScene);
  renderEditor();
  saveProjectDebounced();
});

$("toRenderBtn").addEventListener("click", safe(async (e) => {
  goToStep(9);
  await renderVideo();
}));

// ============================================================
//  STEP 8: Video Rendering
// ============================================================
// We try WebCodecs (fast) first, then fall back to MediaRecorder.
// We pre-fetch Pexels videos when API key is set; otherwise use Picsum images.

const canvas = () => $("videoCanvas");

function setCanvasOrientation() {
  const c = canvas();
  if (state.format === "shorts") { c.width = 1080; c.height = 1920; }
  else { c.width = 1920; c.height = 1080; }
}

async function loadPicsum(seed, w, h) {
  // Deterministic seed from string
  const seedNum = Math.abs(seed.split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % 10000;
  // Try multiple URL formats with increasing timeouts
  const urls = [
    `https://picsum.photos/seed/${encodeURIComponent(seed.slice(0,16))}/${w}/${h}`,
    `https://picsum.photos/${w}/${h}?random=${seedNum}`,
    `https://picsum.photos/id/${seedNum % 1084}/${w}/${h}`,
  ];
  for (const url of urls) {
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('load error'));
        setTimeout(() => reject(new Error('timeout')), 8000);
        i.src = url;
      });
      if (img.naturalWidth > 0 && img.naturalHeight > 0) return img;
    } catch (e) {
      console.warn("[loadPicsum] failed:", url, e.message);
    }
  }
  // Canvas fallback: generate a beautiful gradient based on seed
  console.log("[loadPicsum] All URLs failed, generating canvas gradient for:", seed);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const hue1 = seedNum % 360;
  const hue2 = (hue1 + 60) % 360;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue1}, 65%, 35%)`);
  g.addColorStop(1, `hsl(${hue2}, 75%, 22%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Add subtle radial highlight
  const rg = ctx.createRadialGradient(w*0.3, h*0.3, 0, w*0.5, h*0.5, Math.max(w,h)*0.6);
  rg.addColorStop(0, "rgba(255,255,255,0.08)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  const img = new Image();
  img.src = c.toDataURL();
  await new Promise(r => img.onload = r);
  return img;
}

// Detect WebCodecs support
function supportsWebCodecs() {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

// ----- Encoder using MediaRecorder (real-time to avoid OOM) -----
async function fastEncode({ frames, audioStream, width, height, fps, onProgress, totalDurationSec }) {
  // Use the visible canvas so that captureStream actually records pixels and requestAnimationFrame works.
  const main = $("videoCanvas");
  main.width = width; main.height = height;
  const mainCtx = main.getContext("2d");
  const stream = main.captureStream(fps);

  // Bake audio into the same MediaStream so MediaRecorder muxes it
  if (audioStream) {
    try {
      const audioTracks = audioStream.getAudioTracks ? audioStream.getAudioTracks() : [];
      audioTracks.forEach((t) => stream.addTrack(t));
    } catch (e) {
      console.warn("Could not attach audio tracks:", e);
    }
  }

  // Prioritize mp4 so the downloaded file is seekable
  const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: state.format === "shorts" ? 8_000_000 : 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const finished = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start(100);

  // Render frames synchronized to real time
  const totalFrames = Math.ceil(totalDurationSec * fps);
  let currentFrame = 0;
  
  await new Promise((resolve) => {
    const startTime = performance.now();
    function renderLoop() {
      if (currentFrame >= totalFrames) {
        resolve();
        return;
      }
      
      const now = performance.now();
      const elapsedSec = (now - startTime) / 1000;
      const expectedFrame = Math.floor(elapsedSec * fps);
      
      if (expectedFrame > currentFrame) {
        // It's time to draw the next frame
        const timeInVideo = currentFrame / fps;
        
        // Find current scene
        let timeAcc = 0;
        let activeFrame = frames[frames.length - 1]; // fallback
        for (let i = 0; i < frames.length; i++) {
          if (timeInVideo >= timeAcc && timeInVideo < timeAcc + frames[i].durationSec) {
            activeFrame = frames[i];
            break;
          }
          timeAcc += frames[i].durationSec;
        }

        // Keep video background in sync
        if (activeFrame.scene.bg && activeFrame.scene.bg.type === "video" && activeFrame.scene.bg.el) {
          const v = activeFrame.scene.bg.el;
          if (v.readyState >= 2) {
            v.currentTime = timeInVideo % (v.duration || 10);
          }
        }

        // Draw directly to main context
        drawSceneOnto(mainCtx, width, height, activeFrame.scene, timeInVideo - timeAcc, activeFrame.durationSec, activeFrame.transition, activeFrame.prevScene, activeFrame.sceneIndex, activeFrame.totalScenes);

        currentFrame++;
        if (onProgress && currentFrame % 10 === 0) {
          onProgress(currentFrame / totalFrames, `Recording Video... ${Math.round((currentFrame/totalFrames)*100)}% (Real-time)`);
        }
      }
      
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
  });

  recorder.stop();
  await finished;
  return new Blob(chunks, { type: mime });
}

async function renderVideo() {
  // Auto-generate scenes if missing
  if (!state.scenes || !state.scenes.length) {
    console.warn("[renderVideo] No scenes found, generating fallback");
    state.scenes = generateFallbackScenes(state.fullScript || state.niche || "video", state.format || "long", state.duration || 120);
  }
  if (!state.scenes || !state.scenes.length) {
    showToast("⚠️ No scenes — please go back and regenerate");
    return;
  }

  try {
    await renderVideoInner();
  } catch (e) {
    console.error("[renderVideo]", e);
    showToast("❌ Render failed: " + (e.message || e), 6000);
    $("videoProgress").hidden = true;
    $("videoOverlay").classList.remove("hidden");
  }
}

async function renderVideoInner() {
  console.log("[renderVideo] start", {
    format: state.format,
    duration: state.duration,
    sceneCount: state.scenes.length,
    bgStyle: state.bgStyle,
    hasPexelsKey: !!state.pexelsKey,
  });
  setCanvasOrientation();
  console.log("[renderVideo] canvas", canvas().width, "x", canvas().height);
  $("storyboard").hidden = false;
  $("videoActions").hidden = true;
  $("videoProgress").hidden = false;
  $("videoOverlay").classList.add("hidden");

  // Reset: show canvas, remove old video preview
  const c = canvas();
  c.style.display = "block";
  const oldV = $("videoPreview");
  if (oldV) oldV.remove();

  if (state.userFace && (!state.userFaceImg || !state.userFaceImg.complete)) {
    const img = new Image();
    img.onload = () => { state.userFaceImg = img; };
    img.src = state.userFace;
    state.userFaceImg = img;
  }

  // Show meta
  $("videoMeta").textContent =
    `Format: ${state.format === "shorts" ? "9:16 Shorts" : "16:9 Long"} · ` +
    `${formatTime(state.duration)} · ${state.langName} · ` +
    `BG: ${state.bgStyle}${state.userFace ? " · Face ✓" : ""}${state.userVoice ? " · Voice ✓" : ""}` +
    `${state.pexelsKey ? " · Pexels ✓" : ""}`;

  // Pre-fetch backgrounds — use pipeline visual assets if available, else fetch fresh
  const W = canvas().width, H = canvas().height;
  const hasPipelineAssets = state.visualAssets && state.visualAssets.length > 0;
  showToast(hasPipelineAssets ? "🎬 Using AI-generated visuals…" : (state.pexelsKey ? "🎬 Fetching Pexels videos…" : "📷 Loading backgrounds…"));

  const scenesWithBG = await Promise.all(state.scenes.map(async (s, i) => {
    // Priority 1: Pipeline visual assets (AI-generated images)
    if (s.bg && s.bg.el) {
      console.log(`[BG] Scene ${i}: Using pipeline asset`);
      return { ...s, bg: s.bg };
    }
    // Priority 2: Pipeline visual assets from state.visualAssets
    if (hasPipelineAssets && state.visualAssets[i] && state.visualAssets[i].el) {
      console.log(`[BG] Scene ${i}: Using pipeline visual asset`);
      return { ...s, bg: { type: "image", el: state.visualAssets[i].el } };
    }

    // Priority 3: Fetch from Pexels/Picsum
    let bg = null;
    if (state.bgStyle === "videos" && state.pexelsKey) {
      try {
        const videos = await pexelsSearchVideos(`${state.niche} ${s.heading.replace(/[^\w\s]/g, "")}`.trim() || state.niche, 3);
        if (videos.length) {
          const file = pickBestVideoFile(videos);
          if (file) {
            const blobUrl = await loadVideoFile(file.link);
            const v = await loadVideoElement(blobUrl);
            bg = { type: "video", el: v, url: blobUrl };
            console.log(`[BG] Scene ${i}: Pexels video loaded`);
          }
        }
      } catch (e) {
        console.warn("[BG] Pexels failed for scene", i, e);
      }
    }
    if (!bg && state.bgStyle !== "solid") {
      try {
        const seed = `${state.niche}-${state.lang}-${i}-${state.title.length}`;
        const img = await loadPicsum(seed, W, H);
        bg = { type: "image", el: img };
        console.log(`[BG] Scene ${i}: Picsum image loaded`);
      } catch (e) {
        console.warn("[BG] Picsum failed for scene", i, e.message);
      }
    }
    if (!bg) {
      console.log(`[BG] Scene ${i}: Using ${state.bgStyle} fallback`);
    }
    return { ...s, bg };
  }));

  // Tab audio capture disabled per user request ("I don't want sound in website of script I want in my video")
  let voiceCaptureStream = null;
  state._voiceCaptureStream = null;

  // Build audio
  showToast("🎵 Building audio…");
  const totalDur = state.scenes.reduce((s, sc) => s + sc.seconds, 0);
  state.duration = totalDur; // sync state to actual scene durations
  const sceneBoundaries = [];
  let acc = 0;
  scenesWithBG.forEach((s, i) => { if (i > 0) sceneBoundaries.push(acc); acc += s.seconds; });
  const audio = await buildAudioTrack(totalDur, sceneBoundaries, voiceCaptureStream);

  // Schedule TTS narration. If we captured tab audio above, the speech is
  // routed into the AudioContext (and thus the MediaRecorder) and baked
  // into the final webm/mp4 file. If no capture is active we suppress the
  // live speech to keep the website silent during the render.
  scheduleTtsNarration(audio && audio.sceneTimings, !!voiceCaptureStream);

  // Use the fast encoder (pre-render + MediaRecorder)
  $("progressText").textContent = "Preparing render…";
  $("progressBar").style.width = "0%";

  const fps = 30;
  const frames = scenesWithBG.map((s, i) => ({
    scene: s,
    durationSec: s.seconds,
    transition: i > 0 ? state.transition : "none",
    prevScene: i > 0 ? scenesWithBG[i - 1] : null,
    sceneIndex: i,
    totalScenes: scenesWithBG.length,
  }));

  try {
    let finalBlob;
    try {
      // Single-pass: bake audio into the recording
      finalBlob = await fastEncode({
        frames,
        audioStream: audio?.stream || null,
        width: W, height: H, fps,
        onProgress: (pct, msg) => {
          $("progressBar").style.width = (pct * 100).toFixed(0) + "%";
          $("progressText").textContent = msg;
        },
        totalDurationSec: totalDur,
      });
    } catch (innerErr) {
      console.warn("Single-pass encode failed, trying fallback:", innerErr);
      // Fallback: encode video-only, then mux audio
      showToast("⚠️ Re-encoding with audio (fallback)…");
      const videoOnly = await fastEncode({
        frames,
        audioStream: null,
        width: W, height: H, fps,
        onProgress: (pct, msg) => {
          $("progressBar").style.width = (pct * 100).toFixed(0) + "%";
          $("progressText").textContent = msg;
        },
        totalDurationSec: totalDur,
      });
      finalBlob = await muxWithAudio(videoOnly, audio);
    }
    state.videoBlob = finalBlob;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(finalBlob);

    $("progressBar").style.width = "100%";
    $("progressText").textContent = `✅ Rendered ${formatTime(totalDur)} video (${(finalBlob.size / (1024*1024)).toFixed(1)} MB)`;

    // Show preview
    c.style.display = "none";
    let v = $("videoPreview");
    if (!v) {
      v = document.createElement("video");
      v.id = "videoPreview";
      v.controls = true; v.playsInline = true;
      v.style.width = "100%"; v.style.height = "100%"; v.style.objectFit = "cover";
      c.parentElement.appendChild(v);
    }
    v.style.maxHeight = "600px";
    v.style.borderRadius = "12px";
    if (state.format === "shorts") {
      v.style.maxWidth = "340px";
      v.style.margin = "0 auto";
      v.style.display = "block";
    } else {
      v.style.maxWidth = "";
      v.style.margin = "";
      v.style.display = "";
    }
    v.src = state.videoUrl;

    $("videoActions").hidden = false;
    $("videoProgress").hidden = true;
    showToast("🎉 Video ready!");

    // Cleanup video elements
    scenesWithBG.forEach((s) => { if (s.bg?.type === "video" && s.bg.url) URL.revokeObjectURL(s.bg.url); });
  } catch (e) {
    showToast("❌ Render failed: " + e.message);
    console.error(e);
    $("videoProgress").hidden = true;
  } finally {
    // Always release the tab-audio capture so the browser stops the
    // "Sharing this tab" banner once the render completes.
    cancelTtsNarration();
    if (state._voiceCaptureStream) {
      try { state._voiceCaptureStream.getTracks().forEach((t) => t.stop()); } catch {}
      state._voiceCaptureStream = null;
    }
  }
}

// Mux video-only webm with audio via MediaRecorder (fallback path)
async function muxWithAudio(videoBlob, audio) {
  const c = document.createElement("canvas");
  const W = canvas().width;
  const H = canvas().height;
  c.width = W; c.height = H;
  const cCtx = c.getContext("2d");
  // Play the existing video into a canvas
  const v = document.createElement("video");
  v.src = URL.createObjectURL(videoBlob);
  v.muted = true;

  // Combine canvas + audio into MediaStream
  const stream = c.captureStream(30);
  audio.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: state.format === "shorts" ? 8_000_000 : 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(100);

  await new Promise((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    const draw = () => {
      if (resolved) return;
      if (v.ended || v.paused) { finish(); return; }
      try { cCtx.drawImage(v, 0, 0, c.width, c.height); } catch {}
      requestAnimationFrame(draw);
    };
    v.onloadedmetadata = () => {
      v.currentTime = 0;
      const p = v.play();
      if (p && p.catch) p.catch(() => finish());
    };
    v.onplaying = draw;
    v.onended = finish;
    v.onerror = () => finish();
    // Safety timeout (3x video duration)
    setTimeout(finish, Math.max(20000, (v.duration || 60) * 3 * 1000));
  });
  rec.stop();
  try { audio.ctx.close(); } catch (e) {}
  await done;
  return new Blob(chunks, { type: mime });
}

// ----- Frame rendering (used in pre-render path) -----
async function drawFrameToContext(ctx, W, H, scene, t, durationSec, transition, prevScene, sceneIndex, totalScenes) {
  // drawScene signature is (scene, time, totalDur); we adapt
  drawSceneOnto(ctx, W, H, scene, t, durationSec, transition, prevScene, sceneIndex, totalScenes);
}

function drawSceneOnto(ctx, W, H, scene, time, dur, transition, prevScene, sceneIndex, totalScenes) {
  const isShorts = state.format === "shorts";
  const totalDur = state.duration;

  // Apply crossfade transition: first 0.4s fade in from prev
  let alpha = 1;
  if (transition === "fade" && time < 0.5) {
    alpha = Math.max(0, time / 0.5);
  }
  ctx.globalAlpha = alpha;

  // ---- BACKGROUND ----
  if (scene.bg && scene.bg.type === "video" && scene.bg.el) {
    // Draw video frame
    const v = scene.bg.el;
    const p = Math.min(1, time / dur);
    const scale = 1.08 - p * 0.04;
    const panX = (p - 0.5) * 40;
    const panY = (p - 0.5) * 20;
    const iw = v.videoWidth || W, ih = v.videoHeight || H;
    const targetRatio = W / H;
    const imgRatio = iw / ih;
    let baseW, baseH;
    if (imgRatio > targetRatio) {
      baseH = H * scale; baseW = baseH * imgRatio;
    } else {
      baseW = W * scale; baseH = baseW / imgRatio;
    }
    const dx = (W - baseW) / 2 + panX;
    const dy = (H - baseH) / 2 + panY;
    try { ctx.drawImage(v, dx, dy, baseW, baseH); } catch (e) {}
  } else if (scene.bg && scene.bg.type === "image" && scene.bg.el) {
    const p = Math.min(1, time / dur);
    const scale = 1.08 - p * 0.08;
    const panX = (p - 0.5) * 60;
    const panY = (p - 0.5) * 30;
    const img = scene.bg.el;
    const iw = img.width, ih = img.height;
    const targetRatio = W / H;
    const imgRatio = iw / ih;
    let baseW, baseH;
    if (imgRatio > targetRatio) { baseH = H * scale; baseW = baseH * imgRatio; }
    else { baseW = W * scale; baseH = baseW / imgRatio; }
    const dx = (W - baseW) / 2 + panX;
    const dy = (H - baseH) / 2 + panY;
    try { ctx.drawImage(img, dx, dy, baseW, baseH); } catch (e) {}
  } else if (state.bgStyle === "animated") {
    const h1 = (scene.hue + time * 30) % 360;
    const h2 = (scene.hue + 90 + time * 30) % 360;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${h1}, 70%, 45%)`);
    g.addColorStop(1, `hsl(${h2}, 80%, 25%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const px = (Math.sin(time * 0.3 + i * 1.3) * 0.5 + 0.5) * W;
      const py = ((time * (20 + i % 5) + i * 73) % H);
      ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.03})`;
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Dual-tone gradient that looks designed, not flat
    const h1 = scene.hue % 360;
    const h2 = (scene.hue + 40) % 360;
    const bgGrad = ctx.createLinearGradient(0, 0, W * 0.3, H);
    bgGrad.addColorStop(0, `hsl(${h1}, 70%, 50%)`);
    bgGrad.addColorStop(1, `hsl(${h2}, 75%, 28%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Dark gradient overlay for text
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0.15)");
  g.addColorStop(0.5, "rgba(0,0,0,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0.70)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 1;

  // ---- FACE OVERLAY ----
  if (state.userFaceImg) {
    const faceR = isShorts ? 180 : 140;
    const margin = isShorts ? 80 : 60;
    const fx = W - faceR - margin;
    const fy = H - faceR - margin - 110;
    const pulse = 1 + Math.sin(time * 6) * 0.02;
    const r = faceR * pulse;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(fx + faceR/2, fy + faceR/2, r/2 + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx + faceR/2, fy + faceR/2, r/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(state.userFaceImg, fx, fy, faceR, faceR);
    ctx.restore();
  }

  // ---- TEXT CARD ----
  // Scene-kind accent colors for visual differentiation
  const accentColors = {
    hook:  "#FF4757",  // red — urgency
    intro: "#FFA502",  // orange — energy
    body:  "#2ED573",  // green — info
    outro: "#1E90FF",  // blue — CTA
  };
  const accent = accentColors[scene.kind] || "#F5A623";

  const baseSize = isShorts ? 54 : 42;
  const maxW = W * 0.84;
  const lines = wrapText(ctx, scene.text, maxW, baseSize);
  const lineH = baseSize * 1.2;
  const blockH = lines.length * lineH;
  const cardW = Math.min(W * 0.92, maxW + 60);
  const cardH = blockH + 70;
  const cardX = (W - cardW) / 2;
  // For Shorts: position card in lower third, like real YouTube Shorts
  // For Long: keep centered but shift down slightly
  const cardYBase = isShorts ? H * 0.48 : H * 0.38;
  const cardY = cardYBase - cardH / 2;

  // Stage gradient BEHIND the card so the text area reads cleanly
  const stageGrad = ctx.createLinearGradient(0, cardY - 40, 0, cardY + cardH + 40);
  stageGrad.addColorStop(0, "rgba(0,0,0,0)");
  stageGrad.addColorStop(0.3, "rgba(0,0,0,0.45)");
  stageGrad.addColorStop(0.7, "rgba(0,0,0,0.45)");
  stageGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = stageGrad;
  ctx.fillRect(0, cardY - 40, W, cardH + 80);

  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.stroke();
  // Subtle inner highlight (frosted glass)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  roundRect(ctx, cardX + 2, cardY + 2, cardW - 4, cardH - 4, 26);
  ctx.stroke();

  // Thin 3px left accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(cardX + 4, cardY + 16, 4, cardH - 32);

  ctx.fillStyle = accent;
  ctx.font = "800 28px 'Poppins', 'Inter', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(scene.heading || "", cardX + 30, cardY + 38);

  ctx.font = `800 ${baseSize}px 'Poppins', 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "center";
  lines.forEach((ln, i) => {
    ctx.fillText(ln, W / 2, cardY + 80 + baseSize + i * lineH);
  });
  ctx.shadowColor = "transparent";

  // ---- TOP: scene number ----
  const safeIdx = typeof sceneIndex === "number" && sceneIndex >= 0 ? sceneIndex : 0;
  const safeTotal = typeof totalScenes === "number" && totalScenes > 0 ? totalScenes : 1;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const tagText = `Scene ${safeIdx + 1}/${safeTotal}`;
  ctx.font = "700 26px 'Inter', system-ui, sans-serif";
  const tagW = ctx.measureText(tagText).width + 40;
  roundRect(ctx, 28, 28, tagW, 48, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(tagText, 28 + 20, 28 + 31);

  // ---- BOTTOM: title strip ----
  const stripH = 72;
  const stripY = H - stripH - 16;
  // Separator gradient ABOVE strip for definition
  const sepGrad = ctx.createLinearGradient(0, stripY - 30, 0, stripY);
  sepGrad.addColorStop(0, "rgba(0,0,0,0)");
  sepGrad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = sepGrad;
  ctx.fillRect(0, stripY - 30, W, 30);
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  roundRect(ctx, 22, stripY, W - 44, stripH, 14);
  ctx.fill();
  // Accent-colored top border on the strip
  ctx.fillStyle = accent;
  ctx.fillRect(22, stripY, W - 44, 3);
  ctx.font = "700 30px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`🐯 ${truncate(state.title, 56)}`, W / 2, stripY + stripH / 2 + 10);

  // ---- PROGRESS BAR ----
  const elapsed = state.scenes.slice(0, safeIdx).reduce((s, x) => s + x.seconds, 0);
  const t = (elapsed + time) / totalDur;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(0, H - 8, W, 8);
  const fg = ctx.createLinearGradient(0, 0, W, 0);
  fg.addColorStop(0, accent);
  fg.addColorStop(1, "#ff5e5e");
  ctx.fillStyle = fg;
  ctx.fillRect(0, H - 8, W * t, 8);
}

function drawScene(scene, time, totalDur) {
  // Backwards-compat wrapper for the on-screen preview during render
  const c = canvas();
  const idx = state.scenes ? state.scenes.indexOf(scene) : 0;
  drawSceneOnto(
    c.getContext("2d"), c.width, c.height,
    scene, time, scene.seconds || totalDur, "none", null,
    idx >= 0 ? idx : 0,
    state.scenes ? state.scenes.length : 1
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW, fontSize) {
  ctx.font = `800 ${fontSize}px 'Poppins', 'Inter', system-ui, sans-serif`;
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

$("regenVideoBtn").addEventListener("click", safe(async (e) => {
  showToast("🔄 Re-rendering…");
  await renderVideo();
}));

$("downloadVideoBtn").addEventListener("click", () => {
  if (!state.videoBlob) return showToast("⚠️ Render the video first");
  downloadFile(state.videoBlob, `${slug(state.title)}.mp4`, "video/mp4");
});

// Back button — go to editor (step 8)
if ($("videoBackBtn")) $("videoBackBtn").addEventListener("click", () => {
  goToStep(8);
});

// Next button — download or finish
if ($("videoNextBtn")) $("videoNextBtn").addEventListener("click", () => {
  if (state.videoBlob) {
    downloadFile(state.videoBlob, `${slug(state.title)}.mp4`, "video/mp4");
    showToast("✅ Video downloaded! You can now upload it to YouTube.");
  } else {
    showToast("⚠️ Render the video first, then download.");
  }
});

$("playVideoBtn").addEventListener("click", safe(async (e) => {
  if (!state.videoUrl) {
    await renderVideo();
    return;
  }
  await playRenderedVideo();
}));

// Just play the rendered file. Audio (music + baked-in TTS if the user
// shared tab audio during render) is part of the file itself, so no
// extra Web Speech layer is needed here.
async function playRenderedVideo() {
  const v = $("videoPreview");
  if (!v) return;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  v.currentTime = 0;
  v.muted = false;
  v.volume = 1.0;
  await v.play();
}

// Legacy export kept for any external callers.
async function playWithVoiceover() { return playRenderedVideo(); }

if ($("playWithVoiceBtn")) $("playWithVoiceBtn").addEventListener("click", playRenderedVideo);

function renderStoryboardList() {
  const list = $("scenesList");
  if (!list || !state.storyboard?.length) return;
  list.innerHTML = state.storyboard.map((s, i) => `
    <div class="scene-item">
      <div class="scene-num">Scene ${i + 1} · ${escapeHtml(s.heading)}</div>
      <div class="scene-time">⏱️ ${s.seconds || 0}s</div>
      <div class="scene-text">${escapeHtml(truncate(s.text, 110))}</div>
    </div>
  `).join("");
}

// ============================================================
//  Audio engine (multi-layer + SFX)
// ============================================================
async function buildAudioTrack(durationSec, sceneBoundaries, voiceCaptureStream) {
  const ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  // Resume the context (must be triggered by user gesture in most browsers)
  if (ctxAudio.state === "suspended") {
    try { await ctxAudio.resume(); } catch {}
  }
  const dest = ctxAudio.createMediaStreamDestination();
  const comp = ctxAudio.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4;
  comp.attack.value = 0.005; comp.release.value = 0.1;
  comp.connect(dest);
  const music = ctxAudio.createGain();
  music.gain.value = 0.7;
  music.connect(comp);
  const voice = ctxAudio.createGain();
  voice.gain.value = 0.0;
  voice.connect(comp);

  // Voice-capture lane: any MediaStream (e.g. tab audio with TTS) routed here
  // is baked into the final recording. We duck the music underneath whenever
  // the capture is present so narration sits on top.
  if (voiceCaptureStream && voiceCaptureStream.getAudioTracks &&
      voiceCaptureStream.getAudioTracks().length > 0) {
    try {
      const ttsSrc = ctxAudio.createMediaStreamSource(voiceCaptureStream);
      const ttsGain = ctxAudio.createGain();
      ttsGain.gain.value = 1.4;            // amplify captured TTS
      const ttsHP = ctxAudio.createBiquadFilter();
      ttsHP.type = "highpass"; ttsHP.frequency.value = 90;
      const ttsLP = ctxAudio.createBiquadFilter();
      ttsLP.type = "lowpass";  ttsLP.frequency.value = 8000;
      ttsSrc.connect(ttsHP).connect(ttsLP).connect(ttsGain).connect(comp);
      // Duck the background music for clearer voice
      music.gain.value = 0.22;
    } catch (e) {
      console.warn("Could not route captured voice audio:", e);
    }
  }

  const startTime = ctxAudio.currentTime + 0.1;
  const bpm = 96;
  const beat = 60 / bpm;

  // Kick — punchy low-end
  for (let t = 0; t < durationSec; t += beat) {
    const osc = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    osc.frequency.setValueAtTime(150, startTime + t);
    osc.frequency.exponentialRampToValueAtTime(35, startTime + t + 0.12);
    g.gain.setValueAtTime(0.001, startTime + t);
    g.gain.exponentialRampToValueAtTime(0.6, startTime + t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.18);
    osc.connect(g).connect(music);
    osc.start(startTime + t);
    osc.stop(startTime + t + 0.2);
  }

  // Hi-hat — crisp top end
  for (let t = 0; t < durationSec; t += beat / 2) {
    const bs = ctxAudio.sampleRate * 0.05;
    const buffer = ctxAudio.createBuffer(1, bs, ctxAudio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bs; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctxAudio.createBufferSource();
    noise.buffer = buffer;
    const hp = ctxAudio.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctxAudio.createGain();
    g.gain.setValueAtTime(0.001, startTime + t);
    g.gain.exponentialRampToValueAtTime(0.08, startTime + t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.04);
    noise.connect(hp).connect(g).connect(music);
    noise.start(startTime + t);
    noise.stop(startTime + t + 0.05);
  }

  // Bass — deep sub
  const bassNotes = [55, 55, 73.42, 65.41];
  for (let i = 0, t = 0; t < durationSec; i++, t += beat * 2) {
    const osc = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = bassNotes[i % bassNotes.length];
    const lp = ctxAudio.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 350;
    g.gain.setValueAtTime(0.001, startTime + t);
    g.gain.exponentialRampToValueAtTime(0.22, startTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + t + beat * 1.6);
    osc.connect(lp).connect(g).connect(music);
    osc.start(startTime + t);
    osc.stop(startTime + t + beat * 2);
  }

  // Pad — warm atmosphere
  const padChords = [
    [130.81, 164.81, 196.00],
    [146.83, 174.61, 220.00],
    [130.81, 164.81, 196.00],
    [110.00, 130.81, 164.81],
  ];
  for (let i = 0, t = 0; t < durationSec; i++, t += beat * 8) {
    const chord = padChords[i % padChords.length];
    chord.forEach((freq) => {
      const osc = ctxAudio.createOscillator();
      const g = ctxAudio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, startTime + t);
      g.gain.linearRampToValueAtTime(0.06, startTime + t + 0.8);
      g.gain.setValueAtTime(0.06, startTime + t + beat * 6);
      g.gain.linearRampToValueAtTime(0.0, startTime + t + beat * 8);
      osc.connect(g).connect(music);
      osc.start(startTime + t);
      osc.stop(startTime + t + beat * 8 + 0.1);
    });
  }

  // Pluck — melodic texture
  const scale = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25];
  for (let i = 0, t = beat * 2; t < durationSec - beat; i++, t += beat * 1.5) {
    const osc = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    osc.type = "triangle";
    osc.frequency.value = scale[(i * 2) % scale.length];
    g.gain.setValueAtTime(0.001, startTime + t);
    g.gain.exponentialRampToValueAtTime(0.15, startTime + t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.4);
    osc.connect(g).connect(music);
    osc.start(startTime + t);
    osc.stop(startTime + t + 0.45);
  }

  // SFX — scene transitions
  function sfxWhoosh(at) {
    const bs = ctxAudio.sampleRate * 0.4;
    const buffer = ctxAudio.createBuffer(1, bs, ctxAudio.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctxAudio.createBufferSource();
    noise.buffer = buffer;
    const bp = ctxAudio.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2000, startTime + at);
    bp.frequency.exponentialRampToValueAtTime(300, startTime + at + 0.35);
    const g = ctxAudio.createGain();
    g.gain.setValueAtTime(0.001, startTime + at);
    g.gain.exponentialRampToValueAtTime(0.45, startTime + at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + at + 0.4);
    noise.connect(bp).connect(g).connect(music);
    noise.start(startTime + at);
    noise.stop(startTime + at + 0.45);
  }
  function sfxPop(at) {
    const osc = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    osc.frequency.setValueAtTime(900, startTime + at);
    osc.frequency.exponentialRampToValueAtTime(300, startTime + at + 0.08);
    g.gain.setValueAtTime(0.001, startTime + at);
    g.gain.exponentialRampToValueAtTime(0.5, startTime + at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + at + 0.12);
    osc.connect(g).connect(music);
    osc.start(startTime + at);
    osc.stop(startTime + at + 0.15);
  }
  function sfxChime(at) {
    [880, 1318.5, 1760].forEach((f, i) => {
      const osc = ctxAudio.createOscillator();
      const g = ctxAudio.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.001, startTime + at + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.25, startTime + at + i * 0.05 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + at + i * 0.05 + 0.6);
      osc.connect(g).connect(music);
      osc.start(startTime + at + i * 0.05);
      osc.stop(startTime + at + i * 0.05 + 0.65);
    });
  }
  sceneBoundaries.forEach((b, i) => {
    if (i === 0) sfxPop(b);
    else sfxWhoosh(b);
  });
  sfxChime(durationSec - 1.2);

  if (state.userVoice) {
    const src = ctxAudio.createBufferSource();
    src.buffer = state.userVoice;
    src.loop = true;
    voice.gain.setValueAtTime(0.0, startTime);
    voice.gain.linearRampToValueAtTime(0.18, startTime + 0.5);
    voice.gain.setValueAtTime(0.18, startTime + durationSec - 1);
    voice.gain.linearRampToValueAtTime(0.0, startTime + durationSec);
    src.connect(voice);
    src.start(startTime);
    src.stop(startTime + durationSec);
  }

  // Build scene timing schedule for TTS narration.
  // Web Speech API audio can't be directly captured into the MediaStream, so
  // we hand the schedule back to renderVideoInner() which calls
  // speechSynthesis.speak() at the right wall-clock time so the user hears
  // the narration during render.
  const sceneTimings = [];
  {
    let sceneStart = 0;
    (state.scenes || []).forEach((scene) => {
      sceneTimings.push({
        text: scene.text || "",
        heading: scene.heading || "",
        start: sceneStart,
        duration: scene.seconds || 0,
      });
      sceneStart += scene.seconds || 0;
    });
  }

  return { stream: dest.stream, ctx: ctxAudio, sceneTimings };
}

// ============================================================
//  TTS narration scheduler
//  When `captureActive` is true the caller has set up a tab-audio capture
//  that routes the speech into the AudioContext / MediaRecorder, so the
//  utterances actually end up inside the downloaded video file.
//  When `captureActive` is false we stay silent — no live website speech
//  during render — because hearing it in the browser without it being
//  baked into the file is just noise.
// ============================================================
let _ttsTimers = [];
function cancelTtsNarration() {
  _ttsTimers.forEach((t) => { try { clearTimeout(t); } catch {} });
  _ttsTimers = [];
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
}
function scheduleTtsNarration(sceneTimings, captureActive) {
  cancelTtsNarration();
  if (!Array.isArray(sceneTimings) || sceneTimings.length === 0) return;
  if (!("speechSynthesis" in window)) return;
  // If user uploaded their own voice, don't speak over it.
  if (state.userVoice) return;
  // Nothing to capture into, so do nothing — keeps the render silent
  // instead of leaking speech into the user's speakers.
  if (!captureActive) return;

  const voice = (typeof getSelectedVoice === "function") ? getSelectedVoice() : null;
  const rate = state.format === "shorts" ? 1.08 : 0.96;

  // Slight head-start so MediaRecorder is already running when speech begins.
  const PRIMER_MS = 350;

  sceneTimings
    .slice()
    .sort((a, b) => a.start - b.start)
    .forEach(({ text, start }) => {
      if (!text || !text.trim()) return;
      const delay = Math.max(0, start * 1000 + PRIMER_MS);
      const t = setTimeout(() => {
        try {
          const utter = new SpeechSynthesisUtterance(text);
          if (voice) utter.voice = voice;
          utter.lang = voice ? voice.lang : langToBcp(state.lang);
          utter.rate = rate;
          utter.pitch = 1.0;
          utter.volume = 1.0;
          window.speechSynthesis.speak(utter);
        } catch (e) {
          console.warn("TTS speak failed:", e);
        }
      }, delay);
      _ttsTimers.push(t);
    });
}

// ============================================================
//  Helpers
// ============================================================
function downloadFile(data, filename, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "video";
}

// ============================================================
//  Init
// ============================================================
(async function init() {
  await loadSettings();
  // Surface a soft warning if browser storage is almost full
  try {
    const info = await security.storageInfo();
    if (info.quota && info.pct > 0.85) {
      setTimeout(() => showToast("⚠️ Browser storage is " + Math.round(info.pct * 100) + "% full — consider deleting old projects in My Projects", 6000), 1500);
    }
  } catch {}
  goToStep(1);
})();

document.querySelectorAll('.card, .lang-card, .idea-item, .format-card').forEach(card => {
  card.classList.add('card-3d');
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    card.style.boxShadow = `${-rotateY * 2}px ${rotateX * 2}px 40px rgba(124,58,237,0.3)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
    card.style.boxShadow = 'var(--shadow)';
    card.style.transition = 'all 0.5s ease';
  });
});

// Toast notifications replacement
window.showToast = function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: var(--bg-card); border: 1px solid var(--border-accent);
    color: var(--text-primary); padding: 12px 20px; border-radius: var(--radius);
    box-shadow: var(--glow); font-size: 14px; font-weight: 500;
    animation: slideIn 0.3s ease; max-width: 320px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Onboarding tooltip
if (!localStorage.getItem('onboardingDismissed')) {
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `position: fixed; bottom: 20px; left: 20px; background: var(--bg-card); padding: 15px; border-radius: 12px; border: 1px solid var(--border-accent); box-shadow: var(--glow); z-index: 10000; cursor: pointer;`;
  tooltip.innerHTML = "👋 Start by picking your language → topic → brief. Takes 2 minutes!";
  tooltip.addEventListener('click', () => {
    tooltip.remove();
    localStorage.setItem('onboardingDismissed', 'true');
  });
  document.body.appendChild(tooltip);
}
