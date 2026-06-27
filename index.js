/* global process */
import express from 'express';
import makeWASocket from '@whiskeysockets/baileys';
import { DisconnectReason, makeCacheableSignalKeyStore, Browsers, downloadMediaMessage, initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import Groq from 'groq-sdk';
import pino from 'pino';

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
// Supabase Edge Functions base URL, e.g. https://<project-ref>.supabase.co/functions/v1
const SUPABASE_FUNCTIONS_URL = (process.env.SUPABASE_FUNCTIONS_URL || '').replace(/\/$/, '');
// Shared secret that the receiveMessage function validates (WEBHOOK_SECRET there).
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected';
let connectedPhone = null;
let isConnecting = false;

let settings = {
  ai_enabled: true,
  ai_reply_cap: 50,
  ai_delay_seconds: 2,
  sales_prompt: 'You are a helpful customer service assistant for Lasalu Drop Logistics (LDL). Be friendly, professional, and helpful.'
};

async function getAIReply(message, phoneNumber) {
  try {
    if (!GROQ_API_KEY) return null;
    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const systemPrompt = settings.sales_prompt || 'You are a helpful assistant for Lasalu Drop Logistics (LDL).';
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      model: 'llama3-70b-8192',
      max_tokens: 500,
      temperature: 0.7
    });
    return completion.choices[0]?.message?.content || null;
  } catch (err) {
    console.error('AI reply error:', err.message);
    return null;
  }
}

// ─── Durable WhatsApp session: stored in Supabase, not on Render's disposable disk ───
// Survives deploys/restarts so we don't have to re-scan the QR every time. Talks to the
// baileysAuth edge function using the WEBHOOK_SECRET we already have (no new env vars).
async function useSupabaseAuthState() {
  const url = `${SUPABASE_FUNCTIONS_URL}/baileysAuth`;
  const call = async (action, id, data) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
        body: JSON.stringify({ action, id, data })
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  const read = async (id) => {
    const res = await call('get', id);
    const raw = res?.data;
    return raw ? JSON.parse(JSON.stringify(raw), BufferJSON.reviver) : null;
  };
  const write = (id, value) => call('set', id, JSON.parse(JSON.stringify(value, BufferJSON.replacer)));
  const del = (id) => call('remove', id);

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(ids.map(async (id) => {
            let value = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }));
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? write(key, value) : del(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => write('creds', creds)
  };
}

// Wipe the stored session (on logout / manual clear) so the next boot shows a fresh QR.
async function clearSupabaseAuth() {
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/baileysAuth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ action: 'clear' })
    });
  } catch {}
}

// ─── Voice notes: transcribe with Groq Whisper (free) so ADANOVA can understand them ───
async function transcribeVoice(msg, sock) {
  try {
    if (!GROQ_API_KEY) return '';
    const buffer = await downloadMediaMessage(
      msg, 'buffer', {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voice.ogg');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'text');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form
    });
    if (!res.ok) { console.error('Whisper error:', res.status, (await res.text()).slice(0, 200)); return ''; }
    const text = (await res.text()).trim();
    console.log('Voice note transcribed:', text);
    return text;
  } catch (e) {
    console.error('transcribeVoice error:', e.message);
    return '';
  }
}

