const https = require('https');
const http = require('http');
const zlib = require('zlib');

const TARGET = 'www.alibaba.com';

function decompress(res, callback) {
  const encoding = res.headers['content-encoding'];
  if (encoding === 'gzip') {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);
    const chunks = [];
    gunzip.on('data', c => chunks.push(c));
    gunzip.on('end', () => callback(null, Buffer.concat(chunks)));
    gunzip.on('error', callback);
  } else if (encoding === 'br') {
    const brotli = zlib.createBrotliDecompress();
    res.pipe(brotli);
    const chunks = [];
    brotli.on('data', c => chunks.push(c));
    brotli.on('end', () => callback(null, Buffer.concat(chunks)));
    brotli.on('error', callback);
  } else if (encoding === 'deflate') {
    const inflate = zlib.createInflate();
    res.pipe(inflate);
    const chunks = [];
    inflate.on('data', c => chunks.push(c));
    inflate.on('end', () => callback(null, Buffer.concat(chunks)));
    inflate.on('error', callback);
  } else {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const proxyHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const targetPath = req.url || '/';

  // Forward headers, strip problematic ones
  const headers = { ...req.headers };
  headers['host'] = TARGET;
  headers['origin'] = `https://${TARGET}`;
  headers['referer'] = `https://${TARGET}${targetPath}`;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  delete headers['x-vercel-id'];
  delete headers['x-vercel-deployment-url'];
  delete headers['accept-encoding']; // we handle this ourselves

  // Read request body
  let body = null;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
    headers['content-length'] = body.length;
  }

  const options = {
    hostname: TARGET,
    port: 443,
    path: targetPath,
    method: req.method,
    headers,
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      const isHTML = contentType.includes('text/html');
      const isJS = contentType.includes('javascript');
      const isCSS = contentType.includes('text/css');
      const isText = isHTML || isJS || isCSS || contentType.includes('text/');

      // Copy response headers, remove security ones
      const skipHeaders = [
        'content-encoding', 'content-security-policy',
        'x-frame-options', 'strict-transport-security',
        'content-length', 'transfer-encoding',
        'set-cookie'
      ];

      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (!skipHeaders.includes(k.toLowerCase())) {
          try { res.setHeader(k, v); } catch(e) {}
        }
      });

      // Handle cookies (rewrite domain)
      if (proxyRes.headers['set-cookie']) {
        const cookies = Array.isArray(proxyRes.headers['set-cookie'])
          ? proxyRes.headers['set-cookie']
          : [proxyRes.headers['set-cookie']];
        const rewritten = cookies.map(c =>
          c.replace(/Domain=[^;]+;?/gi, '').replace(/Secure;?/gi, '')
        );
        res.setHeader('set-cookie', rewritten);
      }

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        let loc = proxyRes.headers['location'] || '';
        loc = loc.replace(`https://${TARGET}`, `https://${proxyHost}`);
        loc = loc.replace(`http://${TARGET}`, `https://${proxyHost}`);
        res.setHeader('location', loc);
        res.status(proxyRes.statusCode).end();
        return resolve();
      }

      if (!isText) {
        // Binary: pipe directly
        res.status(proxyRes.statusCode);
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
        return;
      }

      // Text: decompress, rewrite, send
      decompress(proxyRes, (err, buf) => {
        if (err) {
          res.status(500).send('Decompress error: ' + err.message);
          return resolve();
        }

        let text = buf.toString('utf8');

        // Rewrite all alibaba.com references to our proxy domain
        const proxyUrl = `https://${proxyHost}`;
        text = text.replace(/https:\/\/www\.alibaba\.com/g, proxyUrl);
        text = text.replace(/https:\/\/alibaba\.com/g, proxyUrl);
        text = text.replace(/\/\/www\.alibaba\.com/g, `//${proxyHost}`);

        if (isHTML) {
          // Inject our translation script before </body>
          const injectedScript = `
<script>
(function() {
  const PROXY_HOST = '${proxyHost}';
  const API_KEY_STORAGE = '__alibaba_uz_openai_key__';

  // Translation via OpenAI
  async function translate(text, toLang) {
    const key = localStorage.getItem(API_KEY_STORAGE);
    if (!key || !text || !text.trim()) return text;
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: toLang === 'en'
              ? "Translate the following Uzbek text to English. Return ONLY the translated text, nothing else."
              : "Translate the following English text to Uzbek. Return ONLY the translated text, nothing else. Use natural Uzbek." },
            { role: 'user', content: text }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      });
      const d = await r.json();
      return d.choices?.[0]?.message?.content?.trim() || text;
    } catch(e) { return text; }
  }

  // Detect Uzbek (contains Uzbek-specific chars or common Uzbek words)
  function isUzbek(text) {
    if (/[\\u0400-\\u04FF]/.test(text)) return true; // Cyrillic
    const uzWords = /\\b(men|sen|biz|siz|bu|u|ular|va|yoki|lekin|agar|qanday|narsa|kerak|bor|yo'q|nima|qachon|qayerda|rahmat|salom|xayr|iltimos|qilib|beradi|oladi|yaxshi|yomon|katta|kichik|yangi|eski|sotib|olmoq|sotmoq|narx|tovar|mahsulot)\\b/i;
    return uzWords.test(text);
  }

  // Show API key modal if not set
  function showKeyModal() {
    if (localStorage.getItem(API_KEY_STORAGE)) return;
    const modal = document.createElement('div');
    modal.id = 'uz-key-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:sans-serif';
    modal.innerHTML = \`
      <div style="background:white;border-radius:12px;padding:32px;max-width:440px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:40px;height:40px;background:#FF6A00;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">UZ</div>
          <div>
            <div style="font-weight:600;font-size:16px;color:#111">Alibaba O'zbek Tarjimon</div>
            <div style="font-size:13px;color:#666">OpenAI API key kiriting</div>
          </div>
        </div>
        <input id="uz-api-input" type="password" placeholder="sk-..." style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box;font-family:monospace" />
        <button id="uz-save-btn" style="width:100%;padding:11px;background:#FF6A00;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Saqlash va boshlash</button>
        <p style="font-size:12px;color:#999;margin:12px 0 0;text-align:center">Key faqat sizning brauzeringizda saqlanadi</p>
      </div>
    \`;
    document.body.appendChild(modal);
    document.getElementById('uz-save-btn').onclick = function() {
      const val = document.getElementById('uz-api-input').value.trim();
      if (!val.startsWith('sk-')) { alert("API key 'sk-' bilan boshlanishi kerak"); return; }
      localStorage.setItem(API_KEY_STORAGE, val);
      modal.remove();
      showToast('✓ API key saqlandi. Endi o\'zbekcha yozishingiz mumkin!');
    };
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:10px 20px;border-radius:24px;font-size:14px;z-index:999999;font-family:sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Watch for Alibaba chat textarea
  function hookChat() {
    // Alibaba chat send button interceptor
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('button[class*="send"], button[class*="Send"], .send-btn, [class*="sendBtn"]');
      if (!btn) return;

      // Find nearby textarea
      const container = btn.closest('[class*="chat"], [class*="Chat"], [class*="message"], [class*="Message"], form') || document.body;
      const textarea = container.querySelector('textarea, input[type="text"], div[contenteditable="true"]');
      if (!textarea) return;

      const text = textarea.tagName === 'DIV' ? textarea.innerText : textarea.value;
      if (!text || !text.trim()) return;
      if (!isUzbek(text)) return; // Only translate Uzbek

      e.preventDefault();
      e.stopImmediatePropagation();

      const translated = await translate(text, 'en');
      if (textarea.tagName === 'DIV') {
        textarea.innerText = translated;
      } else {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(textarea, translated);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }

      showToast('📤 Inglizchaga tarjima qilindi: "' + translated.substring(0, 40) + '..."');

      // Click send after short delay
      setTimeout(() => {
        btn.click();
        // Restore original so user sees what they typed
        setTimeout(() => {
          if (textarea.tagName === 'DIV') {
            textarea.innerText = text;
          }
        }, 300);
      }, 100);

    }, true);

    // Also intercept Enter key in chat
    document.addEventListener('keydown', async function(e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const el = e.target;
      const inChat = el.closest('[class*="chat"], [class*="Chat"], [class*="message"], [class*="Message"]');
      if (!inChat) return;

      const text = el.tagName === 'DIV' ? el.innerText : el.value;
      if (!text || !text.trim() || !isUzbek(text)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const translated = await translate(text, 'en');
      if (el.tagName === 'DIV') {
        el.innerText = translated;
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, translated);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      showToast('📤 Tarjima yuborildi');
      setTimeout(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }, 150);
    }, true);
  }

  // Watch incoming chat messages and translate English to Uzbek
  function watchIncoming() {
    const observer = new MutationObserver(async (mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Find message bubbles from supplier (not user's own)
          const msgEls = node.querySelectorAll
            ? node.querySelectorAll('[class*="receive"], [class*="Receive"], [class*="left"], [class*="supplier"], [class*="other"]')
            : [];
          for (const el of msgEls) {
            const textEl = el.querySelector('p, span, div') || el;
            const txt = textEl.innerText?.trim();
            if (!txt || txt.length < 3) continue;
            if (el.dataset.uzTranslated) continue;
            el.dataset.uzTranslated = '1';

            // Check if it looks like English
            if (!/[a-zA-Z]{3,}/.test(txt)) continue;

            const uzText = await translate(txt, 'uz');
            if (uzText && uzText !== txt) {
              const badge = document.createElement('div');
              badge.style.cssText = 'margin-top:4px;padding:6px 10px;background:#FFF3E0;border-left:3px solid #FF6A00;border-radius:4px;font-size:13px;color:#333;font-family:sans-serif';
              badge.innerHTML = '🇺🇿 ' + uzText;
              el.appendChild(badge);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Init
  window.addEventListener('DOMContentLoaded', function() {
    setTimeout(showKeyModal, 1000);
    hookChat();
    watchIncoming();
  });

  if (document.readyState !== 'loading') {
    setTimeout(showKeyModal, 1000);
    hookChat();
    watchIncoming();
  }
})();
</script>`;

          // Inject before </body> or at end
          if (text.includes('</body>')) {
            text = text.replace('</body>', injectedScript + '</body>');
          } else {
            text += injectedScript;
          }
        }

        res.status(proxyRes.statusCode).send(text);
        resolve();
      });
    });

    proxyReq.on('error', (err) => {
      res.status(502).send('Proxy error: ' + err.message);
      resolve();
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
};
