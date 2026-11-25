const DEFAULT_PORT = 47832;
const CANDIDATE_PORTS = [47832, 47833, 47834, 47835, 47836, 47840, 48000];
const REQUEST_TIMEOUT_MS = 1600;
const PROBE_TIMEOUT_MS = 550;
const COOLDOWN_MS = 5000;
const CONFIRM_TIMEOUT_MS = 30000;
const CONTEXT_MENU_ID = 'nbrsflow-download-link';

const DEFAULT_SETTINGS = {
  enabled: true,
  confirmBeforeSend: false,
  port: DEFAULT_PORT,
  lastWorkingPort: DEFAULT_PORT,
  lang: 'ar',
  langManual: false,
  lastNotice: null,
  recentSentUrls: {},
  excludedDomains: []
};

const recentSentUrls = new Map();
const pendingConfirmations = new Map();
const pendingConfirmWindows = new Map();

function pruneRecentMap(map, now = Date.now()) {
  for (const [k, ts] of map.entries()) {
    if (typeof ts !== 'number' || (now - ts) >= COOLDOWN_MS) {
      map.delete(k);
    }
  }
}

async function isWithinCooldown(url) {
  const now = Date.now();
  pruneRecentMap(recentSentUrls, now);
  const memTs = recentSentUrls.get(url);
  if (typeof memTs === 'number' && (now - memTs) < COOLDOWN_MS) return true;

  try {
    const stored = await chrome.storage.local.get({ recentSentUrls: {} });
    const obj = stored.recentSentUrls && typeof stored.recentSentUrls === 'object' ? stored.recentSentUrls : {};
    const storedTs = obj[url];
    if (typeof storedTs === 'number' && (now - storedTs) < COOLDOWN_MS) {
      recentSentUrls.set(url, storedTs);
      return true;
    }
  } catch {
    // ignore storage read error
  }
  return false;
}

async function markSentUrl(url) {
  const now = Date.now();
  recentSentUrls.set(url, now);
  pruneRecentMap(recentSentUrls, now);
  try {
    const stored = await chrome.storage.local.get({ recentSentUrls: {} });
    const next = {};
    const prev = stored.recentSentUrls && typeof stored.recentSentUrls === 'object' ? stored.recentSentUrls : {};
    for (const [k, ts] of Object.entries(prev)) {
      if (typeof ts === 'number' && (now - ts) < COOLDOWN_MS) next[k] = ts;
    }
    for (const [k, ts] of recentSentUrls.entries()) {
      next[k] = ts;
    }
    const keys = Object.keys(next);
    if (keys.length > 50) {
      for (const k of keys.slice(0, keys.length - 50)) delete next[k];
    }
    await chrome.storage.local.set({ recentSentUrls: next });
  } catch {
    // ignore storage write error
  }
}

function normalizePort(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : DEFAULT_PORT;
}

function normalizeExcludedDomains(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const clean = String(item || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^\*\./, '');
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function isDomainExcluded(rawUrl, excludedDomains) {
  if (!rawUrl || !Array.isArray(excludedDomains) || excludedDomains.length === 0) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return excludedDomains.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    enabled: stored.enabled !== false,
    confirmBeforeSend: !!stored.confirmBeforeSend,
    port: normalizePort(stored.port),
    lastWorkingPort: normalizePort(stored.lastWorkingPort ?? stored.port),
    lang: stored.lang === 'en' ? 'en' : 'ar',
    langManual: !!stored.langManual,
    lastNotice: stored.lastNotice ?? null,
    excludedDomains: normalizeExcludedDomains(stored.excludedDomains)
  };
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#10B981' : '#4B5563' });
}

function flashSentBadge(enabled) {
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
  setTimeout(() => {
    updateBadge(enabled);
  }, 2500);
}

function isInterceptableUrl(rawUrl, bridgePort) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === '127.0.0.1' && Number(parsed.port || 80) === bridgePort) return false;
    return true;
  } catch {
    return false;
  }
}