async function connectWhatsApp() {
  if (isConnecting) {
    console.log('Already connecting...');
    return;
  }
  isConnecting = true;
  connectionStatus = 'connecting';
  currentQR = null;

  try {
    // Session is restored from Supabase (durable), not the local disk.
    const { state, saveCreds } = await useSupabaseAuthState();

    sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      printQRInTerminal: true,
      logger: pino({ level: 'warn' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = await qrcode.toDataURL(qr);
        connectionStatus = 'qr_ready';
        console.log('QR code generated - waiting for scan');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : null;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        connectionStatus = 'disconnected';
        connectedPhone = null;
        currentQR = null;
        isConnecting = false;

        console.log('Connection closed. Status code:', statusCode, 'Logged out:', loggedOut);

        if (loggedOut) {
          console.log('Logged out - clearing stored session and waiting for manual reconnect');
          await clearSupabaseAuth();
        } else {
          const retryDelay = Math.min(15000 + Math.random() * 10000, 60000);
          console.log('Reconnecting in', Math.round(retryDelay / 1000) + 's...');
          setTimeout(connectWhatsApp, retryDelay);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        isConnecting = false;
        currentQR = null;
        connectedPhone = sock.user?.id?.split(':')[0] || null;
        console.log('WhatsApp connected! Phone:', connectedPhone);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        const phoneNumber = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || msg.key.remoteJid;

        // WhatsApp increasingly hides the real number behind an @lid. Best-effort resolve it to
        // the actual phone so the backend can match admins (Settings) by their normal number.
        let fromPhone = null;
        const _rjid = msg.key.remoteJid || '';
        if (_rjid.endsWith('@s.whatsapp.net')) {
          fromPhone = _rjid.replace('@s.whatsapp.net', '');
        } else if (_rjid.endsWith('@lid')) {
          try {
            let cand = msg.key.senderPn || msg.key.participantPn || msg.key.remoteJidAlt || null;
            if (!cand && sock?.signalRepository?.lidMapping?.getPNForLID) {
              cand = await sock.signalRepository.lidMapping.getPNForLID(_rjid);
            }
            if (cand) fromPhone = String(cand).replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
          } catch { /* best-effort only */ }
        }

        // Detect interactive list response (user selected from a list message)
        const listResponse = msg.message?.listResponseMessage;
        const interactiveSelection = listResponse
          ? {
              type: 'list_response',
              selected_id: listResponse.singleSelectReply?.selectedRowId || '',
              selected_title: listResponse.title || '',
              body: listResponse.description || ''
            }
          : null;

        // Detect media messages (images count as payment proof)
        const hasMedia = !!(msg.message?.imageMessage || msg.message?.documentMessage || msg.message?.videoMessage);
        const mediaCaption = msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';

        let text = interactiveSelection
          ? interactiveSelection.selected_id  // treat selected ID as the message text
          : (msg.message?.conversation || msg.message?.extendedTextMessage?.text || mediaCaption || (hasMedia ? '[image]' : ''));

        // Voice note (or PTT) with no caption → transcribe it so ADANOVA can reply.
        let wasVoice = false;
        if (!text && (msg.message?.audioMessage)) {
          wasVoice = true;
          text = await transcribeVoice(msg, sock);
        }

        // Shared location pin → forward exact coordinates so ADANOVA can use them.
        const locMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage;
        let location = null;
        if (locMsg && locMsg.degreesLatitude != null && locMsg.degreesLongitude != null) {
          location = { lat: locMsg.degreesLatitude, lng: locMsg.degreesLongitude, name: locMsg.name || locMsg.address || '' };
          if (!text) text = '📍 Shared location';
        }

        if (!text) {
          // A voice note we couldn't transcribe → ask them to type, never silently ignore them.
          if (wasVoice && !msg.key.fromMe) {
            try { await sock.sendMessage(msg.key.remoteJid, { text: "I couldn't quite catch that voice note 🙏 could you type it out for me? I'll sort it right away 🙌" }); } catch (e) { /* best effort */ }
          }
          continue;
        }

        const direction = msg.key.fromMe ? 'outbound' : 'inbound';
        console.log(`Message [${direction}] ${msg.key.fromMe ? 'to' : 'from'} ${phoneNumber}:`, text);

        // Send to Base44 webhook
        try {
          const payload = {
            from: phoneNumber,
            from_phone: fromPhone,
            contact_name: msg.pushName || phoneNumber,
            message: text,
            timestamp: msg.messageTimestamp,
            is_group: msg.key.remoteJid?.endsWith('@g.us') || false,
            direction,
            interactive_selection: interactiveSelection,
            has_media: hasMedia,
            media_url: null,
            location: location
          };
          const webhookUrl = `${SUPABASE_FUNCTIONS_URL}/receiveMessage`;
          console.log('Sending webhook to:', webhookUrl);
          console.log('Payload:', payload);
          console.log('Webhook secret set:', WEBHOOK_SECRET ? 'YES' : 'NO');

          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-webhook-secret': WEBHOOK_SECRET
            },
            body: JSON.stringify(payload)
          });
          
          const result = await response.json();
          console.log('Message webhook response:', result);
          if (!response.ok) {
            console.error('Webhook failed with status:', response.status, 'Body:', result);
          }
        } catch (error) {
          console.error('Failed to send message webhook:', error.message);
        }
      }
    });

  } catch (err) {
    console.error('connectWhatsApp error:', err.message);
    connectionStatus = 'disconnected';
    isConnecting = false;
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'LDL Baileys WhatsApp Service is running!', status: 'online', version: '2.0.0' });
});

