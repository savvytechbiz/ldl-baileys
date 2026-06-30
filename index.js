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
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif}
html,body{height:100%}
body{margin:0;background:#fff;color:#0e1726;-webkit-font-smoothing:antialiased}
.wrap{max-width:480px;margin:0 auto;background:#fff;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.maphero{position:relative;flex:1 1 auto;min-height:230px}
#map{position:absolute;top:0;left:0;right:0;bottom:0}
.leaflet-container{z-index:1}
.etabadge{position:absolute;top:14px;right:14px;z-index:1000;background:#fff;border-radius:14px;padding:9px 13px;box-shadow:0 4px 16px rgba(14,23,38,.18);font-size:14px;font-weight:700;color:#0e1726;display:flex;align-items:center;gap:6px}
.etabadge .d{color:#6b7280;font-weight:600;font-size:12.5px}
.riderchip{position:absolute;top:14px;left:14px;z-index:1000;background:#fff;border-radius:14px;padding:8px 12px;box-shadow:0 4px 16px rgba(14,23,38,.18);font-size:13px;font-weight:700;color:#0a7d33;display:none;align-items:center;gap:6px}
.sheet{position:relative;z-index:2;flex:0 0 auto;margin-top:-22px;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -10px 30px rgba(14,23,38,.07);padding:16px 16px 18px}
h2{margin:2px 2px 18px;font-size:23px;font-weight:700;letter-spacing:-.02em}
.route{display:flex;gap:11px;align-items:center;background:#f5f6f8;border-radius:16px;padding:0 12px 0 15px}
.rail{display:flex;flex-direction:column;align-items:center;padding:17px 0}
.locp{width:38px;min-width:38px;height:38px;padding:0;border:0;background:transparent;font-size:18px;color:#25D366;cursor:pointer}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.lbl2{font-size:12.5px;color:#6b7280;font-weight:700;margin:13px 2px 6px}
.lbl2 .hint{font-weight:500;color:#9aa0a6}
.row2 input,.f1{width:100%;padding:13px 15px;border:1px solid #e6e9ed;background:#fff;border-radius:13px;font-size:15.5px;outline:none}
.f1{margin-top:11px}
.row2 input:focus,.f1:focus{border-color:#25D366}
.rail .dot{width:11px;height:11px;border-radius:50%;background:#25D366;box-shadow:0 0 0 4px rgba(37,211,102,.16)}
.rail .line{flex:1;width:2px;background:#d7dbe0;margin:5px 0;min-height:20px}
.rail .sq{width:11px;height:11px;border-radius:3px;background:#0e1726}
.ins{flex:1;min-width:0}
.ri{position:relative;display:flex;align-items:center}
.ri input{flex:1;min-width:0;border:0;background:transparent;padding:14px 0;font-size:16px;outline:none;color:#0e1726;font-weight:500}
.ri input::placeholder{color:#9aa0a6;font-weight:400}
.divln{height:1px;background:#e6e9ed}
.sug{position:absolute;z-index:2000;top:100%;left:-16px;right:-16px;background:#fff;border:1px solid #edeff2;border-radius:16px;margin-top:4px;box-shadow:0 16px 40px rgba(14,23,38,.12);overflow:hidden;max-height:220px;overflow-y:auto}
.clr{width:30px;min-width:30px;height:30px;padding:0;border:0;background:transparent;color:#aeb4bb;font-size:15px;cursor:pointer;display:none}
.sug div{padding:15px 16px;font-size:15px;border-bottom:1px solid #f2f4f6}
.sug div:active{background:#f5f7f9}
.ghost{width:100%;margin:14px 0 2px;padding:15px;border:1px solid #e6e9ed;background:#fff;color:#0e1726;border-radius:14px;font-size:15px;font-weight:600}
.reuse a{display:inline-block;background:#eef6f1;color:#0e6b39;border:1px solid #d6e7dd;border-radius:20px;padding:9px 15px;font-size:13.5px;font-weight:600;cursor:pointer;margin-top:9px;margin-right:6px}
.reuse a.on{background:#25D366;color:#fff;border-color:#25D366}
.feebig{display:none;align-items:center;justify-content:space-between;border:1px solid #e6e9ed;border-radius:14px;padding:13px 16px;margin:12px 0 0}
.feebig .lbl{font-size:13.5px;color:#6b7280;font-weight:600}
.feebig .sub{font-size:12.5px;color:#9aa0a6;margin-top:2px}
.feebig .amt{font-size:22px;font-weight:800;color:#0e1726;letter-spacing:-.01em}
.sec{font-size:14px;font-weight:700;color:#0e1726;margin:24px 0 12px;letter-spacing:-.01em}
.fld{margin-bottom:12px}
.fld label{font-size:12.5px;color:#6b7280;display:block;margin-bottom:6px;font-weight:600}
.fld input{width:100%;padding:15px 16px;border:1px solid #e6e9ed;background:#fff;border-radius:14px;font-size:16px;outline:none}
.fld input:focus,.ri input:focus{border-color:#25D366}
.fld input:focus{box-shadow:0 0 0 3px rgba(37,211,102,.12)}
button{width:100%;padding:17px;border:0;border-radius:16px;background:#25D366;color:#fff;font-size:17px;font-weight:800;-webkit-appearance:none}
button:disabled{background:#cfe9d8}
#go{margin-top:10px}
.done{text-align:center;padding:46px 22px}.done h2{font-size:22px;color:#0a7d33}
.muted{color:#9aa0a6;font-size:12.5px;text-align:center;margin-top:22px}
.wabtn{display:inline-block;margin-top:18px;padding:16px 28px;background:#25D366;color:#fff;border-radius:16px;text-decoration:none;font-weight:700;font-size:17px}
.reveal{animation:fade .35s ease}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body><div class="wrap" id="app">
<div class="maphero"><div id="map"></div><div id="riderchip" class="riderchip"></div><div id="eta" class="etabadge" style="display:none"></div></div>
<div class="sheet">
<div class="route">
  <div class="rail"><span class="dot"></span><span class="line"></span><span class="sq"></span></div>
  <div class="ins">
    <div class="ri"><input id="pin" placeholder="Pickup" autocomplete="off"><button type="button" class="clr" data-clr="pickup" aria-label="Clear pickup">✕</button><button type="button" class="locp" data-for="pickup" aria-label="Use my location for pickup">📍</button><div class="sug" id="psug" style="display:none"></div></div>
    <div class="divln"></div>
    <div class="ri"><input id="din" placeholder="Drop-off" autocomplete="off"><button type="button" class="clr" data-clr="dropoff" aria-label="Clear drop-off">✕</button><button type="button" class="locp" data-for="dropoff" aria-label="Use my location for drop-off">📍</button><div class="sug" id="dsug" style="display:none"></div></div>
  </div>
</div>
<div class="reuse" id="rpickup"></div>
<div class="reuse" id="rdrop"></div>
<div class="lbl2">Sender <span class="hint">— defaults to you, edit if it's someone else</span></div>
<div class="row2"><input id="sname" placeholder="Sender's name"><input id="sphone" type="tel" inputmode="tel" placeholder="Sender's phone"></div>
<div class="lbl2">Receiver</div>
<div class="row2"><input id="rname" placeholder="Receiver's name"><input id="rphone" type="tel" inputmode="tel" placeholder="Receiver's phone"></div>
<div class="reuse" id="rrecv"></div>
<input id="item" class="f1" placeholder="What are you sending? (e.g. food, documents)">
<div class="feebig" id="fee"></div>
<button id="go" disabled>Confirm &amp; book</button>
</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/mapPicker";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
var picked={pickup:null,dropoff:null};
var map,mP,mD;
function initMap(){
  map=L.map('map',{zoomControl:false,attributionControl:false}).setView([4.82,7.03],12);
  // Clean, modern basemap (CARTO Voyager) — soft tones, minimal clutter, sharp on retina phones.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,detectRetina:true,attribution:'© OpenStreetMap © CARTO'}).addTo(map);
  L.control.attribution({position:'bottomright',prefix:false}).addTo(map);
  setTimeout(function(){ map.invalidateSize(); },250);
}
// Clean ride-app markers: a green dot for pickup, a dark rounded square for drop-off.
function pinIcon(which){
  var c = which==='pickup'
    ? '<div style="width:18px;height:18px;border-radius:50%;background:#25D366;border:3px solid #fff;box-shadow:0 2px 6px rgba(14,23,38,.4)"></div>'
    : '<div style="width:18px;height:18px;border-radius:5px;background:#0e1726;border:3px solid #fff;box-shadow:0 2px 6px rgba(14,23,38,.4)"></div>';
  return L.divIcon({className:'',iconSize:[24,24],iconAnchor:[12,12],html:c});
}
// Real on-shift rider dots (anonymous + privacy-fuzzed by the server). Refreshes every ~25s so the
// dots drift roughly with the riders — like Bolt/inDrive, but honest (no fake bikes, no ETA promises).
var riderDots=[];
function bikeIcon(){return L.divIcon({className:'',iconSize:[34,34],iconAnchor:[17,17],html:'<div style="width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 3px 11px rgba(14,23,38,.3);border:1px solid rgba(14,23,38,.06);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="#0e1726" aria-hidden="true"><path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.79-2.21-5-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.63 0-3-1.37-3-3s1.37-3 3-3 3 1.37 3 3-1.37 3-3 3z"/></svg></div>'});}
function loadRiders(){
  fetch(api('action=riders')).then(function(r){return r.json();}).then(function(j){
    var rs=(j&&j.riders)||[];
    riderDots.forEach(function(m){map.removeLayer(m);});riderDots=[];
    rs.forEach(function(p){riderDots.push(L.marker([p.lat,p.lng],{icon:bikeIcon(),interactive:false,zIndexOffset:-200,opacity:.9}).addTo(map));});
    var chip=document.getElementById('riderchip');
    if(chip){if(rs.length){chip.style.display='flex';chip.textContent='🟢 '+rs.length+' rider'+(rs.length>1?'s':'')+' nearby';}else{chip.style.display='none';}}
  }).catch(function(){});
}
// Reveal the next step only when the previous one is done — one simple thing at a time.
function reveal(id){var e=document.getElementById(id);if(e&&e.style.display==='none'){e.style.display='';e.className=(e.className?e.className+' ':'')+'reveal';}}
function step(){if(picked.pickup&&picked.dropoff)reveal('step-details');}
function setPin(which,d){
  var ll=[d.lat,d.lng];
  var old=which==='pickup'?mP:mD; if(old)map.removeLayer(old);
  var m=L.marker(ll,{draggable:true,icon:pinIcon(which)}).addTo(map).bindPopup(which==='pickup'?'Pickup — drag to adjust':'Drop-off — drag to adjust');
  m.on('dragend',function(e){var p=e.target.getLatLng();reverseSet(which,p.lat,p.lng);});
  if(which==='pickup')mP=m;else mD=m;
  picked[which]={address:d.address,lat:d.lat,lng:d.lng};
  showClr(which,true);
  step();
  var pts=[]; if(picked.pickup)pts.push([picked.pickup.lat,picked.pickup.lng]); if(picked.dropoff)pts.push([picked.dropoff.lat,picked.dropoff.lng]);
  if(pts.length)map.fitBounds(pts,{padding:[40,40],maxZoom:15});
  validate();
  if(picked.pickup&&picked.dropoff)quote();
}
// Reverse-geocode a moved/located pin and update the field.
function reverseSet(which,lat,lng){
  picked[which]={address:(which==='pickup'?'Pickup point':'Drop-off point'),lat:lat,lng:lng};
  var fld=document.getElementById(which==='pickup'?'pin':'din');
  fld.value='Getting address…';
  validate(); if(picked.pickup&&picked.dropoff)quote();
  fetch(api('action=reverse&lat='+lat+'&lng='+lng)).then(function(r){return r.json();}).then(function(d){
    var addr=(d&&d.address)?d.address:picked[which].address;
    fld.value=addr; picked[which].address=addr;   // show the REAL address, and save it for the order
  }).catch(function(){ fld.value=picked[which].address; });
}
// Show/hide the little ✕ clear button when a field has text.
function showClr(which,on){ var b=document.querySelector('.clr[data-clr="'+which+'"]'); if(b)b.style.display=on?'block':'none'; }
// Wipe one end so the customer can re-enter it cleanly (the ✕ button + when they retype).
function clearLoc(which){
  var inp=document.getElementById(which==='pickup'?'pin':'din'); inp.value='';
  var old=which==='pickup'?mP:mD; if(old)map.removeLayer(old); if(which==='pickup')mP=null;else mD=null;
  picked[which]=null;
  var sug=document.getElementById(which==='pickup'?'psug':'dsug'); if(sug)sug.style.display='none';
  if(routeLine){map.removeLayer(routeLine);routeLine=null;}
  var fe=document.getElementById('fee'); if(fe)fe.style.display='none';
  var et=document.getElementById('eta'); if(et)et.style.display='none';
  if(liveSide===which){ liveSide=null; lockOtherLoc(); }   // release the one-spot live-location lock
  showClr(which,false); validate(); inp.focus();
}
// The chatting customer's own name/number (from prefill) — placed on whichever side they locate.
var YOU_NAME='', YOU_PHONE='';
// Live location is ONE physical spot — only one end (pickup OR drop-off) can use it.
var liveSide=null;
function lockOtherLoc(){ Array.prototype.forEach.call(document.querySelectorAll('.locp'),function(b){ var f=b.getAttribute('data-for'); if(liveSide && f!==liveSide){ b.disabled=true; b.style.opacity='0.3'; b.title='Your live location is one spot — type the other end'; } else { b.disabled=false; b.style.opacity=''; b.title=''; } }); }
// Use the customer's GPS for EITHER the pickup or the drop-off. Pickup = they're sending (their
// details go to Sender); drop-off = they're receiving (their details go to Receiver).
function useLoc(which){
  which = which==='dropoff' ? 'dropoff' : 'pickup';
  var btns=document.querySelectorAll('.locp');
  if(!navigator.geolocation){ alert('Location is not available here — please type your area.'); return; }
  btns.forEach(function(b){b.textContent='…';b.disabled=true;});
  navigator.geolocation.getCurrentPosition(function(pos){
    btns.forEach(function(b){b.textContent='📍';b.disabled=false;});
    var lat=pos.coords.latitude, lng=pos.coords.longitude;
    map.setView([lat,lng],16);
    document.getElementById(which==='pickup'?'pin':'din').value='Pinpointing…';
    setPin(which,{address:'My current location',lat:lat,lng:lng});
    reverseSet(which,lat,lng);
    // Put the chatting customer's details on the side they just located.
    if(which==='dropoff'){
      if(YOU_NAME && !val('rname')) document.getElementById('rname').value=YOU_NAME;
      if(YOU_PHONE && !val('rphone')) document.getElementById('rphone').value=YOU_PHONE;
      // They're the RECEIVER, so the auto-filled "you" Sender details no longer apply — clear them.
      if(val('sname')===YOU_NAME) document.getElementById('sname').value='';
      if(YOU_PHONE && val('sphone')===YOU_PHONE) document.getElementById('sphone').value='';
    } else {
      if(YOU_NAME && !val('sname')) document.getElementById('sname').value=YOU_NAME;
      if(YOU_PHONE && !val('sphone')) document.getElementById('sphone').value=YOU_PHONE;
    }
    validate();
    liveSide=which; lockOtherLoc();   // your live location is one spot — lock the other end's 📍
  }, function(){
    btns.forEach(function(b){b.textContent='📍';b.disabled=false;});
    lockOtherLoc();
    alert('Couldn\\'t get your location — please allow location access, or just type your area.');
  }, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
function val(id){return (document.getElementById(id).value||'').trim();}
function validate(){
  var ok = picked.pickup&&picked.dropoff&&val('rname')&&val('rphone').length>=7&&val('item');
  document.getElementById('go').disabled=!ok;
}
// Decode a Google-encoded polyline into [lat,lng] points (so we can draw the route, Bolt-style).
function decodePoly(str){ var i=0,lat=0,lng=0,c=[]; while(i<str.length){ var b,sh=0,res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lat+=((res&1)?~(res>>1):(res>>1)); sh=0;res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lng+=((res&1)?~(res>>1):(res>>1)); c.push([lat/1e5,lng/1e5]); } return c; }
var routeLine=null;
function drawRoute(enc){ try{ var pts=decodePoly(enc); if(!pts.length)return; if(routeLine)map.removeLayer(routeLine); routeLine=L.polyline(pts,{color:'#25D366',weight:5,opacity:.85,lineJoin:'round'}).addTo(map); map.fitBounds(routeLine.getBounds(),{padding:[50,50],maxZoom:15}); }catch(e){} }
function quote(){
  var f=document.getElementById('fee'); f.style.display='flex'; f.innerHTML='<div class="lbl">Calculating fee…</div>';
  fetch(api('action=price&plat='+picked.pickup.lat+'&plng='+picked.pickup.lng+'&dlat='+picked.dropoff.lat+'&dlng='+picked.dropoff.lng))
   .then(r=>r.json()).then(j=>{
     var e=document.getElementById('eta');
     if(j.price){
       var sub=[]; if(j.min)sub.push('~'+j.min+' min trip'); if(j.km)sub.push('~'+j.km+' km');
       f.style.display='flex'; f.innerHTML='<div><div class="lbl">Delivery fee</div>'+(sub.length?('<div class="sub">'+sub.join(' · ')+'</div>'):'')+'</div><div class="amt">₦'+j.price.toLocaleString()+'</div>';
       if(j.min){ e.style.display='flex'; e.innerHTML='🛵 '+j.min+' min <span class="d">trip</span>'; } else { e.style.display='none'; }
     } else { f.style.display='none'; if(e)e.style.display='none'; }
     if(j.polyline) drawRoute(j.polyline);
   }).catch(function(){ f.style.display='none'; });
}
function wire(inId,sugId,which){
  var inp=document.getElementById(inId), sug=document.getElementById(sugId), t;
  inp.addEventListener('input',function(){
    clearTimeout(t); var q=inp.value.trim(); showClr(which,q.length>0); if(q.length<2){sug.style.display='none';return;}
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
else { initMap(); loadRiders(); setInterval(loadRiders,25000); wire('pin','psug','pickup'); wire('din','dsug','dropoff');
  Array.prototype.forEach.call(document.querySelectorAll('.locp'),function(b){ b.onclick=function(){ useLoc(b.getAttribute('data-for')); }; });
  Array.prototype.forEach.call(document.querySelectorAll('.clr'),function(b){ b.onclick=function(){ clearLoc(b.getAttribute('data-clr')); }; });
  ['sname','sphone','rname','rphone','item'].forEach(function(id){ document.getElementById(id).addEventListener('input',validate); });
  // One-tap reuse for returning customers ("same as last time").
  function reuse(id,label,fn){ var d=document.getElementById(id); var a=document.createElement('a'); a.textContent=label; a.onclick=function(){ fn(); a.className='on'; validate(); }; d.appendChild(a); }
  fetch(api('action=prefill')).then(function(r){return r.json();}).then(function(p){
    if(!p) return;
    YOU_NAME=p.name||''; YOU_PHONE=p.phone||'';
    if(p.name) document.getElementById('sname').value=p.name;
    if(p.phone) document.getElementById('sphone').value=p.phone;
    if(p.item) document.getElementById('item').value=p.item;
    // Pickup: the chat already quoted this route, so open the map ON it (pin + price), and the customer
    // can drag the pin to fine-tune. Else offer their last pickup as a chip.
    if(p.pickup){ if(p.pickup.from_chat){ document.getElementById('pin').value=p.pickup.address; if(p.pickup.lat) setPin('pickup',p.pickup); }
      else if(p.pickup.lat){ reuse('rpickup','↩ Same pickup — '+p.pickup.address,function(){ document.getElementById('pin').value=p.pickup.address; setPin('pickup',p.pickup); }); } }
    // Drop-off: same — open on the quoted spot, draggable to fine-tune.
    if(p.dropoff){ if(p.dropoff.from_chat){ document.getElementById('din').value=p.dropoff.address; if(p.dropoff.lat) setPin('dropoff',p.dropoff); }
      else if(p.dropoff.lat){ reuse('rdrop','↩ Same drop-off — '+p.dropoff.address,function(){ document.getElementById('din').value=p.dropoff.address; setPin('dropoff',p.dropoff); }); } }
    if(p.receiver&&p.receiver.name){ if(p.receiver.from_chat){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; }
      else { reuse('rrecv','↩ Same receiver — '+p.receiver.name,function(){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; }); } }
    showClr('pickup',(document.getElementById('pin').value||'').length>0);
    showClr('dropoff',(document.getElementById('din').value||'').length>0);
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
// Shared premium styling for the no-map booking pages (international & waybill) — matches the
// clean white + green look of the local map page.
const QUOTE_CSS = `*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
body{margin:0;background:#fff;color:#0e1726;-webkit-font-smoothing:antialiased}
.wrap{max-width:480px;margin:0 auto;min-height:100vh}
.hero{padding:24px 20px 16px}
.hero h1{margin:0;font-size:23px;font-weight:700;letter-spacing:-.02em}
.hero p{margin:8px 0 0;font-size:13.5px;color:#6b7280;line-height:1.55}
.body{padding:4px 20px 28px}
.lbl{font-size:12.5px;color:#6b7280;font-weight:700;margin:15px 2px 7px}
.fld{margin-bottom:11px;position:relative}
.fld input,.fld select{width:100%;padding:15px;border:1px solid #e6e9ed;border-radius:13px;font-size:16px;outline:none;background:#fff;-webkit-appearance:none}
.fld input:focus,.fld select:focus{border-color:#25D366;box-shadow:0 0 0 3px rgba(37,211,102,.12)}
.req{color:#25D366}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sugbox{position:absolute;z-index:50;left:0;right:0;background:#fff;border:1px solid #edeff2;border-radius:13px;margin-top:4px;box-shadow:0 12px 30px rgba(14,23,38,.12);overflow:hidden}
.gpsbtn{position:absolute;top:0;right:0;height:52px;width:46px;border:0;background:transparent;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#25D366}.gpsbtn:disabled{opacity:.5}
.sugbox div{padding:14px;font-size:15px;border-bottom:1px solid #f2f4f6;cursor:pointer}
.sugbox div:active{background:#eef9f1}
.states{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}
.st{padding:14px;border:1px solid #e6e9ed;border-radius:13px;text-align:center;cursor:pointer}
.st b{display:block;font-size:15px;font-weight:700}
.st span{font-size:12.5px;color:#6b7280}
.st.on{border-color:#25D366;background:#eef9f1}.st.on b,.st.on span{color:#0a7d33}
.feebig{display:none;align-items:center;justify-content:space-between;border:1px solid #e6e9ed;border-radius:14px;padding:15px 18px;margin:14px 0 2px}
.feebig .l{font-size:13px;color:#6b7280;font-weight:600}
.feebig .sub{font-size:12px;color:#9aa0a6;margin-top:2px}
.feebig .amt{font-size:22px;font-weight:800;letter-spacing:-.01em}
button{width:100%;padding:17px;border:0;border-radius:14px;background:#25D366;color:#fff;font-size:17px;font-weight:800;margin-top:14px;-webkit-appearance:none}
button:disabled{background:#cfe9d8}
.done{text-align:center;padding:48px 22px}.done h2{font-size:22px;color:#0a7d33}
.muted{color:#9aa0a6;font-size:12.5px;text-align:center;margin-top:24px}
.wabtn{display:inline-block;margin-top:18px;padding:16px 28px;background:#25D366;color:#fff;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px}
.err{color:#c0392b;font-size:13px;min-height:16px;margin-top:6px}`;

// ── INTERNATIONAL shipping page (rider-first estimate) — premium look, no waybill ──
const QUOTE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Ship internationally — Lasalu Drop</title>
<meta name="theme-color" content="#0e1726">
<style>
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#eef1f4;color:#0e1726;-webkit-font-smoothing:antialiased}
.wrap{max-width:480px;margin:0 auto;min-height:100vh;background:#eef1f4;position:relative;padding-bottom:94px}
.hero{background:#0e1726;color:#fff;padding:26px 22px 52px;position:relative;overflow:hidden}
.hero .glow{position:absolute;right:-26px;top:-18px;font-size:150px;opacity:.06;transform:rotate(-12deg);pointer-events:none}
.hero h1{margin:0;font-size:25px;font-weight:700;letter-spacing:-.02em;position:relative}
.hero p{margin:9px 0 0;font-size:13.5px;color:#aeb6c2;line-height:1.55;max-width:310px;position:relative}
.chips{display:flex;gap:7px;margin-top:16px;flex-wrap:wrap;position:relative}
.chip{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);color:#e3e8ee;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:20px}
.sheet{background:#fff;border-radius:22px 22px 0 0;margin-top:-30px;position:relative;padding:6px 18px 22px;box-shadow:0 -8px 24px rgba(14,23,38,.05)}
.sec{font-size:11.5px;color:#9098a4;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:22px 2px 11px}
.sec:first-child{margin-top:16px}
.pills{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pill{border:1.5px solid #e6e9ed;border-radius:15px;padding:13px 14px;cursor:pointer;transition:border-color .15s,background .15s;background:#fff}
.pill.on{border-color:#25D366;background:#f0fbf4}
.pill .pt{font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;color:#0e1726}
.pill .pd{font-size:11.5px;color:#7b828d;margin-top:4px;line-height:1.3}
.pill.on .pt{color:#0a7d33}
.lbl{font-size:12.5px;color:#6b7280;font-weight:600;margin:14px 2px 6px}
.fld{position:relative;margin-bottom:11px}
.fld input,.fld select,.fld textarea{width:100%;padding:14px 15px;border:1px solid #e6e9ed;border-radius:13px;font-size:16px;outline:none;background:#fff;-webkit-appearance:none;appearance:none;font-family:inherit}
.fld input:focus,.fld select:focus,.fld textarea:focus{border-color:#25D366;box-shadow:0 0 0 3px rgba(37,211,102,.12)}
.fld select{padding-right:40px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' stroke='%236b7280' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 15px center}
.fld textarea{min-height:64px;resize:none;line-height:1.4}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.req{color:#25D366}
.sugbox{position:absolute;z-index:50;left:0;right:0;background:#fff;border:1px solid #edeff2;border-radius:13px;margin-top:4px;box-shadow:0 12px 30px rgba(14,23,38,.12);overflow:hidden}
.sugbox div{padding:14px;font-size:15px;border-bottom:1px solid #f2f4f6;cursor:pointer}.sugbox div:active{background:#eef9f1}
.gpsbtn{position:absolute;top:0;right:0;height:50px;width:46px;border:0;background:transparent;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center}.gpsbtn:disabled{opacity:.5}
.estcard{display:none;align-items:center;justify-content:space-between;gap:12px;background:#0e1726;color:#fff;border-radius:16px;padding:15px 18px;margin:18px 0 4px}
.estcard .l{font-size:12.5px;color:#aab4c2;font-weight:600}
.estcard .sub{font-size:11px;color:#7e8a9a;margin-top:3px;line-height:1.3}
.estcard .amt{font-size:23px;font-weight:800;letter-spacing:-.01em;white-space:nowrap}
.err{color:#c0392b;font-size:13px;min-height:15px;margin-top:6px}
.muted{color:#aab0b8;font-size:12px;text-align:center;margin:20px 0 2px}
.bar{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;background:#fff;border-top:1px solid #eef0f3;padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:14px;box-shadow:0 -6px 22px rgba(14,23,38,.07)}
.bar .bamt .s{font-size:10.5px;color:#9098a4;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.bar .bamt .v{font-size:18px;font-weight:800;letter-spacing:-.01em}
.bar button{flex:1;padding:15px;border:0;border-radius:14px;background:#25D366;color:#fff;font-size:16px;font-weight:800;-webkit-appearance:none}
.bar button:disabled{background:#cfe9d8}
.done{text-align:center;padding:60px 24px}.done h2{font-size:23px;color:#0a7d33}
.wabtn{display:inline-block;margin-top:18px;padding:16px 28px;background:#25D366;color:#fff;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px}
</style></head><body><div class="wrap" id="app">
<div class="hero"><div class="glow">✈️</div>
<h1>Ship internationally 🌍</h1>
<p>Door pickup in Port Harcourt, delivered worldwide. You only pay after our rider weighs it.</p></div>
<div class="sheet">
<div class="sec">Choose your service</div>
<div class="pills">
<div class="pill on" data-svc="express"><div class="pt">✈️ Air Express</div><div class="pd">Worldwide · 3–7 days</div></div>
<div class="pill" data-svc="cargo"><div class="pt">📦 Air Cargo</div><div class="pd">UK/US/CA/GH · 10kg+</div></div>
</div>
<div class="sec">Shipment details</div>
<div class="lbl">Destination country</div>
<div class="fld"><select id="country">
<option value="">Select destination…</option>
<optgroup label="UK &amp; Ireland"><option value="UNITED KINGDOM (Z1)">United Kingdom</option><option value="IRELAND REP OF (Z1)">Ireland</option><option value="GUERNSEY (Z1)">Guernsey</option><option value="JERSEY (Z1)">Jersey</option></optgroup>
<optgroup label="Africa (West &amp; Central)"><option value="GHANA (Z2)">Ghana</option><option value="BENIN (Z2)">Benin</option><option value="CAMEROON (Z2)">Cameroon</option><option value="COTE D IVOIRE (Z2)">Côte d'Ivoire</option><option value="GABON (Z2)">Gabon</option><option value="GAMBIA (Z2)">Gambia</option><option value="GUINEA REP. (Z2)">Guinea</option></optgroup>
<optgroup label="North America"><option value="USA (Z3)">United States</option><option value="CANADA (Z3)">Canada</option><option value="MEXICO (Z3)">Mexico</option></optgroup>
<optgroup label="Europe"><option value="GERMANY (Z4)">Germany</option><option value="FRANCE (Z4)">France</option><option value="ITALY (Z4)">Italy</option><option value="SPAIN (Z4)">Spain</option><option value="NETHERLANDS (Z4)">Netherlands</option><option value="BELGIUM (Z4)">Belgium</option><option value="SWITZERLAND (Z4)">Switzerland</option><option value="SWEDEN (Z4)">Sweden</option><option value="NORWAY (Z4)">Norway</option><option value="DENMARK (Z4)">Denmark</option><option value="POLAND (Z4)">Poland</option><option value="PORTUGAL (Z4)">Portugal</option><option value="AUSTRIA (Z4)">Austria</option><option value="GREECE (Z4)">Greece</option><option value="TURKEY (Z4)">Turkey</option><option value="FINLAND (Z4)">Finland</option><option value="CZECH REPUBLIC (Z4)">Czech Republic</option><option value="ROMANIA (Z4)">Romania</option><option value="HUNGARY (Z4)">Hungary</option><option value="RUSSIA (Z4)">Russia</option></optgroup>
<optgroup label="Africa (East &amp; Southern)"><option value="SOUTH AFRICA (Z5)">South Africa</option><option value="EGYPT (Z5)">Egypt</option><option value="KENYA (Z5)">Kenya</option><option value="MOROCCO (Z5)">Morocco</option><option value="TANZANIA (Z5)">Tanzania</option><option value="UGANDA (Z5)">Uganda</option><option value="RWANDA (Z5)">Rwanda</option><option value="ETHIOPIA (Z5)">Ethiopia</option><option value="ZAMBIA (Z5)">Zambia</option><option value="ZIMBABWE (Z5)">Zimbabwe</option><option value="NAMIBIA (Z5)">Namibia</option><option value="BOTSWANA (Z5)">Botswana</option><option value="ANGOLA (Z5)">Angola</option></optgroup>
<optgroup label="Middle East"><option value="UNITED ARAB EMIRATES (Z6)">United Arab Emirates</option><option value="SAUDI ARABIA (Z6)">Saudi Arabia</option><option value="QATAR (Z6)">Qatar</option><option value="KUWAIT (Z6)">Kuwait</option><option value="OMAN (Z6)">Oman</option><option value="BAHRAIN (Z6)">Bahrain</option><option value="ISRAEL (Z6)">Israel</option><option value="LEBANON (Z6)">Lebanon</option><option value="JORDAN (Z6)">Jordan</option></optgroup>
<optgroup label="Asia &amp; Oceania"><option value="CHINA (Z7)">China</option><option value="INDIA (Z7)">India</option><option value="JAPAN (Z7)">Japan</option><option value="SINGAPORE (Z7)">Singapore</option><option value="MALAYSIA (Z7)">Malaysia</option><option value="HONG KONG (Z7)">Hong Kong</option><option value="AUSTRALIA (Z7)">Australia</option><option value="PHILIPPINES (Z7)">Philippines</option><option value="THAILAND (Z7)">Thailand</option><option value="INDONESIA (Z7)">Indonesia</option><option value="VIETNAM (Z7)">Vietnam</option><option value="PAKISTAN (Z7)">Pakistan</option><option value="BANGLADESH (Z7)">Bangladesh</option><option value="TAIWAN (Z7)">Taiwan</option></optgroup>
<optgroup label="Latin America &amp; Caribbean"><option value="BRAZIL (Z8)">Brazil</option><option value="ARGENTINA (Z8)">Argentina</option><option value="CHILE (Z8)">Chile</option><option value="COLOMBIA (Z8)">Colombia</option><option value="PERU (Z8)">Peru</option><option value="JAMAICA (Z8)">Jamaica</option><option value="NEW ZEALAND (Z8)">New Zealand</option><option value="PANAMA (Z8)">Panama</option><option value="VENEZUELA (Z8)">Venezuela</option></optgroup>
</select></div>
<div class="two"><div><div class="lbl">Weight (kg)</div><div class="fld"><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="2"></div></div>
<div><div class="lbl">Item value (₦) <span class="req">*</span></div><div class="fld"><input id="value" type="number" min="1" inputmode="numeric" placeholder="What's it worth?"></div></div></div>
<div class="estcard" id="fee"></div>
<div class="err" id="err"></div>
<div class="sec">Pickup — sender in Port Harcourt</div>
<div class="two"><div class="fld"><input id="sname" placeholder="Sender's name"></div><div class="fld"><input id="sphone" type="tel" inputmode="tel" placeholder="Your phone *"></div></div>
<div class="lbl">Pickup address — where our rider collects <span class="req">*</span></div>
<div class="fld"><input id="paddr" placeholder="Start typing your address…" autocomplete="off" style="padding-right:44px"><button type="button" id="ploc" class="gpsbtn" aria-label="Use my current location">📍</button><div class="sugbox" id="psug" style="display:none"></div></div>
<div class="sec">Receiver — abroad</div>
<div class="two"><div class="fld"><input id="rname" placeholder="Receiver's name"></div><div class="fld"><input id="rphone" type="tel" inputmode="tel" placeholder="Their phone"></div></div>
<div class="fld"><input id="daddr" placeholder="Delivery address abroad…" autocomplete="off"><div class="sugbox" id="dsug" style="display:none"></div></div>
<div class="lbl">What are you sending?</div>
<div class="fld"><input id="item" placeholder="e.g. documents, clothes, a phone"></div>
<div class="sec">Delivery instruction <span style="font-weight:600;text-transform:none;letter-spacing:0;color:#aab0b8">— optional</span></div>
<div class="fld"><textarea id="dinstr" placeholder="Anything the rider should know? e.g. call on arrival, leave at reception, fragile…"></textarea></div>
<p class="muted">🔒 Powered by Lasalu Drop Logistics</p>
</div>
<div class="bar"><div class="bamt"><div class="s">Estimate</div><div class="v" id="baramt">—</div></div><button id="go" disabled>Request pickup</button></div>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker";
var lastPrice=null, t, SVC='express';
function el(id){return document.getElementById(id);}
function svc(){return SVC;}
function val(id){return (el(id).value||'').trim();}
function useLoc(){var b=el('ploc');if(!b)return;b.onclick=function(){if(!navigator.geolocation){alert('Location is not available here — please type your address.');return;}var prev=b.textContent;b.textContent='…';b.disabled=true;navigator.geolocation.getCurrentPosition(function(pos){el('paddr').value='Getting address…';fetch(API+'?action=reverse&session='+encodeURIComponent(SESSION)+'&lat='+pos.coords.latitude+'&lng='+pos.coords.longitude).then(function(r){return r.json();}).then(function(j){el('paddr').value=(j&&j.address)?j.address:'My current location';b.textContent=prev;b.disabled=false;validate();}).catch(function(){el('paddr').value='My current location';b.textContent=prev;b.disabled=false;validate();});},function(){b.textContent=prev;b.disabled=false;alert('Couldn\\'t get your location — please allow access or type your address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});};}
function pickupCity(){return /owerri|\\bimo\\b/i.test(val('paddr'))?'OWERRI':'PORT_HARCOURT';}
function wireAuto(inId,sugId,region){
  var inp=el(inId),sug=el(sugId),tt;
  inp.addEventListener('input',function(){
    clearTimeout(tt);var q=inp.value.trim();if(q.length<2){sug.style.display='none';return;}
    tt=setTimeout(function(){
      fetch(API+'?action=autocomplete&session='+encodeURIComponent(SESSION)+'&q='+encodeURIComponent(q)+(region?'&region='+region:'')).then(function(r){return r.json();}).then(function(j){
        sug.innerHTML='';(j.predictions||[]).forEach(function(p){
          var dv=document.createElement('div');dv.textContent=p.label;
          dv.onclick=function(){inp.value=p.label;sug.style.display='none';validate();};
          sug.appendChild(dv);
        });
        sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';
      }).catch(function(){sug.style.display='none';});
    },300);
  });
  inp.addEventListener('blur',function(){setTimeout(function(){sug.style.display='none';},200);});
}
function snapWeight(){var w=parseFloat(el('weight').value);if(!isNaN(w)&&w>0)el('weight').value=(Math.ceil(w*2)/2).toFixed(1);}
function recalc(){
  lastPrice=null;el('fee').style.display='none';el('baramt').textContent='—';el('err').textContent='';
  var d=val('country'),w=parseFloat(el('weight').value),v=parseFloat(el('value').value);
  if(!d||isNaN(w)||w<=0){validate();return;}
  if(isNaN(v)||v<=0){el('err').textContent='Please enter the item\\'s value to see the estimate.';validate();return;}
  el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Calculating…</div></div><div class="amt">…</div>';
  var qs='action=price&session='+encodeURIComponent(SESSION)+'&mode='+svc()+'&destination='+encodeURIComponent(d)+'&weight='+w+'&value='+v+'&pickup_city='+pickupCity();
  fetch(API+'?'+qs).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;var amt='~₦'+Number(j.price).toLocaleString();
      el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Estimate · '+(j.ship_mode==='cargo'?'Air Cargo':'Air Express')+'</div><div class="sub">confirmed after the rider weighs it'+(j.etd?(' • '+j.etd):'')+'</div></div><div class="amt">'+amt+'</div>';
      el('baramt').textContent=amt;}
    else{el('fee').style.display='none';el('baramt').textContent='—';
      if(j&&j.error==='cargo_min_weight')el('err').textContent='Air Cargo needs 10kg or more — try Express for lighter parcels.';
      else if(j&&j.error==='cargo_unavailable')el('err').textContent='Air Cargo is UK, USA, Canada & Ghana only — use Express here.';
      else if(j&&j.error==='unknown_country')el('err').textContent='Pick a destination from the list.';
    }
    validate();
  }).catch(function(){el('fee').style.display='none';el('baramt').textContent='—';validate();});
}
function validate(){
  var ok=lastPrice&&val('sname')&&val('sphone').length>=7&&val('paddr')&&val('rname')&&val('rphone').length>=7&&val('daddr')&&val('item');
  el('go').disabled=!ok;
}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:svc(),destination:val('country'),weight:parseFloat(el('weight').value),value:parseFloat(el('value').value)||0,pickup_city:pickupCity(),
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:val('daddr'),item:val('item'),delivery_instruction:val('dinstr')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){el('app').innerHTML='<div class="done"><h2>✅ All set!</h2><p class="muted">Your estimate is waiting in your WhatsApp chat — reply YES there to send the rider.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';}
    else{b.disabled=false;b.textContent='Request pickup';el('err').textContent=(j&&j.error==='value_required')?'Please enter the item\\'s value.':(j&&j.error)?('Couldn\\'t book: '+j.error):'Something went wrong — try again.';}
  }).catch(function(){b.disabled=false;b.textContent='Request pickup';alert('Network hiccup — try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a quote again.</p></div>';}
else{
  Array.prototype.forEach.call(document.querySelectorAll('.pill'),function(p){p.onclick=function(){SVC=p.getAttribute('data-svc');Array.prototype.forEach.call(document.querySelectorAll('.pill'),function(x){x.className='pill';});p.className='pill on';recalc();};});
  el('weight').addEventListener('input',function(){snapWeight();recalc();});
  el('country').addEventListener('change',recalc);
  el('value').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,350);});
  ['sname','sphone','paddr','rname','rphone','daddr','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  wireAuto('paddr','psug','ng');wireAuto('daddr','dsug','');useLoc();
  el('go').onclick=book;
}
</script></body></html>`;
app.get('/quote', (req, res) => { res.type('html').send(QUOTE_PAGE); });

// ── WAYBILL page (interstate, flat under 5kg) — its own simple premium page ──
const WAYBILL_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send a waybill — Lasalu Drop</title>
<meta name="theme-color" content="#25D366">
<style>${QUOTE_CSS}</style></head><body><div class="wrap" id="app">
<div class="hero"><h1>🚚 Send a waybill</h1><p>Flat price for items under 5kg. We pick up from your door 🛵 — your receiver collects at the destination park.</p></div>
<div class="body">
<div class="lbl">Where is it going?</div>
<div class="states" id="states">
<div class="st" data-s="LAGOS"><b>Lagos</b><span>₦10,000</span></div>
<div class="st" data-s="ABUJA"><b>Abuja</b><span>₦10,000</span></div>
<div class="st" data-s="ABA"><b>Aba</b><span>₦5,000</span></div>
<div class="st" data-s="OWERRI"><b>Owerri</b><span>₦6,000</span></div>
</div>
<div class="lbl">Weight (kg)</div>
<div class="fld"><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="e.g. 2 (flat up to 5kg)"></div>
<div class="feebig" id="fee"></div>
<div class="err" id="err"></div>
<div class="lbl">Pickup — where our rider collects <span class="req">*</span></div>
<div class="fld"><input id="paddr" placeholder="Start typing your address…" autocomplete="off" style="padding-right:44px"><button type="button" id="ploc" class="gpsbtn" aria-label="Use my current location">📍</button><div class="sugbox" id="psug" style="display:none"></div></div>
<div class="lbl">Sender</div>
<div class="two"><div class="fld"><input id="sname" placeholder="Sender's name"></div><div class="fld"><input id="sphone" type="tel" inputmode="tel" placeholder="Sender's phone"></div></div>
<div class="lbl">Receiver <span style="font-weight:500;color:#9aa0a6">— collects at the park</span></div>
<div class="two"><div class="fld"><input id="rname" placeholder="Receiver's name"></div><div class="fld"><input id="rphone" type="tel" inputmode="tel" placeholder="Receiver's phone"></div></div>
<div class="fld"><input id="item" placeholder="What are you sending?"></div>
<button id="go" disabled>Confirm &amp; book</button>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div></div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker";
var lastPrice=null, state="", t;
function el(id){return document.getElementById(id);}
function val(id){return (el(id).value||'').trim();}
function useLoc(){var b=el('ploc');if(!b)return;b.onclick=function(){if(!navigator.geolocation){alert('Location is not available here — please type your address.');return;}var prev=b.textContent;b.textContent='…';b.disabled=true;navigator.geolocation.getCurrentPosition(function(pos){el('paddr').value='Getting address…';fetch(API+'?action=reverse&session='+encodeURIComponent(SESSION)+'&lat='+pos.coords.latitude+'&lng='+pos.coords.longitude).then(function(r){return r.json();}).then(function(j){el('paddr').value=(j&&j.address)?j.address:'My current location';b.textContent=prev;b.disabled=false;validate();}).catch(function(){el('paddr').value='My current location';b.textContent=prev;b.disabled=false;validate();});},function(){b.textContent=prev;b.disabled=false;alert('Couldn\\'t get your location — please allow access or type your address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});};}
function nice(s){return s?s.charAt(0)+s.slice(1).toLowerCase():s;}
function wireAuto(inId,sugId){
  var inp=el(inId),sug=el(sugId),tt;
  inp.addEventListener('input',function(){
    clearTimeout(tt);var q=inp.value.trim();if(q.length<2){sug.style.display='none';return;}
    tt=setTimeout(function(){
      fetch(API+'?action=autocomplete&session='+encodeURIComponent(SESSION)+'&q='+encodeURIComponent(q)+'&region=ng').then(function(r){return r.json();}).then(function(j){
        sug.innerHTML='';(j.predictions||[]).forEach(function(p){
          var dv=document.createElement('div');dv.textContent=p.label;
          dv.onclick=function(){inp.value=p.label;sug.style.display='none';validate();};
          sug.appendChild(dv);
        });
        sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';
      }).catch(function(){sug.style.display='none';});
    },300);
  });
  inp.addEventListener('blur',function(){setTimeout(function(){sug.style.display='none';},200);});
}
function recalc(){
  lastPrice=null;el('fee').style.display='none';el('err').textContent='';
  var w=parseFloat(el('weight').value);
  if(!state){validate();return;}
  if(isNaN(w)||w<=0){validate();return;}
  if(w>5){el('err').textContent='Items over 5kg — our team will confirm a custom price. Reach us on WhatsApp.';validate();return;}
  el('fee').style.display='flex';el('fee').innerHTML='<div class="l">Calculating…</div>';
  fetch(API+'?action=price&session='+encodeURIComponent(SESSION)+'&mode=waybill&destination='+encodeURIComponent(state)+'&weight='+w).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Waybill to '+nice(state)+'</div><div class="sub">up to 5kg • receiver collects at the park</div></div><div class="amt">₦'+Number(j.price).toLocaleString()+'</div>';}
    else{el('fee').style.display='none';if(j&&j.error==='over_5kg')el('err').textContent='Items over 5kg — our team will confirm a custom price.';}
    validate();
  }).catch(function(){el('fee').style.display='none';validate();});
}
function validate(){var ok=lastPrice&&val('paddr')&&val('rname')&&val('rphone').length>=7&&val('item');el('go').disabled=!ok;}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:'waybill',destination:state,weight:parseFloat(el('weight').value)||1,
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:'',item:val('item')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){el('app').innerHTML='<div class="done"><h2>✅ All set!</h2><p class="muted">Your order &amp; price are waiting in your WhatsApp chat.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';}
    else{b.disabled=false;b.textContent='Confirm & book';el('err').textContent=(j&&j.error)?('Couldn\\'t book: '+j.error):'Something went wrong — try again.';}
  }).catch(function(){b.disabled=false;b.textContent='Confirm & book';alert('Network hiccup — try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a quote again.</p></div>';}
else{
  Array.prototype.forEach.call(document.querySelectorAll('.st'),function(b){b.onclick=function(){state=b.getAttribute('data-s');Array.prototype.forEach.call(document.querySelectorAll('.st'),function(x){x.className='st';});b.className='st on';recalc();};});
  el('weight').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,300);});
  ['sname','sphone','paddr','rname','rphone','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  wireAuto('paddr','psug');useLoc();
  el('go').onclick=book;
}
</script></body></html>`;
app.get('/waybill', (req, res) => { res.type('html').send(WAYBILL_PAGE); });

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
