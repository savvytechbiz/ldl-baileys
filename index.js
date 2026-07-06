/* global process */
import express from 'express';
import makeWASocket from '@whiskeysockets/baileys';
import { DisconnectReason, makeCacheableSignalKeyStore, Browsers, downloadMediaMessage, initAuthCreds, BufferJSON, proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import Groq from 'groq-sdk';
import pino from 'pino';

// Branded "Book Order" preview-card image, embedded as base64 so the Baileys deploy stays a single
// file. Shown as the thumbnail on booking-link preview cards. (null if not populated → no thumbnail.)
const BOOK_CARD_B64 = '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';
const BOOK_CARD_JPEG = BOOK_CARD_B64.length > 100 ? Buffer.from(BOOK_CARD_B64, 'base64') : null;

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
    const buffer = await downloadMediaMessage(
      msg, 'buffer', {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );
    if (!buffer || !buffer.length) { console.error('transcribeVoice: empty audio download'); return ''; }
    const mime = (msg.message && msg.message.audioMessage && msg.message.audioMessage.mimetype) || 'audio/ogg';
    // Transcribe via the Supabase transcribeVoice function — it uses the SAME Groq key that powers chat
    // (app_settings), so voice no longer depends on a separate GROQ_API_KEY being set on this host.
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/transcribeVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ audio_base64: buffer.toString('base64'), mime })
    });
    const j = await res.json().catch(function(){ return null; });
    if (!res.ok || !j) { console.error('transcribeVoice http', res.status); return ''; }
    if (j.error) console.error('transcribeVoice service error:', j.error);
    var text = (j.text || '').trim();
    console.log('Voice note transcribed:', text.slice(0, 120));
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
        // Skip WhatsApp Status posts, broadcast lists and channel/newsletter updates.
        // These are one-to-many broadcasts, NOT real conversations — ADANOVA must never
        // reply to them (was answering people's Status uploads on status@broadcast).
        const _bcast = msg.key.remoteJid || '';
        if (_bcast === 'status@broadcast' || _bcast.endsWith('@broadcast') || _bcast.endsWith('@newsletter')) continue;

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

        // Detect media messages (an image is usually the ITEM the customer wants to ship)
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

        // Download an image so ADANOVA can actually SEE it (usually the item being shipped, sometimes an
        // address). Images only, size-capped so the webhook payload stays small; best-effort (a failure
        // just means no picture is sent, and she'll ask what it shows).
        let mediaBase64 = null, mediaMime = null;
        if (msg.message?.imageMessage && !msg.key.fromMe) {
          try {
            const imgBuf = await downloadMediaMessage(
              msg, 'buffer', {},
              { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
            );
            if (imgBuf && imgBuf.length <= 1500000) {          // ~1.5 MB cap
              mediaBase64 = imgBuf.toString('base64');
              mediaMime = msg.message.imageMessage.mimetype || 'image/jpeg';
            }
          } catch (e) { console.log('image download failed:', e.message); }
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
            media_base64: mediaBase64,   // image bytes so ADANOVA can SEE the item (null if none / too big)
            media_mime: mediaMime,
            location: location
          };
          const webhookUrl = `${SUPABASE_FUNCTIONS_URL}/receiveMessage`;
          console.log('Sending webhook to:', webhookUrl);
          console.log('Payload:', { ...payload, media_base64: mediaBase64 ? `[image ~${Math.round(mediaBase64.length / 1024)}kb]` : null });
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
.payopt{display:flex;align-items:center;gap:10px;padding:12px 13px;border:1px solid #e6e9ed;border-radius:12px;margin-bottom:8px;font-size:14.5px;font-weight:500;color:#0e1726;cursor:pointer}
.payopt:has(input:checked){border-color:#25D366;background:#f1fbf5}
.payopt#opt-cod:has(input:checked){border-color:#f59e0b;background:#fff8ec}
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
<input id="dinstr" class="f1" placeholder="Delivery instructions — optional (e.g. call on arrival, gate code)" maxlength="200" style="margin-top:10px">
<div id="paysel" style="margin-top:13px">
  <div style="font-size:12.5px;color:#6b7280;font-weight:700;margin:0 2px 8px">Payment</div>
  <label class="payopt"><input type="radio" name="pay" value="now" checked style="width:18px;height:18px;accent-color:#25D366"> 💳 Pay now (card or transfer)</label>
  <label class="payopt" id="opt-pod" style="display:none"><input type="radio" name="pay" value="pod" style="width:18px;height:18px;accent-color:#25D366"> 🛵 Pay on delivery — cash to the rider</label>
  <label class="payopt" id="opt-cod" style="display:none"><input type="radio" name="pay" value="cod" style="width:18px;height:18px;accent-color:#f59e0b"> 🏬 Receiver pays for the goods (COD)</label>
  <div id="codamt" style="display:none;margin:2px 2px 0">
    <input id="goods" type="number" inputmode="numeric" min="1" placeholder="Goods amount the receiver pays (₦)" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
    <div style="font-size:12px;color:#9a7b3a;margin-top:6px">You pay nothing now — the receiver pays on delivery, and your goods money lands in your next-day payout.</div>
  </div>
</div>
<div class="feebig" id="fee"></div>
<button id="go" disabled>Confirm &amp; book</button>
</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
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
function phoneOk(v){var d=(v||'').replace(/\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=document.getElementById(id);if(!e)return;function u(){var v=(e.value||'').trim();var bad=v&&!phoneOk(v);e.style.borderColor=bad?'#dc2626':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='📵 That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',u);}
function validate(){
  var ok = picked.pickup&&picked.dropoff&&val('rname')&&phoneOk(val('rphone'))&&(!val('sphone')||phoneOk(val('sphone')))&&val('item');
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
  flagPhone('sphone');flagPhone('rphone');
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
    // Show the payment options this customer is allowed (pay-on-delivery per settings; COD = trusted vendor).
    if(p.pod_allowed){ document.getElementById('opt-pod').style.display='flex'; }
    if(p.cod_allowed){ document.getElementById('opt-cod').style.display='flex'; }
    validate(); step();
  }).catch(function(){});
  // Reveal the goods-amount field only when "Receiver pays for the goods (COD)" is selected.
  Array.prototype.forEach.call(document.querySelectorAll('input[name=pay]'),function(r){ r.addEventListener('change',function(){ var v=(document.querySelector('input[name=pay]:checked')||{}).value; document.getElementById('codamt').style.display=(v==='cod')?'block':'none'; }); });
  document.getElementById('go').onclick=function(){
    var payVal=(function(){ var r=document.querySelector('input[name=pay]:checked'); return r?r.value:'now'; })();
    var codOn=payVal==='cod';
    var goodsVal=codOn?Number((document.getElementById('goods').value||'').replace(/[^0-9.]/g,'')):0;
    if(codOn&&!(goodsVal>0)){ alert('Please enter the amount the receiver pays for the goods.'); return; }
    var b=document.getElementById('go'); b.disabled=true; b.textContent='Booking…';
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      session:SESSION,pickup:picked.pickup,dropoff:picked.dropoff,
      sender_name:val('sname'),sender_phone:val('sphone'),receiver_name:val('rname'),receiver_phone:val('rphone'),item:val('item'),delivery_instruction:val('dinstr'),
      pay_method:payVal,cod:codOn,goods_value:goodsVal
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
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
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
function phoneOk(v){var d=(v||'').replace(/\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=el(id);if(!e)return;function u(){var v=(e.value||'').trim();var bad=v&&!phoneOk(v);e.style.borderColor=bad?'#dc2626':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='📵 That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',u);}
function validate(){
  var ok=lastPrice&&val('sname')&&phoneOk(val('sphone'))&&val('paddr')&&val('rname')&&phoneOk(val('rphone'))&&val('daddr')&&val('item');
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
  el('weight').addEventListener('input',function(){recalc();});
  el('weight').addEventListener('blur',function(){snapWeight();recalc();});
  el('country').addEventListener('change',recalc);
  el('value').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,350);});
  ['sname','sphone','paddr','rname','rphone','daddr','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  flagPhone('sphone');flagPhone('rphone');
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
<div class="fld"><input id="dinstr" placeholder="Delivery instructions — optional" maxlength="200"></div>
<button id="go" disabled>Confirm &amp; book</button>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div></div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
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
function phoneOk(v){var d=(v||'').replace(/\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=el(id);if(!e)return;function u(){var v=(e.value||'').trim();var bad=v&&!phoneOk(v);e.style.borderColor=bad?'#dc2626':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='📵 That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',u);}
function validate(){var ok=lastPrice&&val('paddr')&&val('rname')&&phoneOk(val('rphone'))&&(!val('sphone')||phoneOk(val('sphone')))&&val('item');el('go').disabled=!ok;}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:'waybill',destination:state,weight:parseFloat(el('weight').value)||1,
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:'',item:val('item'),delivery_instruction:val('dinstr')
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
  flagPhone('sphone');flagPhone('rphone');
  wireAuto('paddr','psug');useLoc();
  el('go').onclick=book;
}
</script></body></html>`;
app.get('/waybill', (req, res) => { res.type('html').send(WAYBILL_PAGE); });

// ── Vendor bulk order form (trusted vendors) — add several buyer orders, we book + collect COD ──
const VENDOR_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send orders — Lasalu Drop</title>
<style>
*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
body{margin:0;background:#f4f6f8;color:#0e1726}
.wrap{max-width:480px;margin:0 auto;background:#fff;min-height:100vh;min-height:100dvh}
.hero{background:#0e1726;color:#fff;padding:22px 20px 16px}
.hero h1{margin:0;font-size:22px;font-weight:700}
.hero p{margin:7px 0 0;font-size:13px;color:#aeb6c2;line-height:1.5}
.body{padding:16px}
.lbl{font-size:12.5px;color:#6b7280;font-weight:700;margin:0 2px 6px}
input{width:100%;padding:12px 13px;border:1px solid #e6e9ed;border-radius:11px;font-size:15px;outline:none}
input:focus{border-color:#25D366}
.ord{border:1px solid #e6e9ed;border-radius:14px;padding:12px;margin:12px 0;position:relative;background:#fbfcfd}
.ord .rm{position:absolute;top:6px;right:8px;color:#c0392b;background:none;border:0;font-size:20px;cursor:pointer;line-height:1}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mt{margin-top:8px}
.sug{position:absolute;z-index:50;left:0;right:0;background:#fff;border:1px solid #edeff2;border-radius:12px;margin-top:2px;box-shadow:0 12px 30px rgba(14,23,38,.12);overflow:hidden;max-height:200px;overflow-y:auto}
.sug div{padding:11px 12px;font-size:14px;border-bottom:1px solid #f2f4f6;cursor:pointer}
.add{width:100%;margin:6px 0 2px;padding:13px;border:1px dashed #c7ccd2;background:#fff;color:#0e1726;border-radius:12px;font-size:14.5px;font-weight:600;cursor:pointer}
.go{width:100%;margin-top:14px;padding:15px;border:0;border-radius:13px;background:#25D366;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
.go:disabled{background:#cfe9d8}
.done{text-align:center;padding:48px 22px}.done h2{font-size:22px;color:#0a7d33;margin:0}
.wabtn{display:inline-block;margin-top:18px;padding:15px 26px;background:#25D366;color:#fff;border-radius:14px;text-decoration:none;font-weight:700}
.muted{color:#9aa0a6;font-size:13px}
</style></head><body>
<div class="wrap" id="app">
  <div class="hero"><h1>Send your orders 🛵</h1><p>Add each customer's order — we pick up from your shop, deliver, and collect their payment. You get paid out daily.</p></div>
  <div class="body">
    <div class="lbl">Your shop address (we pick up here)</div>
    <input id="shop" placeholder="e.g. 12 Aggrey Road, Port Harcourt">
    <div id="orders"></div>
    <button class="add" id="add">+ Add another order</button>
    <button class="go" id="go" disabled>Book all orders</button>
    <div id="out" style="margin-top:10px"></div>
  </div>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/vendorOrders";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
function el(id){return document.getElementById(id)}
var n=0;
function phoneOk(v){var d=(v||'').replace(/\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhoneEl(bp){if(!bp)return;function u(){var v=(bp.value||'').trim();var bad=v&&!phoneOk(v);bp.style.borderColor=bad?'#dc2626':'';var box=bp.closest('.row2')||bp.parentNode;var w=box.parentNode.querySelector('.bpe-'+(box.dataset.pe||''));if(bad){if(!w){var tag=String(n);box.dataset.pe=tag;w=document.createElement('div');w.className='bpe-'+tag;w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='📵 That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}bp.addEventListener('input',u);bp.addEventListener('blur',u);}
function collect(){var out=[];document.querySelectorAll('.ord').forEach(function(d){var o={};d.querySelectorAll('input[data-f]').forEach(function(i){o[i.getAttribute('data-f')]=i.value.trim();});out.push(o);});return out;}
function validate(){var os=collect();var ok=el('shop').value.trim()&&os.length>0&&os.every(function(o){return o.buyer_name&&phoneOk(o.buyer_phone)&&o.address&&o.item&&Number((o.goods_value||'').replace(/[^0-9.]/g,''))>0;});el('go').disabled=!ok;}
function addOrder(){
  n++;var d=document.createElement('div');d.className='ord';
  d.innerHTML='<button class="rm" title="Remove">×</button>'
    +'<div class="row2"><input placeholder="Buyer name" data-f="buyer_name"><input placeholder="Buyer phone" data-f="buyer_phone" inputmode="tel"></div>'
    +'<div style="position:relative" class="mt"><input placeholder="Delivery address" data-f="address" autocomplete="off"><div class="sug" style="display:none"></div></div>'
    +'<div class="row2 mt"><input placeholder="Item (e.g. wig)" data-f="item"><input placeholder="Buyer pays ₦" data-f="goods_value" inputmode="numeric"></div>';
  el('orders').appendChild(d);
  d.querySelector('.rm').onclick=function(){d.remove();validate();};
  var ai=d.querySelector('input[data-f=address]'),sug=d.querySelector('.sug'),t;
  ai.addEventListener('input',function(){clearTimeout(t);var q=ai.value.trim();validate();if(q.length<2){sug.style.display='none';return;}t=setTimeout(function(){fetch(api('action=autocomplete&q='+encodeURIComponent(q))).then(function(r){return r.json()}).then(function(j){sug.innerHTML='';(j.predictions||[]).forEach(function(p){var x=document.createElement('div');x.textContent=p.label;x.onclick=function(){ai.value=p.label;sug.style.display='none';validate();};sug.appendChild(x);});sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';});},300);});
  d.querySelectorAll('input').forEach(function(i){i.addEventListener('input',validate);});
  flagPhoneEl(d.querySelector('input[data-f=buyer_phone]'));
  validate();
}
el('add').onclick=addOrder;el('shop').addEventListener('input',validate);
if(VALID!=='1'){el('app').innerHTML='<div class="hero"><h1>Link expired</h1><p>Head back to your chat and ask for a new order link.</p></div>';}
else{
  fetch(api('action=prefill')).then(function(r){return r.json()}).then(function(p){if(p&&p.shop_address)el('shop').value=p.shop_address;});
  addOrder();
  el('go').onclick=function(){
    var b=el('go');b.disabled=true;b.textContent='Booking…';
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:SESSION,shop_address:el('shop').value.trim(),orders:collect()})})
     .then(function(r){return r.json()}).then(function(j){
       if(j.error){b.disabled=false;b.textContent='Book all orders';el('out').innerHTML='<p style="color:#c0392b">'+j.error+'</p>';return;}
       var lines=(j.results||[]).map(function(r){return r.ok?('✅ '+r.buyer+' — booked, buyer pays ₦'+r.total.toLocaleString()):('⚠️ '+(r.buyer||'an order')+' — '+r.error);}).join('<br>');
       el('app').innerHTML='<div class="done"><h2>Done! 🙌</h2><p class="muted">'+j.booked+' order(s) booked. We\\'ve sent each buyer their payment link.</p><div style="text-align:left;font-size:14px;margin:14px 0">'+lines+'</div><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
     }).catch(function(){b.disabled=false;b.textContent='Book all orders';alert('Network hiccup — try again.');});
  };
}
</script></body></html>`;
app.get('/vendor', (req, res) => { res.type('html').send(VENDOR_PAGE); });

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
// A booking link gets a clean tappable PREVIEW CARD (title + description) above the message. The URL
// STAYS in the text — WhatsApp only renders the card when the URL is present in the body (hiding it
// makes the card vanish). So: card on top (nice), the link still there and tappable (safe).
function bookingPreview(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+\/(map|waybill|quote|vendor)\b[^\s]*/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const meta = {
    map:     { title: '📍 Book your delivery',        description: 'Tap to set pickup & drop-off — takes 10 seconds' },
    waybill: { title: '🚚 Get your waybill price',     description: 'Tap to pick the state & weight' },
    quote:   { title: '🌍 Get your shipping estimate', description: 'Tap to pick country, weight & value' },
    vendor:  { title: '🛍️ Send your orders',          description: 'Tap to add your buyers & addresses' }
  }[kind] || { title: '📦 Lasalu Drop Logistics', description: 'Tap to continue' };
  return { url: m[0], ...meta };
}

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
    // Booking link → attach the branded preview card AND declutter the text: the card is the
    // call-to-action, so drop the redundant "👉 just tap here 👇" scaffolding + stray arrows — but
    // ALWAYS keep the URL (the card needs it and the link must stay tappable; safety fallback below).
    // Wrapped: any failure falls back to a plain text send with the original message.
    const pv = bookingPreview(message);
    if (pv) {
      try {
        let body = message.split('\n').filter((ln) => {
          const t = ln.trim();
          if (/^[👉👇➡️🔗•\-\s]+$/u.test(t)) return false;                                    // a pure arrow / bullet line
          if (t.length <= 55 && /\b(tap|click|book\s+it|go\s+ahead|set\s+it\s+up|lock\s+it\s+in)\b/i.test(t)
              && /\b(here|now|below|it|in\s+seconds)\b/i.test(t) && !/https?:\/\//.test(t)) return false;  // short pure-CTA line
          return true;
        }).join('\n');
        body = body.replace(/^[ \t]*[👉👇➡️🔗]+[ \t]*/gmu, '').replace(/[ \t]*[👉👇➡️🔗]+[ \t]*$/gmu, '').replace(/\n{3,}/g, '\n\n').replace(/[\s\n]+$/, '').trim();
        if (!body.includes(pv.url)) body = message;   // safety: never lose the link
        const content = { extendedTextMessage: { text: body, matchedText: pv.url, canonicalUrl: pv.url, title: pv.title, description: pv.description, ...(BOOK_CARD_JPEG ? { jpegThumbnail: BOOK_CARD_JPEG } : {}) } };
        const wam = await generateWAMessageFromContent(jid, content, {});
        await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
        return res.json({ status: 'sent' });
      } catch (e) { /* preview failed → fall through to a plain send */ }
    }
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
