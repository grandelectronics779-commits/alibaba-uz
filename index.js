const https = require('https');
const zlib = require('zlib');

const TARGET = 'www.alibaba.com';

function decompress(res, callback) {
  const enc = res.headers['content-encoding'];
  const chunks = [];
  let stream = res;
  if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
  else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
  else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
  stream.on('data', c => chunks.push(c));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', callback);
}

const INJECT = `<script>
(function(){
  const S='__alibaba_uz_key__';
  async function tr(text,to){
    const k=localStorage.getItem(S);
    if(!k||!text||!text.trim())return text;
    try{
      const r=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},
        body:JSON.stringify({
          model:'gpt-4o-mini',
          messages:[
            {role:'system',content:to==='en'?'Translate Uzbek to English. Return ONLY translated text.':'Translate English to Uzbek. Return ONLY translated text.'},
            {role:'user',content:text}
          ],
          max_tokens:500,temperature:0.3
        })
      });
      const d=await r.json();
      return d.choices?.[0]?.message?.content?.trim()||text;
    }catch(e){return text;}
  }
  function isUzbek(t){
    return /[\\u0400-\\u04FF]/.test(t)||/\\b(men|sen|biz|siz|bu|va|nima|qanday|narx|mahsulot|kerak|bor|yaxshi|salom|rahmat|iltimos|sotib|olmoq|qancha|tovar)\\b/i.test(t);
  }
  function toast(msg){
    const t=document.createElement('div');
    t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;z-index:999999;font-family:sans-serif';
    t.textContent=msg;document.body.appendChild(t);
    setTimeout(()=>t.remove(),3000);
  }
  function showModal(){
    if(localStorage.getItem(S))return;
    const m=document.createElement('div');
    m.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:sans-serif';
    m.innerHTML='<div style="background:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%"><div style="display:flex;align-items:center;gap:12px;margin-bottom:20px"><div style="width:40px;height:40px;background:#FF6A00;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">UZ</div><div><div style="font-weight:600;font-size:16px">Alibaba O\'zbek Tarjimon</div><div style="font-size:13px;color:#666">OpenAI API key kiriting</div></div></div><input id="_uzk" type="password" placeholder="sk-..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box;font-family:monospace"><button id="_uzb" style="width:100%;padding:11px;background:#FF6A00;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Saqlash</button><p style="font-size:12px;color:#999;margin:10px 0 0;text-align:center">Key faqat sizning brauzeringizda saqlanadi</p></div>';
    document.body.appendChild(m);
    document.getElementById('_uzb').onclick=function(){
      const v=document.getElementById('_uzk').value.trim();
      if(!v.startsWith('sk-')){alert("API key sk- bilan boshlanishi kerak");return;}
      localStorage.setItem(S,v);m.remove();
      toast('✓ Tayyor! Endi o\'zbekcha yozishingiz mumkin');
    };
  }
  function hookSend(){
    document.addEventListener('click',async function(e){
      const btn=e.target.closest('button');
      if(!btn)return;
      const txt=btn.textContent.toLowerCase();
      if(!txt.includes('send')&&!btn.className.includes('send')&&!btn.className.includes('Send'))return;
      const wrap=btn.closest('[class*="chat"],[class*="Chat"],[class*="message"],[class*="Message"]')||btn.parentElement;
      const ta=wrap&&wrap.querySelector('textarea,input[type="text"],div[contenteditable="true"]');
      if(!ta)return;
      const text=ta.tagName==='DIV'?ta.innerText:ta.value;
      if(!text||!text.trim()||!isUzbek(text))return;
      e.preventDefault();e.stopImmediatePropagation();
      const en=await tr(text,'en');
      if(ta.tagName==='DIV'){ta.innerText=en;}
      else{
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,en);
        ta.dispatchEvent(new Event('input',{bubbles:true}));
      }
      toast('📤 Yuborildi: "'+en.substring(0,40)+'"');
      setTimeout(()=>btn.click(),100);
    },true);
    document.addEventListener('keydown',async function(e){
      if(e.key!=='Enter'||e.shiftKey)return;
      const el=e.target;
      if(!el.closest('[class*="chat"],[class*="Chat"],[class*="message"],[class*="Message"]'))return;
      const text=el.tagName==='DIV'?el.innerText:el.value;
      if(!text||!text.trim()||!isUzbek(text))return;
      e.preventDefault();e.stopImmediatePropagation();
      const en=await tr(text,'en');
      if(el.tagName==='DIV'){el.innerText=en;}
      else{
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,en);
        el.dispatchEvent(new Event('input',{bubbles:true}));
      }
      toast('📤 Yuborildi');
      setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})),150);
    },true);
  }
  function watchIncoming(){
    new MutationObserver(async mutations=>{
      for(const m of mutations){
        for(const n of m.addedNodes){
          if(n.nodeType!==1)continue;
          const els=n.querySelectorAll?n.querySelectorAll('[class*="receive"],[class*="Receive"],[class*="left"],[class*="other"]'):[];
          for(const el of els){
            if(el.dataset.uzDone)continue;
            el.dataset.uzDone='1';
            const t=(el.querySelector('p,span')||el).innerText?.trim();
            if(!t||t.length<3||!/[a-zA-Z]{3,}/.test(t))continue;
            const uz=await tr(t,'uz');
            if(uz&&uz!==t){
              const b=document.createElement('div');
              b.style.cssText='margin-top:4px;padding:6px 10px;background:#FFF3E0;border-left:3px solid #FF6A00;border-radius:4px;font-size:13px;color:#333';
              b.innerHTML='🇺🇿 '+uz;
              el.appendChild(b);
            }
          }
        }
      }
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(showModal,1000);hookSend();watchIncoming();});
  }else{
    setTimeout(showModal,1000);hookSend();watchIncoming();
  }
})();
</script>`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const path = req.url || '/';
  const headers = { ...req.headers };
  headers['host'] = TARGET;
  headers['origin'] = `https://${TARGET}`;
  headers['referer'] = `https://${TARGET}${path}`;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  delete headers['accept-encoding'];

  let body = null;
  if (['POST','PUT','PATCH'].includes(req.method)) {
    body = await new Promise(r => {
      const c = [];
      req.on('data', d => c.push(d));
      req.on('end', () => r(Buffer.concat(c)));
    });
    headers['content-length'] = body.length;
  }

  return new Promise(resolve => {
    const pr = https.request({ hostname: TARGET, port: 443, path, method: req.method, headers }, pres => {
      const ct = pres.headers['content-type'] || '';
      const isHTML = ct.includes('text/html');
      const isText = isHTML || ct.includes('javascript') || ct.includes('css') || ct.includes('text/');
      const skip = ['content-encoding','content-security-policy','x-frame-options','strict-transport-security','content-length','transfer-encoding'];
      Object.entries(pres.headers).forEach(([k,v]) => {
        if (!skip.includes(k.toLowerCase())) try { res.setHeader(k,v); } catch(e) {}
      });
      if (pres.headers['set-cookie']) {
        const c = [].concat(pres.headers['set-cookie']).map(c => c.replace(/Domain=[^;]+;?/gi,'').replace(/Secure;?/gi,''));
        res.setHeader('set-cookie', c);
      }
      if ([301,302,303,307,308].includes(pres.statusCode)) {
        let loc = (pres.headers['location']||'').replace(`https://${TARGET}`,`https://${host}`);
        res.setHeader('location', loc);
        return res.status(pres.statusCode).end(), resolve();
      }
      if (!isText) { res.status(pres.statusCode); pres.pipe(res); pres.on('end', resolve); return; }
      decompress(pres, (err, buf) => {
        if (err) { res.status(500).send('Error'); return resolve(); }
        let text = buf.toString('utf8');
        text = text.replace(/https:\/\/www\.alibaba\.com/g, `https://${host}`);
        text = text.replace(/\/\/www\.alibaba\.com/g, `//${host}`);
        if (isHTML && text.includes('</body>')) text = text.replace('</body>', INJECT+'</body>');
        res.status(pres.statusCode).send(text);
        resolve();
      });
    });
    pr.on('error', e => { res.status(502).send('Error: '+e.message); resolve(); });
    if (body) pr.write(body);
    pr.end();
  });
};