function isNoisyOrTrackingDownload(downloadItem, targetUrl) {
  try {
    const u = new URL(targetUrl);
    const p = u.pathname.toLowerCase();
    const fname = String(downloadItem?.filename || '').toLowerCase();
    if (p.endsWith('/favicon.ico') || fname === 'favicon.ico') return true;
    if (/\/(?:pixel|beacon|telemetry|analytics\/collect|__utm\.gif)(?:$|[/?])/.test(p)) return true;
    const size = Number(downloadItem?.fileSize);
    if (Number.isFinite(size) && size > 0 && size < 256 && /\.(?:gif|png|ico|cur)$/i.test(p)) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeBridgePort(port, timeoutMs = PROBE_TIMEOUT_MS) {
  try {
    const res = await fetchWithTimeout(`http://127.0.0.1:${port}/api/status`, {
      method: 'GET',
      headers: { 'X-Nbrsflow-Extension': '1' }
    }, timeoutMs);
    if (!res.ok) return { connected: false, port, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (!data?.ok || (data.app && data.app !== 'nbrsflow')) {
      return { connected: false, port, error: 'INVALID_BRIDGE' };
    }
    return {
      connected: true,
      port: normalizePort(data.port ?? port),
      version: data.version || '',
      engineReady: !!data.engineReady,
      enabled: data.enabled !== false,
      language: data.language === 'en' || data.language === 'ar' ? data.language : undefined
    };
  } catch {
    return { connected: false, port, error: 'UNREACHABLE' };
  }
}

async function syncDiscoveredBridge(result, preferredPort, settings) {
  const patch = { lastWorkingPort: result.port };
  if (result.port !== preferredPort) {
    patch.port = result.port;
  }
  if (!settings?.langManual && result.language && result.language !== settings?.lang) {
    patch.lang = result.language;
  }
  try {
    await chrome.storage.local.set(patch);
  } catch {
    // ignore
  }
  return {
    ...result,
    autoSyncedPort: result.port !== preferredPort
  };
}

async function checkBridgeStatus(preferredPort, settings) {
  const primary = normalizePort(preferredPort);
  const direct = await probeBridgePort(primary, REQUEST_TIMEOUT_MS);
  if (direct.connected) {
    return syncDiscoveredBridge(direct, primary, settings);
  }

  const candidates = [];
  const seen = new Set([primary]);
  const addCandidate = (p) => {
    const n = normalizePort(p);
    if (!seen.has(n)) {
      seen.add(n);
      candidates.push(n);
    }
  };
  if (settings?.lastWorkingPort) addCandidate(settings.lastWorkingPort);
  for (const p of CANDIDATE_PORTS) addCandidate(p);

  const probes = await Promise.all(candidates.map((p) => probeBridgePort(p, PROBE_TIMEOUT_MS)));
  const found = probes.find((r) => r.connected);
  if (found) {
    return syncDiscoveredBridge(found, primary, settings);
  }
  return { connected: false, port: primary, error: 'UNREACHABLE' };
}

async function syncBridgeConnection() {
  try {
    const s = await getSettings();
    updateBadge(s.enabled);
    const bridge = await checkBridgeStatus(s.port, s);
    if (bridge.connected) {
      try { await chrome.storage.local.set({ lastConnectedAt: Date.now() }); } catch { /* ignore */ }
    }
    return { settings: await getSettings(), bridge };
  } catch {
    return { settings: null, bridge: { connected: false, error: 'UNREACHABLE' } };
  }
}

function ensureKeepAliveAlarm() {
  try {
    if (chrome.alarms && typeof chrome.alarms.create === 'function') {
      chrome.alarms.create('nbrsflow-keepalive', { periodInMinutes: 1 });
    }
  } catch { /* ignore */ }
}

async function collectCookieHeader(targetUrl) {
  try {
    if (!chrome.cookies || typeof chrome.cookies.getAll !== 'function') return '';
    const cookies = await chrome.cookies.getAll({ url: targetUrl });
    if (!Array.isArray(cookies) || cookies.length === 0) return '';
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

async function postDownloadToPort({ url, fileName, referrer, userAgent, cookie, port }) {
  const res = await fetchWithTimeout(`http://127.0.0.1:${port}/api/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Nbrsflow-Extension': '1'
    },
    body: JSON.stringify({
      url,
      fileName: fileName || '',
      referrer: referrer || '',
      userAgent,
      cookie
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return { ...data, usedPort: port };
}

async function sendToNbrsflow({ url, fileName, referrer, port, settings }) {
  const cookie = await collectCookieHeader(url);
  const userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  try {
    return await postDownloadToPort({ url, fileName, referrer, userAgent, cookie, port });
  } catch (err) {
    if (err && typeof err.httpStatus === 'number') {
      throw err;
    }
    // Network/connection failure: try auto-discovering active bridge port once
    const discovered = await checkBridgeStatus(port, settings);
    if (discovered.connected && discovered.port !== port) {
      return await postDownloadToPort({ url, fileName, referrer, userAgent, cookie, port: discovered.port });
    }
    throw err;
  }
}

async function askUserConfirmation({ url, fileName, lang }) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const qs = new URLSearchParams({
    token,
    url,
    fileName: fileName || '',
    lang: lang === 'en' ? 'en' : 'ar'
  });
  return new Promise((resolve) => {
    let settled = false;
    let winId = null;
    const finish = (approved) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingConfirmations.delete(token);
      if (winId !== null) {
        const shouldClose = pendingConfirmWindows.has(winId);
        pendingConfirmWindows.delete(winId);
        if (shouldClose) {
          try { chrome.windows.remove(winId); } catch { /* ignore */ }
        }
      }
      resolve(approved);
    };
    const timer = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
    pendingConfirmations.set(token, finish);
    try {
      chrome.windows.create({
        url: chrome.runtime.getURL(`confirm.html?${qs.toString()}`),
        type: 'popup',
        width: 440,
        height: 250,
        focused: true
      }, (win) => {
        if (chrome.runtime.lastError || !win) {
          finish(false);
          return;
        }
        winId = win.id ?? null;
        if (settled) {
          if (winId !== null) {
            try { chrome.windows.remove(winId); } catch { /* ignore */ }
          }
          return;
        }
        if (winId !== null) {
          pendingConfirmWindows.set(winId, finish);
        }
      });
    } catch {
      finish(false);
    }
  });
}

function notifyUser(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message
    });
  } catch {
    // Ignore if notifications are unavailable
  }
}

async function recordNotice(type, text) {
  await chrome.storage.local.set({
    lastNotice: { type, text, at: Date.now() }
  });
}

function refreshContextMenu(lang) {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: lang === 'en' ? 'Download with nbrsflow' : 'التحميل بواسطة nbrsflow',
      contexts: ['link']
    });
  });
}

function formatAcceptedNotice(res, fallbackLabel, lang) {
  const label = res.fileName || fallbackLabel;
  if (res.deduplicated) {
    return lang === 'en'
      ? `Already queued in nbrsflow: ${label}`
      : `الرابط مرسل مسبقاً إلى nbrsflow: ${label}`;
  }
  return lang === 'en'
    ? `Accepted by nbrsflow: ${label}`
    : `تم قبول التحميل في nbrsflow: ${label}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const s = await getSettings();
    await chrome.storage.local.set({
      enabled: s.enabled,
      port: s.port,
      lastWorkingPort: s.lastWorkingPort,
      lang: s.lang
    });
    updateBadge(s.enabled);
    refreshContextMenu(s.lang);
    ensureKeepAliveAlarm();
    await syncBridgeConnection();
  } catch { /* ignore */ }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const s = await getSettings();
    updateBadge(s.enabled);
    refreshContextMenu(s.lang);
    ensureKeepAliveAlarm();
    await syncBridgeConnection();
  } catch { /* ignore */ }
});

try {
  if (chrome.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm?.name === 'nbrsflow-keepalive') {
        void syncBridgeConnection();
      }
    });
  }
  ensureKeepAliveAlarm();
  void syncBridgeConnection();
} catch { /* ignore */ }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) updateBadge(changes.enabled.newValue !== false);
  if (changes.lang) refreshContextMenu(changes.lang.newValue === 'en' ? 'en' : 'ar');
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.linkUrl) return;
  const s = await getSettings();
  if (!isInterceptableUrl(info.linkUrl, s.port)) return;
  if (isDomainExcluded(info.linkUrl, s.excludedDomains) || isDomainExcluded(info.pageUrl, s.excludedDomains)) return;
  if (await isWithinCooldown(info.linkUrl)) return;
  try {
    await markSentUrl(info.linkUrl);
    const res = await sendToNbrsflow({
      url: info.linkUrl,
      referrer: info.pageUrl || '',
      port: s.port,
      settings: s
    });
    const sentMsg = formatAcceptedNotice(res, info.linkUrl, s.lang);
    await recordNotice('ok', sentMsg);
    if (!res.deduplicated) {
      flashSentBadge(s.enabled);
      notifyUser('nbrsflow', sentMsg);
    }
  } catch (err) {
    const isRejected = typeof err?.httpStatus === 'number';
    const msg = isRejected
      ? (s.lang === 'en' ? `nbrsflow rejected link: ${err.message}` : `رفض nbrsflow الرابط: ${err.message}`)
      : (s.lang === 'en' ? 'nbrsflow is not running or receiver is disabled.' : 'تطبيق nbrsflow غير قيد التشغيل أو الاستقبال معطّل.');
    await recordNotice('fallback', msg);
    notifyUser('nbrsflow', msg);
  }
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Handle asynchronously so we can safely fall back to suggest() if nbrsflow is offline.
  (async () => {
    try {
      const s = await getSettings();
      const targetUrl = downloadItem.finalUrl || downloadItem.url;

      if (
        !s.enabled ||
        !isInterceptableUrl(targetUrl, s.port) ||
        isDomainExcluded(targetUrl, s.excludedDomains) ||
        isDomainExcluded(downloadItem.referrer, s.excludedDomains) ||
        isNoisyOrTrackingDownload(downloadItem, targetUrl)
      ) {
        suggest();
        return;
      }

      if (await isWithinCooldown(targetUrl)) {
        suggest();
        try {
          await chrome.downloads.cancel(downloadItem.id);
          await chrome.downloads.erase({ id: downloadItem.id });
        } catch {
          // Ignore if already cancelled
        }
        return;
      }

      if (s.confirmBeforeSend) {
        const approved = await askUserConfirmation({
          url: targetUrl,
          fileName: downloadItem.filename || '',
          lang: s.lang
        });
        if (!approved) {
          suggest();
          return;
        }
      }

      try {
        await markSentUrl(targetUrl);
        const result = await sendToNbrsflow({
          url: targetUrl,
          fileName: downloadItem.filename || '',
          referrer: downloadItem.referrer || '',
          port: s.port,
          settings: s
        });

        // Let Chrome finish determining filename then cancel & erase its duplicate download.
        suggest();
        try {
          await chrome.downloads.cancel(downloadItem.id);
          await chrome.downloads.erase({ id: downloadItem.id });
        } catch {
          // Ignore if already cancelled
        }

        const sentMsg = formatAcceptedNotice(result, downloadItem.filename || targetUrl, s.lang);
        await recordNotice('ok', sentMsg);
        if (!result.deduplicated) {
          flashSentBadge(s.enabled);
          notifyUser('nbrsflow', sentMsg);
        }
      } catch (err) {
        // Do not lose the link or hang the browser: let the browser complete the download normally.
        suggest();
        const isRejected = typeof err?.httpStatus === 'number';
        const msg = isRejected
          ? (s.lang === 'en' ? `nbrsflow rejected link — browser continued download.` : `تعذر قبول الرابط في nbrsflow — أكمل المتصفح التحميل.`)
          : (s.lang === 'en' ? 'nbrsflow offline — browser continued download.' : 'nbrsflow غير متصل — أكمل المتصفح التحميل بشكل طبيعي.');
        await recordNotice('fallback', msg);
        notifyUser('nbrsflow', msg);
      }
    } catch {
      try { suggest(); } catch { /* ignore */ }
    }
  })();

  return true;
});

