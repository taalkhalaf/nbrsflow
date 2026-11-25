const STRINGS = {
  ar: {
    langSwitch: 'English',
    connected: 'متصل بـ nbrsflow',
    disconnected: 'nbrsflow غير متصل',
    engineReady: 'محرك aria2 جاهز',
    autoSyncedPort: 'تمت مزامنة المنفذ تلقائياً',
    offlineHint: 'تأكد من تشغيل nbrsflow وتفعيل استقبال المتصفح في الإعدادات.',
    sendUrlLabel: 'إرسال رابط تحميل مباشر',
    sendUrlPlaceholder: 'https://example.com/file.zip',
    sendUrlBtn: 'إرسال',
    capturePageBtn: 'التقاط روابط الوسائط/الملفات من الصفحة',
    noCapturedLinks: 'لم يتم العثور على روابط مباشرة في الصفحة الحالية.',
    excludedLabel: 'استثناء نطاقات (مفصولة بفاصلة)',
    interceptTitle: 'الاعتراض التلقائي للتحميلات',
    interceptDesc: 'تحويل تحميلات المتصفح مباشرة إلى nbrsflow',
    confirmTitle: 'تأكيد قبل الإرسال',
    confirmDesc: 'السؤال قبل إرسال التحميل بدلاً من الاعتراض الصامت',
    sentBadge: '✓ أُرسل للتحميل',
    fallbackBadge: '⚠ تنبيه',
    portLabel: 'منفذ الاتصال المحلي (127.0.0.1)',
    savePort: 'حفظ',
    saved: 'تم الحفظ'
  },
  en: {
    langSwitch: 'العربية',
    connected: 'Connected to nbrsflow',
    disconnected: 'nbrsflow unreachable',
    engineReady: 'aria2 engine ready',
    autoSyncedPort: 'Port auto-synced',
    offlineHint: 'Make sure nbrsflow is running and Browser Extension is enabled in Settings.',
    sendUrlLabel: 'Send direct download link',
    sendUrlPlaceholder: 'https://example.com/file.zip',
    sendUrlBtn: 'Send',
    capturePageBtn: 'Capture media/file links from page',
    noCapturedLinks: 'No direct download/media links found on active page.',
    excludedLabel: 'Excluded domains (comma-separated)',
    interceptTitle: 'Auto-intercept downloads',
    interceptDesc: 'Send browser downloads directly to nbrsflow',
    confirmTitle: 'Confirm before sending',
    confirmDesc: 'Ask before sending instead of silent interception',
    sentBadge: '✓ Sent for download',
    fallbackBadge: '⚠ Notice',
    portLabel: 'Local bridge port (127.0.0.1)',
    savePort: 'Save',
    saved: 'Saved'
  }
};

let currentLang = 'ar';
let currentEnabled = true;
let currentConfirm = false;

function applyLocale(lang) {
  currentLang = lang === 'en' ? 'en' : 'ar';
  const t = STRINGS[currentLang];
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langBtn').textContent = t.langSwitch;
  document.getElementById('sendUrlLabel').textContent = t.sendUrlLabel;
  document.getElementById('directUrlInput').placeholder = t.sendUrlPlaceholder;
  document.getElementById('sendUrlBtn').textContent = t.sendUrlBtn;
  document.getElementById('capturePageBtn').textContent = t.capturePageBtn;
  document.getElementById('excludedLabel').textContent = t.excludedLabel;
  document.getElementById('saveExcludedBtn').textContent = t.savePort;
  document.getElementById('interceptTitle').textContent = t.interceptTitle;
  document.getElementById('interceptDesc').textContent = t.interceptDesc;
  document.getElementById('confirmTitle').textContent = t.confirmTitle;
  document.getElementById('confirmDesc').textContent = t.confirmDesc;
  document.getElementById('portLabel').textContent = t.portLabel;
  document.getElementById('savePortBtn').textContent = t.savePort;
}

function renderState(state) {
  if (!state) return;
  const { settings, bridge } = state;
  applyLocale(settings.lang);
  currentEnabled = settings.enabled !== false;
  currentConfirm = !!settings.confirmBeforeSend;
  document.getElementById('toggleBtn').setAttribute('aria-checked', String(currentEnabled));
  document.getElementById('confirmToggleBtn').setAttribute('aria-checked', String(currentConfirm));
  document.getElementById('portInput').value = String(bridge?.port || settings.port);
  document.getElementById('excludedInput').value = Array.isArray(settings.excludedDomains) ? settings.excludedDomains.join(', ') : '';

  const t = STRINGS[currentLang];
  const dot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');

  if (bridge?.connected) {
    dot.className = 'dot ok';
    statusText.textContent = `${t.connected} (v${bridge.version || '?'})`;
    const parts = [bridge.engineReady ? t.engineReady : `127.0.0.1:${bridge.port || settings.port}`];
    if (bridge.autoSyncedPort) parts.push(`${t.autoSyncedPort}: ${bridge.port}`);
    statusSub.textContent = parts.join(' · ');
  } else {
    dot.className = 'dot err';
    statusText.textContent = t.disconnected;
    statusSub.textContent = t.offlineHint;
  }

  const noticeBox = document.getElementById('noticeBox');
  if (settings.lastNotice?.text) {
    const isFallback = settings.lastNotice.type === 'fallback';
    noticeBox.style.display = 'block';
    noticeBox.className = `notice ${isFallback ? 'fallback' : 'ok'}`;
    const badge = isFallback ? t.fallbackBadge : t.sentBadge;
    noticeBox.textContent = `${badge}: ${settings.lastNotice.text}`;
  } else {
    noticeBox.style.display = 'none';
  }
}

