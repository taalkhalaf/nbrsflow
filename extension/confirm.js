const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const url = params.get('url') || '';
const fileName = params.get('fileName') || '';
const lang = params.get('lang') === 'en' ? 'en' : 'ar';

const T = {
  ar: {
    title: 'تأكيد الإرسال إلى nbrsflow',
    send: 'تحميل عبر nbrsflow',
    browser: 'متابعة في المتصفح'
  },
  en: {
    title: 'Confirm send to nbrsflow',
    send: 'Download with nbrsflow',
    browser: 'Keep in browser'
  }
}[lang];

document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
document.getElementById('titleEl').textContent = T.title;
document.getElementById('fileEl').textContent = fileName || url;
document.getElementById('urlEl').textContent = url;
document.getElementById('sendBtn').textContent = T.send;
document.getElementById('browserBtn').textContent = T.browser;

function decide(approved) {
  chrome.runtime.sendMessage({ type: 'confirmDecision', token, approved }, () => {
    window.close();
  });
}

document.getElementById('sendBtn').addEventListener('click', () => decide(true));
document.getElementById('browserBtn').addEventListener('click', () => decide(false));
window.addEventListener('beforeunload', () => {
  try {
    chrome.runtime.sendMessage({ type: 'confirmDecision', token, approved: false });
  } catch {
    // ignore
  }
});