chrome.windows.onRemoved.addListener((winId) => {
  const finish = pendingConfirmWindows.get(winId);
  if (finish) {
    pendingConfirmWindows.delete(winId);
    finish(false);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
    if (message?.type === 'getState') {
      let { settings, bridge } = await syncBridgeConnection();
      if (!bridge?.connected) {
        await new Promise((r) => setTimeout(r, 180));
        const retry = await syncBridgeConnection();
        if (retry.bridge?.connected) {
          settings = retry.settings;
          bridge = retry.bridge;
        }
      }
      sendResponse({ settings: settings || await getSettings(), bridge });
      return;
    }
    if (message?.type === 'setEnabled') {
      const enabled = !!message.enabled;
      await chrome.storage.local.set({ enabled });
      updateBadge(enabled);
      sendResponse({ ok: true, enabled });
      return;
    }
    if (message?.type === 'setConfirmBeforeSend') {
      const confirmBeforeSend = !!message.confirmBeforeSend;
      await chrome.storage.local.set({ confirmBeforeSend });
      sendResponse({ ok: true, confirmBeforeSend });
      return;
    }
    if (message?.type === 'confirmDecision') {
      const cb = pendingConfirmations.get(message.token);
      if (cb) cb(!!message.approved);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'setPort') {
      const port = Number(message.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        sendResponse({ ok: false, error: 'Invalid port' });
        return;
      }
      await chrome.storage.local.set({ port, lastWorkingPort: port });
      const s = await getSettings();
      const bridge = await checkBridgeStatus(port, s);
      sendResponse({ ok: true, port, bridge });
      return;
    }
    if (message?.type === 'setLang') {
      const lang = message.lang === 'en' ? 'en' : 'ar';
      await chrome.storage.local.set({ lang, langManual: true });
      refreshContextMenu(lang);
      sendResponse({ ok: true, lang });
      return;
    }
    if (message?.type === 'setExcludedDomains') {
      const excludedDomains = normalizeExcludedDomains(message.domains);
      await chrome.storage.local.set({ excludedDomains });
      sendResponse({ ok: true, excludedDomains });
      return;
    }
    if (message?.type === 'sendDirectUrl') {
      const rawUrl = String(message.url || '').trim();
      const s = await getSettings();
      if (!isInterceptableUrl(rawUrl, s.port)) {
        sendResponse({ ok: false, error: s.lang === 'en' ? 'Invalid HTTP/HTTPS URL' : 'رابط HTTP/HTTPS غير صالح' });
        return;
      }
      try {
        await markSentUrl(rawUrl);
        const res = await sendToNbrsflow({ url: rawUrl, port: s.port, settings: s });
        const sentMsg = formatAcceptedNotice(res, rawUrl, s.lang);
        await recordNotice('ok', sentMsg);
        if (!res.deduplicated) flashSentBadge(s.enabled);
        sendResponse({ ok: true, res, notice: sentMsg });
      } catch (err) {
        const msg = s.lang === 'en'
          ? (err?.message || 'Could not reach nbrsflow')
          : (err?.message || 'تعذر الاتصال بـ nbrsflow');
        await recordNotice('fallback', msg);
        sendResponse({ ok: false, error: msg });
      }
    }
    } catch (err) {
      try { sendResponse({ ok: false, error: err?.message || 'Internal error' }); } catch { /* ignore */ }
    }
  })();
  return true;
});