function refresh() {
  chrome.runtime.sendMessage({ type: 'getState' }, renderState);
}

document.getElementById('toggleBtn').addEventListener('click', () => {
  const next = !currentEnabled;
  chrome.runtime.sendMessage({ type: 'setEnabled', enabled: next }, () => refresh());
});

document.getElementById('confirmToggleBtn').addEventListener('click', () => {
  const next = !currentConfirm;
  chrome.runtime.sendMessage({ type: 'setConfirmBeforeSend', confirmBeforeSend: next }, () => refresh());
});

document.getElementById('langBtn').addEventListener('click', () => {
  const next = currentLang === 'ar' ? 'en' : 'ar';
  chrome.runtime.sendMessage({ type: 'setLang', lang: next }, () => refresh());
});

document.getElementById('refreshBtn').addEventListener('click', refresh);

document.getElementById('sendUrlBtn').addEventListener('click', () => {
  const input = document.getElementById('directUrlInput');
  const url = input.value.trim();
  if (!url) return;
  chrome.runtime.sendMessage({ type: 'sendDirectUrl', url }, (res) => {
    if (res?.ok) input.value = '';
    refresh();
  });
});

document.getElementById('directUrlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('sendUrlBtn').click();
});

document.getElementById('savePortBtn').addEventListener('click', () => {
  const port = Number(document.getElementById('portInput').value);
  chrome.runtime.sendMessage({ type: 'setPort', port }, (res) => {
    if (res?.ok) {
      const btn = document.getElementById('savePortBtn');
      btn.textContent = STRINGS[currentLang].saved;
      setTimeout(() => {
        btn.textContent = STRINGS[currentLang].savePort;
      }, 1200);
      refresh();
    }
  });
});

document.getElementById('saveExcludedBtn').addEventListener('click', () => {
  const domains = document.getElementById('excludedInput').value;
  chrome.runtime.sendMessage({ type: 'setExcludedDomains', domains }, (res) => {
    if (res?.ok) {
      const btn = document.getElementById('saveExcludedBtn');
      btn.textContent = STRINGS[currentLang].saved;
      setTimeout(() => { btn.textContent = STRINGS[currentLang].savePort; }, 1200);
      refresh();
    }
  });
});

document.getElementById('capturePageBtn').addEventListener('click', async () => {
  const box = document.getElementById('capturedLinksBox');
  box.style.display = 'block';
  box.innerHTML = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    let links = [];
    if (chrome.scripting?.executeScript) {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const extRe = /\.(?:mp4|mkv|avi|mov|webm|mp3|flac|wav|zip|rar|7z|tar|gz|iso|pdf|exe|msi)(?:$|[?#])/i;
          const set = new Set();
          for (const el of document.querySelectorAll('a[href], video[src], audio[src], source[src]')) {
            const u = el.href || el.src;
            if (u && /^https?:/i.test(u) && (extRe.test(u) || el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'SOURCE')) {
              set.add(u);
            }
          }
          return [...set].slice(0, 8);
        }
      });
      links = res?.[0]?.result || [];
    }
    if (links.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = STRINGS[currentLang].noCapturedLinks;
      box.appendChild(empty);
      return;
    }
    for (const u of links) {
      const row = document.createElement('div');
      row.className = 'port-row';
      row.style.marginTop = '4px';
      const span = document.createElement('span');
      span.style.flex = '1';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.whiteSpace = 'nowrap';
      span.style.fontSize = '11px';
      span.textContent = u;
      span.title = u;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary';
      btn.textContent = STRINGS[currentLang].sendUrlBtn;
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'sendDirectUrl', url: u }, () => refresh());
      });
      row.append(span, btn);
      box.appendChild(row);
    }
  } catch {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = STRINGS[currentLang].noCapturedLinks;
    box.appendChild(empty);
  }
});

refresh();
const popupPollTimer = setInterval(refresh, 4000);
window.addEventListener('unload', () => clearInterval(popupPollTimer));