// ── In-WhatsApp map picker page (opens in WhatsApp's in-app browser) ──
// Static page; it calls the Supabase mapPicker function for autocomplete/price/callback.
const MAP_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Set your delivery — Lasalu Drop</title>
<meta name="description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds.">
<meta property="og:title" content="📦 Set your delivery — Lasalu Drop">
<meta property="og:description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds 🛵">
<meta property="og:type" content="website">
<meta name="theme-color" content="#25D366">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
body{margin:0;background:#f4f6f8;color:#111}
.wrap{max-width:520px;margin:0 auto;padding:16px}
h2{margin:8px 0 6px;font-size:21px}
.fld{position:relative;margin-bottom:12px}
.fld label{font-size:13px;color:#555;display:block;margin-bottom:5px;font-weight:600}
.fld input{width:100%;padding:16px;border:1.5px solid #d6dbe0;border-radius:14px;font-size:17px;outline:none}
.fld input:focus{border-color:#25D366;box-shadow:0 0 0 3px rgba(37,211,102,.15)}
.sug{position:absolute;z-index:2000;left:0;right:0;background:#fff;border:1px solid #e2e6ea;border-radius:12px;margin-top:4px;box-shadow:0 6px 18px rgba(0,0,0,.08);overflow:hidden}
.leaflet-container{z-index:1}
.sug div{padding:15px 14px;font-size:16px;border-bottom:1px solid #f0f2f4}
.sug div:active{background:#eafaf0}
#map{height:260px;border-radius:14px;margin:12px 0;border:1px solid #e2e6ea}
.feebig{font-size:24px;font-weight:800;text-align:center;color:#0a7d33;background:#eafaf0;border:1px solid #bce6cb;border-radius:14px;padding:16px;margin:14px 0;display:none}
.feebig small{display:block;font-size:13px;font-weight:600;color:#5a8a6c;margin-top:3px}
button{width:100%;padding:18px;border:0;border-radius:14px;background:#25D366;color:#fff;font-size:18px;font-weight:800}
button:disabled{background:#b6e6c8}
.done{text-align:center;padding:30px 14px}.done h2{font-size:22px;color:#0a7d33}
.muted{color:#777;font-size:13px;text-align:center;margin-top:18px}
.wabtn{display:inline-block;margin-top:18px;padding:16px 28px;background:#25D366;color:#fff;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px}
.reuse{margin:-2px 0 10px}
.reuse a{display:inline-block;background:#eafaf0;color:#0a7d33;border:1px solid #bce6cb;border-radius:22px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer}
.reuse a.on{background:#25D366;color:#fff;border-color:#25D366}
.locbtn{width:100%;padding:20px;border:0;background:#25D366;color:#fff;border-radius:16px;font-size:19px;font-weight:800;box-shadow:0 5px 16px rgba(37,211,102,.38)}
.intro{font-size:14px;color:#666;margin:0 0 16px}
.or{text-align:center;color:#aaa;font-size:13px;margin:12px 0 10px}
.step{font-size:16px;font-weight:800;color:#111;margin:22px 0 10px}
.step:first-child{margin-top:8px}
.reveal{animation:fade .35s ease}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style></head><body><div class="wrap" id="app">
<h2>📦 Book your delivery</h2>
<p class="intro">Just a few taps — we'll show your price and book your rider 🛵</p>

<div id="step-pickup">
  <div class="step">1 · Where are you sending FROM? 📍</div>
  <button type="button" id="loc" class="locbtn">📍 Use my current location</button>
  <div class="or">— or type the area —</div>
  <div class="fld"><input id="pin" placeholder="e.g. Woji, Chicken Republic" autocomplete="off"><div class="sug" id="psug" style="display:none"></div></div>
  <div class="reuse" id="rpickup"></div>
</div>

<div id="map" style="display:none"></div>

<div id="step-drop" style="display:none">
  <div class="step">2 · Where is it going TO? 🏁</div>
  <div class="fld"><input id="din" placeholder="e.g. GRA, Forces Avenue" autocomplete="off"><div class="sug" id="dsug" style="display:none"></div></div>
  <div class="reuse" id="rdrop"></div>
</div>

<div class="feebig" id="fee"></div>

<div id="step-details" style="display:none">
  <div class="step">3 · Who's it for? 📦</div>
  <div class="fld"><label>Sender's name</label><input id="sname" placeholder="Who's sending it"></div>
  <div class="fld"><label>Sender's phone</label><input id="sphone" type="tel" inputmode="tel" placeholder="0801…"></div>
  <div class="reuse" id="rrecv"></div>
  <div class="fld"><label>Receiver's name</label><input id="rname" placeholder="Who's receiving it"></div>
  <div class="fld"><label>Receiver's phone</label><input id="rphone" type="tel" inputmode="tel" placeholder="0801…"></div>
  <div class="fld"><label>What are you sending?</label><input id="item" placeholder="e.g. documents, a phone, food"></div>
  <button id="go" disabled>Confirm &amp; book 🛵</button>
</div>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/mapPicker";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
var picked={pickup:null,dropoff:null};
var map,mP,mD;
function initMap(){map=L.map('map').setView([4.82,7.03],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);}
// Reveal the next step only when the previous one is done — one simple thing at a time.
function reveal(id){var e=document.getElementById(id);if(e&&e.style.display==='none'){e.style.display='';e.className=(e.className?e.className+' ':'')+'reveal';if(id==='map'&&map){setTimeout(function(){map.invalidateSize();var pts=[];if(picked.pickup)pts.push([picked.pickup.lat,picked.pickup.lng]);if(picked.dropoff)pts.push([picked.dropoff.lat,picked.dropoff.lng]);if(pts.length)map.fitBounds(pts,{padding:[40,40],maxZoom:15});},60);}}}
function step(){if(picked.pickup){reveal('map');reveal('step-drop');}if(picked.pickup&&picked.dropoff){reveal('step-details');}}
function setPin(which,d){
  var ll=[d.lat,d.lng];
  var old=which==='pickup'?mP:mD; if(old)map.removeLayer(old);
  var m=L.marker(ll,{draggable:true}).addTo(map).bindPopup(which==='pickup'?'Pickup — drag to adjust':'Drop-off — drag to adjust');
  m.on('dragend',function(e){var p=e.target.getLatLng();reverseSet(which,p.lat,p.lng);});
  if(which==='pickup')mP=m;else mD=m;
  picked[which]={address:d.address,lat:d.lat,lng:d.lng};
  step();
  var pts=[]; if(picked.pickup)pts.push([picked.pickup.lat,picked.pickup.lng]); if(picked.dropoff)pts.push([picked.dropoff.lat,picked.dropoff.lng]);
  if(pts.length)map.fitBounds(pts,{padding:[40,40],maxZoom:15});
  validate();
  if(picked.pickup&&picked.dropoff)quote();
}
// Reverse-geocode a moved/located pin and update the field.
function reverseSet(which,lat,lng){
  picked[which]={address:(which==='pickup'?'Pickup point':'Drop-off point'),lat:lat,lng:lng};
  validate(); if(picked.pickup&&picked.dropoff)quote();
  fetch(api('action=reverse&lat='+lat+'&lng='+lng)).then(function(r){return r.json();}).then(function(d){
    var addr=d.address||picked[which].address;
    document.getElementById(which==='pickup'?'pin':'din').value=addr;
    picked[which].address=addr;
  }).catch(function(){});
}
// Get the customer's current GPS location and set it as the pickup.
function useLoc(){
  var btn=document.getElementById('loc');
  if(!navigator.geolocation){ alert('Location is not available here — please type your area.'); return; }
  btn.textContent='Locating you…'; btn.disabled=true;
  navigator.geolocation.getCurrentPosition(function(pos){
    btn.textContent='📍 Use my current location'; btn.disabled=false;
    var lat=pos.coords.latitude, lng=pos.coords.longitude;
    map.setView([lat,lng],16);
    document.getElementById('pin').value='Pinpointing…';
    setPin('pickup',{address:'My current location',lat:lat,lng:lng});
    reverseSet('pickup',lat,lng);
  }, function(){
    btn.textContent='📍 Use my current location'; btn.disabled=false;
    alert('Couldn\\'t get your location — please allow location access, or just type your area.');
  }, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
function val(id){return (document.getElementById(id).value||'').trim();}
function validate(){
  var ok = picked.pickup&&picked.dropoff&&val('sname')&&val('sphone').length>=7&&val('rname')&&val('rphone').length>=7&&val('item');
  document.getElementById('go').disabled=!ok;
}
// Decode a Google-encoded polyline into [lat,lng] points (so we can draw the route, Bolt-style).
function decodePoly(str){ var i=0,lat=0,lng=0,c=[]; while(i<str.length){ var b,sh=0,res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lat+=((res&1)?~(res>>1):(res>>1)); sh=0;res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lng+=((res&1)?~(res>>1):(res>>1)); c.push([lat/1e5,lng/1e5]); } return c; }
var routeLine=null;
function drawRoute(enc){ try{ var pts=decodePoly(enc); if(!pts.length)return; if(routeLine)map.removeLayer(routeLine); routeLine=L.polyline(pts,{color:'#25D366',weight:5,opacity:.85,lineJoin:'round'}).addTo(map); map.fitBounds(routeLine.getBounds(),{padding:[50,50],maxZoom:15}); }catch(e){} }
function quote(){
  var f=document.getElementById('fee'); f.style.display='block'; f.textContent='Calculating fee…';
  fetch(api('action=price&plat='+picked.pickup.lat+'&plng='+picked.pickup.lng+'&dlat='+picked.dropoff.lat+'&dlng='+picked.dropoff.lng))
   .then(r=>r.json()).then(j=>{
     if(j.price){ f.style.display='block'; f.innerHTML='₦'+j.price.toLocaleString()+(j.km?('<small>Delivery fee • ~'+j.km+'km</small>'):'<small>Delivery fee</small>'); }
     else { f.style.display='none'; }
     if(j.polyline) drawRoute(j.polyline);  // draw the actual road path pickup → drop-off
   }).catch(function(){ f.style.display='none'; });
}
function wire(inId,sugId,which){
  var inp=document.getElementById(inId), sug=document.getElementById(sugId), t;
  inp.addEventListener('input',function(){
    clearTimeout(t); var q=inp.value.trim(); if(q.length<2){sug.style.display='none';return;}
    t=setTimeout(function(){
      fetch(api('action=autocomplete&q='+encodeURIComponent(q))).then(r=>r.json()).then(j=>{
        sug.innerHTML=''; (j.predictions||[]).forEach(function(p){
          var div=document.createElement('div'); div.textContent=p.label;
          div.onclick=function(){ inp.value=p.label; sug.style.display='none';
            fetch(api('action=resolve&place_id='+encodeURIComponent(p.id))).then(r=>r.json()).then(d=>{ if(d.lat)setPin(which,{address:p.label,lat:d.lat,lng:d.lng}); }); };
          sug.appendChild(div); });
        sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';
      });
    },300);
  });
}
if(VALID!=='1'){ document.getElementById('app').innerHTML='<div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for the price again.</p></div>'; }
else { initMap(); wire('pin','psug','pickup'); wire('din','dsug','dropoff');
  document.getElementById('loc').onclick=useLoc;
  ['sname','sphone','rname','rphone','item'].forEach(function(id){ document.getElementById(id).addEventListener('input',validate); });
  // One-tap reuse for returning customers ("same as last time").
  function reuse(id,label,fn){ var d=document.getElementById(id); var a=document.createElement('a'); a.textContent=label; a.onclick=function(){ fn(); a.className='on'; validate(); }; d.appendChild(a); }
  fetch(api('action=prefill')).then(function(r){return r.json();}).then(function(p){
    if(!p) return;
    if(p.name) document.getElementById('sname').value=p.name;
    if(p.phone) document.getElementById('sphone').value=p.phone;
    if(p.item) document.getElementById('item').value=p.item;
    // Pickup: if they already said it this chat → auto-fill + pin; else offer last one as a chip.
    if(p.pickup){ if(p.pickup.from_chat){ document.getElementById('pin').value=p.pickup.address; if(p.pickup.lat) setPin('pickup',p.pickup); }
      else if(p.pickup.lat){ reuse('rpickup','↩ Same pickup — '+p.pickup.address,function(){ document.getElementById('pin').value=p.pickup.address; setPin('pickup',p.pickup); }); } }
    // Drop-off: same — "how much to Woji" lands Woji here automatically.
    if(p.dropoff){ if(p.dropoff.from_chat){ document.getElementById('din').value=p.dropoff.address; if(p.dropoff.lat) setPin('dropoff',p.dropoff); }
      else if(p.dropoff.lat){ reuse('rdrop','↩ Same drop-off — '+p.dropoff.address,function(){ document.getElementById('din').value=p.dropoff.address; setPin('dropoff',p.dropoff); }); } }
    if(p.receiver&&p.receiver.name){ if(p.receiver.from_chat){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; }
      else { reuse('rrecv','↩ Same receiver — '+p.receiver.name,function(){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; }); } }
    validate(); step();
  }).catch(function(){});
  document.getElementById('go').onclick=function(){
    var b=document.getElementById('go'); b.disabled=true; b.textContent='Booking…';
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      session:SESSION,pickup:picked.pickup,dropoff:picked.dropoff,
      sender_name:val('sname'),sender_phone:val('sphone'),receiver_name:val('rname'),receiver_phone:val('rphone'),item:val('item')
    })})
     .then(r=>r.json()).then(j=>{
       document.getElementById('app').innerHTML='<div class="done"><h2>✅ All set!</h2><p class="muted">Your order &amp; price are waiting in your WhatsApp chat.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
     }).catch(function(){ b.disabled=false; b.textContent='Confirm & book'; alert('Network hiccup — try again.'); });
  };
}
</script></body></html>`;
app.get('/map', (req, res) => { res.type('html').send(MAP_PAGE); });

// ── International / Waybill quote calculator (the INTL/WAYBILL twin of the map) ──
// Pricing is recomputed server-side by the Supabase quotePicker function (intlPricing).
const QUOTE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Get your shipping quote — Lasalu Drop</title>
<meta name="description" content="Pick destination, weight & value for an instant international or waybill price, and book in seconds.">
<meta property="og:title" content="🌍 Get your shipping quote — Lasalu Drop">
<meta property="og:description" content="Instant international & interstate prices — pick destination, weight & value, then book 📦">
<meta property="og:type" content="website">
<meta name="theme-color" content="#E23A7C">
<style>
*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
body{margin:0;background:#f4f6f8;color:#111}
.wrap{max-width:520px;margin:0 auto;padding:14px}
h2{margin:6px 0 4px;font-size:19px}
.intro{font-size:13px;color:#666;margin:0 0 14px}
.fld{margin-bottom:11px;position:relative}
.fld label{font-size:12px;color:#555;display:block;margin-bottom:4px}
.fld input,.fld select{width:100%;padding:12px;border:1px solid #d6dbe0;border-radius:10px;font-size:15px;outline:none;background:#fff;-webkit-appearance:none}
.fld input:focus,.fld select:focus{border-color:#E23A7C;box-shadow:0 0 0 3px rgba(226,58,124,.15)}
.sug{position:absolute;z-index:50;left:0;right:0;background:#fff;border:1px solid #e2e6ea;border-radius:10px;margin-top:4px;box-shadow:0 6px 18px rgba(0,0,0,.1);overflow:hidden}
.sug div{padding:11px 12px;font-size:14px;border-bottom:1px solid #f0f2f4;cursor:pointer}
.sug div:active,.sug div:hover{background:#fcebf2}
.two{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.feebig{font-size:21px;font-weight:800;text-align:center;color:#a01457;background:#fcebf2;border:1px solid #f3c4da;border-radius:12px;padding:13px;margin:12px 0;display:none}
.feebig small{display:block;font-size:12px;font-weight:600;color:#b56b8c;margin-top:2px}
.sec{font-size:12px;color:#8a9099;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin:18px 0 8px}
button{width:100%;padding:14px;border:0;border-radius:12px;background:#E23A7C;color:#fff;font-size:16px;font-weight:700}
button:disabled{background:#f0a9c8}
.done{text-align:center;padding:30px 14px}.done h2{font-size:20px;color:#a01457}
.muted{color:#777;font-size:13px;text-align:center}
.wabtn{display:inline-block;margin-top:18px;padding:15px 26px;background:#25D366;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px}
.err{color:#c0392b;font-size:13px;text-align:center;min-height:16px}
</style></head><body><div class="wrap" id="app">
<h2>🌍 Get your shipping quote</h2>
<p class="intro">Pick the service, destination, weight &amp; value for an instant price — then book.</p>
<div class="fld"><label>Service</label><select id="svc">
<option value="express">✈️ Air Express — worldwide, 3–7 days</option>
<option value="cargo">📦 Air Cargo — UK/USA/Canada/Ghana, 10kg+</option>
<option value="waybill">🚚 Waybill — interstate Nigeria</option>
</select></div>
<div class="fld" id="countryFld"><label>Destination country</label>
<input id="country" list="countries" placeholder="Start typing… e.g. United Kingdom" autocomplete="off"></div>
<datalist id="countries">
<option value="UNITED KINGDOM (Z1)"><option value="IRELAND REP OF (Z1)"><option value="GUERNSEY (Z1)"><option value="JERSEY (Z1)">
<option value="GHANA (Z2)"><option value="BENIN (Z2)"><option value="CAMEROON (Z2)"><option value="COTE D IVOIRE (Z2)"><option value="GABON (Z2)"><option value="GAMBIA (Z2)"><option value="GUINEA REP. (Z2)">
<option value="USA (Z3)"><option value="CANADA (Z3)"><option value="MEXICO (Z3)">
<option value="GERMANY (Z4)"><option value="FRANCE (Z4)"><option value="ITALY (Z4)"><option value="SPAIN (Z4)"><option value="NETHERLANDS (Z4)"><option value="BELGIUM (Z4)"><option value="SWITZERLAND (Z4)"><option value="SWEDEN (Z4)"><option value="NORWAY (Z4)"><option value="DENMARK (Z4)"><option value="POLAND (Z4)"><option value="PORTUGAL (Z4)"><option value="AUSTRIA (Z4)"><option value="GREECE (Z4)"><option value="TURKEY (Z4)"><option value="FINLAND (Z4)"><option value="CZECH REPUBLIC (Z4)"><option value="ROMANIA (Z4)"><option value="HUNGARY (Z4)"><option value="RUSSIA (Z4)">
<option value="SOUTH AFRICA (Z5)"><option value="EGYPT (Z5)"><option value="KENYA (Z5)"><option value="MOROCCO (Z5)"><option value="TANZANIA (Z5)"><option value="UGANDA (Z5)"><option value="RWANDA (Z5)"><option value="ETHIOPIA (Z5)"><option value="ZAMBIA (Z5)"><option value="ZIMBABWE (Z5)"><option value="NAMIBIA (Z5)"><option value="BOTSWANA (Z5)"><option value="ANGOLA (Z5)">
<option value="UNITED ARAB EMIRATES (Z6)"><option value="SAUDI ARABIA (Z6)"><option value="QATAR (Z6)"><option value="KUWAIT (Z6)"><option value="OMAN (Z6)"><option value="BAHRAIN (Z6)"><option value="ISRAEL (Z6)"><option value="LEBANON (Z6)"><option value="JORDAN (Z6)">
<option value="CHINA (Z7)"><option value="INDIA (Z7)"><option value="JAPAN (Z7)"><option value="SINGAPORE (Z7)"><option value="MALAYSIA (Z7)"><option value="HONG KONG (Z7)"><option value="AUSTRALIA (Z7)"><option value="PHILIPPINES (Z7)"><option value="THAILAND (Z7)"><option value="INDONESIA (Z7)"><option value="VIETNAM (Z7)"><option value="PAKISTAN (Z7)"><option value="BANGLADESH (Z7)"><option value="TAIWAN (Z7)">
<option value="BRAZIL (Z8)"><option value="ARGENTINA (Z8)"><option value="CHILE (Z8)"><option value="COLOMBIA (Z8)"><option value="PERU (Z8)"><option value="JAMAICA (Z8)"><option value="NEW ZEALAND (Z8)"><option value="PANAMA (Z8)"><option value="VENEZUELA (Z8)">
</datalist>
<div class="fld" id="stateFld" style="display:none"><label>Destination state</label>
<select id="state"><option value="">— Select a state —</option><option value="LAGOS">Lagos</option></select></div>
<div class="two"><div class="fld"><label>Weight (kg)</label><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="2"></div>
<div class="fld"><label>Item value (₦) <span style="color:#E23A7C">*</span></label><input id="value" type="number" min="1" inputmode="numeric" placeholder="What is it worth?" required></div></div>
<div class="feebig" id="fee"></div>
<div class="err" id="err"></div>
<div class="sec">Delivery details</div>
<div class="fld"><label>Sender's name</label><input id="sname" placeholder="Who's sending it"></div>
<div class="fld"><label>Your phone <span style="color:#E23A7C">*</span></label><input id="sphone" type="tel" inputmode="tel" placeholder="So our rider can reach you"></div>
<div class="fld"><label>Pickup address — where our rider picks up <span style="color:#E23A7C">*</span></label><input id="paddr" placeholder="Start typing your address…" autocomplete="off"><div class="sug" id="psug" style="display:none"></div></div>
<div class="fld"><label>Receiver's name</label><input id="rname" placeholder="Who's receiving it"></div>
<div class="fld"><label>Receiver's phone</label><input id="rphone" type="tel" inputmode="tel" placeholder="Their number"></div>
<div class="fld"><label>Delivery address</label><input id="daddr" placeholder="Start typing the address abroad…" autocomplete="off"><div class="sug" id="dsug" style="display:none"></div></div>
<div class="fld"><label>What are you sending?</label><input id="item" placeholder="e.g. documents, clothes, a phone"></div>
<button id="go" disabled>Confirm &amp; book</button>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker";
var lastPrice=null, t;
function el(id){return document.getElementById(id);}
function svc(){return el('svc').value;}
function val(id){return (el(id).value||'').trim();}
function dest(){return svc()==='waybill'?val('state'):val('country');}
function pickupCity(){return /owerri|\bimo\b/i.test(val('paddr'))?'OWERRI':'PORT_HARCOURT';}
function wireAuto(inId,sugId,region){
  var inp=el(inId),sug=el(sugId),tt;
  inp.addEventListener('input',function(){
    clearTimeout(tt);var q=inp.value.trim();if(q.length<2){sug.style.display='none';return;}
    tt=setTimeout(function(){
      fetch(API+'?action=autocomplete&session='+encodeURIComponent(SESSION)+'&q='+encodeURIComponent(q)+(region?'&region='+region:'')).then(function(r){return r.json();}).then(function(j){
        sug.innerHTML='';(j.predictions||[]).forEach(function(p){
          var dv=document.createElement('div');dv.textContent=p.label;
          dv.onclick=function(){inp.value=p.label;sug.style.display='none';validate();if(region==='ng')recalc();};
          sug.appendChild(dv);
        });
        sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';
      }).catch(function(){sug.style.display='none';});
    },300);
  });
  inp.addEventListener('blur',function(){setTimeout(function(){sug.style.display='none';},200);});
}
function snapWeight(){var w=parseFloat(el('weight').value);if(!isNaN(w)&&w>0)el('weight').value=(Math.ceil(w*2)/2).toFixed(1);}
function toggleSvc(){
  var wb=svc()==='waybill';
  el('countryFld').style.display=wb?'none':'block';
  el('stateFld').style.display=wb?'block':'none';
  recalc();validate();
}
function recalc(){
  lastPrice=null;el('fee').style.display='none';el('err').textContent='';
  var d=dest(),w=parseFloat(el('weight').value),v=parseFloat(el('value').value);
  if(!d||isNaN(w)||w<=0){validate();return;}
  if(isNaN(v)||v<=0){el('err').textContent='Please enter the item\\'s value to see the price.';validate();return;}
  el('fee').style.display='block';el('fee').textContent='Calculating…';
  var qs='action=price&session='+encodeURIComponent(SESSION)+'&mode='+svc()+'&destination='+encodeURIComponent(d)+'&weight='+w+'&value='+v+'&pickup_city='+pickupCity();
  fetch(API+'?'+qs).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;el('fee').style.display='block';el('fee').innerHTML=(j.ship_mode?'~₦':'₦')+Number(j.price).toLocaleString()+'<small>'+(j.ship_mode==='cargo'?'Air Cargo':j.ship_mode==='express'?'Air Express':'Waybill')+(j.ship_mode?' • estimate':'')+(j.etd?(' • delivery '+j.etd):'')+'</small>';}
    else{el('fee').style.display='none';
      if(j&&j.error==='cargo_min_weight')el('err').textContent='Air Cargo needs 10kg or more — try Express for lighter parcels.';
      else if(j&&j.error==='cargo_unavailable')el('err').textContent='Air Cargo is UK, USA, Canada & Ghana only — use Express here.';
      else if(j&&j.error==='unknown_country')el('err').textContent='Pick a destination from the list.';
      else if(j&&j.error==='unknown_state')el('err').textContent='We currently run waybill to Lagos only.';
    }
    validate();
  }).catch(function(){el('fee').style.display='none';validate();});
}
function validate(){
  var ok=lastPrice&&val('sname')&&val('sphone').length>=7&&val('paddr')&&val('rname')&&val('rphone').length>=7&&val('daddr')&&val('item');
  el('go').disabled=!ok;
}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:svc(),destination:dest(),weight:parseFloat(el('weight').value),value:parseFloat(el('value').value)||0,pickup_city:pickupCity(),
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:val('daddr'),item:val('item')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){el('app').innerHTML='<div class="done"><h2>✅ All set!</h2><p class="muted">Your order &amp; price are waiting in your WhatsApp chat.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';}
    else{b.disabled=false;b.textContent='Confirm & book';el('err').textContent=(j&&j.error)?('Couldn\\'t book: '+j.error):'Something went wrong — try again.';}
  }).catch(function(){b.disabled=false;b.textContent='Confirm & book';alert('Network hiccup — try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a quote again.</p></div>';}
else{
  el('svc').addEventListener('change',toggleSvc);
  el('weight').addEventListener('input',function(){snapWeight();recalc();});
  ['country','value'].forEach(function(id){el(id).addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,350);});});
  el('state').addEventListener('change',recalc);
  ['sname','sphone','paddr','rname','rphone','daddr','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  wireAuto('paddr','psug','ng');wireAuto('daddr','dsug','');
  el('go').onclick=book;
}
</script></body></html>`;
app.get('/quote', (req, res) => { res.type('html').send(QUOTE_PAGE); });

// Status
app.get('/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

// QR
app.get('/qr', (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'already_connected', phone: connectedPhone });
  }
  if (!currentQR) {
    return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
  }
  res.json({ status: 'qr_ready', qr: currentQR });
});

// Connect
app.post('/connect', async (req, res) => {
  try {
    if (connectionStatus === 'connected') {
      return res.json({ status: 'ok', connection: connectionStatus, phone: connectedPhone });
    }
    if (!isConnecting) {
      connectWhatsApp();
    }
    res.json({ status: 'ok', connection: 'connecting', message: 'Connection started, poll /status for QR' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Base44 compatibility
app.post('/session/start', async (req, res) => {
  try {
    if (connectionStatus === 'connected') {
      return res.json({ status: 'ok', connection: connectionStatus, phone: connectedPhone });
    }
    if (!isConnecting) {
      connectWhatsApp();
    }
    res.json({ status: 'ok', connection: 'connecting', message: 'Connection started, poll /status for QR' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/session/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

app.get('/session/qr', (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'already_connected', phone: connectedPhone });
  }
  if (!currentQR) {
    return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
  }
  res.json({ status: 'qr_ready', qr: currentQR });
});

app.post('/session/disconnect', async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch {}
    }
    sock = null;
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    isConnecting = false;
    res.json({ status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Session clear
app.post('/session/clear', async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch {}
    }
    sock = null;
    isConnecting = false;
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    await clearSupabaseAuth();
    setTimeout(connectWhatsApp, 2000);
    res.json({ status: 'cleared', message: 'Auth cleared, reconnecting fresh...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Typing indicator — sends "composing" presence then clears it after duration
app.post('/typing', async (req, res) => {
  try {
    const { phone, duration = 3 } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
    // WhatsApp only shows "typing…" if we subscribe to the contact's presence and
    // appear online first — otherwise the composing update is silently dropped.
    try { await sock.presenceSubscribe(jid); } catch {}
    try { await sock.sendPresenceUpdate('available'); } catch {}
    await new Promise(r => setTimeout(r, 300));
    await sock.sendPresenceUpdate('composing', jid);
    // Clear after the specified duration
    setTimeout(async () => {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    }, duration * 1000);
    res.json({ status: 'typing_started', duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message
app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send interactive list message (location picker)
// body: { phone, title, body_text, button_text, sections: [{ title, rows: [{ id, title, description }] }], footer? }
app.post('/send-list', async (req, res) => {
  try {
    const { phone, title, body_text, button_text, sections, footer } = req.body;
    if (!phone || !sections) return res.status(400).json({ error: 'phone and sections required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
    await sock.sendMessage(jid, {
      listMessage: {
        title: title || 'Select an option',
        text: body_text || 'Please choose one:',
        footerText: footer || '',
        buttonText: button_text || 'View Options',
        sections
      }
    });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('send-list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Settings
app.post('/settings', (req, res) => {
  const { ai_enabled, ai_reply_cap, ai_delay_seconds, sales_prompt } = req.body;
  if (ai_enabled !== undefined) settings.ai_enabled = ai_enabled;
  if (ai_reply_cap !== undefined) settings.ai_reply_cap = ai_reply_cap;
  if (ai_delay_seconds !== undefined) settings.ai_delay_seconds = ai_delay_seconds;
  if (sales_prompt) settings.sales_prompt = sales_prompt;
  res.json({ status: 'saved', settings });
});

app.get('/settings', (req, res) => {
  res.json(settings);
});

// Test AI
app.post('/test-ai', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const reply = await getAIReply(message, 'test');
  res.json({ reply });
});

app.listen(PORT, async () => {
  console.log('LDL Baileys Service running on port', PORT);
  console.log('GROQ_API_KEY:', GROQ_API_KEY ? 'SET' : 'NOT SET');
  console.log('WEBHOOK_SECRET:', WEBHOOK_SECRET ? 'SET' : 'NOT SET');
  console.log('SUPABASE_FUNCTIONS_URL:', SUPABASE_FUNCTIONS_URL || 'NOT SET');
  console.log('Auto-starting WhatsApp connection...');
  setTimeout(connectWhatsApp, 3000);
});
