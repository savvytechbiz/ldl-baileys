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
// Bug 8: ids already handed to the webhook. WhatsApp re-delivers the same id on reconnect/'append',
// so we process each id at most once. Bounded (drops oldest) so it can't grow without limit.
const _seenMsgIds = new Set();

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

// ─── Inbound message extraction helpers ──────────────────────────────────────
// WhatsApp buries the real content inside a growing set of envelope wrappers (disappearing,
// view-once, edited, bot) and delivers Facebook "Click to WhatsApp" ad leads + button/list taps
// in shapes that yield EMPTY plain text — which the old handler silently dropped (`if(!text) continue`).
// That lost EVERY paid ad lead. unwrapMessage peels the wrappers to the innermost real content node.
function unwrapMessage(m) {
  let cur = m;
  for (let i = 0; cur && i < 8; i++) {
    // An EDIT arrives as protocolMessage.editedMessage — and THAT inner node IS the content Message
    // itself: read it directly, do NOT step into a `.message`. (Distinct from the OUTER editedMessage
    // WRAPPER below, whose payload sits under `.message`. Same key name, opposite shape — the trap.)
    if (cur.protocolMessage && cur.protocolMessage.editedMessage) { cur = cur.protocolMessage.editedMessage; continue; }
    const inner = cur.ephemeralMessage?.message
      || cur.viewOnceMessage?.message
      || cur.viewOnceMessageV2?.message
      || cur.viewOnceMessageV2Extension?.message
      || cur.documentWithCaptionMessage?.message
      || cur.editedMessage?.message
      || cur.botInvokeMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur || {};
}

// True when the (already-unwrapped) content is NOT a real user message we should reply to — a
// reaction, a delete/other protocol event, a poll update, a key handshake, or empty. Lets the
// never-drop fallback greet genuine leads while staying silent on system/reaction traffic.
function isSkippableContent(c) {
  if (!c || typeof c !== 'object') return true;
  const keys = Object.keys(c).filter((k) => c[k] != null && k !== 'messageContextInfo');
  if (keys.length === 0) return true;
  const skipOnly = ['reactionMessage', 'protocolMessage', 'pollUpdateMessage', 'pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3', 'senderKeyDistributionMessage', 'stickerSyncRmrMessage'];
  return keys.every((k) => skipOnly.includes(k));
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
      // Live pushes AND reconnect back-fill ('append') recovery. Safe now: receiveMessage dedups on
      // wa_msg_id (a restart-within-window redelivery can't double-reply) and the ~900s / 15-min recency
      // gate below drops stale history replay so we never answer old messages after a reconnect.
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        // Skip WhatsApp Status posts, broadcast lists and channel/newsletter updates.
        // These are one-to-many broadcasts, NOT real conversations — ADANOVA must never
        // reply to them (was answering people's Status uploads on status@broadcast).
        const _bcast = msg.key.remoteJid || '';
        if (_bcast === 'status@broadcast' || _bcast.endsWith('@broadcast') || _bcast.endsWith('@newsletter')) continue;

        // Bug 15: one malformed message must never abandon the rest of the batch — wrap the whole body.
        try {
          // Bug 8: skip ids we've already handled (WhatsApp can re-deliver the same id). We record the id
          // only AFTER a successful webhook (below), so a failed/aborted send stays retry-able on redelivery.
          const _mid = msg.key.id;
          if (_mid && _seenMsgIds.has(_mid)) continue;

          // Bug 7: append recovery — drop STALE replay, but keep the window WIDE enough to recover a real
          // outage. Reconnect base delay alone is 15-25s and a free-tier cold start adds more, so 120s was
          // far too short — it silently dropped genuine never-answered messages buffered during a 2-5 min
          // socket drop (exactly what append recovery exists to save). 15 min covers realistic reconnect/
          // spin-down gaps. Safe to widen: receiveMessage's DB-backed wa_msg_id dedup is the real
          // double-reply guard (survives restarts), so a longer window can't re-answer anything handled;
          // the bound just keeps a fresh history-sync from replying to a huge backlog at once (ban-safety).
          // Fresh live 'notify' msgs are seconds old so this never touches them.
          const _ts = Number(msg.messageTimestamp) || 0;
          if (_ts && (Date.now() / 1000 - _ts) > 900) continue;

        // Blue ticks: mark the customer's message READ so they see the two blue ticks. FIRE-AND-FORGET
        // (do NOT await) — the read receipt is a round-trip to WhatsApp and must NEVER sit in the
        // critical path, or a slow/busy socket would delay Adanova seeing & answering every message.
        if (!msg.key.fromMe) { Promise.resolve().then(() => sock.readMessages([msg.key])).catch(() => {}); }

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
              // Cap this @lid→phone lookup — it runs on EVERY message now (everyone arrives as @lid) and
              // from_phone is only best-effort, so it must never block intake. 1.5s then give up (null).
              cand = await Promise.race([
                sock.signalRepository.lidMapping.getPNForLID(_rjid),
                new Promise((r) => setTimeout(() => r(null), 1500))
              ]);
            }
            if (cand) fromPhone = String(cand).replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
          } catch { /* best-effort only */ }
        }

        // Peel WhatsApp's envelope wrappers (disappearing / view-once / edited / bot) so we read the
        // REAL content — ads, list/button taps, media, text — no matter how deeply it's nested.
        const content = unwrapMessage(msg.message) || {};

        // Facebook / Instagram "Click to WhatsApp" ad context hangs off a node's contextInfo. Capture
        // it so we can attribute the lead AND still reply even when there's no typed message.
        const _ctx = content.extendedTextMessage?.contextInfo
          || content.imageMessage?.contextInfo
          || content.videoMessage?.contextInfo
          || content.contextInfo;
        const _ad = _ctx?.externalAdReply;
        let adContext = null;
        if (_ad || _ctx?.entryPointConversionSource) {
          adContext = {
            is_ad: true,
            ad_title: _ad?.title || '',
            ad_body: _ad?.body || '',
            ad_source_url: _ad?.sourceUrl || '',
            ctwa_clid: _ad?.ctwaClid || '',
            entry_point: _ctx?.entryPointConversionSource || 'ctwa_ad'
          };
        }

        // Interactive replies (list pick / button tap / template / native-flow). A LIST pick keeps its
        // row id (the geopick flow matches a bare number); other taps forward the human label.
        const listResponse = content.listResponseMessage;
        const btnResponse = content.buttonsResponseMessage;
        const tplResponse = content.templateButtonReplyMessage;
        const flowResponse = content.interactiveResponseMessage;
        let interactiveSelection = null;
        if (listResponse) {
          interactiveSelection = { type: 'list_response', selected_id: listResponse.singleSelectReply?.selectedRowId || '', selected_title: listResponse.title || '', body: listResponse.description || '' };
        } else if (btnResponse) {
          interactiveSelection = { type: 'button_response', selected_id: btnResponse.selectedButtonId || '', selected_title: btnResponse.selectedDisplayText || '', body: '' };
        } else if (tplResponse) {
          interactiveSelection = { type: 'template_reply', selected_id: tplResponse.selectedId || '', selected_title: tplResponse.selectedDisplayText || '', body: '' };
        } else if (flowResponse?.nativeFlowResponseMessage) {
          const nf = flowResponse.nativeFlowResponseMessage;
          interactiveSelection = { type: 'native_flow_response', selected_id: nf.name || '', selected_title: flowResponse.body?.text || nf.name || '', body: nf.paramsJson || '' };
        }

        // Media (an image is usually the ITEM the customer wants to ship).
        const hasMedia = !!(content.imageMessage || content.documentMessage || content.videoMessage);
        const mediaCaption = content.imageMessage?.caption || content.videoMessage?.caption || content.documentMessage?.caption || '';

        let text = interactiveSelection
          ? (interactiveSelection.type === 'list_response'
              ? (interactiveSelection.selected_id || interactiveSelection.selected_title || '[selection]')  // row id → geopick
              : (interactiveSelection.selected_title || interactiveSelection.selected_id || '[selection]'))
          : (content.conversation || content.extendedTextMessage?.text || mediaCaption || (hasMedia ? '[image]' : ''));

        // Voice note (or PTT) with no caption → transcribe it so ADANOVA can reply.
        let wasVoice = false;
        if (!text && content.audioMessage) {
          wasVoice = true;
          text = await transcribeVoice(msg, sock);
        }

        // Shared location pin → forward exact coordinates so ADANOVA can use them.
        const locMsg = content.locationMessage || content.liveLocationMessage;
        let location = null;
        if (locMsg && locMsg.degreesLatitude != null && locMsg.degreesLongitude != null) {
          location = { lat: locMsg.degreesLatitude, lng: locMsg.degreesLongitude, name: locMsg.name || locMsg.address || '' };
          if (!text) text = '📍 Shared location';
        }

        // A Facebook ad lead who just TAPPED the ad (no typed text) → synthesize an opener that reads
        // as "saw your ad" so ADANOVA's ad-lead handler greets & pitches them, instead of the lead
        // vanishing. (This is the bug: every paid ad lead was silently dropped here.)
        if (!text && adContext && !msg.key.fromMe) {
          text = adContext.ad_title ? `Hi, I saw your ad: ${adContext.ad_title}` : 'Hi, I saw your ad — is anyone available to chat?';
        }

        if (!text) {
          // A voice note we couldn't transcribe → ask them to type, never silently ignore them.
          if (wasVoice && !msg.key.fromMe) {
            try { await sock.sendMessage(msg.key.remoteJid, { text: "I couldn't quite catch that voice note 🙏 could you type it out for me? I'll sort it right away 🙌" }); } catch (e) { /* best effort */ }
            continue;
          }
          // A GENUINE inbound message we simply couldn't parse must NOT be dropped (that was the ad-lead
          // bug). Greet them so a human/ADANOVA engages, and log the shape so we can teach the extractor.
          if (!msg.key.fromMe && !isSkippableContent(content)) {
            console.log('UNPARSED inbound kept — content keys:', Object.keys(content), '| ad:', !!adContext);
            text = 'Hi 👋';
          } else {
            continue;   // reaction / delete / protocol / receipt — nothing to reply to
          }
        }

        if (adContext) console.log('AD LEAD:', adContext.ad_title || '(no title)', '|', adContext.ad_source_url || '', '| text:', String(text).slice(0, 50));

        // Download an image so ADANOVA can actually SEE it (usually the item being shipped, sometimes an
        // address). Images only, size-capped so the webhook payload stays small; best-effort (a failure
        // just means no picture is sent, and she'll ask what it shows).
        let mediaBase64 = null, mediaMime = null;
        if (content.imageMessage && !msg.key.fromMe) {
          try {
            const imgBuf = await downloadMediaMessage(
              msg, 'buffer', {},
              { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
            );
            if (imgBuf && imgBuf.length <= 1500000) {          // ~1.5 MB cap
              mediaBase64 = imgBuf.toString('base64');
              mediaMime = content.imageMessage.mimetype || 'image/jpeg';
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
            wa_msg_id: msg.key.id,   // Bug 7: server-side dedup key for reconnect redelivery
            is_group: msg.key.remoteJid?.endsWith('@g.us') || false,
            direction,
            interactive_selection: interactiveSelection,
            has_media: hasMedia,
            media_url: null,
            media_base64: mediaBase64,   // image bytes so ADANOVA can SEE the item (null if none / too big)
            media_mime: mediaMime,
            location: location,
            ad_context: adContext   // Facebook Click-to-WhatsApp attribution (null if not an ad lead)
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
            body: JSON.stringify(payload),
            // Bound the wait so ONE slow message can't stall every later message in the batch (an intake
            // pile-up cause). 18s sits ABOVE receiveMessage's worst-case synchronous path (a ~15s awaited
            // takeover relay) so we don't abort a genuinely-succeeding request, but still cap a hung/cold one.
            signal: AbortSignal.timeout(18000)
          });
          
          const result = await response.json();
          console.log('Message webhook response:', result);
          if (!response.ok) {
            console.error('Webhook failed with status:', response.status, 'Body:', result);
          } else if (_mid) {
            // Bug 8: only NOW mark the id handled (webhook succeeded) so a failed send stays retry-able.
            _seenMsgIds.add(_mid);
            if (_seenMsgIds.size > 1000) { const _it = _seenMsgIds.values(); for (let _i = 0; _i < 400; _i++) _seenMsgIds.delete(_it.next().value); }
          }
        } catch (error) {
          console.error('Failed to send message webhook:', error.message);
        }
        } catch (_perMsgErr) {
          // Bug 15: swallow a per-message failure (odd shape, media helper, etc.) and keep the batch going.
          console.error('per-message handler error (skipping this message):', _perMsgErr?.message);
          continue;
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
<!-- Build stamp: bump on every change so we can confirm what is actually deployed.
     Check live with:  curl -s https://ldl-baileys-v2.onrender.com/map | grep ldl-build -->
<meta name="ldl-build" content="2026-07-18-14 pink-surfaces">
<meta name="description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds.">
<meta property="og:title" content="Set your delivery — Lasalu Drop">
<meta property="og:description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds">
<meta property="og:type" content="website">
<meta name="theme-color" content="#4F074C">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --plum:#4F074C;--plum-d:#3A0537;--pink:#E23A7C;--pink-soft:#FCEBF2;--lilac:#FBE9F1;
  --ink:#241a29;--ink-2:#6a626f;--ink-3:#a8a0ae;
  --line:#ece7ef;--line-2:#ded6e2;--surface:#fff;--bg:#FBF3F7;
  --amber:#b45309;--amber-line:#ffe0a6;--amber-bg:#fff8ec;
  --r:14px;--r-lg:18px;--r-xl:26px;
  --ease:cubic-bezier(.23,1,.32,1);
  --sh-1:0 1px 2px rgba(58,5,55,.05),0 3px 10px rgba(58,5,55,.05);
  --sh-pop:0 18px 44px rgba(58,5,55,.16);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
input,button,textarea,select{font-family:inherit}
.wrap{max-width:480px;margin:0 auto;background:var(--bg);min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.maphero{position:relative;flex:1 1 auto;min-height:240px}
/* ── premium motion (Bolt-style choreography) ── */
@keyframes stepInR{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
@keyframes stepInL{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}
.stepInR{animation:stepInR .24s cubic-bezier(.23,1,.32,1)}
.stepInL{animation:stepInL .24s cubic-bezier(.23,1,.32,1)}
@keyframes pindrop{0%{transform:translateY(-24px) scale(.4);opacity:0}55%{transform:translateY(3px) scale(1.08);opacity:1}100%{transform:none;opacity:1}}
.pindrop{animation:pindrop .34s cubic-bezier(.34,1.4,.64,1)}
/* Bolt-style location pin: teardrop that gently bounces so it's obviously draggable. */
.pinwrap{position:relative;width:34px;height:48px}
.pinbob{animation:pinbob 1.15s ease-in-out infinite;transform-origin:50% 100%}
.pinsh{position:absolute;left:50%;bottom:3px;width:15px;height:5px;margin-left:-7.5px;border-radius:50%;background:rgba(0,0,0,.3);animation:pinsh 1.15s ease-in-out infinite}
@keyframes pinbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes pinsh{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(.6);opacity:.14}}
@keyframes popin{from{opacity:0;transform:translateY(10px) scale(.88)}to{opacity:1;transform:none}}
.popin{animation:popin .22s cubic-bezier(.23,1,.32,1)}
@keyframes risein{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.risein{animation:risein .24s cubic-bezier(.23,1,.32,1)}
@keyframes sugin{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:none}}
.sug div{animation:sugin .28s var(--ease) both}
.sug div:nth-child(2){animation-delay:.05s}.sug div:nth-child(3){animation-delay:.1s}.sug div:nth-child(4){animation-delay:.15s}.sug div:nth-child(5){animation-delay:.2s}.sug div:nth-child(6){animation-delay:.25s}
.leaflet-overlay-pane path.routeanim{stroke-dasharray:3000;stroke-dashoffset:3000;animation:draw 1.1s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.reuse a,.locp,.mic{transition:transform .14s var(--ease),background .18s var(--ease),opacity .2s}
.reuse a:active{transform:scale(.96)}
/* ── Bolt-style recent/saved places list (map stays visible above, list hides once a route is set) ── */
#rpickup,#rdrop{display:none}
#app.routed .recentlist{display:none}
.recentlist{margin-top:6px}
.recentlist .rr{display:flex;align-items:center;gap:14px;padding:15px 4px;border-bottom:1px solid var(--line);cursor:pointer}
.recentlist .rr:active{background:var(--lilac)}
.recentlist .rc{width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line-2);display:flex;align-items:center;justify-content:center;font-size:15px;flex:none}
/* rn/rs are spans — they MUST be stacked explicitly or they run together on one line (margin-top is
   ignored on inline elements). Flex column keeps the address above its area, cleanly separated. */
.recentlist .rm{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.recentlist .rn{display:block;font-size:15px;font-weight:600;line-height:1.25;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.recentlist .rs{display:block;font-size:12.5px;font-weight:500;line-height:1.2;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.recentlist .rs:empty{display:none}
/* ── Order summary on the confirm/pay step — review everything before money moves ── */
.summary{background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 16px;margin:0 0 6px}
.summary .route2{display:flex;gap:11px}
.summary .rail2{display:flex;flex-direction:column;align-items:center;padding:5px 0 3px}
.summary .rail2 .d1{width:9px;height:9px;border-radius:50%;background:var(--plum);flex:none}
.summary .rail2 .ln{flex:1;width:2px;background:var(--line-2);margin:4px 0;min-height:16px}
.summary .rail2 .d2{width:9px;height:9px;border-radius:2px;background:var(--pink);flex:none}
.summary .addrs{flex:1;min-width:0}
.summary .a1{font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.3;margin-bottom:14px}
.summary .a2{font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.3}
.summary .srow{display:flex;gap:12px;align-items:flex-start;padding:9px 0 0;margin-top:9px;border-top:1px solid var(--line)}
.summary .sk{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;width:62px;flex:none;padding-top:3px}
.summary .sv{font-size:14px;font-weight:600;color:var(--ink);flex:1;min-width:0;line-height:1.35}
/* Tells the customer exactly what is still missing instead of a silently dead button */
.needhint{font-size:12.5px;font-weight:500;color:var(--amber);text-align:center;margin-top:10px;line-height:1.35}
.needhint:empty{display:none}
.reqtag{font-size:10.5px;font-weight:700;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase;margin-left:6px}
/* Confirm-pickup step — the address big, with a nudge that the pin is draggable */
.pickconf{background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 16px}
.pickconf .pcaddr{font-size:16px;font-weight:700;color:var(--ink);line-height:1.3}
.pickconf .pchint{font-size:12.5px;font-weight:500;color:var(--ink-2);margin-top:7px;line-height:1.4}
.melab{flex:none;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--plum);cursor:pointer;-webkit-user-select:none;user-select:none;padding:12px 0 12px 12px;margin:-12px 0 -12px auto}
.melab input{width:18px;height:18px;accent-color:var(--plum);margin:0;cursor:pointer;flex:none}
.stopc{border:1px solid var(--line-2);border-radius:var(--r-lg);padding:12px 13px 13px;margin-top:11px;background:#fff}
.stophd{display:flex;align-items:center;gap:8px}
.stopdot{width:10px;height:10px;border-radius:50%;flex:none}
.stopdot.pk{background:var(--plum);box-shadow:0 0 0 3px rgba(79,7,76,.14)}
.stopdot.dp{background:var(--pink);box-shadow:0 0 0 3px rgba(226,58,124,.16)}
.stopnm{font-size:13.5px;font-weight:800;color:var(--ink);letter-spacing:.01em}
.stoprole{font-size:11.5px;font-weight:600;color:var(--ink-3)}
.stopadr{font-size:12px;font-weight:600;color:var(--ink-2);margin:4px 0 10px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stopc .reuse{margin:0 0 9px}
.pickbtn{display:none;align-items:center;gap:7px;background:var(--lilac);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;font-size:13px;font-weight:700;color:var(--plum);cursor:pointer;margin:0 0 9px;transition:transform .13s cubic-bezier(.23,1,.32,1)}
.pickbtn:active{transform:scale(.96)}
.pickbtn .i{width:17px;height:17px}
.cover{font-size:12.5px;font-weight:600;color:#166534;margin-top:9px;line-height:1.35}
.search{text-align:center;padding:10px 6px 4px;animation:searchin .18s cubic-bezier(.23,1,.32,1)}
@keyframes searchin{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.search h2{font-size:20px;font-weight:800;color:var(--plum-d);letter-spacing:-.02em;margin:0 0 6px}
.livedot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pink);margin:0 8px 2px 0;vertical-align:middle;animation:livep 1.6s cubic-bezier(.23,1,.32,1) infinite}
@keyframes livep{0%,100%{box-shadow:0 0 0 0 rgba(226,58,124,.35)}50%{box-shadow:0 0 0 6px rgba(226,58,124,0)}}
.search .smut{font-size:13.5px;color:var(--ink-2);line-height:1.45;margin:0 0 2px}
.search .ssub{font-size:12px;color:var(--ink-3);margin:12px 0 0;line-height:1.4}
.sbar{height:4px;border-radius:99px;background:var(--line);overflow:hidden;margin:15px 10px 4px}
.sfill{height:100%;width:6%;border-radius:99px;background:var(--plum);animation:screep 75s cubic-bezier(.25,.6,.3,1) forwards}
@keyframes screep{0%{width:6%}15%{width:34%}45%{width:60%}100%{width:88%}}
.ridericon{width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid var(--plum);box-shadow:0 2px 8px rgba(58,5,55,.25);display:flex;align-items:center;justify-content:center;font-size:15px}
/* glide between GPS fixes — but never during Leaflet's zoom animation (it re-writes the same transform) */
.leaflet-marker-icon.rglide{transition:transform 4.5s linear}   /* glide the FULL gap between 5s GPS fixes — the bike visibly moves, never teleports */
.leaflet-zoom-anim .leaflet-marker-icon.rglide{transition:none}
.radar{position:relative;width:18px;height:18px;pointer-events:none}
.radar span{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(79,7,76,.30);animation:radarp 2.4s ease-out infinite}
.radar span+span{animation-delay:1.2s}
@keyframes radarp{0%{transform:scale(.5);opacity:.9}70%{opacity:.15}100%{transform:scale(8);opacity:0}}
.trk{margin:14px 4px 2px;text-align:left}
.tkrow{position:relative;display:flex;align-items:center;gap:12px;padding:8px 0;animation:tkrowin .22s cubic-bezier(.23,1,.32,1) both}
@keyframes tkrowin{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.tkrow:nth-child(2){animation-delay:.04s}.tkrow:nth-child(3){animation-delay:.08s}.tkrow:nth-child(4){animation-delay:.12s}
/* the rail: each row draws its incoming segment; traversed segments fill plum */
.tkrow+.tkrow::before{content:'';position:absolute;left:10px;top:-8px;width:2px;height:16px;border-radius:2px;background:var(--line-2)}
.tkrow+.tkrow.tk-done::before,.tkrow+.tkrow.tk-cur::before{background:var(--plum)}
.tkd{width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;position:relative;z-index:1}
.tk-done .tkd{background:var(--plum);color:#fff;animation:tkin .22s cubic-bezier(.23,1,.32,1) both}
.tkrow:nth-child(2).tk-done .tkd{animation-delay:.04s}.tkrow:nth-child(3).tk-done .tkd{animation-delay:.08s}.tkrow:nth-child(4).tk-done .tkd{animation-delay:.12s}
@keyframes tkin{from{transform:scale(.6);opacity:.4}to{transform:scale(1);opacity:1}}
.tk-cur .tkd{background:#fff;border:2px solid var(--pink);animation:tkpulse 1.6s ease-in-out infinite}
.tk-todo .tkd{background:#fff;border:2px solid var(--line-2)}
.tkl{font-size:14px;font-weight:600;color:var(--ink)}
.tk-todo .tkl{color:var(--ink-3);font-weight:500}
.tk-cur .tkl{color:var(--plum-d);font-weight:700}
@keyframes tkpulse{0%,100%{box-shadow:0 0 0 3px rgba(226,58,124,.20)}50%{box-shadow:0 0 0 8px rgba(226,58,124,.06)}}
.feenote{font-size:12.5px;color:var(--ink-2);line-height:1.45;margin:12px 2px 0;padding-top:11px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.trkact{display:flex;gap:10px;margin-top:14px}
.trkact button{flex:1;width:auto;height:44px;margin:0;padding:0 10px;background:#fff;border:1.5px solid var(--line-2);border-radius:12px;box-shadow:none;color:var(--plum-d);font-size:13.5px;font-weight:700;letter-spacing:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.trkact button:active{transform:scale(.97)}
.trkact button:disabled{opacity:.55}
.trkact .tkx{border-color:#f2c6c6;color:#b3261e}
.riderrow{display:flex;align-items:center;gap:11px;margin-top:12px;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:13px;text-align:left;animation:riderin .22s cubic-bezier(.23,1,.32,1)}
@keyframes riderin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.rdrav{flex:none;width:38px;height:38px;border-radius:50%;background:var(--plum);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800}
.rdrmeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rdrcap{font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--ink-3);text-transform:uppercase}
.riderrow .rdrnm{font-size:14px;font-weight:800;color:var(--plum-d);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.riderrow .rdrcall{flex:none;display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 15px;border-radius:11px;background:var(--plum);color:#fff;font-size:12.5px;font-weight:800;text-decoration:none;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.riderrow .rdrcall:active{transform:scale(.96)}
/* ── Shipday-style tracker card (owner screenshot 2026-07-25): headline + ETA pill, est-arrival line,
   segmented progress, driver row with round call/chat, collapsible Updates + Order sections ── */
.tkhead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tkhead h2{margin:0}
.etapill{flex:none;background:var(--lilac);border:1px solid var(--line);color:var(--plum);font-size:13px;font-weight:800;border-radius:99px;padding:7px 14px;white-space:nowrap}
.estline{font-size:12.5px;color:var(--ink-2);margin:5px 0 0;font-weight:500}
.tsegs{display:flex;gap:6px;margin:15px 0 3px}
.tseg{flex:1;height:5px;border-radius:99px;background:var(--line-2)}
.tseg.on{background:#16a34a}
.tseg.cur{background:#16a34a;animation:segpulse 1.1s ease-in-out infinite alternate}
@keyframes segpulse{from{opacity:.25}to{opacity:.75}}
.rdrbtns{flex:none;display:flex;gap:8px}
.rdricon{width:40px;height:40px;border-radius:50%;background:var(--lilac);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;color:var(--plum);text-decoration:none;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.rdricon:active{transform:scale(.93)}
.rdricon .i{width:18px;height:18px}
.tacc{border-top:1px solid var(--line);margin-top:12px}
.tacc summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 2px;font-size:14px;font-weight:700;color:var(--ink);cursor:pointer}
.tacc summary::-webkit-details-marker{display:none}
.tacc summary::after{content:'▾';color:var(--ink-3);font-size:12px;transition:transform .18s ease}
.tacc[open] summary::after{transform:rotate(180deg)}
.tacc .taccb{padding:0 2px 12px}
.updrow{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--ink-2);padding:5px 0}
.updrow b{color:var(--ink);font-weight:600}
.ordrow{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--ink-2);padding:4px 0;line-height:1.45}
.ordrow .odot{flex:none;width:8px;height:8px;border-radius:99px;margin-top:4px}
/* In-app chat with the rider — a sheet over the tracker, never leaves the app. */
.chatwrap{position:fixed;inset:0;z-index:4000;background:rgba(26,10,23,.45);display:flex;align-items:flex-end}
.chatpanel{width:100%;max-height:82vh;display:flex;flex-direction:column;background:var(--surface);border-radius:var(--r-xl) var(--r-xl) 0 0;animation:rise .28s var(--ease)}
.chathead{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid var(--line);font-size:15px;font-weight:800;color:var(--ink)}
.chathead button{width:auto;background:none;border:0;box-shadow:none;color:var(--ink-3);font-size:19px;padding:0 4px;cursor:pointer}
.chatbody{flex:1;overflow-y:auto;padding:14px 15px;min-height:170px;display:flex;flex-direction:column;gap:8px}
.chatempty{color:var(--ink-3);font-size:13px;text-align:center;margin:auto;line-height:1.6;padding:0 12px}
.cmsg{display:flex}.cmsg.me{justify-content:flex-end}
.cbub{max-width:78%;padding:10px 13px;border-radius:15px;font-size:14px;line-height:1.45;word-break:break-word}
.cmsg.me .cbub{background:var(--plum);color:#fff;border-bottom-right-radius:5px}
.cmsg.them .cbub{background:var(--bg);border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:5px}
.chatfoot{display:flex;gap:9px;padding:12px 14px;border-top:1px solid var(--line)}
.chatfoot input{flex:1;padding:13px 15px;border:1.5px solid var(--line-2);border-radius:13px;font-size:15px;outline:none}
.chatfoot input:focus{border-color:var(--plum)}
.chatfoot button{width:auto;padding:0 20px;border-radius:13px;font-size:14.5px;font-weight:800}
.rdricon{position:relative}
.chatdot{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--magenta);color:#fff;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--surface)}
/* Peak period — more orders than free riders. Informational: it nudges, it never inflates the fare. */
.surgebox{display:flex;gap:10px;align-items:flex-start;background:#fff8ec;border:1px solid #ffe0a6;border-radius:var(--r);padding:12px 14px;margin:14px 0 0;font-size:12.5px;color:#8a5a12;line-height:1.5;font-weight:600}
.surgebox b{color:#6b430b}
/* Handover code — the receiver's proof-of-identity digits, shown only to them. */
.codebox{margin:14px 0 0;background:var(--lilac);border:1.5px dashed var(--plum);border-radius:var(--r-lg);padding:14px;text-align:center}
.codecap{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2)}
.codeval{font-size:38px;font-weight:800;letter-spacing:.16em;color:var(--plum);line-height:1.15;margin:4px 0 2px}
.codenote{font-size:11.5px;color:var(--ink-2);font-weight:600;line-height:1.45}
.codehint{margin:12px 0 0;background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:12.5px;color:var(--ink-2);font-weight:600;line-height:1.5}
.paybtn{display:block;width:100%;margin:12px 0 0;padding:13px;background:#fff;border:1.5px solid var(--plum);border-radius:var(--r-lg);color:var(--plum);font-size:14px;font-weight:800;letter-spacing:0;box-shadow:none;cursor:pointer}
.paybtn:disabled{opacity:.55;background:#fff;color:var(--plum)}
.tknew{display:block;width:100%;margin:10px 0 0;padding:10px 0;background:none;border:none;box-shadow:none;color:var(--plum);font-size:13px;font-weight:700;letter-spacing:0;cursor:pointer;height:auto;transition:transform .16s cubic-bezier(.23,1,.32,1),opacity .16s ease}
.tknew:active{transform:scale(.98);opacity:.75}
#pickok{display:flex;align-items:center;justify-content:center;gap:9px}
/* The payment label used to be a bare text node, so the price had no room and broke onto two lines
   ("+" above "N200"). Give the text its own flex box and pin the price to a single line. */
.payopt .pt{flex:1;min-width:0;line-height:1.35}
.payopt .sur{flex:none;white-space:nowrap;margin-left:auto;padding-left:12px;font-size:14px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
/* ── Draggable bottom sheet (Bolt-style) — pull the handle up to fill the screen, down to see more map ── */
.wrap{height:100dvh;overflow:hidden}
.maphero{min-height:60px}
.sheet{overflow-y:auto;overscroll-behavior:contain;padding-top:0}
.sheet.snapping{transition:height .28s cubic-bezier(.32,.72,0,1)}
.grab{position:sticky;top:0;z-index:6;width:100%;height:auto;background:var(--surface);margin:0 0 8px;padding:11px 0 12px;border-radius:var(--r-xl) var(--r-xl) 0 0;cursor:grab;touch-action:none;display:flex;justify-content:center}
.grab::after{content:"";width:42px;height:5px;border-radius:99px;background:var(--line-2)}
.grab:active{cursor:grabbing}
/* ── Tap-driven details (less typing) ── */
.chipwrap{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 2px}
/* NOTE: the base button rule (width:100%, padding, box-shadow) MUST be fully reset here, or chips stack full-width. */
.ichip{width:auto;flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.5px solid var(--line-2);border-radius:11px;padding:9px 13px;font-size:14px;font-weight:600;line-height:1;letter-spacing:0;color:var(--ink);box-shadow:none;cursor:pointer;transition:transform .13s cubic-bezier(.23,1,.32,1),background .15s ease,border-color .15s ease,color .15s ease}
.ichip:active{transform:scale(.95)}
.ichip.on{background:var(--plum);border-color:var(--plum);color:#fff;box-shadow:none}
.morebtn{width:auto;display:inline-flex;align-items:center;gap:6px;background:none;border:0;border-radius:0;box-shadow:none;color:var(--plum);font-weight:600;font-size:13.5px;letter-spacing:0;padding:9px 2px;margin:0;cursor:pointer;text-align:left}
.morebtn:active{opacity:.55;transform:none}
.dotlive{width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block;margin-right:7px;box-shadow:0 0 0 3px rgba(22,163,74,.18)}
#continue,#tonext{display:flex;align-items:center;justify-content:center;gap:9px}
/* Past the route step the fee lives in the sheet, so the map badge would only be clipped — hide it.
   EXCEPT the details (phones) step: there's no fee box there, and the customer should never lose
   sight of the price/offer they just locked in — the badge stays pinned on the map. */
#app.instep .pricetop{display:none !important}
#app.stepdetails .pricetop{display:flex !important}
.etabadge .i,.riderchip .i{opacity:.9}
/* ── Icon system — one stroke weight, optical sizing, inherits colour ── */
.i{width:19px;height:19px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.ichip .i{width:18px;height:18px;opacity:.75}
.ichip.on .i{opacity:1}
.morebtn .i{width:16px;height:16px}
.recentlist .rc .i{width:18px;height:18px;color:var(--ink-2)}
.payopt .i{width:20px;height:20px;color:var(--ink-3)}
.payopt:has(input:checked) .i{color:var(--plum)}
.locp .i,.mic .i,.clr .i{width:19px;height:19px}
.locp.busy{opacity:.4}
.locp.busy .i{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.clr .i{width:16px;height:16px}
/* Press feedback — every pressable surface answers the finger */
button,.reuse a,.recentlist .rr{transition:transform .16s cubic-bezier(.23,1,.32,1),background .16s cubic-bezier(.23,1,.32,1)}
button:active:not(:disabled),.recentlist .rr:active{transform:scale(.97)}
#map{position:absolute;inset:0}
.leaflet-container{z-index:1}
.scrim{position:absolute;left:0;right:0;bottom:0;height:78px;background:linear-gradient(to bottom,rgba(247,244,248,0),var(--bg));z-index:2;pointer-events:none}
.etabadge{position:absolute;top:16px;right:14px;z-index:1000;background:rgba(255,255,255,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:13px;padding:9px 13px;box-shadow:var(--sh-1);font-size:13.5px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:6px}
.etabadge .d{color:var(--ink-2);font-weight:500;font-size:12px}
.pricetop{position:absolute;bottom:22px;right:14px;z-index:1000;background:var(--plum);color:#fff;border-radius:15px;padding:9px 16px;box-shadow:0 8px 22px rgba(79,7,76,.34);white-space:nowrap;align-items:baseline;gap:8px}
.pricetop .cap{font-size:10.5px;font-weight:600;color:#e7b9df;text-transform:uppercase;letter-spacing:.09em}
.pricetop .amt{font-size:19px;font-weight:800;letter-spacing:-.02em}
/* Negotiating: the pill KEEPS the recommended fare and shows the offer as its own second line, so the
   customer always sees both numbers and knows they're bargaining. */
.pricetop.neg{flex-wrap:wrap;justify-content:center}
.pricetop .off{flex-basis:100%;font-size:11.5px;font-weight:800;background:rgba(255,255,255,.17);border-radius:8px;padding:3px 9px;margin-top:5px;text-align:center;letter-spacing:.01em}
@keyframes pop{from{opacity:0;transform:translateY(7px) scale(.95)}to{opacity:1;transform:none}}
.riderchip{position:absolute;top:16px;left:14px;z-index:1000;background:rgba(255,255,255,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:13px;padding:8px 12px;box-shadow:var(--sh-1);font-size:12.5px;font-weight:600;color:var(--plum-d);display:none;align-items:center;gap:6px}
.sheet{position:relative;z-index:3;flex:0 0 auto;margin-top:-26px;background:var(--surface);border-radius:var(--r-xl) var(--r-xl) 0 0;box-shadow:0 -1px 0 var(--line),0 -14px 34px rgba(58,5,55,.08);padding:9px 17px 24px;animation:rise .45s var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.grab{width:38px;height:4px;border-radius:99px;background:var(--line-2);margin:0 auto 14px}
.sec{font-size:11.5px;font-weight:700;color:var(--ink-2);text-transform:uppercase;letter-spacing:.07em;margin:22px 2px 10px}
.sec.first{margin-top:2px}
h2{margin:2px 2px 16px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.route{display:flex;gap:11px;align-items:stretch;background:var(--lilac);border-radius:var(--r-lg);padding:2px 10px 2px 15px;border:1px solid var(--line)}
.rail{display:flex;flex-direction:column;align-items:center;padding:20px 0}
.rail .dot{width:11px;height:11px;border-radius:50%;background:var(--plum);box-shadow:0 0 0 4px rgba(226,58,124,.16)}
.rail .line{flex:1;width:2px;background:var(--line-2);margin:6px 0;min-height:20px;border-radius:2px}
.rail .sq{width:11px;height:11px;border-radius:3px;background:var(--pink)}
.ins{flex:1;min-width:0}
.ri{position:relative;display:flex;align-items:center}
.ri input{flex:1;min-width:0;border:0;background:transparent;padding:15px 0;font-size:16px;outline:none;color:var(--ink);font-weight:500}
.ri input::placeholder{color:var(--ink-3);font-weight:400}
.divln{height:1px;background:var(--line-2)}
.locp{width:38px;min-width:38px;height:38px;padding:0;border:0;background:transparent;font-size:17px;color:var(--plum);cursor:pointer;border-radius:10px;transition:background .15s var(--ease),transform .12s var(--ease)}
.locp:active{background:rgba(79,7,76,.09);transform:scale(.92)}
.clr{width:30px;min-width:30px;height:30px;margin-right:5px;padding:0;border:0;background:transparent;color:var(--ink-3);font-size:15px;cursor:pointer;display:none;border-radius:50%;transition:background .15s var(--ease)}
.clr:active{background:rgba(79,7,76,.08)}
.sug{position:absolute;z-index:2000;top:100%;left:-15px;right:-15px;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);margin-top:6px;box-shadow:var(--sh-pop);overflow:hidden;max-height:240px;overflow-y:auto}
.sug div{padding:14px 16px;font-size:15px;border-bottom:1px solid var(--line);color:var(--ink)}
.sug div:last-child{border-bottom:0}
.sug div:active{background:var(--lilac)}
.lbl2{font-size:12.5px;color:var(--ink-2);font-weight:600;margin:14px 2px 7px}
.lbl2 .hint{font-weight:400;color:var(--ink-2)}
.hint{font-size:12px;color:var(--ink-2);font-weight:400}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.row2 input,.f1{width:100%;padding:14px 15px;border:1px solid var(--line);background:#fff;border-radius:var(--r);font-size:16px;color:var(--ink);outline:none;transition:border-color .15s var(--ease),box-shadow .15s var(--ease)}
.f1{margin-top:11px}
.row2 input::placeholder,.f1::placeholder{color:var(--ink-3)}
.row2 input:focus,.f1:focus{border-color:var(--plum);box-shadow:0 0 0 3px rgba(79,7,76,.10)}
.reuse{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.reuse:empty{display:none}
.reuse a{display:inline-flex;align-items:center;gap:9px;max-width:100%;background:#fff;border:1px solid var(--line);border-radius:13px;padding:8px 14px 8px 9px;cursor:pointer;box-shadow:0 1px 2px rgba(16,12,20,.05);transition:border-color .15s var(--ease),background .15s var(--ease),transform .12s var(--ease)}
.reuse a .ric{flex:none;width:24px;height:24px;border-radius:50%;background:var(--lilac);color:var(--plum);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.reuse a .rl{display:flex;flex-direction:column;min-width:0;line-height:1.25}
.reuse a .rt{font-size:10.5px;font-weight:700;color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em}
.reuse a .rv{font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
.reuse a:active{transform:scale(.97)}
.reuse a.on{background:var(--plum);border-color:var(--plum);box-shadow:0 4px 12px rgba(79,7,76,.22)}
.reuse a.on .rt{color:rgba(255,255,255,.72)}
.reuse a.on .rv{color:#fff}
.reuse a.on .ric{background:rgba(255,255,255,.22);color:#fff}
.payopt{display:flex;align-items:center;gap:11px;padding:14px;border:1px solid var(--line);border-radius:var(--r);margin-bottom:9px;font-size:14.5px;font-weight:500;color:var(--ink);cursor:pointer;transition:border-color .15s var(--ease),background .15s var(--ease)}
.payopt input{width:19px;height:19px;accent-color:var(--plum);flex:none}
.payopt:has(input:checked){border-color:var(--plum);background:var(--lilac)}
.payopt#opt-cod input{accent-color:var(--amber)}
.payopt#opt-cod:has(input:checked){border-color:var(--amber);background:var(--amber-bg)}
.negpaynote{display:none;background:var(--lilac);border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;font-size:13px;color:var(--ink-2);line-height:1.55;margin-bottom:9px}
.negpaynote b{color:var(--ink)}
.feebig{display:none;align-items:center;justify-content:space-between;background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 18px;margin:16px 0 0}
/* ── inDrive-style fare card (route screen): recommended fare centred, − / + steppers to name your price ── */
#farecard{align-items:center;gap:10px;background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin:16px 0 0}
.fbtn{width:46px;height:46px;flex:none;border-radius:50%;background:#fff;border:1.5px solid var(--line-2);color:var(--plum);box-shadow:none;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer}
.fbtn .i{width:20px;height:20px;stroke-width:2.2}
.fbtn:disabled{opacity:.3}
.fmid{flex:1;text-align:center;min-width:0}
.famt{font-size:24px;font-weight:800;color:var(--plum);letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.famt .was{font-size:13px;color:var(--ink-3);text-decoration:line-through;font-weight:600;margin-left:6px}
.flbl{font-size:11.5px;color:var(--ink-2);font-weight:600;margin-top:2px}
.autorow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 4px 0}
.autolbl{font-size:13.5px;font-weight:600;color:var(--ink)}
.fartog{width:46px;height:26px;flex:none;border-radius:13px;background:var(--line-2);position:relative;cursor:pointer;transition:background .18s ease}
.fartog span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:left .18s ease}
.fartog.on{background:var(--plum)}
.fartog.on span{left:23px}
.feebig .lbl{font-size:13px;color:var(--ink-2);font-weight:600}
.feebig .sub{font-size:12px;color:var(--ink-2);margin-top:2px;font-weight:500}
.feebig .amt{font-size:23px;font-weight:800;color:var(--plum);letter-spacing:-.02em}
button{width:100%;padding:17px;border:0;border-radius:var(--r-lg);background:var(--plum);color:#fff;font-size:16.5px;font-weight:700;letter-spacing:-.01em;-webkit-appearance:none;cursor:pointer;box-shadow:0 6px 18px rgba(79,7,76,.26);transition:transform .14s var(--ease),background .2s var(--ease),box-shadow .2s var(--ease)}
button:active:not(:disabled){transform:scale(.985)}
button:disabled{background:var(--line);color:var(--ink-3);box-shadow:none;cursor:default}
#go{margin-top:12px}
.done{text-align:center;padding:52px 22px}.done h2{font-size:24px;color:var(--plum-d);font-weight:800}
.muted{color:var(--ink-2);font-size:12.5px;text-align:center;margin-top:22px}
.wabtn{display:inline-block;margin-top:20px;padding:16px 30px;background:var(--plum);color:#fff;border-radius:var(--r-lg);text-decoration:none;font-weight:700;font-size:16.5px;box-shadow:0 6px 18px rgba(79,7,76,.26)}
.reveal{animation:fade .35s var(--ease)}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body><div class="wrap" id="app">
<div class="maphero"><div id="map"></div><div id="riderchip" class="riderchip"></div><div id="pricetop" class="pricetop" style="display:none"></div><div id="eta" class="etabadge" style="display:none"></div><div class="scrim"></div></div>
<div class="sheet">
<div class="grab"></div>
<div id="step-route">
<div class="sec first">Where to?</div>
<div class="route">
  <div class="rail"><span class="dot"></span><span class="line"></span><span class="sq"></span></div>
  <div class="ins">
    <div class="ri"><input id="pin" placeholder="Pickup" autocomplete="off"><button type="button" class="clr" data-clr="pickup" aria-label="Clear pickup"><svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button><button type="button" class="locp" data-for="pickup" aria-label="Use my location for pickup"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5"/></svg></button><div class="sug" id="psug" style="display:none"></div></div>
    <div class="divln"></div>
    <div class="ri"><input id="din" placeholder="Drop-off" autocomplete="off"><button type="button" class="clr" data-clr="dropoff" aria-label="Clear drop-off"><svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button><button type="button" class="locp" data-for="dropoff" aria-label="Use my location for drop-off"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5"/></svg></button><div class="sug" id="dsug" style="display:none"></div></div>
  </div>
</div>
<div class="reuse" id="rpickup"></div>
<div class="reuse" id="rdrop"></div>
<div class="recentlist" id="recentlist"></div>
<div id="farecard" style="display:none">
  <button type="button" class="fbtn" id="fminus" aria-label="Lower your offer"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
  <div class="fmid" id="fmid"><div class="famt" id="famt"></div><div class="flbl" id="flbl">Recommended fare</div></div>
  <button type="button" class="fbtn" id="fplus" aria-label="Raise your offer"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
</div>
<div class="autorow" id="autorow" style="display:none"><div class="autolbl" id="autolbl">Auto-accept offer</div><div class="fartog" id="fartog"><span></span></div></div>
<button id="continue" style="display:none;margin-top:16px" onclick="routeNext()">Continue<svg class="i" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
</div>
<div id="step-pickup" style="display:none">
<a onclick="showStep(1)" style="display:inline-flex;align-items:center;gap:6px;color:#4F074C;font-weight:600;font-size:13.5px;cursor:pointer;margin:2px 2px 8px">&lsaquo; Back to route</a>
<div class="sec first">Where should the rider come?</div>
<div class="pickconf" id="pickconf"></div>
<button id="pickok" style="margin-top:16px" onclick="showStep(3)">Confirm pickup<svg class="i" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
</div>
<div id="step-details" style="display:none">
<a id="backstep" onclick="showStep(2)" style="display:inline-flex;align-items:center;gap:6px;color:#4F074C;font-weight:600;font-size:13.5px;cursor:pointer;margin:2px 2px 6px">&lsaquo; Back to pickup</a>
<div class="sec first">What are you sending?<span class="reqtag">Required</span></div>
<div class="chipwrap" id="itemchips">
  <button type="button" class="ichip" data-i="Documents"><svg class="i" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8.5 13h7M8.5 17h5"/></svg>Documents</button>
  <button type="button" class="ichip" data-i="Food"><svg class="i" viewBox="0 0 24 24"><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M12 4v3.5"/><path d="M2.5 20h19"/></svg>Food</button>
  <button type="button" class="ichip" data-i="Clothes"><svg class="i" viewBox="0 0 24 24"><path d="M15 3a3 3 0 0 1-6 0L4.5 5.2 6 9.5l2-.8V21h8V8.7l2 .8 1.5-4.3z"/></svg>Clothes</button>
  <button type="button" class="ichip" data-i="Parcel"><svg class="i" viewBox="0 0 24 24"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>Parcel</button>
  <button type="button" class="ichip" data-i="Gadget"><svg class="i" viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="2.5"/><path d="M11.5 18.5h1"/></svg>Gadget</button>
  <button type="button" class="ichip" data-i="Medicine"><svg class="i" viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a5 5 0 0 0-7-7l-10 10a5 5 0 0 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>Meds</button>
  <button type="button" class="ichip" data-i="Gift"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 5.5 12 8c0-2.5 2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>Gift</button>
  <button type="button" class="ichip" data-i="__other"><svg class="i" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>Other</button>
</div>
<input id="item" class="f1" placeholder="Type what you're sending" style="display:none;margin-top:2px">
<button type="button" class="morebtn" id="addnote"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add a note for the rider</button>
<div id="notebox" style="display:none;margin-top:8px">
  <div class="chipwrap">
    <button type="button" class="ichip nchip" data-n="Call on arrival">Call on arrival</button>
    <button type="button" class="ichip nchip" data-n="Fragile — handle with care">Fragile</button>
    <button type="button" class="ichip nchip" data-n="Wait at the gate">Wait at the gate</button>
  </div>
  <input id="dinstr" class="f1" placeholder="Or type your own — gate code, landmark…" maxlength="200" style="margin-top:8px">
</div>
<div class="sec">Who's on this trip?<span class="reqtag">Required</span></div>
<div class="hint" style="margin:2px 2px 10px;color:var(--ink-3)">Tick who you are — your side fills in automatically.</div>
<div class="stopc">
  <div class="stophd"><span class="stopdot pk"></span><span class="stopnm">Pickup</span><label class="melab" id="mepk_w"><input type="checkbox" id="mepk">I am the sender</label></div>
  <div class="stopadr" id="cpaddr"></div>
  <button type="button" class="pickbtn" id="pickc_s"><svg class="i" viewBox="0 0 24 24"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7.8 16.5a4.4 4.4 0 0 1 8.4 0"/></svg>Pick from my contacts</button>
  <div class="row2"><input id="sname" placeholder="Name (optional)"><input id="sphone" type="tel" inputmode="tel" placeholder="Phone"></div>
  <div class="cover" id="pkcover" style="display:none">✓ If this stop is you, leave it blank — we already have your number</div>
</div>
<div class="stopc">
  <div class="stophd"><span class="stopdot dp"></span><span class="stopnm">Receiver</span><label class="melab" id="merc_w"><input type="checkbox" id="merc">I am the receiver</label></div>
  <div class="stopadr" id="cdaddr"></div>
  <div class="reuse" id="rrecv"></div>
  <button type="button" class="pickbtn" id="pickc_r"><svg class="i" viewBox="0 0 24 24"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7.8 16.5a4.4 4.4 0 0 1 8.4 0"/></svg>Pick from my contacts</button>
  <div class="row2"><input id="rname" placeholder="Name (optional)"><input id="rphone" type="tel" inputmode="tel" placeholder="Phone"></div>
  <div class="cover" id="dpcover" style="display:none">✓ If this stop is you, leave it blank — we already have your number</div>
</div>
<div id="codrphint" class="hint" style="display:none;color:#b45309;margin:8px 2px 0">For collect-on-delivery, add the <b>Receiver</b> (buyer) phone — they get the payment request.</div>
<button id="tonext" disabled style="margin-top:18px" onclick="detailsNext()">Continue<svg class="i" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
<div class="needhint" id="needhint"></div>
</div>
<div id="step-pay" style="display:none">
<a onclick="showStep(3)" style="display:inline-flex;align-items:center;gap:6px;color:#4F074C;font-weight:600;font-size:13.5px;cursor:pointer;margin:2px 2px 8px">&lsaquo; Back to details</a>
<div class="sec first">Check your order</div>
<div class="summary" id="paysummary"></div>
<div id="paysel" style="margin-top:2px">
  <div class="sec">Payment</div>
  <div id="payradios">
    <label class="payopt"><input type="radio" name="pay" value="now" checked style="width:18px;height:18px;accent-color:#4F074C"><svg class="i" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg><span class="pt">Pay now (card or transfer)</span></label>
    <label class="payopt" id="opt-pod" style="display:none"><input type="radio" name="pay" value="pod" style="width:18px;height:18px;accent-color:#4F074C"><svg class="i" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg><span class="pt">Pay on delivery — cash to the rider</span></label>
  </div>
  <label class="payopt" id="opt-cod" style="display:none"><input type="checkbox" id="codbox" style="width:18px;height:18px;accent-color:#b45309"><svg class="i" viewBox="0 0 24 24"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg><span class="pt">The buyer hasn't paid for the item yet — we collect it for you</span></label>
  <div id="codamt" style="display:none;margin-top:4px">
    <div style="font-size:12.5px;color:#6a626f;font-weight:700;margin:8px 2px 6px">How much should we collect from the buyer? (₦)</div>
    <input id="goods" type="number" inputmode="numeric" min="1" placeholder="e.g. 100000" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
    <div id="codbreak" style="display:none;margin-top:8px;background:#fff8ec;border:1px solid #ffe0a6;border-radius:12px;padding:12px 14px"></div>
    <div style="font-size:11.5px;color:#9a7b3a;margin-top:7px">The buyer pays this on delivery, <b>Lasalu collects it</b> (comes to us — <b>not your account</b>), and the rider hands over the item only once it's paid.</div>
    <div id="bankbox" style="display:none;margin-top:14px;border-top:1px dashed #ffe0a6;padding-top:12px">
      <div style="font-size:12.5px;color:#6a626f;font-weight:700;margin:0 2px 6px">Where should we pay you? <span style="font-weight:500;color:#9a7b3a">(so we can settle you same-day)</span></div>
      <input id="acctno" type="text" inputmode="numeric" maxlength="10" placeholder="Account number (10 digits)" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
      <div style="position:relative;margin-top:8px">
        <input id="bankcode" type="text" autocomplete="off" placeholder="Type your bank name…" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
        <div id="banksug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:20;margin-top:4px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #ffe0a6;border-radius:11px;box-shadow:0 12px 32px rgba(58,5,55,.16)"></div>
      </div>
      <div id="acctname" style="display:none;margin-top:8px;font-size:13px;font-weight:700"></div>
    </div>
    <div id="banksaved" style="display:none;margin-top:14px;border-top:1px dashed #ffe0a6;padding-top:12px;font-size:13px;color:#166534">We'll pay you to <b><span id="banklabel"></span></b>. <a href="#" id="bankchange" style="color:#E23A7C;text-decoration:underline;font-weight:600">change</a></div>
  </div>
</div>
<div class="feebig" id="fee"></div>
<button id="go" disabled>Confirm &amp; book</button>
</div>
</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
// Running INSIDE the native app? Then there is no chat to "go back" to — every "Back to WhatsApp"
// button/copy is nonsense there (owner rule 2026-07-27). The app injects __LDL_APP__ before the page
// loads (instant, works offline); the session's app_origin flag confirms it a moment later.
var APPMODE=(function(){try{return !!window.__LDL_APP__;}catch(e){return false;}})();
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.app_origin)APPMODE=true;if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent=APPMODE?"This booking link has expired — please go back and start again.":"This link has already been used or expired — go back to WhatsApp and ask me for a fresh link";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
// The ONE place "Back to WhatsApp" is allowed: a chat customer in a mobile browser. Never in the app.
function waCta(label){ return APPMODE ? '' : '<a class="wabtn" href="https://wa.me/2349110218825">'+(label||'Back to WhatsApp →')+'</a>'; }
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/mapPicker";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
// ── Funnel checkpoints ── best-effort, once per step per visit. These decide (with real numbers, not
// guesses) whether the phones step is where customers quit — i.e. whether the "type details while riders
// bid" variant is worth building. Never blocks or breaks the flow.
var FUNNEL_SENT={};
function track(step){ if(FUNNEL_SENT[step])return; FUNNEL_SENT[step]=1; try{ fetch(api('action=funnel&step='+encodeURIComponent(step)),{method:'POST'}).catch(function(){}); }catch(e){} }
var picked={pickup:null,dropoff:null};
// ── BATCH mode (/bulk) ── the SAME map flow, but you ADD several drops and book them together.
// Everything batch is gated on BATCH, so /map is completely unaffected.
var BATCH = location.pathname.indexOf('/bulk') > -1;
var DROPS = [];   // completed drops: {pickup,dropoff,receiver_name,receiver_phone,item,note}
var BULK_API = "https://wbsczuwofdrliloueskw.supabase.co/functions/v1/bulkOrders";
var VENDOR_API = "https://wbsczuwofdrliloueskw.supabase.co/functions/v1/vendorOrders"; // COD (collect the buyer's payment)
var SENDER_NAME='', SENDER_PHONE='';   // captured once (bulk = one sender, many drops)
var BATCH_PICKUP=null;                  // the single pickup, set once and reused for every drop
var BT={list:[],timer:null,pn:0};      // batch tracker state
var map,mP,mD;
function initMap(){
  // Open at street level (15), not city level (12) — at 12 the roads barely render.
  map=L.map('map',{zoomControl:false,attributionControl:false}).setView([4.8156,7.0498],16);
  // CARTO **Voyager** rastertiles. The old URL was light_all — CARTO's minimal wash, which has almost no
  // street names or POIs (why the map looked empty next to Bolt). Voyager carries road labels, POIs and
  // building detail; detectRetina pulls @2x tiles so it stays sharp on phones.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,detectRetina:true,attribution:'© OpenStreetMap © CARTO'}).addTo(map);
  L.control.attribution({position:'bottomright',prefix:false}).addTo(map);
  setTimeout(function(){ map.invalidateSize(); },250);
}
// Bolt-style teardrop pin that gently bounces so it reads as draggable. Plum = pickup,
// magenta = drop-off; the tip sits on the exact spot, a soft shadow pulses beneath it.
function pinIcon(which){
  var col = which==='pickup' ? '#4F074C' : '#E23A7C';
  var html = '<div class="pinwrap">'
    + '<div class="pinsh"></div>'
    + '<div class="pinbob"><svg width="34" height="44" viewBox="0 0 24 32" fill="none">'
    + '<path d="M12 1.2C6 1.2 1.2 6 1.2 11.9 1.2 19.7 12 30.8 12 30.8s10.8-11.1 10.8-18.9C22.8 6 18 1.2 12 1.2z" fill="' + col + '" stroke="#fff" stroke-width="1.8"/>'
    + '<circle cx="12" cy="11.6" r="4.4" fill="#fff"/></svg></div>'
    + '</div>';
  return L.divIcon({className:'',iconSize:[34,48],iconAnchor:[17,44],html:html});
}
// Real on-shift rider dots (anonymous + privacy-fuzzed by the server). Refreshes every ~25s so the
// dots drift roughly with the riders — like Bolt/inDrive, but honest (no fake bikes, no ETA promises).
var riderDots=[];
function bikeIcon(){return L.divIcon({className:'',iconSize:[34,34],iconAnchor:[17,17],html:'<div style="width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 3px 11px rgba(58,5,55,.3);border:1px solid rgba(58,5,55,.08);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="#4F074C" aria-hidden="true"><path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.79-2.21-5-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.63 0-3-1.37-3-3s1.37-3 3-3 3 1.37 3 3-1.37 3-3 3z"/></svg></div>'});}
function loadRiders(){
  fetch(api('action=riders')).then(function(r){return r.json();}).then(function(j){
    var rs=(j&&j.riders)||[];
    riderDots.forEach(function(m){map.removeLayer(m);});riderDots=[];
    rs.forEach(function(p){riderDots.push(L.marker([p.lat,p.lng],{icon:bikeIcon(),interactive:false,zIndexOffset:-200,opacity:.9}).addTo(map));});
    var chip=document.getElementById('riderchip');
    if(chip){if(rs.length){chip.style.display='flex';chip.innerHTML='<span class="dotlive"></span>'+rs.length+' rider'+(rs.length>1?'s':'')+' nearby';}else{chip.style.display='none';}}
  }).catch(function(){});
}
// Reveal the next step only when the previous one is done — one simple thing at a time.
function reveal(id){var e=document.getElementById(id);if(e&&e.style.display==='none'){e.style.display='';e.className=(e.className?e.className+' ':'')+'reveal';}}
// Two-step flow: Step 1 = set the route (map + price), Step 2 = details + confirm. One focus per screen.
function anim(el,cls){if(!el)return;el.classList.remove('stepInL','stepInR','risein');void el.offsetWidth;el.classList.add(cls);}
// Resize the draggable sheet to a fraction of the screen (with a smooth snap + map re-measure).
// Size the sheet to the CONTENT it actually holds (capped at maxFrac of the screen), so a short
// step never leaves dead white space below the button. Still fully draggable afterwards.
function sheetH(maxFrac){
  var sh=document.querySelector('.sheet'); if(!sh)return;
  var vh=window.innerHeight||700;
  var cur=sh.getBoundingClientRect().height;
  sh.classList.remove('snapping');
  sh.style.height='auto';
  var natural=sh.scrollHeight;              // natural height of the visible step
  sh.style.height=cur+'px';                 // restore so the transition has a start value
  void sh.offsetHeight;                     // force reflow
  sh.classList.add('snapping');
  sh.style.height=Math.max(Math.round(vh*0.26),Math.min(Math.round(vh*maxFrac),natural))+'px';
  setTimeout(function(){try{map.invalidateSize();}catch(e){}},350);
}
// Escape anything the customer typed before it touches innerHTML.
function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// Who the booker is (from prefill) — printed on the summary for whichever side they left blank,
// so "You" is their real name and number, exactly what the rider will be given.
var MYNAME='', MYPHONE='';
// "This is me" — a one-tap declaration per stop card. NOT a mode: it simply fills that side with
// the booker's own details (or marks it covered when their number is hidden) and leaves the other
// card as the only thing to complete. Filling both stops by hand still works exactly as before.
var MESIDE='', MEFILL_S=false, MEFILL_R=false;
function digTail(v){ var s=String(v||''),d='',i,c; for(i=0;i<s.length;i++){ c=s.charAt(i); if(c>='0'&&c<='9')d+=c; } return d.slice(-10); }
function isMyNum(v){ return !!(MYPHONE&&v&&digTail(v)===digTail(MYPHONE)); }
// The gate must be satisfied by the OTHER person's phone — the booker's own number alone books an
// order where the rider can reach nobody but the booker (both ends auto-fill to them). Their own
// side is covered without typing anything.
function otherPhoneOk(sp,rp){ return (phoneOk(sp)&&!isMyNum(sp))||(phoneOk(rp)&&!isMyNum(rp)); }
function updateMeChips(){
  var a=document.getElementById('mepk'), b=document.getElementById('merc');
  var aw=document.getElementById('mepk_w'), bw=document.getElementById('merc_w');
  var cod=document.getElementById('codbox'), codOn=!!(cod&&cod.checked);
  if(a)a.checked=(MESIDE==='pickup');
  if(b)b.checked=(MESIDE==='recv');
  // You can only be ONE of them: ticking a side hides the other box entirely.
  // COD also keeps the Receiver box away — that seat belongs to the buyer.
  if(aw)aw.style.display=(MESIDE==='recv')?'none':'';
  if(bw)bw.style.display=(MESIDE==='pickup'||codOn)?'none':'';
}
function clearMe(side){
  var n,p;
  if(side==='pickup'&&MEFILL_S){ n=document.getElementById('sname'); p=document.getElementById('sphone');
    if(n&&n.value===(MYNAME||''))n.value=''; if(p&&isMyNum(p.value)){ p.value=''; p.dispatchEvent(new Event('input')); } MEFILL_S=false; }
  if(side==='recv'&&MEFILL_R){ n=document.getElementById('rname'); p=document.getElementById('rphone');
    if(n&&n.value===(MYNAME||''))n.value=''; if(p&&isMyNum(p.value)){ p.value=''; p.dispatchEvent(new Event('input')); } MEFILL_R=false; }
}
function setMe(side){
  if(MESIDE===side){ clearMe(side); MESIDE=''; updateMeChips(); validate(); return; }
  if(MESIDE)clearMe(MESIDE);
  MESIDE=side;
  var n,p;
  if(MYPHONE){
    if(side==='pickup'){ n=document.getElementById('sname'); p=document.getElementById('sphone');
      if(n&&(!n.value||MEFILL_S))n.value=MYNAME||''; if(p){ p.value=MYPHONE; p.dispatchEvent(new Event('blur')); } MEFILL_S=true; }
    else { n=document.getElementById('rname'); p=document.getElementById('rphone');
      if(n&&(!n.value||MEFILL_R))n.value=MYNAME||''; if(p){ p.value=MYPHONE; p.dispatchEvent(new Event('blur')); } MEFILL_R=true; }
  }
  updateMeChips(); validate();
}
// The confirm screen: show the whole order back to them before any money moves.
function buildSummary(){
  var el=document.getElementById('paysummary'); if(!el)return;
  var h='<div class="route2"><div class="rail2"><span class="d1"></span><span class="ln"></span><span class="d2"></span></div><div class="addrs">'
      + '<div class="a1">'+esc(picked.pickup?picked.pickup.address:'')+'</div>'
      + '<div class="a2">'+esc(picked.dropoff?picked.dropoff.address:'')+'</div></div></div>';
  var sn=val('sname'), sp=val('sphone'), rn=val('rname'), rp=val('rphone'), it=val('item'), nt=val('dinstr');
  // Both stops ALWAYS show who's there — name · phone when given. The blank side is the booker
  // (their WhatsApp number fills it at booking), and the summary says so instead of hiding the row:
  // this is the last look before money moves, so a wrong number must be catchable here.
  function who(nm,ph){
    var tag=' <span style="color:var(--ink-2);font-weight:500">(you)</span>';
    var mine=isMyNum(ph);
    if(nm&&ph)return esc(nm+' · '+ph)+(mine?tag:'');
    if(nm||ph)return esc(nm||ph)+(mine?tag:'');
    if(MYPHONE)return esc((MYNAME?(MYNAME+' · '):'')+MYPHONE)+tag;
    return '<span style="color:var(--ink-2);font-weight:500">You — your WhatsApp number</span>'; }
  h+='<div class="srow"><span class="sk">Pickup</span><span class="sv">'+who(sn,sp)+'</span></div>';
  h+='<div class="srow"><span class="sk">Receiver</span><span class="sv">'+who(rn,rp)+'</span></div>';
  if(it)     h+='<div class="srow"><span class="sk">Sending</span><span class="sv">'+esc(it)+'</span></div>';
  if(nt)     h+='<div class="srow"><span class="sk">Note</span><span class="sv">'+esc(nt)+'</span></div>';
  el.innerHTML=h;
}
// The exact pickup spot, shown big so they can drag the pin if GPS put it on the wrong side of the road.
function buildPickConf(){
  var el=document.getElementById('pickconf'); if(!el)return;
  el.innerHTML='<div class="pcaddr">'+esc(picked.pickup?picked.pickup.address:'')+'</div>'
    +'<div class="pchint">Drag the purple pin on the map if the rider should come somewhere else.</div>';
}
// 4 steps: 1 route → 2 confirm pickup → 3 details → 4 check & pay.
function showStep(n){
  var r=document.getElementById('step-route'),k=document.getElementById('step-pickup'),
      d=document.getElementById('step-details'),p=document.getElementById('step-pay'),
      sh=document.querySelector('.sheet'),app=document.getElementById('app');
  if(!r||!k||!d||!p)return;
  function only(el,cls){ [r,k,d,p].forEach(function(x){ x.style.display='none'; }); el.style.display=''; anim(el,cls); if(sh)sh.scrollTop=0; }
  if(n===2){
    if(!(picked.pickup&&picked.dropoff))return;
    buildPickConf(); only(k,'stepInR'); if(app){app.classList.remove('instep');app.classList.remove('stepdetails');} sheetH(0.44);
    // Zoom right in on the pickup so the exact spot is obvious and the pin is easy to drag.
    setTimeout(function(){ try{ map.invalidateSize(); map.flyTo([picked.pickup.lat,picked.pickup.lng],18,{duration:.7}); }catch(e){} },360);
  }
  else if(n===3){
    // Anchor each contact to its real address so the booker knows which stop is which
    // (drop-off = my friend's place → I put her number there; my own end I leave blank).
    var _cp=document.getElementById('cpaddr'); if(_cp) _cp.textContent=picked.pickup?picked.pickup.address:'';
    var _cd=document.getElementById('cdaddr'); if(_cd) _cd.textContent=picked.dropoff?picked.dropoff.address:'';
    // Coming BACK to details: re-sync the "This is me" boxes (claimed side ticked, other hidden,
    // and COD keeps the Receiver box away — that seat belongs to the buyer).
    updateMeChips();
    only(d,'stepInR'); if(app){app.classList.add('instep');if(!BATCH)app.classList.add('stepdetails');} sheetH(0.9);
  }
  else if(n===4){ buildSummary(); if(typeof syncPayForOffer==='function')syncPayForOffer(); only(p,'stepInR'); if(app){app.classList.add('instep');app.classList.remove('stepdetails');} sheetH(0.9); }
  else { only(r,'stepInL'); if(app){app.classList.remove('instep');app.classList.remove('stepdetails');} sheetH(0.6); }
}
// Reveal the "Continue" button only once both ends are set (and the map is pricing the trip).
// Price-first flow (/map only): the moment both pins land, the inDrive-style FARE CARD appears right here
// on the route screen — recommended fare centred, − / + to name your own price, auto-accept toggle under
// it. The customer strikes their deal before typing anything; details stay on their own step.
function step(){
  var c=document.getElementById('continue');if(!c)return;
  var show=!!(picked.pickup&&picked.dropoff);
  if(show){if(c.style.display==='none'||!c.style.display){c.style.display='block';anim(c,'risein');}}else c.style.display='none';
  if(!BATCH){ if(show)track('route_set'); renderFareCard(); }
}
// ── BATCH module ── /map ends the details step by going to Pay; /bulk ADDS the drop to a batch and
// resets the map for the next one, then books them all together via bulkOrders. All gated on BATCH.
// ── Two-phase batch flow ── PHASE 1: pin ALL the drop-off locations (fast, map only). PHASE 2:
// one scrollable card per numbered stop to fill item + receiver. Then review price + book.
// /map is untouched (routeNext→step2, detailsNext→step4).
function routeNext(){ if(BATCH){ addLocation(); } else { showStep(2); } }
function detailsNext(){ if(!BATCH){ track('phones_done'); showStep(4); } }
var dropMarkers=[];
var ITEMS=[['Documents',''],['Food',''],['Clothes',''],['Parcel',''],['Gadget',''],['Medicine',''],['Gift','']];
// PHASE 1 — add a drop-off LOCATION only (no details yet); keep the one pickup fixed.
function addLocation(){
  if(!(picked.pickup&&picked.dropoff))return;
  if(!SENDER_PHONE){ SENDER_NAME=val('sname')||MYNAME||''; SENDER_PHONE=val('sphone')||MYPHONE||''; }
  if(!BATCH_PICKUP){ BATCH_PICKUP={address:picked.pickup.address,lat:picked.pickup.lat,lng:picked.pickup.lng}; }
  DROPS.push({ dropoff:{address:picked.dropoff.address,lat:picked.dropoff.lat,lng:picked.dropoff.lng},
    receiver_name:'', receiver_phone:'', item:'', note:'', cod:false, goods:'' });
  try{ var n=DROPS.length; var mk=L.marker([picked.dropoff.lat,picked.dropoff.lng],{interactive:false,zIndexOffset:400,icon:L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],html:'<div class="dropnum">'+n+'</div>'})}).addTo(map); dropMarkers.push(mk); }catch(e){}
  try{ clearLoc('dropoff'); }catch(e){}
  picked.pickup=BATCH_PICKUP;
  batchBar(); batchPrompt();
  showStep(1);
}
function rebuildDropMarkers(){
  dropMarkers.forEach(function(m){ try{ map.removeLayer(m); }catch(e){} }); dropMarkers=[];
  DROPS.forEach(function(d,i){ try{ var mk=L.marker([d.dropoff.lat,d.dropoff.lng],{interactive:false,zIndexOffset:400,icon:L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],html:'<div class="dropnum">'+(i+1)+'</div>'})}).addTo(map); dropMarkers.push(mk); }catch(e){} });
}
// Route-step guidance: pickup first, then each numbered drop-off.
var ORDS=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'];
function ord(n){ return ORDS[n-1] || (n+'th'); }
function batchPrompt(){
  var s=document.querySelector('#step-route .sec.first');
  var n=DROPS.length+1;   // the drop-off they're adding now
  if(s) s.textContent = !BATCH_PICKUP ? 'First, where are we picking up from?' : ('Where is your '+ord(n)+' drop-off?');
  var din=document.getElementById('din'); if(din)din.placeholder = BATCH_PICKUP ? ('Your '+ord(n)+' drop-off') : 'Drop-off';
  var pin=document.getElementById('pin'); if(pin&&BATCH_PICKUP&&!pin.value)pin.value=BATCH_PICKUP.address;
  // The Continue button on the route step COUNTS the drop-off, so it's obvious you're adding more.
  var cn=document.getElementById('continue'); if(cn)cn.innerHTML='Add '+ord(n)+' drop-off <svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  // Little guide under the route once the pickup is set — non-tech-clear "how to finish".
  var hint=document.getElementById('bhint');
  if(hint) hint.textContent = BATCH_PICKUP
    ? (DROPS.length ? ('Add another drop-off, or tap “Continue” below when you’ve added them all.') : ('Pin your first drop-off, then tap “Add first drop-off”.'))
    : 'Set your pickup first, then add each drop-off.';
}
// The floating bar is the clear WAY FORWARD once drop-offs exist — worded as a plain "Continue".
function batchBar(){
  var bar=document.getElementById('batchbar');
  if(!bar){ bar=document.createElement('div'); bar.id='batchbar'; bar.className='batchbar'; document.getElementById('app').appendChild(bar); bar.onclick=showDetails; }
  var n=DROPS.length;
  bar.innerHTML='<span><b>'+n+'</b> drop-off'+(n===1?'':'s')+' added</span><span class="bbgo">Continue &rarr;</span>';
  bar.style.display=n?'flex':'none';
}
// PHASE 2 — a scrollable card per numbered stop: item + receiver, plus pay + book. Over the live map.
function showDetails(){
  if(!DROPS.length)return;
  var bar=document.getElementById('batchbar'); if(bar)bar.style.display='none';
  var ov=document.getElementById('batchsheet');
  if(!ov){ ov=document.createElement('div'); ov.id='batchsheet'; ov.className='batchsheet'; document.getElementById('app').appendChild(ov); }
  // COD is a PER-STOP choice, not a batch switch — most buyers have already paid the vendor; the
  // vendor ticks only the stops where WE should collect the buyer's payment on delivery.
  var codAllowed = !!(document.getElementById('opt-cod') && document.getElementById('opt-cod').style.display!=='none');
  var cards=DROPS.map(function(d,i){
    var chips=ITEMS.map(function(it){ return '<button type="button" class="lchip'+(d.item===it[0]?' on':'')+'" data-i="'+i+'" data-it="'+it[0]+'">'+it[1]+' '+it[0]+'</button>'; }).join('');
    var codBlock = codAllowed
      ? '<label class="lcodtog"><input type="checkbox" class="lcod" data-i="'+i+'"'+(d.cod?' checked':'')+'> This buyer hasn&rsquo;t paid yet — collect it on delivery</label>'
        +'<input class="lgoods" data-i="'+i+'" type="number" inputmode="numeric" placeholder="Collect ₦ from this buyer" value="'+esc(d.goods||'')+'" style="display:'+(d.cod?'block':'none')+';margin-top:8px">'
      : '';
    return '<div class="loccard" data-card="'+i+'"><div class="lchd"><span class="lcn">'+(i+1)+'</span><span class="lca">'+esc(String(d.dropoff.address).split(',').slice(0,2).map(function(x){return x.trim();}).join(', '))+'</span><button type="button" class="lcx" data-i="'+i+'" aria-label="Remove">&times;</button></div>'
      +'<div class="lchips">'+chips+'</div>'
      +'<input class="litem" data-i="'+i+'" placeholder="…or type what&rsquo;s going here" value="'+esc(d.item)+'">'
      +'<div class="lrow2"><input class="lrn" data-i="'+i+'" placeholder="Receiver name" value="'+esc(d.receiver_name)+'"><input class="lrp" data-i="'+i+'" type="tel" inputmode="tel" placeholder="Receiver phone *" value="'+esc(d.receiver_phone)+'"></div>'
      +codBlock+'</div>'; }).join('');
  var podRow = (POD_SURCHARGE>=0 && document.getElementById('opt-pod') && document.getElementById('opt-pod').style.display!=='none')
    ? '<label class="bpayopt"><input type="radio" name="bpay" value="pod"> Pay on delivery — cash to each rider</label>' : '';
  ov.innerHTML='<div class="bpanel"><div class="bgrab"></div><div class="bph"><b>What&rsquo;s going to each stop?</b><button type="button" class="bclose" id="bclose">&times;</button></div>'
    +'<p class="bsub">Pickup: '+esc(String(BATCH_PICKUP?BATCH_PICKUP.address:'').split(',')[0])+' &middot; '+DROPS.length+' stop'+(DROPS.length>1?'s':'')+' <span id="btot"></span></p>'
    +'<div class="loclist">'+cards+'</div>'
    +'<button type="button" id="badd" class="bsecondary">＋ Add another location</button>'
    +'<div class="bpaylbl">How do you want to pay for delivery?</div>'
    +'<div class="bpayw"><label class="bpayopt"><input type="radio" name="bpay" value="now" checked> Pay all now (card or transfer)</label>'+podRow+'</div>'
    +'<button type="button" id="bbook" class="bprimary">Book '+DROPS.length+' deliver'+(DROPS.length>1?'ies':'y')+'</button></div>';
  ov.style.display='flex';
  document.getElementById('bclose').onclick=function(){ ov.style.display='none'; batchBar(); };
  document.getElementById('badd').onclick=function(){ ov.style.display='none'; try{ batchPrompt(); }catch(e){} showStep(1); };
  document.getElementById('bbook').onclick=function(){ var pm=(document.querySelector('input[name=bpay]:checked')||{}).value||'now'; bookBatch(pm); };
  // Item chips → set that stop's item + fill its text field.
  Array.prototype.forEach.call(ov.querySelectorAll('.lchip'),function(c){ c.onclick=function(){ var i=Number(c.getAttribute('data-i')), it=c.getAttribute('data-it'); DROPS[i].item=it;
    Array.prototype.forEach.call(ov.querySelectorAll('.lchip[data-i="'+i+'"]'),function(x){x.classList.toggle('on',x===c);});
    var f=ov.querySelector('.litem[data-i="'+i+'"]'); if(f)f.value=it; }; });
  // Typed item / receiver fields → live-bind to the stop.
  Array.prototype.forEach.call(ov.querySelectorAll('.litem'),function(f){ f.oninput=function(){ var i=Number(f.getAttribute('data-i')); DROPS[i].item=f.value.trim();
    Array.prototype.forEach.call(ov.querySelectorAll('.lchip[data-i="'+i+'"]'),function(x){x.classList.toggle('on',x.getAttribute('data-it')===f.value.trim());}); }; });
  Array.prototype.forEach.call(ov.querySelectorAll('.lrn'),function(f){ f.oninput=function(){ DROPS[Number(f.getAttribute('data-i'))].receiver_name=f.value.trim(); }; });
  Array.prototype.forEach.call(ov.querySelectorAll('.lrp'),function(f){ f.oninput=function(){ DROPS[Number(f.getAttribute('data-i'))].receiver_phone=f.value.trim(); }; });
  Array.prototype.forEach.call(ov.querySelectorAll('.lgoods'),function(f){ f.oninput=function(){ DROPS[Number(f.getAttribute('data-i'))].goods=f.value.replace(/[^0-9.]/g,''); }; });
  // Per-stop COD toggle — reveals the "collect ₦" amount for THAT stop only. Default off = already paid.
  Array.prototype.forEach.call(ov.querySelectorAll('.lcod'),function(c){ c.onchange=function(){ var i=Number(c.getAttribute('data-i')); DROPS[i].cod=c.checked;
    var g=ov.querySelector('.lgoods[data-i="'+i+'"]'); if(g){ g.style.display=c.checked?'block':'none'; if(!c.checked){ DROPS[i].goods=''; g.value=''; } if(c.checked)g.focus(); }
    syncBookLabel(); }; });
  function syncBookLabel(){ var anyCod=DROPS.some(function(d){return d.cod;});
    // When any stop is unpaid, vendorOrders settles the delivery fees (from what we collect / on
    // arrival), so the batch "pay for delivery" choice doesn't apply — swap it for a plain note.
    var pw=ov.querySelector('.bpayw'), pl=ov.querySelector('.bpaylbl');
    if(pw)pw.style.display=anyCod?'none':'block'; if(pl)pl.style.display=anyCod?'none':'block';
    var note=ov.querySelector('.bcodnote');
    if(!note&&pl){ note=document.createElement('div'); note.className='bnote bcodnote'; note.style.textAlign='left'; pl.parentNode.insertBefore(note,pl); }
    if(note){ note.style.display=anyCod?'block':'none'; note.textContent='We collect payment from the buyers you marked and pay you out; the rest are delivered as already-paid.'; }
    var bb=document.getElementById('bbook'); if(bb)bb.innerHTML=anyCod?'Book &mdash; collect where marked':('Book '+DROPS.length+' deliver'+(DROPS.length>1?'ies':'y')); }
  syncBookLabel();
  Array.prototype.forEach.call(ov.querySelectorAll('.lcx'),function(b){ b.onclick=function(){ DROPS.splice(Number(b.getAttribute('data-i')),1); rebuildDropMarkers(); if(DROPS.length)showDetails(); else { ov.style.display='none'; batchBar(); try{ batchPrompt(); }catch(e){} } }; });
  // Live total (best-effort; the book re-prices authoritatively).
  fetch(BULK_API+'?session='+encodeURIComponent(SESSION)+'&action=quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveries:dropsPayload()})})
    .then(function(r){return r.json();}).then(function(j){ if(j&&j.total){ var t=document.getElementById('btot'); if(t)t.textContent='· Total ₦'+Number(j.total).toLocaleString(); } }).catch(function(){});
}
// The one pickup (BATCH_PICKUP) is shared by every stop; each stop carries its own drop-off + details.
function dropsPayload(){ return DROPS.map(function(d){ return {
  pickup_address:BATCH_PICKUP.address, pickup_coords:BATCH_PICKUP.lat+','+BATCH_PICKUP.lng,
  delivery_address:d.dropoff.address, delivery_coords:d.dropoff.lat+','+d.dropoff.lng,
  receiver_name:d.receiver_name, receiver_phone:d.receiver_phone, item:d.item, delivery_instruction:d.note }; }); }
function bookBatch(pm){
  // Every stop needs an item + a valid receiver phone; the stops you MARKED as unpaid also need a collect amount.
  for(var i=0;i<DROPS.length;i++){ var d=DROPS[i], ph=String(d.receiver_phone||'').replace(/\\D/g,''), g=Number(String(d.goods||'').replace(/[^0-9.]/g,''));
    var miss=[]; if(!d.item)miss.push('an item'); if(ph.length<10)miss.push('a valid receiver phone'); if(d.cod&&!(g>0))miss.push('how much to collect from the buyer');
    if(miss.length){ alert('Stop '+(i+1)+' still needs '+miss.join(' and ')+'.');
      var card=document.querySelector('.loccard[data-card="'+i+'"]'); if(card)card.scrollIntoView({behavior:'smooth',block:'center'}); return; } }
  var anyCod=DROPS.some(function(d){return d.cod;});
  var btn=document.getElementById('bbook'); var lbl=btn?btn.innerHTML:''; if(btn){ btn.disabled=true; btn.textContent='Booking…'; }
  function fail(msg){ if(btn){ btn.disabled=false; btn.innerHTML=lbl; } alert(msg); }
  // ── No stop marked unpaid → every buyer already paid the vendor → plain deliveries via bulkOrders.
  if(!anyCod){
    fetch(BULK_API+'?session='+encodeURIComponent(SESSION),{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session:SESSION,sender_name:SENDER_NAME,sender_phone:SENDER_PHONE,pay_method:pm,deliveries:dropsPayload()})})
     .then(function(r){return r.json();}).then(function(j){
       if(j&&j.mode==='now'&&j.payment_url){ document.getElementById('app').innerHTML='<div class="done"><h2>Opening secure payment…</h2><p class="muted">One moment</p></div>'; window.location.href=j.payment_url; return; }
       if(j&&j.orders&&j.orders.length){ openBatchTracker(j.orders); return; }
       if(j&&j.ok){ document.getElementById('app').innerHTML='<div class="done"><h2>All set!</h2><p class="muted">'+(j.booked||DROPS.length)+' deliveries created — a rider is being assigned to each.</p></div>'; return; }
       fail((j&&j.error)?('Couldn\\'t book: '+j.error):'Couldn\\'t book just now — please try again.');
     }).catch(function(){ fail('Network hiccup — try again.'); });
    return;
  }
  // ── Some stops are unpaid → vendorOrders handles the WHOLE batch in one call (one session claim):
  // it COLLECTS the buyer's payment on the marked stops and simply DELIVERS the already-paid ones.
  var orders=DROPS.map(function(d){ var o={ buyer_name:d.receiver_name, buyer_phone:d.receiver_phone,
    address:d.dropoff.address, delivery_coords:d.dropoff.lat+','+d.dropoff.lng, item:d.item };
    if(d.cod){ o.goods_value=String(d.goods||'').replace(/[^0-9.]/g,''); } else { o.paid=true; } return o; });
  fetch(VENDOR_API+'?session='+encodeURIComponent(SESSION),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({session:SESSION,shop_address:BATCH_PICKUP.address,pickup_coords:BATCH_PICKUP.lat+','+BATCH_PICKUP.lng,orders:orders})})
   .then(function(r){return r.json();}).then(function(j){
     if(j&&j.ok&&j.results){ var okd=j.results.filter(function(r){return r.ok;});
       if(okd.length){ openBatchTracker(okd.map(function(r){return {n:r.order_number,receiver:r.buyer};})); return; }
       fail('Couldn\\'t book: '+(((j.results.filter(function(r){return !r.ok;})[0])||{}).error||'check the amounts & addresses')); return; }
     fail((j&&j.error)?('Couldn\\'t book: '+j.error):'Couldn\\'t book just now — please try again.');
   }).catch(function(){ fail('Network hiccup — try again.'); });
}
// Live batch tracker — one status chip per delivery (same pipeline as the standalone /bulk tracker).
function bChip(st){ if(st==='delivered')return '<span class="bchip bc-del">Delivered ✓</span>'; if(st==='failed'||st==='cancelled')return '<span class="bchip bc-fail">'+(st==='failed'?'Failed':'Cancelled')+'</span>'; if(st==='ontheway')return '<span class="bchip bc-otw">On the way</span>'; if(st==='assigned')return '<span class="bchip bc-asg">Rider assigned</span>'; return '<span class="bchip bc-wait">Finding rider…</span>'; }
// A delivery can be called off by the client only while it hasn't been picked up — finding-a-rider ('')
// or rider-assigned. Once it's on the way / delivered / already cancelled, the cancel option disappears.
function btCancellable(st){ return st===''||st==='assigned'; }
function btRender(){
  var rows=BT.list.map(function(o,i){
    var line='<div class="nm">'+esc(o.receiver||'Delivery')+(o.rider?('<span class="rd">'+esc(o.rider)+'</span>'):'')+'</div>'+bChip(o.status);
    var act= o.cancelling ? '<div class="btca btca-wait">Cancelling…</div>'
           : btCancellable(o.status) ? '<button class="btca" onclick="cancelBatchOrder('+i+')">Cancel this delivery</button>' : '';
    return '<div class="btrow">'+line+act+'</div>';
  }).join('');
  var doneAll=BT.list.length&&BT.list.every(function(o){return o.status==='delivered'||o.status==='failed'||o.status==='cancelled';});
  var deliveredN=BT.list.filter(function(o){return o.status==='delivered';}).length;
  // Only say "All delivered" when they ALL actually delivered — a cancelled/failed stop must not be counted
  // as a happy delivery. Otherwise summarise honestly.
  var doneMsg=(deliveredN===BT.list.length)?'All delivered — thanks for shipping with us':(deliveredN+' of '+BT.list.length+' delivered — the rest were cancelled or didn\\'t complete');
  document.getElementById('app').innerHTML='<div class="brevfull"><h2>Your deliveries</h2><p class="bsub">Live status of each rider — updated as they move.</p><div class="btrk">'+rows+'</div>'
    +(doneAll?((BATCH||APPMODE)?'<p class="bnote">'+doneMsg+'</p>':waCta())
             :'<p class="bnote">Updates land here'+((BATCH||APPMODE)?'':' and in your WhatsApp chat')+' — you can close this page.</p>')+'</div>';
  if(doneAll&&BT.timer){clearInterval(BT.timer);BT.timer=null;}
}
function openBatchTracker(orders){
  BT.list=orders.map(function(o){return {n:o.n,receiver:o.receiver,status:'',rider:''};}); BT.pn=0; btRender();
  if(BT.timer)clearInterval(BT.timer);
  BT.timer=setInterval(function(){ BT.pn++; if(BT.pn>360){clearInterval(BT.timer);BT.timer=null;return;}
    fetch(BULK_API+'?session='+encodeURIComponent(SESSION)+'&action=batchstatus&orders='+encodeURIComponent(BT.list.map(function(o){return o.n;}).join(',')))
     .then(function(r){return r.json();}).then(function(j){ if(!j||!j.list)return; var by={}; j.list.forEach(function(x){by[x.n]=x;}); var chg=false;
       BT.list.forEach(function(o){ if(o.status==='cancelled'||o.cancelling)return; /* locally terminal — a lagging poll must not revive it */ var u=by[o.n]; if(u){ if((u.status||'')!==o.status||String(u.rider||'')!==String(o.rider||''))chg=true; o.status=u.status||o.status; o.rider=u.rider||o.rider; }}); if(chg)btRender();
     }).catch(function(){});
  },10000);
}
// Client-side cancel of ONE delivery in the batch (server re-checks ownership + "not picked up yet").
function cancelBatchOrder(i){
  var o=BT.list[i]; if(!o||o.cancelling||!btCancellable(o.status))return;
  if(!confirm('Cancel the delivery to '+(o.receiver||'this stop')+'? The rest of your batch is unaffected.'))return;
  o.cancelling=true; btRender();
  var _to={}; try{ if(window.AbortSignal&&AbortSignal.timeout)_to={signal:AbortSignal.timeout(25000)}; }catch(e){}
  fetch(BULK_API+'?session='+encodeURIComponent(SESSION)+'&action=cancelorder&order='+encodeURIComponent(o.n),Object.assign({method:'POST'},_to))
   .then(function(r){return r.json();}).then(function(j){
     o.cancelling=false;
     if(j&&(j.cancelled||j.already)){ o.status='cancelled'; btRender(); return; }
     if(j&&j.error==='too-late'){ o.status='ontheway'; btRender(); alert('That delivery has already been picked up, so it can no longer be cancelled here. Message us on WhatsApp and we will sort it out.'); return; }
     btRender(); alert('Could not cancel just now — please try again, or message us on WhatsApp.');
   }).catch(function(){ o.cancelling=false; btRender(); alert('Network hiccup — please try again.'); });
}
// Batch-mode chrome: relabel the route CTA to "Add location", inject the batch CSS. Batch NEVER
// uses the single-delivery details/pay steps — phase 2 is the card overlay (showDetails).
function initBatch(){
  // A plain-language guide sits under the route inputs, before the Continue button, so a
  // non-tech customer always knows what to do next (pin a drop-off, or continue when done).
  var cn=document.getElementById('continue');
  if(cn&&!document.getElementById('bhint')){ var hn=document.createElement('div'); hn.id='bhint'; hn.className='bhint'; cn.parentNode.insertBefore(hn,cn); }
  try{ batchPrompt(); }catch(e){}
  var css='.bhint{font-size:12.5px;color:var(--ink-2);line-height:1.5;margin:14px 2px 2px;padding:11px 13px;background:var(--bg);border:1px solid var(--line);border-radius:12px}'
   +'.batchbar{position:fixed;left:14px;right:14px;bottom:16px;z-index:1400;display:none;align-items:center;justify-content:space-between;gap:10px;background:var(--plum);color:#fff;border-radius:16px;padding:15px 18px;box-shadow:0 14px 34px rgba(58,5,55,.4);font-size:14.5px;font-weight:700;cursor:pointer;animation:barpop .3s var(--ease)}'
   +'@keyframes barpop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
   +'.batchbar .bbgo{font-size:14px;font-weight:800;background:rgba(255,255,255,.18);padding:7px 13px;border-radius:99px}.batchbar b{font-size:16px}'
   +'.batchsheet{position:fixed;inset:0;z-index:1500;display:none;align-items:flex-end;background:rgba(30,4,28,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}'
   +'.bpanel{width:100%;max-width:480px;margin:0 auto;background:var(--bg);border-radius:26px 26px 0 0;padding:8px 16px calc(18px + env(safe-area-inset-bottom));max-height:88vh;overflow-y:auto;animation:rise .4s var(--ease)}'
   +'.bgrab{width:40px;height:4px;border-radius:99px;background:var(--line-2);margin:6px auto 12px}'
   +'.bph{display:flex;align-items:center;justify-content:space-between;padding:0 2px}.bph b{font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-.02em}'
   +'.bclose{width:34px;height:34px;background:#fff;border:1px solid var(--line);border-radius:50%;font-size:19px;color:var(--ink-2);cursor:pointer;line-height:1}'
   +'.bsub{font-size:13px;color:var(--ink-2);margin:5px 2px 14px;line-height:1.5}.bsub #btot{font-weight:800;color:var(--plum)}'
   +'.brev,.brevfull{padding:20px 18px}.brevfull h2,.brev h2{font-size:22px;font-weight:800;margin:6px 2px 4px}'
   +'.btrk{margin:2px 0 6px}.btrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 13px;background:#fff;border:1px solid var(--line-2);border-radius:13px;margin-bottom:9px}'
   +'.btca{flex-basis:100%;margin-top:2px;padding-top:10px;border:none;border-top:1px solid var(--line);background:none;text-align:left;color:#b3261e;font-size:12.5px;font-weight:700;cursor:pointer}.btca:active{opacity:.6}'
   +'.btca-wait{color:var(--ink-3);cursor:default;font-weight:600}'
   +'.btrow .nm{flex:1;min-width:0;font-size:13.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.btrow .rd{display:block;font-size:11px;font-weight:600;color:var(--ink-3);margin-top:2px}'
   +'.btrow .bx{flex:none;width:28px;height:28px;border:none;background:var(--bg);border-radius:50%;color:var(--ink-3);font-size:16px;cursor:pointer}'
   +'.bchip{flex:none;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:99px;font-size:11.5px;font-weight:800}'
   +'.bc-wait{background:var(--bg);color:var(--ink-2);border:1px solid var(--line-2)}.bc-asg{background:var(--lilac);color:var(--plum)}.bc-otw{background:var(--pink-soft);color:#a3255f}.bc-del{background:#e8f6ec;color:#166534}.bc-fail{background:#fdecec;color:#b3261e}'
   +'.bpayw{margin:6px 0 4px}.bpayopt{display:flex;align-items:center;gap:10px;padding:14px;border:1.5px solid var(--line-2);border-radius:14px;margin-top:9px;font-size:13.5px;font-weight:700;color:var(--ink);cursor:pointer;background:#fff;transition:border-color .15s var(--ease),background .15s var(--ease)}.bpayopt:has(input:checked){border-color:var(--plum);background:var(--lilac)}.bpayopt input{width:19px;height:19px;accent-color:var(--plum)}'
   +'.bsecondary{width:100%;margin:2px 0 12px;padding:13px 0;background:none;border:1.5px dashed var(--line-2);border-radius:14px;color:var(--plum);font-size:13.5px;font-weight:800;cursor:pointer;transition:transform .16s var(--ease)}.bsecondary:active{transform:scale(.98)}'
   +'.bprimary{width:100%;margin-top:8px;padding:16px 0;background:var(--plum);color:#fff;border:none;border-radius:16px;font-size:15.5px;font-weight:800;cursor:pointer;box-shadow:0 12px 28px rgba(79,7,76,.32);transition:transform .16s var(--ease)}.bprimary:active{transform:scale(.985)}'
   +'.bnote{font-size:12px;color:var(--ink-3);text-align:center;margin-top:10px}'
   +'.dropnum{width:26px;height:26px;border-radius:50%;background:var(--pink);color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(226,58,124,.45);border:2px solid #fff}'
   +'.loclist{margin:2px 0 6px}'
   +'.loccard{background:#fff;border:1px solid var(--line);border-radius:20px;padding:15px 15px 16px;margin-bottom:13px;box-shadow:0 1px 2px rgba(58,5,55,.04),0 8px 20px rgba(58,5,55,.05);animation:locin .3s var(--ease) both}'
   +'@keyframes locin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
   +'.loccard:nth-child(2){animation-delay:.04s}.loccard:nth-child(3){animation-delay:.08s}.loccard:nth-child(4){animation-delay:.12s}.loccard:nth-child(n+5){animation-delay:.15s}'
   +'.lchd{display:flex;align-items:center;gap:11px;margin-bottom:12px}'
   +'.lcn{flex:none;width:30px;height:30px;border-radius:10px;background:var(--plum);color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center}'
   +'.lca{flex:1;min-width:0;font-size:14.5px;font-weight:800;color:var(--ink);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
   +'.lcx{flex:none;width:28px;height:28px;border:none;background:var(--bg);border-radius:50%;color:var(--ink-3);font-size:16px;cursor:pointer;line-height:1}'
   +'.lchips{display:flex;gap:7px;margin-bottom:9px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.lchips::-webkit-scrollbar{display:none}'
   +'.lchip{flex:0 0 auto;width:auto;padding:8px 13px;border-radius:999px;border:1.5px solid var(--line-2);background:#fff;font-size:12.5px;font-weight:700;color:var(--ink-2);cursor:pointer;white-space:nowrap;transition:transform .14s var(--ease)}.lchip:active{transform:scale(.95)}.lchip.on{border-color:var(--plum);background:var(--plum);color:#fff}'
   +'.litem,.lrow2 input,.lgoods{width:100%;padding:12px 14px;border:1.5px solid transparent;background:var(--bg);border-radius:12px;font-size:14.5px;color:var(--ink);outline:none;transition:border-color .15s var(--ease),background .15s var(--ease)}'
   +'.litem::placeholder,.lrow2 input::placeholder,.lgoods::placeholder{color:var(--ink-3)}'
   +'.litem:focus,.lrow2 input:focus,.lgoods:focus{border-color:var(--plum);background:#fff}'
   +'.lrow2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}'
   +'.lgoods{margin-top:8px;background:var(--amber-bg);border-color:var(--amber-line)}.lgoods:focus{border-color:var(--amber);background:#fff}'\n   +'.lcodtog{display:flex;align-items:flex-start;gap:9px;margin-top:11px;padding-top:11px;border-top:1px dashed var(--line);font-size:12.5px;font-weight:600;color:var(--ink-2);line-height:1.4;cursor:pointer}.lcodtog input{width:18px;height:18px;flex:none;accent-color:var(--amber);margin-top:1px}'\n   +'.bpaylbl{font-size:13px;font-weight:800;color:var(--ink);margin:10px 2px 2px}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
}
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
  // Bolt-style: the camera glides to frame the trip instead of snapping.
  if(pts.length>1){ try{ map.flyToBounds(pts,{padding:[45,45],maxZoom:17,duration:.9}); }catch(e){ map.fitBounds(pts,{padding:[45,45],maxZoom:17}); } }
  else if(pts.length===1){ try{ map.flyTo(pts[0],17,{duration:.8}); }catch(e){ map.setView(pts[0],17); } }
  validate();
  if(picked.pickup&&picked.dropoff)quote();
  // Once both ends are set a route exists — hide the recent list (Continue takes over). Map stays visible.
  if(picked.pickup&&picked.dropoff){ document.getElementById('app').classList.add('routed'); }
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
    try{ buildPickConf(); }catch(e){}             // keep the confirm-pickup panel in step with a dragged pin
  }).catch(function(){ fld.value=picked[which].address; });
}
// Show/hide the little clear button when a field has text.
function showClr(which,on){ var b=document.querySelector('.clr[data-clr="'+which+'"]'); if(b)b.style.display=on?'block':'none'; }
// Wipe one end so the customer can re-enter it cleanly (the button + when they retype).
function clearLoc(which){
  var inp=document.getElementById(which==='pickup'?'pin':'din'); inp.value='';
  var old=which==='pickup'?mP:mD; if(old)map.removeLayer(old); if(which==='pickup')mP=null;else mD=null;
  picked[which]=null;
  var sug=document.getElementById(which==='pickup'?'psug':'dsug'); if(sug)sug.style.display='none';
  if(routeLine){map.removeLayer(routeLine);routeLine=null;}
  document.getElementById('app').classList.remove('routed');
  mapFee=null;
  var fe=document.getElementById('fee'); if(fe)fe.style.display='none';
  var et=document.getElementById('eta'); if(et)et.style.display='none';
  var pt=document.getElementById('pricetop'); if(pt)pt.style.display='none';
  if(liveSide===which){ liveSide=null; lockOtherLoc(); }   // release the one-spot live-location lock
  showClr(which,false); validate(); inp.focus();
}
// The chatting customer's own name/number (from prefill) — placed on whichever side they locate.
var YOU_NAME='', YOU_PHONE='', COD_PCT=1.75;
// Live location is ONE physical spot — only one end (pickup OR drop-off) can use it.
var liveSide=null;
function lockOtherLoc(){ Array.prototype.forEach.call(document.querySelectorAll('.locp'),function(b){ var f=b.getAttribute('data-for'); if(liveSide && f!==liveSide){ b.disabled=true; b.style.opacity='0.3'; b.title='Your live location is one spot — type the other end'; } else { b.disabled=false; b.style.opacity=''; b.title=''; } }); }
// Use the customer's GPS for EITHER the pickup or the drop-off. Pickup = they're sending (their
// details go to Sender); drop-off = they're receiving (their details go to Receiver).
// silent = the automatic pickup default on page open. It must NEVER pop an alert (a denied permission
// is a normal outcome there); the manual tap still explains itself.
function useLoc(which,silent){
  which = which==='dropoff' ? 'dropoff' : 'pickup';
  var btns=document.querySelectorAll('.locp');
  if(!navigator.geolocation){ if(!silent) alert('Location is not available here — please type your area.'); return; }
  btns.forEach(function(b){b.classList.add('busy');b.disabled=true;});
  navigator.geolocation.getCurrentPosition(function(pos){
    btns.forEach(function(b){b.classList.remove('busy');b.disabled=false;});
    var lat=pos.coords.latitude, lng=pos.coords.longitude;
    try{ map.flyTo([lat,lng],17,{duration:.8}); }catch(e){ map.setView([lat,lng],17); }
    document.getElementById(which==='pickup'?'pin':'din').value='Pinpointing…';
    setPin(which,{address:'My current location',lat:lat,lng:lng});
    reverseSet(which,lat,lng);
    // Just set the pin — we no longer auto-fill names/phones by side (the booker's own end is filled
    // server-side from their WhatsApp number, so tapping a pin never mis-assigns who's the sender/receiver).
    validate();
    liveSide=which; lockOtherLoc();   // your live location is one spot — lock the other end's
  }, function(){
    btns.forEach(function(b){b.classList.remove('busy');b.disabled=false;});
    lockOtherLoc();
    if(!silent) alert('Couldn\\'t get your location — please allow location access, or just type your area.');
  }, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
function val(id){return (document.getElementById(id).value||'').trim();}
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);if(d.length===10&&d.charAt(0)!=='0')d='0'+d;return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=document.getElementById(id);if(!e)return;function u(){var v=(e.value||'').trim();var ok=v&&phoneOk(v);var bad=v&&!ok;e.style.borderColor=bad?'#dc2626':(ok?'#16a34a':'');e.style.borderWidth=ok?'1.5px':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',function(){var s=(e.value||''),d='';for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')d+=c;}if(d.slice(0,3)==='234')d=d.slice(3);while(d.charAt(0)==='0')d=d.slice(1);if(d)e.value='0'+d;e.dispatchEvent(new Event('input'));});}
function validate(){
  // Step 2 (details) completeness gates the Continue-to-payment button: one good phone + an item.
  // Never leave a dead grey button — say exactly what is still missing.
  var _t=document.getElementById('tonext');
  if(_t){
    var _sp=val('sphone'), _rp=val('rphone'), _ph=otherPhoneOk(_sp,_rp), _it=!!val('item');
    _t.disabled=!(_ph&&_it);
    var _h=document.getElementById('needhint');
    if(_h){ var _need=[]; if(!_it)_need.push("what you're sending"); if(!_ph)_need.push("the other person's phone");
      _h.textContent=_need.length?('Add '+_need.join(' and ')+' to continue'):''; }
    // Hand-editing a claimed side to a different number quietly withdraws the "This is me" claim.
    if(MESIDE==='pickup'&&MEFILL_S&&MYPHONE&&digTail(_sp)!==digTail(MYPHONE)){ MESIDE=''; MEFILL_S=false; updateMeChips(); }
    if(MESIDE==='recv'&&MEFILL_R&&MYPHONE&&digTail(_rp)!==digTail(MYPHONE)){ MESIDE=''; MEFILL_R=false; updateMeChips(); }
    // Live "leave it blank" cue: shown when the other side is done OR this side is claimed as "me"
    // while the number stays hidden. COD keeps it off Receiver (the buyer's real phone is required).
    var _cbx=document.getElementById('codbox');
    var _pkc=document.getElementById('pkcover'); if(_pkc)_pkc.style.display=((phoneOk(_rp)||MESIDE==='pickup')&&!_sp)?'block':'none';
    var _dpc=document.getElementById('dpcover'); if(_dpc)_dpc.style.display=((phoneOk(_sp)||MESIDE==='recv')&&!_rp&&!(_cbx&&_cbx.checked))?'block':'none';
  }
  // Names are optional. Each phone must be valid or blank, and at least one must be filled (the other
  // person's) — we fill the blank side with the booker's own WhatsApp number server-side.
  var sp=val('sphone'), rp=val('rphone');
  var phonesOk=(!sp||phoneOk(sp))&&(!rp||phoneOk(rp))&&otherPhoneOk(sp,rp);
  var cb=document.getElementById('codbox');
  // COD: the receiver IS the buyer, so their phone is required (they get the payment request).
  if(cb&&cb.checked) phonesOk=phonesOk&&phoneOk(rp);
  // Keep the COD "receiver phone needed" note in sync so the button is never silently dead.
  var crh=document.getElementById('codrphint'); if(crh) crh.style.display=(cb&&cb.checked&&!phoneOk(rp))?'block':'none';
  var ok = picked.pickup&&picked.dropoff&&val('item')&&phonesOk;
  if(ok&&cb&&cb.checked&&!BANK_SAVED) ok=ACCT_OK;
  document.getElementById('go').disabled=!ok;
  if(val('item'))track('item_set');
}
// Decode a Google-encoded polyline into [lat,lng] points (so we can draw the route, Bolt-style).
function decodePoly(str){ var i=0,lat=0,lng=0,c=[]; while(i<str.length){ var b,sh=0,res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lat+=((res&1)?~(res>>1):(res>>1)); sh=0;res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lng+=((res&1)?~(res>>1):(res>>1)); c.push([lat/1e5,lng/1e5]); } return c; }
var routeLine=null, mapFee=null, mapMin=null, mapKm=null, POD_SURCHARGE=0;
// Price negotiation (app-only). NEGO.enabled from prefill; OFFER = the customer's opening price to riders
// (null = accepting the recommended fee). A new route price invalidates any prior offer.
var NEGO={enabled:false}, OFFER=null, SURGE=null;
// Render the fee box (and top badge). Pay-on-delivery adds the surcharge, so the number shown here matches
// what the rider actually collects (base + POD surcharge) — not the base-only price. COD (buyer-hasn't-paid)
// is a separate model whose delivery fee is netted from the goods, so it stays on the base price.
// Under the negotiation model the pay radios are hidden, but a stale 'pod' selection would still add the
// POD surcharge to the displayed fare — inflating the number above the price the customer actually named.
function podPicked(){ var cb=document.getElementById('codbox'); if(cb&&cb.checked) return false; if(NEGO&&NEGO.enabled) return false; var r=document.querySelector('input[name=pay]:checked'); return !!(r&&r.value==='pod'); }
function renderFee(){
  var f=document.getElementById('fee'), pt=document.getElementById('pricetop');
  if(mapFee==null){ if(f)f.style.display='none'; if(pt)pt.style.display='none'; var ow0=document.getElementById('offerwrap'); if(ow0)ow0.style.display='none'; renderFareCard(); return; }
  var base=Number(mapFee), neg=(OFFER!=null);
  var sc=(!neg&&podPicked())?(Number(POD_SURCHARGE)||0):0, tot=(neg?Number(OFFER):base)+sc;
  var sub=[]; if(mapMin)sub.push('~'+mapMin+' min trip'); if(mapKm)sub.push('~'+mapKm+' km');
  if(sc>0)sub.push('incl. ₦'+sc.toLocaleString()+' pay-on-delivery');
  if(neg)sub.push('your offer · was ₦'+base.toLocaleString());
  var feeHtml='<div><div class="lbl">Delivery fee</div>'+(sub.length?('<div class="sub">'+sub.join(' · ')+'</div>'):'')+'</div><div class="amt">₦'+tot.toLocaleString()+'</div>';
  if(f){ f.style.display='flex'; f.innerHTML=feeHtml; }
  if(pt){
    var pw=(pt.style.display==='none'||!pt.style.display); pt.style.display='flex';
    pt.classList.toggle('neg',neg);
    // While negotiating the pill KEEPS the recommended fare on top and adds the offer as a second line —
    // the recommended price never changes, and the customer clearly sees they're bargaining.
    pt.innerHTML=neg
      ?'<span class="cap">Fee</span><span class="amt">₦'+base.toLocaleString()+'</span><span class="off">Your offer ₦'+Number(OFFER).toLocaleString()+'</span>'
      :'<span class="cap">Fee</span><span class="amt">₦'+tot.toLocaleString()+'</span>';
    if(pw){pt.classList.remove('popin');void pt.offsetWidth;pt.classList.add('popin');}
  }
  renderOffer(base);
  renderFareCard();
}
// ── inDrive-style fare card (route screen, /map only) ── recommended fare centred; − / + step the
// customer's offer ₦100 at a time (below the quote = a bargain, above = reaches riders faster); tapping
// the amount opens a type-your-price panel. Under it: "Auto-accept offer of ₦X" — ON matches the first
// rider instantly at that price, OFF collects rider offers and the customer picks (inDrive mode).
var FARE_STEP=100, AUTO_PICK=null;   // AUTO_PICK null = customer hasn't touched the toggle → model default
// Under the negotiation model the customer ALWAYS picks their rider by default (riders state what they'll
// charge and the offer cards come back). The toggle is the escape hatch for someone in a hurry: ON = match
// me instantly with the first rider who takes my price.
function autoPickOn(){ return AUTO_PICK===null ? false : AUTO_PICK; }
function renderFareCard(){
  var fc=document.getElementById('farecard'); if(!fc||BATCH)return;
  var ar=document.getElementById('autorow');
  var _cb=document.getElementById('codbox'), _codOn=!!(_cb&&_cb.checked);
  // COD (collect the goods money for a vendor) is its own model — not rider-bargained, so no fare stepper.
  if(mapFee==null||_codOn||!(picked.pickup&&picked.dropoff)){ fc.style.display='none'; if(ar)ar.style.display='none'; return; }
  var base=Math.round(Number(mapFee)), cur=(OFFER!=null?Math.round(Number(OFFER)):base);
  var was=fc.style.display!=='none';
  fc.style.display='flex'; if(!was)anim(fc,'risein');
  var am=document.getElementById('famt'), lb=document.getElementById('flbl');
  if(am)am.innerHTML='₦'+cur.toLocaleString()+(OFFER!=null?'<span class="was">₦'+base.toLocaleString()+'</span>':'');
  if(lb)lb.textContent=!NEGO.enabled?'Delivery fee'
    :(OFFER==null?'Recommended fare'
    :(OFFER<base?'Your offer — riders accept or counter':'Boosted offer — reaches riders faster'));
  var mi=document.getElementById('fminus'), pl=document.getElementById('fplus');
  if(mi){ mi.style.display=NEGO.enabled?'flex':'none'; mi.disabled=cur<=Math.max(FARE_STEP,base-500); }   // ₦500-below floor
  if(pl){ pl.style.display=NEGO.enabled?'flex':'none'; pl.disabled=false; }                               // no ceiling
  // Peak-period note under the fare card: honest about WHY, and it nudges toward the + button rather
  // than quietly charging more. Only while they haven't already raised their offer above the fare.
  var sb=document.getElementById('surgebox');
  if(SURGE&&NEGO.enabled){
    if(!sb){ sb=document.createElement('div'); sb.id='surgebox'; sb.className='surgebox'; fc.parentNode.insertBefore(sb,fc.nextSibling); }
    sb.style.display='flex';
    sb.innerHTML='<span>🔥</span><span><b>Busy right now — '+SURGE.waiting+' orders waiting'+(SURGE.free_riders?(' and only '+SURGE.free_riders+' rider'+(SURGE.free_riders===1?'':'s')+' free'):' and no free riders')+'.</b> Riders pick the best offers first, so tapping <b>+</b> gets you moving sooner.</span>';
  } else if(sb){ sb.style.display='none'; }
  if(ar){
    ar.style.display=NEGO.enabled?'flex':'none';
    var al=document.getElementById('autolbl'); if(al)al.textContent='Auto-accept offer of ₦'+cur.toLocaleString();
    var tg=document.getElementById('fartog'); if(tg)tg.classList.toggle('on',autoPickOn());
  }
}
function setFare(v){
  var base=Math.round(Number(mapFee)||0); if(!base||!NEGO.enabled)return;
  // FLOOR: at most ₦500 below the recommended fare (riders won't move for less and lowballs stall the
  // search). No ceiling — offering more just reaches riders faster.
  var floor=Math.max(FARE_STEP,base-500);
  v=Math.round(v); if(!(v>0))v=floor;
  if(v<floor)v=floor;
  track('offer_opened');
  if(v===base){ OFFER=null; } else { OFFER=v; track('offer_set'); }
  renderFee(); syncPayForOffer(); if(typeof validate==='function')validate();
}
// ── Price negotiation UI (app-only) ── The customer BARGAINS WITH RIDERS. Their offer is a starting price
// riders see and can accept or COUNTER — there's no Lasalu floor and no prepay; the agreed price is paid on
// delivery. The control lives right under the fee box.
function renderOffer(base){
  // /map: the inDrive fare card (renderFareCard) owns negotiation now — this "Make an offer" widget is
  // only kept for /bulk's fee box, where the fare card doesn't exist.
  if(!BATCH){ var w0=document.getElementById('offerwrap'); if(w0)w0.style.display='none'; return; }
  var host=document.getElementById('fee'); if(!host)return;
  var w=document.getElementById('offerwrap');
  if(!NEGO.enabled||mapFee==null){ if(w)w.style.display='none'; return; }
  if(!w){ w=document.createElement('div'); w.id='offerwrap'; w.className='offerwrap'; host.parentNode.insertBefore(w,host.nextSibling); }
  w.style.display='block';
  if(OFFER!=null){
    w.innerHTML='<div class="offon"><div><span class="offlbl">Your offer</span> <b>&#8358;'+Number(OFFER).toLocaleString()+'</b> <span class="offwas">&#8358;'+Number(base).toLocaleString()+'</span></div><button type="button" id="offreset" class="offlink">Reset</button></div><p class="offnote">Riders will accept your price or propose their own — you pay the agreed price on delivery.</p>';
    document.getElementById('offreset').onclick=function(){ OFFER=null; renderFee(); syncPayForOffer(); if(typeof validate==='function')validate(); };
    return;
  }
  w.innerHTML='<button type="button" id="offopen" class="offcta">Make an offer</button>';
  document.getElementById('offopen').onclick=function(){ openOfferPanel(base); };
}
function openOfferPanel(base){
  var w=document.getElementById('offerwrap'); if(!w)return;
  track('offer_opened');
  w.innerHTML='<div class="offpanel"><div class="offh">Name your price</div>'
    +'<div class="offin"><span>&#8358;</span><input id="offval" inputmode="numeric" value="'+Math.round(base)+'"></div>'
    +'<div class="offhint" id="offhint">Riders near you will see your offer and can accept it or propose their own price. You pay the agreed price on delivery.</div>'
    +'<div class="offrow"><button type="button" class="offcancel" id="offcancel">Cancel</button><button type="button" class="offuse" id="offuse">Set my price</button></div></div>';
  var inp=document.getElementById('offval'); try{ inp.focus(); inp.select(); }catch(e){}
  document.getElementById('offcancel').onclick=function(){ renderFee(); };
  document.getElementById('offuse').onclick=function(){
    var v=Math.round(Number((inp.value||'').replace(/[^0-9.]/g,''))||0);
    if(!(v>0)) return;
    if(v>=Math.round(base)){ OFFER=null; renderFee(); syncPayForOffer(); if(typeof validate==='function')validate(); return; } // offering full price → no negotiation
    OFFER=v; track('offer_set'); renderFee(); syncPayForOffer(); if(typeof validate==='function')validate();
  };
}
// EVERY local order goes through the negotiation model: you name a price, riders say what they'll charge,
// you pick one — so money only moves AFTER the price is agreed. That means no pay-now choice at booking;
// the payment section explains the flow instead (an EMPTY section reads as broken). The one exception is
// COD (the buyer hasn't paid for the goods) — that's a collect-for-a-vendor order settled through Lasalu,
// so it can't also be rider-bargained: ticking it drops any offer and restores the normal payment choices.
function syncPayForOffer(){
  var cb=document.getElementById('codbox');
  var codOn=!!(cb&&cb.checked);
  if(codOn&&OFFER!=null){ OFFER=null; renderFee(); }
  var neg=!!NEGO.enabled&&!codOn;
  // BOTH models own the payment section: negotiation replaces it with the explainer, COD with the
  // collect-amount block. Only show the pay-now/POD radios when neither is active — otherwise this
  // function would re-show the radios the COD handler just hid.
  var pr=document.getElementById('payradios'); if(pr)pr.style.display=(neg||codOn)?'none':'block';
  var note=document.getElementById('negpaynote');
  if(neg){
    if(!note&&pr){ note=document.createElement('div'); note.id='negpaynote'; note.className='negpaynote'; pr.parentNode.insertBefore(note,pr); }
    if(note){ note.style.display='block'; note.innerHTML='🤝 <b>You pay once your price is agreed.</b> Riders near you will take your price or say what they\\'d charge, and you pick the one you want. Then pay however you like — <b>cash on delivery</b>, or <b>pay online</b> from the tracking screen the moment your rider is locked in.'; }
  } else if(note){ note.style.display='none'; }
}
function injectNegCss(){
  if(document.getElementById('negcss'))return;
  var s=document.createElement('style'); s.id='negcss'; s.textContent=
    '.offerwrap{margin:10px 0 2px}'
   +'.offcta{width:100%;padding:12px;border:1.5px dashed var(--line-2,#ddd0e2);background:none;border-radius:12px;color:var(--plum,#4F074C);font-size:13.5px;font-weight:800;cursor:pointer}.offcta:active{transform:scale(.99)}'
   +'.offon{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--lilac,#FBE9F1);border-radius:12px;padding:11px 13px}'
   +'.offlbl{font-size:12px;color:#7a5b83;font-weight:700}.offon b{color:var(--plum,#4F074C);font-size:15px}.offwas{font-size:11.5px;color:#a8a0ae;text-decoration:line-through;margin-left:4px}'
   +'.offlink{background:none;border:none;color:#b3261e;font-size:12.5px;font-weight:800;cursor:pointer}'
   +'.offnote{font-size:11.5px;color:#7a5b83;margin:6px 2px 0}'
   +'.offpanel{background:#fff;border:1px solid var(--line,#ece3ef);border-radius:14px;padding:14px;box-shadow:0 8px 22px rgba(58,5,55,.08)}'
   +'.offh{font-size:14px;font-weight:800;color:#241826;margin-bottom:9px}'
   +'.offin{display:flex;align-items:center;gap:6px;background:var(--bg,#FBF3F7);border-radius:10px;padding:10px 12px;border:1.5px solid var(--line-2,#ddd0e2)}.offin span{font-size:16px;color:#6a626f;font-weight:700}.offin input{flex:1;border:none;background:none;outline:none;font-size:17px;font-weight:700;color:#241826;width:100%}'
   +'.offhint{font-size:12px;color:#7a5b83;margin-top:8px}.offhint.low{color:#b3261e;font-weight:600}'
   +'.offrow{display:flex;gap:8px;margin-top:12px}.offcancel{flex:1;padding:11px;border:1px solid var(--line,#ece3ef);background:#fff;border-radius:10px;font-weight:700;color:#6a626f;cursor:pointer}.offuse{flex:2;padding:11px;border:none;background:var(--plum,#4F074C);color:#fff;border-radius:10px;font-weight:800;cursor:pointer}';
  document.head.appendChild(s);
}
// COD payout bank: BANK_SAVED means we already have this vendor's account on file (no re-entry).
var BANK_SAVED=false, BANKS_LOADED=false, ACCT_OK=false;
// Searchable bank picker: keep the full list in memory and filter as they type (no endless scrolling).
var BANK_LIST=[], SEL_BANK_CODE='', SEL_BANK_NAME='';
function loadBanks(){
  if(BANKS_LOADED) return; BANKS_LOADED=true;
  fetch(api('action=banks')).then(function(r){return r.json();}).then(function(j){
    BANK_LIST=j.banks||[];
  }).catch(function(){ BANKS_LOADED=false; });
}
function renderBankSug(q){
  var box=document.getElementById('banksug'); if(!box) return;
  var s=(q||'').trim().toLowerCase();
  var list=BANK_LIST.filter(function(b){ return !s||b.name.toLowerCase().indexOf(s)>-1; }).slice(0,40);
  box.innerHTML='';
  if(!list.length){ box.style.display='none'; return; }
  list.forEach(function(b){
    var d=document.createElement('div'); d.textContent=b.name;
    d.style.cssText='padding:11px 14px;font-size:14.5px;cursor:pointer;border-bottom:1px solid #f5e6cf';
    d.onmousedown=function(e){ e.preventDefault(); SEL_BANK_CODE=b.code; SEL_BANK_NAME=b.name;
      document.getElementById('bankcode').value=b.name; box.style.display='none'; resolveAcct(); validate(); };
    box.appendChild(d);
  });
  box.style.display='block';
}
function resolveAcct(){
  var acctEl=document.getElementById('acctno'), nm=document.getElementById('acctname');
  var acct=(acctEl.value||'').replace(/\\D/g,''), code=SEL_BANK_CODE;
  ACCT_OK=false; nm.style.display='none';
  if(acct.length!==10||!code) return;
  nm.style.display='block'; nm.style.color='#7a5b1a'; nm.textContent='Checking account…';
  fetch(api('action=resolve_account&account_number='+encodeURIComponent(acct)+'&bank_code='+encodeURIComponent(code)))
   .then(function(r){return r.json();}).then(function(j){
     if(j&&j.name){ ACCT_OK=true; nm.style.color='#166534'; nm.textContent=''+j.name; }
     else { ACCT_OK=false; nm.style.color='#c0392b'; nm.textContent='Couldn\\'t verify that account — check the number and bank.'; }
   }).catch(function(){ nm.style.display='none'; });
}
function drawRoute(enc){ try{ var pts=decodePoly(enc); if(!pts.length)return; if(routeLine)map.removeLayer(routeLine); routeLine=L.polyline(pts,{color:'#E23A7C',weight:5,opacity:.9,lineJoin:'round',className:'routeanim'}).addTo(map); try{ map.flyToBounds(routeLine.getBounds(),{padding:[40,40],maxZoom:16,duration:.9}); }catch(e){ map.fitBounds(routeLine.getBounds(),{padding:[40,40],maxZoom:16}); } }catch(e){} }
function quote(){
  var f=document.getElementById('fee'), pt=document.getElementById('pricetop');
  f.style.display='flex'; f.innerHTML='<div class="lbl">Calculating fee…</div>';
  var fa0=document.getElementById('famt'); if(fa0&&!BATCH)fa0.textContent='…';
  if(pt){ pt.style.display='flex'; pt.innerHTML='<span class="cap">Fee</span><span class="amt">…</span>'; }
  fetch(api('action=price&plat='+picked.pickup.lat+'&plng='+picked.pickup.lng+'&dlat='+picked.dropoff.lat+'&dlng='+picked.dropoff.lng))
   .then(r=>r.json()).then(j=>{
     var e=document.getElementById('eta');
     if(j.price){
       mapFee=j.price; mapMin=j.min||null; mapKm=j.km||null; OFFER=null;  // new price → any prior offer is stale
       SURGE=(j.surge&&j.surge.active)?j.surge:null;   // peak period → tell them, let THEM decide to offer more
       track('price_shown');
       renderFee();   // fee box + top badge (adds the POD surcharge when pay-on-delivery is selected)
       if(j.min){ var ew=(e.style.display==='none'||!e.style.display); e.style.display='flex'; e.innerHTML='<svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><circle cx="6" cy="17" r="2.6"/><circle cx="18.5" cy="17" r="2.6"/><path d="M8.6 17h7.3l1.9-7h2.7M6 17l2.8-8.4h4.4"/></svg>'+j.min+' min <span class="d">trip</span>'; if(ew){e.classList.remove('popin');void e.offsetWidth;e.classList.add('popin');} } else { e.style.display='none'; }
     } else { mapFee=null; renderFee(); if(e)e.style.display='none'; }
     if(typeof codBreak==='function') codBreak();
     if(j.polyline) drawRoute(j.polyline);
   }).catch(function(){ f.style.display='none'; if(pt)pt.style.display='none'; var fc0=document.getElementById('farecard'); if(fc0)fc0.style.display='none'; });
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
  if(BATCH){ try{ initBatch(); }catch(e){} }
  // inDrive fare card controls (/map): − / + step the offer, tap the amount to type it, toggle auto-accept.
  if(!BATCH){
    var _fm=document.getElementById('fminus'); if(_fm)_fm.onclick=function(){ var b=Math.round(Number(mapFee)||0); if(!b)return; var cur=(OFFER!=null?Math.round(Number(OFFER)):b); setFare(cur-FARE_STEP); };
    var _fp=document.getElementById('fplus'); if(_fp)_fp.onclick=function(){ var b=Math.round(Number(mapFee)||0); if(!b)return; var cur=(OFFER!=null?Math.round(Number(OFFER)):b); setFare(cur+FARE_STEP); };
    var _ft=document.getElementById('fartog'); if(_ft)_ft.onclick=function(){ AUTO_PICK=!autoPickOn(); renderFareCard(); };
  }
  Array.prototype.forEach.call(document.querySelectorAll('.locp'),function(b){ b.onclick=function(){ useLoc(b.getAttribute('data-for')); }; });
  Array.prototype.forEach.call(document.querySelectorAll('.clr'),function(b){ b.onclick=function(){ clearLoc(b.getAttribute('data-clr')); }; });
  // ── Draggable bottom sheet (Bolt-style): drag the handle to fill the screen or shrink to see the map ──
  (function(){
    var sheet=document.querySelector('.sheet'), grab=document.querySelector('.grab'); if(!sheet||!grab) return;
    function vh(){ return window.innerHeight||document.documentElement.clientHeight||700; }
    function snaps(){ return [Math.round(vh()*0.33), Math.round(vh()*0.58), Math.round(vh()*0.92)]; }
    function setH(h){ sheet.style.height=Math.max(150,Math.min(Math.round(vh()*0.94),h))+'px'; }
    function nearest(h){ var s=snaps(), b=s[0], d=1e9; s.forEach(function(v){ var dd=Math.abs(v-h); if(dd<d){d=dd;b=v;} }); return b; }
    var dragging=false, sy=0, sh=0;
    grab.addEventListener('pointerdown',function(e){ dragging=true; sheet.classList.remove('snapping'); sy=e.clientY; sh=sheet.getBoundingClientRect().height; try{grab.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); });
    window.addEventListener('pointermove',function(e){ if(!dragging)return; setH(sh+(sy-e.clientY)); });
    window.addEventListener('pointerup',function(){ if(!dragging)return; dragging=false; sheet.classList.add('snapping'); setH(nearest(sheet.getBoundingClientRect().height)); setTimeout(function(){ try{map.invalidateSize();}catch(_){}} ,360); });
    sheetH(0.58);   // open at a comfortable middle height
  })();
  ['sname','sphone','rname','rphone','item'].forEach(function(id){ document.getElementById(id).addEventListener('input',validate); });
  // Item = TAP not type. Each chip fills the (hidden) #item field; "Other" reveals a text box.
  Array.prototype.forEach.call(document.querySelectorAll('#itemchips .ichip'),function(c){ c.onclick=function(){ Array.prototype.forEach.call(document.querySelectorAll('#itemchips .ichip'),function(x){x.classList.remove('on');}); c.classList.add('on'); var v=c.getAttribute('data-i'); var it=document.getElementById('item'); if(v==='__other'){ it.style.display='block'; it.value=''; sheetH(0.9); it.focus(); } else { it.style.display='none'; it.value=v; sheetH(0.9); } validate(); }; });
  // Optional fields stay hidden until tapped — keeps the screen from feeling like a form.
  // Revealing an optional field grows the content — re-fit the sheet so it never scrolls unnecessarily.
  // Reveal presets FIRST, no autofocus — the keyboard only opens if they tap the text box.
  var _an=document.getElementById('addnote'); if(_an)_an.onclick=function(){ document.getElementById('notebox').style.display='block'; this.style.display='none'; sheetH(0.9); };
  // Rider-note presets: the common notes are one tap; tap again to remove. Text box stays for the rest.
  Array.prototype.forEach.call(document.querySelectorAll('.nchip'),function(ch){
    ch.onclick=function(){
      var d=document.getElementById('dinstr'), t=ch.getAttribute('data-n');
      if(ch.classList.contains('on')){
        d.value=d.value.split('; ').filter(function(x){ return x!==t; }).join('; ');
        ch.classList.remove('on');
      } else {
        d.value=d.value?(d.value+'; '+t):t;
        ch.classList.add('on');
      }
    };
  });
  flagPhone('sphone');flagPhone('rphone');
  var _mp=document.getElementById('mepk'); if(_mp)_mp.onchange=function(){ setMe('pickup'); };
  var _mr=document.getElementById('merc'); if(_mr)_mr.onchange=function(){ setMe('recv'); };
  // "More taps, less typing": where the browser has the Contact Picker (Chrome on Android —
  // most of our customers), the other person comes straight from the phone book: one tap,
  // name + number filled, the blur pass normalises +234/spaces to 0803… and paints it green.
  // Unsupported browsers (iOS, in-app webviews) simply never see the button.
  function pickContact(nid,pid){
    navigator.contacts.select(['name','tel'],{multiple:false}).then(function(cs){
      var c=(cs&&cs[0])||null; if(!c)return;
      var tel=(c.tel&&c.tel.length)?String(c.tel[0]||''):'';
      var pe=document.getElementById(pid);
      if(tel&&pe){ pe.value=tel; pe.dispatchEvent(new Event('blur')); }
      var ne=document.getElementById(nid);
      if(ne&&!ne.value&&c.name&&c.name.length)ne.value=String(c.name[0]||'');
      validate();
    }).catch(function(){});
  }
  if(navigator.contacts&&navigator.contacts.select){
    var _pc1=document.getElementById('pickc_s'), _pc2=document.getElementById('pickc_r');
    if(_pc1){ _pc1.style.display='inline-flex'; _pc1.onclick=function(){ pickContact('sname','sphone'); }; }
    if(_pc2){ _pc2.style.display='inline-flex'; _pc2.onclick=function(){ pickContact('rname','rphone'); }; }
  }
  // One-tap reuse for returning customers ("same as last time").
  function reuse(id,title,value,fn){ var d=document.getElementById(id); var a=document.createElement('a'); a.innerHTML='<span class="ric">↩</span><span class="rl"><span class="rt"></span><span class="rv"></span></span>'; a.querySelector('.rt').textContent=title; a.querySelector('.rv').textContent=value; a.onclick=function(){ fn(); a.className='on'; validate(); }; d.appendChild(a); }
  // Bolt-style recent/saved place row (shown as a tappable list on the search step).
  // Row = place on top, its area underneath (the icon already says recent vs saved, so we don't repeat it).
  // "Waterlines, Port Harcourt" -> "Waterlines" / "Port Harcourt". No comma: fall back to the label.
  function recentRow(icon,label,sub,fn){
    var d=document.getElementById('recentlist'); if(!d)return;
    var txt=String(label||'').trim(), i=txt.indexOf(',');
    var main=i>0?txt.slice(0,i).trim():txt;
    var area=i>0?txt.slice(i+1).trim():(sub||'');
    var r=document.createElement('div'); r.className='rr';
    r.innerHTML='<span class="rc"></span><span class="rm"><span class="rn"></span><span class="rs"></span></span>';
    r.querySelector('.rc').innerHTML=icon;
    r.querySelector('.rn').textContent=main;
    r.querySelector('.rs').textContent=area;
    r.onclick=fn; d.appendChild(r);
  }
  fetch(api('action=prefill')).then(function(r){return r.json();}).then(function(p){
    if(!p) return;
    YOU_NAME=p.name||''; YOU_PHONE=p.phone||'';
    // Do NOT pre-type the booker into Pickup — the whole point is "leave your own side blank, we use your
    // WhatsApp number." Prefilling here re-declared them as the sender and contradicted the hint.
    if(p.item) document.getElementById('item').value=p.item;
    // Pickup: the chat already quoted this route, so open the map ON it (pin + price), and the customer
    // can drag the pin to fine-tune. Else offer their last pickup as a chip.
    if(p.pickup){ if(p.pickup.from_chat){ document.getElementById('pin').value=p.pickup.address; if(p.pickup.lat) setPin('pickup',p.pickup); }
      else if(p.pickup.lat){ reuse('rpickup','Same pickup',p.pickup.address,function(){ document.getElementById('pin').value=p.pickup.address; setPin('pickup',p.pickup); }); } }
    // Drop-off: same — open on the quoted spot, draggable to fine-tune.
    if(p.dropoff){ if(p.dropoff.from_chat){ document.getElementById('din').value=p.dropoff.address; if(p.dropoff.lat) setPin('dropoff',p.dropoff); }
      else if(p.dropoff.lat){ reuse('rdrop','Same drop-off',p.dropoff.address,function(){ document.getElementById('din').value=p.dropoff.address; setPin('dropoff',p.dropoff); }); } }
    // Recent places list — the customer's last few destinations, one tap each.
    var _clock='<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/></svg>';
    var _home='<svg class="i" viewBox="0 0 24 24"><path d="m3 9.6 9-6.8 9 6.8V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.5 22v-7.5h5V22"/></svg>';
    var _seen={};
    (p.recent||[]).slice(0,4).forEach(function(r){
      if(!r||!r.address||!r.lat||_seen[r.address])return; _seen[r.address]=1;
      recentRow(_clock,r.address,'Recent drop-off',function(){ document.getElementById('din').value=r.address; setPin('dropoff',r); });
    });
    if(p.dropoff&&p.dropoff.lat&&!p.dropoff.from_chat&&!_seen[p.dropoff.address]){ _seen[p.dropoff.address]=1; recentRow(_clock,p.dropoff.address,'Recent drop-off',function(){ document.getElementById('din').value=p.dropoff.address; setPin('dropoff',p.dropoff); }); }
    if(p.pickup&&p.pickup.lat&&!p.pickup.from_chat){ recentRow(_home,p.pickup.address,'Saved pickup',function(){ document.getElementById('pin').value=p.pickup.address; setPin('pickup',p.pickup); }); }
    // The list arrives AFTER the sheet was first sized — re-fit so the places are never clipped.
    if(document.querySelectorAll('#recentlist .rr').length) sheetH(0.74);
    if(p.me_phone)MYPHONE=String(p.me_phone);
    if(p.me_name)MYNAME=String(p.me_name);
    if(p.receiver&&p.receiver.name){ var _rpB=function(){ document.getElementById('rphone').dispatchEvent(new Event('blur')); };
      if(p.receiver.from_chat){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; _rpB(); }
      else { reuse('rrecv','Same receiver',p.receiver.name,function(){ document.getElementById('rname').value=p.receiver.name; document.getElementById('rphone').value=p.receiver.phone||''; _rpB(); }); } }
    showClr('pickup',(document.getElementById('pin').value||'').length>0);
    showClr('dropoff',(document.getElementById('din').value||'').length>0);
    // Show the payment options this customer is allowed (pay-on-delivery per settings; COD = trusted vendor).
    if(p.pod_allowed){ var po=document.getElementById('opt-pod'); po.style.display='flex'; POD_SURCHARGE=Math.max(0,Number(p.pod_surcharge)||0); if(POD_SURCHARGE>0){ var ps=document.createElement('span'); ps.className='sur'; ps.textContent='+₦'+POD_SURCHARGE.toLocaleString(); po.appendChild(ps); } renderFee(); }
    if(p.cod_allowed){ document.getElementById('opt-cod').style.display='flex'; }
    if(p.negotiation&&p.negotiation.enabled){ NEGO.enabled=true; NEGO.pick_default=!!p.negotiation.pick_default; injectNegCss(); renderFee(); syncPayForOffer(); }
    if(p.cod_fee_pct!=null) COD_PCT=Number(p.cod_fee_pct)||1.75;
    if(p.has_bank){ BANK_SAVED=true; document.getElementById('banklabel').textContent=p.bank_label||'your saved account'; }
    // PICKUP DEFAULT = where the booker is standing. Unless the chat already named a pickup, we drop
    // their current-location pin automatically so the common case needs zero typing. They can clear it
    // with the (clearLoc) or tap a saved place if we guessed wrong. A denied/failed fix just leaves
    // the field empty — never blocks them. Small delay so the map + sheet paint before the permission ask.
    if(!picked.pickup){ setTimeout(function(){ if(!picked.pickup) useLoc('pickup',true); }, 400); }
    validate(); step();
    // ── Auto-resume: a live order owns the screen (the server sends p.active for app sessions only,
    // so a chat booking link never gets hijacked). Reopens the tracker exactly where the order
    // stands — searching / assigned / on the way — with the route pins restored, ride-app style.
    // "Book another delivery" exits to a fresh step 1 without touching the running order.
    if(!BATCH&&p.active&&p.active.order_number){   // batch mode never resumes a single-order tracker
      try{
        if(p.active.pickup&&p.active.pickup.lat){ document.getElementById('pin').value=p.active.pickup.address||''; setPin('pickup',p.active.pickup); }
        if(p.active.dropoff&&p.active.dropoff.lat){ document.getElementById('din').value=p.active.dropoff.address||''; setPin('dropoff',p.active.dropoff); }
      }catch(e){}
      RESUMED=true;
      var ap=document.getElementById('app'); if(ap){ap.classList.add('instep');ap.classList.remove('stepdetails');}   // keeps the price pill off the tracker map
      showSearching({booked:true,fee:(p.active.mode==='pod'?p.active.fee:0),cod_booked:p.active.mode!=='pod',order_number:p.active.order_number});
      if(p.active.status)applyStatus(String(p.active.status));
    }
  }).catch(function(){});
  // COD: live "you'll be credited" = amount − our fee (COD_PCT%, CBN & bank charges; max ₦3,000) − delivery.
  function codBreak(){
    var A=Number((document.getElementById('goods').value||'').replace(/[^0-9.]/g,''))||0;
    var box=document.getElementById('codbreak');
    if(!document.getElementById('codbox').checked||!(A>0)){ box.style.display='none'; return; }
    var fee=Math.min(3000,Math.round(A*COD_PCT/100));
    var F=Number(mapFee)||0;
    var credit=A-fee-F;
    box.style.display='block';
    function row(l,v){ return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12.5px;color:#7a5b1a;margin-top:6px"><span>'+l+'</span><span style="font-weight:600;white-space:nowrap">'+v+'</span></div>'; }
    if(credit>0){
      box.innerHTML=
        '<div style="font-size:11px;color:#8a6d2e;font-weight:700;text-transform:uppercase;letter-spacing:.05em">You\\'ll be credited</div>'+
        '<div style="font-size:26px;font-weight:800;color:#4F074C;margin:2px 0 4px;letter-spacing:-.02em">₦'+credit.toLocaleString()+'</div>'+
        row('Buyer pays','₦'+A.toLocaleString())+
        row('Our fee ('+COD_PCT+'% · CBN &amp; bank charges)','− ₦'+fee.toLocaleString())+
        row('Delivery', F>0?('− ₦'+F.toLocaleString()):'set your route');
    } else {
      box.innerHTML='<div style="font-size:13px;color:#c0392b;font-weight:700">Too low — the amount must cover our fee (₦'+fee.toLocaleString()+', '+COD_PCT+'% for CBN &amp; bank charges)'+(F>0?(' + the ₦'+F.toLocaleString()+' delivery'):'')+'. Enter a higher amount.</div>';
    }
  }
  document.getElementById('codbox').addEventListener('change',function(){
    var on=this.checked;
    // COD: the receiver IS the buyer — the booker cannot claim that seat. Withdraw the claim
    // (clearing any auto-filled own number) and hide the receiver "This is me" chip while COD is on.
    if(on&&MESIDE==='recv'){ clearMe('recv'); MESIDE=''; }
    updateMeChips();
    document.getElementById('codamt').style.display=on?'block':'none';
    document.getElementById('payradios').style.display=on?'none':'block';
    // COD needs the receiver (buyer) phone — say so, so a blank field never leaves the button silently dead.
    var crh=document.getElementById('codrphint'); if(crh) crh.style.display=(on&&!phoneOk(val('rphone')))?'block':'none';
    // Ask for a payout account only if we don't already have one saved for this vendor.
    document.getElementById('banksaved').style.display=(on&&BANK_SAVED)?'block':'none';
    document.getElementById('bankbox').style.display=(on&&!BANK_SAVED)?'block':'none';
    if(on&&!BANK_SAVED) loadBanks();
    codBreak(); renderFee(); syncPayForOffer(); validate();   // COD ↔ negotiation are exclusive models
  });
  document.getElementById('goods').addEventListener('input',codBreak);
  // Selecting "Pay on delivery" must update the visible Delivery fee to base + surcharge (matches the rider's cash).
  Array.prototype.forEach.call(document.querySelectorAll('input[name=pay]'),function(r){ r.addEventListener('change',renderFee); });
  document.getElementById('acctno').addEventListener('input',function(){ resolveAcct(); validate(); });
  // Searchable bank field: typing filters the list; a fresh edit clears any previous selection.
  var bankInp=document.getElementById('bankcode');
  bankInp.addEventListener('input',function(){ SEL_BANK_CODE=''; SEL_BANK_NAME=''; renderBankSug(bankInp.value); resolveAcct(); validate(); });
  bankInp.addEventListener('focus',function(){ renderBankSug(bankInp.value); });
  bankInp.addEventListener('blur',function(){ setTimeout(function(){ var b=document.getElementById('banksug'); if(b)b.style.display='none'; },150); });
  document.getElementById('bankchange').onclick=function(e){ e.preventDefault(); BANK_SAVED=false; ACCT_OK=false; SEL_BANK_CODE=''; SEL_BANK_NAME=''; bankInp.value='';
    document.getElementById('banksaved').style.display='none'; document.getElementById('bankbox').style.display='block'; loadBanks(); validate(); };
  // ── Bolt-style "Finding your rider…" after booking ── The map STAYS alive: the pickup pin gets a
  // radar pulse, the sheet becomes a searching panel with a creeping bar, and we poll the REAL order
  // status (the same shipdayWebhook milestones that message the customer) so "Rider assigned" here is
  // true, never theater. If the status endpoint is not live yet (older mapPicker), the panel simply
  // settles into the honest "we confirm on WhatsApp" line — nothing breaks, nothing lies.
  var radarM=null, pollT=null, pollN=0, trkState='', doneN=1, feeLine='', ORDNUM='', MODE='', RESUMED=false, RIDER=null, riderM=null, ORDER_OWN=false, ORDER_RATED=false;
  var TRK_LOG=[], ORDER_META=null;   // Updates-accordion history + what-was-booked (item/route/fee) for the Order accordion
  var ORDER_PAID=false;              // CASH order paid online AFTER the price was agreed (payonline flow)
  var MY_CODE='', CODE_SET=false;    // handover code: MY_CODE only when THIS session is the receiver
  var CHAT_UNREAD=0;                 // unread rider messages (badge on the chat button)
  function fmtClock(d){ var hh=d.getHours()%12||12, mm=('0'+d.getMinutes()).slice(-2); return hh+':'+mm+' '+(d.getHours()<12?'AM':'PM'); }
  function trkLog(t){ try{ if(TRK_LOG.length&&TRK_LOG[TRK_LOG.length-1].t===t)return; TRK_LOG.push({t:t,at:fmtClock(new Date())}); }catch(e){} }
  var COFF_DECLINED={}, _lastCounters=[], _lastViewers=0, _lastDeclines=0, COFF_EXPANDED=false;   // rider-offer picker (inDrive-style) state
  var NEG_BASE=0, NEG_RAISE=0, NEG_TIMER=null, NEG_LEFT=0;  // raise-offer + auto-accept + search countdown
  // Live rider marker: a bike chip that glides between GPS fixes (Shipday reports the rider app's
  // location; we join it server-side). Camera fits ONCE on first fix — never fight the user's pan.
  function updateRider(lat,lng){
    if(!(isFinite(lat)&&isFinite(lng)))return;
    try{
      if(!riderM){
        riderM=L.marker([lat,lng],{interactive:false,zIndexOffset:600,icon:L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,15],html:'<div class="ridericon">🛵</div>'})}).addTo(map);
        var el=riderM._icon; if(el)el.classList.add('rglide');
        var tgt=(trkState==='ontheway'||trkState==='pickedup'||trkState==='arrived')?picked.dropoff:picked.pickup;
        if(tgt)try{map.fitBounds(L.latLngBounds([[lat,lng],[tgt.lat,tgt.lng]]),{padding:[46,46],maxZoom:16});}catch(e){}
      } else {
        var prev=riderM.getLatLng();
        if(prev&&Math.abs(prev.lat-lat)<1e-6&&Math.abs(prev.lng-lng)<1e-6)return;   // same fix — keep gliding, no restart
        riderM.setLatLng([lat,lng]);
        // Follow the movement: if the bike glides toward the edge, nudge the map so it stays on screen.
        // panInside only pans when actually needed, so it never fights the customer's own zoom/drag.
        try{ map.panInside([lat,lng],{padding:[70,70]}); }catch(e){}
      }
    }catch(e){}
  }
  function clearRider(){
    if(riderM){try{map.removeLayer(riderM);}catch(e){} riderM=null;}
    var eb=document.getElementById('eta'); if(eb)eb.style.display='none';
  }
  // The 4 milestones the customer sees. "On the way" lives in the HEADLINE (our webhook folds
  // picked-up + on-the-way into one milestone) — the dots mark what has HAPPENED.
  var TRK=['Order placed','Rider assigned','Picked up','On the way','Arrived','Delivered'];
  var RUNNING_STATES=['assigned','pickedup','ontheway','arrived'];   // a rider is actively on this job
  function trkHead(st){
    if(st==='searching')return ['Finding your rider…','Your order is out to riders nearby.'];
    if(st==='assigned')return ['Rider assigned','Your rider is heading to the pickup now.'];
    if(st==='pickedup')return ['Picked up','Your parcel is with the rider — we sent the receiver their 4-digit handover code.'];
    if(st==='ontheway')return ['On the way','Your parcel is moving — we message you at every step too.'];
    if(st==='arrived')return ['Rider has arrived','Give the rider the 4-digit code to collect your parcel.'];
    if(st==='delivered')return ['Delivered','Thank you for sending with Lasalu Drop'];
    if(st==='failed')return ['Delivery issue','Something interrupted this delivery — our team is on it and will message you.'];
    if(st==='cancelled')return ['Order cancelled','Nothing was charged — book again anytime'];
    return ['Still matching you','Riders are confirming — the moment one accepts, we update here and on WhatsApp.'];
  }
  function stageN(st){ if(st==='assigned')return 2; if(st==='pickedup')return 3; if(st==='ontheway')return 4; if(st==='arrived')return 5; if(st==='delivered')return 6; return 1; }
  function trackUI(st){
    var box=document.getElementById('searchbox'); if(!box)return;
    box.classList.remove('choosing');   // a state repaint always starts from the normal panel; renderCounters re-enters chooser mode if bids exist
    if(typeof chooserH==='function')try{ chooserH(false); }catch(e){}
    var h=trkHead(st), i;
    // Shipday-style SEGMENTED progress (owner screenshot): filled = happened, pulsing = current stage.
    var segs='';
    for(i=0;i<TRK.length;i++){
      var scls=(i<doneN)?'tseg on':((i===doneN&&st!=='failed'&&st!=='cancelled')?'tseg cur':'tseg');
      segs+='<div class="'+scls+'" title="'+TRK[i]+'"></div>';
    }
    // CANCEL is offered for ANY order while the parcel isn't picked up yet (searching or just-assigned) —
    // keke/prepaid included (owner: "I can't cancel keke drop"); the server re-checks & handles refunds.
    // EDIT (= cancel + rebook) stays POD-only, since editing a prepaid order would mean a refund + re-pay.
    var canCancel=(ORDNUM&&(st==='searching'||st==='settle'||st==='assigned'));
    var canEdit=(MODE==='pod'&&!ORDER_PAID&&canCancel);   // once paid online, edit(=cancel+rebook) means a refund — humans only
    var ended=(st==='delivered'||st==='failed'||st==='cancelled');
    var running=(st==='assigned'||st==='pickedup'||st==='ontheway'||st==='arrived');   // a rider is on the job
    // Price agreed + still cash → offer to settle it ONLINE right here (owner 2026-07-26): the fare is
    // locked once a rider is assigned, so prepaying it is safe; the webhook tells the rider not to collect.
    var feeL=ORDER_PAID?'✅ Paid online — nothing to pay on delivery.':feeLine;
    var payBtn=(running&&MODE==='pod'&&ORDER_OWN&&!ORDER_PAID&&ORDNUM)
      ?('<button type="button" id="paybtn" class="paybtn">💳 Pay online instead'+(ORDER_META&&ORDER_META.fee?(' — ₦'+Number(ORDER_META.fee).toLocaleString()):'')+'</button>')
      :'';
    // Driver row (Shipday-style): avatar, name over "Your driver", round CALL + round WhatsApp CHAT.
    var riderRow='';
    if(RIDER&&(RIDER.name||RIDER.phone)&&running){
      var _init=(RIDER.name||'').trim().charAt(0).toUpperCase()||'';
      var _dig=String(RIDER.phone||'').replace(/\\D/g,'');
      var _wa=(_dig.length===11&&_dig.charAt(0)==='0')?('234'+_dig.slice(1)):_dig;
      riderRow='<div class="riderrow"><div class="rdrav">'+esc(_init)+'</div>'
        +'<div class="rdrmeta"><span class="rdrnm">'+esc(RIDER.name||'On the job')+'</span><span class="rdrcap" style="text-transform:none;letter-spacing:0">Your driver</span></div>'
        +'<div class="rdrbtns">'
          +(RIDER.phone?('<a class="rdricon" aria-label="Call your driver" href="tel:'+esc(String(RIDER.phone).replace(/[^\\d+]/g,''))+'"><svg class="i" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9z"/></svg></a>'):'')
          // In-app chat with the rider (not WhatsApp) — the thread lives on the order, both sides poll it.
          +'<button type="button" class="rdricon" id="chatbtn" aria-label="Message your driver"><svg class="i" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1-5.1a8.4 8.4 0 1 1 17-3.4z"/></svg>'
          +(CHAT_UNREAD?'<span class="chatdot">'+(CHAT_UNREAD>9?'9+':CHAT_UNREAD)+'</span>':'')+'</button>'
          +'</div></div>';
    }
    // Updates accordion — the timestamped story of this order (Shipday's "Updates" section).
    var upd='';
    if(TRK_LOG.length){
      var rows2=''; for(i=TRK_LOG.length-1;i>=0;i--)rows2+='<div class="updrow"><b>'+esc(TRK_LOG[i].t)+'</b><span>'+esc(TRK_LOG[i].at)+'</span></div>';
      upd='<details class="tacc"><summary>Updates</summary><div class="taccb">'+rows2+'</div></details>';
    }
    // Order accordion — what was booked (number, item, route, price), whatever this visit knows.
    var ord='';
    if(ORDNUM){
      var om=ORDER_META||{};
      var obody='';
      if(om.pu)obody+='<div class="ordrow"><span class="odot" style="background:var(--plum)"></span><span>'+esc(om.pu)+'</span></div>';
      if(om.doff)obody+='<div class="ordrow"><span class="odot" style="background:#16a34a"></span><span>'+esc(om.doff)+'</span></div>';
      if(om.fee)obody+='<div class="ordrow"><span class="odot" style="background:var(--magenta)"></span><span>Delivery fee ₦'+Number(om.fee).toLocaleString()+(MODE==='pod'?' — cash on delivery':'')+'</span></div>';
      if(!obody)obody='<div class="ordrow"><span>Full details are in your WhatsApp chat.</span></div>';
      ord='<details class="tacc"><summary>Order '+esc(ORDNUM)+(om.item?(' · '+esc(om.item)):'')+'</summary><div class="taccb">'+obody+'</div></details>';
    }
    // The receiver's own handover code — shown only to them (the server only sends my_code when this
    // session's number IS the receiver's). Everyone else gets the explainer instead.
    var codeBox='';
    if(MY_CODE&&(st==='pickedup'||st==='ontheway'||st==='arrived')){
      codeBox='<div class="codebox"><div class="codecap">Your handover code</div><div class="codeval">'+esc(MY_CODE)+'</div><div class="codenote">Give this to the rider ONLY when they hand you the parcel.</div></div>';
    } else if(CODE_SET&&(st==='pickedup'||st==='ontheway'||st==='arrived')){
      codeBox='<div class="codehint">🔐 We sent the receiver a 4-digit code — the rider needs it to complete the handover.</div>';
    }
    var live=(st==='searching'||st==='settle')?'<span class="livedot"></span>':'';
    box.innerHTML='<div class="search">'
      +'<div class="tkhead"><h2>'+live+h[0]+'</h2>'+(running?'<span class="etapill" id="etapill" style="display:none"></span>':'')+'</div>'
      +'<p class="smut estline" id="estline">'+h[1]+'</p>'
      +((st==='searching'||st==='settle')?'<div class="sbar"><div class="sfill"></div></div>':'')
      +'<div class="tsegs">'+segs+'</div>'
      +riderRow
      +codeBox
      +(feeL&&!ended?('<p class="feenote">'+feeL+'</p>'):'')
      +payBtn
      +upd
      +ord
      +((canEdit||canCancel)?('<div class="trkact">'+(canEdit?'<button type="button" id="trkedit">Edit location</button>':'')+(canCancel?'<button type="button" id="trkcancel" class="tkx">Cancel order</button>':'')+'</div>'):'')
      +(ended?'<div class="trkact"><button type="button" id="trknew">Book another delivery</button></div>'
             :(RESUMED?'<button type="button" id="trknew" class="tknew">＋ Book another delivery</button>':''))
      +((st==='delivered'||st==='cancelled')?'':'<p class="ssub">You can close this page — every update also lands in your WhatsApp chat.</p>')
      +'</div>';
    var _eb=document.getElementById('trkedit'); if(_eb)_eb.onclick=editLoc;
    var _cb=document.getElementById('trkcancel'); if(_cb)_cb.onclick=cancelOrd;
    var _nb=document.getElementById('trknew'); if(_nb)_nb.onclick=newBooking;
    var _pb=document.getElementById('paybtn'); if(_pb)_pb.onclick=payOnline;
    var _cb2=document.getElementById('chatbtn'); if(_cb2)_cb2.onclick=openChat;
  }
  // ── In-app chat with the rider ── one thread per order, polled by both sides. WhatsApp only nudges
  // the other party when they're away, so nobody has to leave the app to talk.
  var CHAT_OPEN=false, CHAT_MSGS=[], CHAT_BUSY=false;
  function chatCall(text){
    return fetch(api('action=chat&order='+encodeURIComponent(ORDNUM)+(text?('&text='+encodeURIComponent(text)):'')),_postOpt())
      .then(function(r){return r.json();});
  }
  function openChat(){
    if(!ORDNUM)return;
    CHAT_OPEN=true; CHAT_UNREAD=0;
    var w=document.getElementById('chatwrap');
    if(!w){ w=document.createElement('div'); w.id='chatwrap'; w.className='chatwrap'; document.body.appendChild(w); }
    w.innerHTML='<div class="chatpanel"><div class="chathead"><span>Message your rider</span><button type="button" id="chatx" aria-label="Close">✕</button></div>'
      +'<div class="chatbody" id="chatbody"><div class="chatempty">Loading…</div></div>'
      +'<div class="chatfoot"><input id="chatin" placeholder="Type a message…" maxlength="700" autocomplete="off"><button type="button" id="chatsend">Send</button></div></div>';
    document.getElementById('chatx').onclick=closeChat;
    document.getElementById('chatsend').onclick=sendChat;
    document.getElementById('chatin').addEventListener('keydown',function(e){ if(e.key==='Enter')sendChat(); });
    refreshChat();
    trackUI(trkState);   // repaint so the unread badge clears
  }
  function closeChat(){ CHAT_OPEN=false; var w=document.getElementById('chatwrap'); if(w&&w.parentNode)w.parentNode.removeChild(w); }
  function paintChat(){
    var b=document.getElementById('chatbody'); if(!b)return;
    if(!CHAT_MSGS.length){ b.innerHTML='<div class="chatempty">No messages yet — say hello, or tell your rider anything they need to know.</div>'; return; }
    b.innerHTML=CHAT_MSGS.map(function(m){
      var mine=(m.sender==='customer');
      return '<div class="cmsg '+(mine?'me':'them')+'"><div class="cbub">'+esc(m.body)+'</div></div>';
    }).join('');
    b.scrollTop=b.scrollHeight;
  }
  function refreshChat(){ if(!CHAT_OPEN)return; chatCall('').then(function(j){ if(j&&j.messages){ CHAT_MSGS=j.messages; paintChat(); } }).catch(function(){}); }
  function sendChat(){
    var i=document.getElementById('chatin'); if(!i)return;
    var t=(i.value||'').trim(); if(!t||CHAT_BUSY)return;
    CHAT_BUSY=true; i.value='';
    CHAT_MSGS.push({sender:'customer',body:t}); paintChat();          // optimistic
    chatCall(t).then(function(j){ if(j&&j.messages){ CHAT_MSGS=j.messages; paintChat(); } })
      .catch(function(){ alert('Could not send — check your connection.'); })
      .then(function(){ CHAT_BUSY=false; });
  }
  function payOnline(){
    var b=document.getElementById('paybtn'); if(b){ b.disabled=true; b.textContent='Opening secure payment…'; }
    fetch(api('action=payonline&order='+encodeURIComponent(ORDNUM)),_postOpt())
     .then(function(r){return r.json();}).then(function(j){
       if(j&&j.pay_url){ window.location.href=j.pay_url; return; }
       if(b){ b.disabled=false; b.textContent='💳 Pay online instead'; }
       alert(j&&j.error==='too-late'?'This delivery is already completing — please settle with the rider.':'Could not start the payment just now — please try again.');
     }).catch(function(){ if(b){ b.disabled=false; b.textContent='💳 Pay online instead'; } alert('Network hiccup — try again.'); });
  }
  // Leave the tracker WITHOUT touching the live order (unlike editLoc, which cancels it):
  // used by "Book another delivery" — the active order keeps running and keeps messaging
  // WhatsApp; refreshing the page resumes it again.
  function newBooking(){
    stopPoll(); if(radarM){try{map.removeLayer(radarM);}catch(e){} radarM=null;}
    clearRider();
    var bx=document.getElementById('searchbox'); if(bx&&bx.parentNode)bx.parentNode.removeChild(bx);
    RESUMED=false; RIDER=null; trkState=''; doneN=1; ORDNUM=''; MODE=''; pollN=0; TRK_LOG=[]; ORDER_META=null; ORDER_PAID=false;
    // Clear the finished/running order's route completely — a stale prefilled route here would
    // let one absent-minded Continue re-book the SAME trip, so the new booking starts clean.
    try{ clearLoc('pickup'); clearLoc('dropoff'); }catch(e){}
    var g=document.getElementById('go'); if(g){g.disabled=false; g.textContent='Confirm & book';}
    showStep(1);
  }
  function stopPoll(){ if(pollT){clearInterval(pollT);pollT=null;} }
  // Rider price counters shown on the "finding a rider" screen — the customer accepts one to lock the rider
  // at that price (POD, receiver pays cash). Kept as a self-managed #counters block so the poll can refresh it.
  function injectCofferCss(){ if(document.getElementById('coffercss'))return; var s=document.createElement('style'); s.id='coffercss'; s.textContent=
    '#counters{margin-top:16px}'
   /* Bids on screen → the chooser IS the page: hide every sibling of #counters (headline, bar, segments,
      raise/auto controls, hints) until the wave clears or a rider is picked. */
   +'#searchbox.choosing .search>*{display:none!important}'
   +'#searchbox.choosing .search>#counters{display:block!important;margin-top:2px}'
   +'.coffcancel{display:inline-flex;align-items:center;gap:7px;width:auto;background:var(--plum,#4F074C);border:none;border-radius:99px;padding:10px 16px;font-size:13.5px;font-weight:800;color:#fff;box-shadow:none;margin:0 0 12px;cursor:pointer}'
   +'.coffcancel .i{width:15px;height:15px;stroke:#fff}'
   +'.cofferh2{font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--ink,#241826);margin:0 0 4px}'
   +'.coffverified{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink2,#6A6270);margin:0 0 13px}'
   +'.coffverified .vck{width:16px;height:16px;border-radius:99px;background:var(--plum,#4F074C);color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}'
   +'.coffprice{font-size:23px;font-weight:800;letter-spacing:-.02em;color:var(--ink,#241826)}'
   +'.coffeta2{font-size:13px;font-weight:600;color:var(--ink2,#6A6270);margin-left:8px;letter-spacing:0}'
   +'.coffer>.cofftag{margin:7px 0 0}'
   +'.coffer .coffhead{margin-top:10px}'
   +'.coffstar{font-weight:800;color:var(--ink,#241826);font-size:13px;margin-left:6px}'
   +'.coffrides{font-size:12.5px;color:var(--ink2,#6A6270);font-weight:600;margin-left:5px}'
   +'.coffveh{font-size:12px;color:var(--ink2,#6A6270);margin-top:1px}'
   +'.cofferh{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--plum,#4F074C);margin-bottom:10px;text-align:center}'
   +'.coffdecl{font-size:12px;color:#b45309;font-weight:700;background:#fff8ec;border:1px solid #ffe0a6;border-radius:10px;padding:8px 12px;margin:0 0 10px;text-align:center}'
   +'.coffview{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink2,#6A6270);padding:8px 0}'
   +'.coffdot{width:8px;height:8px;border-radius:99px;background:var(--magenta,#E23A7C);animation:coffpulse 1.4s infinite}'
   +'@keyframes coffpulse{0%{box-shadow:0 0 0 0 rgba(226,58,124,.5)}70%{box-shadow:0 0 0 8px rgba(226,58,124,0)}100%{box-shadow:0 0 0 0 rgba(226,58,124,0)}}'
   +'.coffer{background:#fff;border:1.5px solid var(--line-2,#ddd0e2);border-radius:18px;padding:15px;margin-bottom:12px;box-shadow:0 6px 18px rgba(58,5,55,.06)}'
   +'.coffhead{display:flex;align-items:center;gap:13px}'
   +'.coffav{width:56px;height:56px;border-radius:99px;background:var(--plum,#4F074C);color:#fff;display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:800;flex-shrink:0;box-shadow:0 2px 8px rgba(58,5,55,.18)}'
   +'.coffid{flex:1;min-width:0}.cofn{font-size:16px;font-weight:800;color:var(--ink,#241826);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cofsub{font-size:12.5px;color:var(--ink2,#6A6270);margin-top:1px}'
   +'.cofmeta{display:flex;align-items:baseline;gap:10px;margin-top:3px;flex-wrap:wrap}'
   +'.cofrate{font-size:15px;font-weight:800;color:var(--ink,#241826)}'
   +'.cofgold{color:#F2B01E}'
   +'.cofcnt{font-size:12px;font-weight:600;color:var(--ink2,#6A6270);margin-left:3px}'
   +'.cofrides2{font-size:13px;font-weight:700;color:var(--ink2,#6A6270)}'
   +'.cofnew{font-size:11px;font-weight:800;letter-spacing:.02em;color:#0369a1;background:#e0f2fe;border-radius:99px;padding:3px 10px}'
   +'.cofpx{text-align:right;flex-shrink:0}.cofp{font-size:18px;font-weight:800;color:var(--plum,#4F074C)}.coffeta{font-size:11.5px;color:var(--ink2,#6A6270);margin-top:1px}'
   +'.coffact{display:flex;gap:10px;margin-top:14px}'
   +'.coffdecline{flex:1;background:#fff;border:1.5px solid var(--line-2,#ddd0e2);color:var(--ink2,#6A6270);border-radius:13px;padding:13px;font-size:14.5px;font-weight:700;cursor:pointer}'
   +'.cofa{flex:1.7;background:var(--plum,#4F074C);color:#fff;border:none;border-radius:13px;padding:13px;font-size:14.5px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(79,7,76,.25)}.cofa:disabled{opacity:.5}'
   +'.coffav.hasimg{overflow:hidden}.coffav img{width:100%;height:100%;object-fit:cover;border-radius:99px;display:block}'
   +'.cofftag{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.02em;color:#0B7A45;background:#E4F7EC;border-radius:99px;padding:2px 9px;margin-top:9px}'
   +'.cofftag.counter{color:var(--magenta,#E23A7C);background:#FCE7F1}'
   +'.negctl{margin-top:14px;background:#fff;border:1.5px solid var(--line-2,#ddd0e2);border-radius:16px;padding:13px}'
   +'.negrow{display:flex;align-items:center;justify-content:space-between;gap:10px}'
   +'.neglbl{font-size:13.5px;font-weight:800;color:var(--ink,#241826)}.negsub{font-size:11.5px;color:var(--ink2,#6A6270);margin-top:1px}'
   +'.negstep{display:flex;align-items:center;gap:11px}'
   +'.negbtn{width:34px;height:34px;border-radius:99px;border:1.5px solid var(--line-2,#ddd0e2);background:#fff;font-size:19px;font-weight:800;color:var(--plum,#4F074C);cursor:pointer;line-height:0}'
   +'.negamt{font-size:16px;font-weight:800;color:var(--plum,#4F074C);min-width:72px;text-align:center}'
   +'.negraise{margin-top:11px;width:100%;background:var(--plum,#4F074C);color:#fff;border:none;border-radius:12px;padding:11px;font-size:14px;font-weight:800;cursor:pointer}.negraise:disabled{opacity:.5}'
   +'.negtog{position:relative;width:44px;height:26px;border-radius:99px;background:#d9cfe0;transition:background .15s;cursor:pointer;flex-shrink:0}.negtog.on{background:var(--magenta,#E23A7C)}'
   +'.negtog span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:99px;background:#fff;transition:left .15s}.negtog.on span{left:21px}'
   +'.negcount{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--ink2,#6A6270);padding:2px 0 4px}'
   +'.negdiv{height:1px;background:var(--line,#ECE5EE);margin:12px 0}';
   document.head.appendChild(s); }
  // inDrive-style rider-offer picker (owner screenshot 2026-07-26): the moment bids exist the WHOLE panel
  // becomes "Choose your rider" — cancel pill, verified line, then one card per bidding rider led by their
  // PRICE + ETA, a "Your fare"/"Rider's offer" chip, avatar + name ★rating rides + vehicle, Decline/Accept.
  // Everything else (radar headline, progress, raise/auto controls) hides until the bids clear.
  // FULL-SCREEN is enforced with a min-height FLOOR: sheetH() by design never grows the sheet beyond its
  // CONTENT height, so with one bid card it stopped at ~300px on a tall phone (owner iPhone screenshot
  // 2026-07-27 — the chooser peeked from the bottom instead of taking the screen).
  function chooserH(on){
    var sh=document.querySelector('.sheet'); if(!sh)return;
    if(on){
      var vh=window.innerHeight||700, target=Math.round(vh*0.92);
      if(sh.style.minHeight===target+'px')return;   // already enforced — don't restart the transition
      sh.classList.add('snapping');
      sh.style.minHeight=target+'px';
      sh.style.height=target+'px';
      setTimeout(function(){try{map.invalidateSize();}catch(e){}},350);
    } else if(sh.style.minHeight){
      sh.style.minHeight='';
    }
  }
  function renderCounters(list, viewers, declines){
    _lastCounters=list||[]; _lastViewers=Number(viewers)||0; if(declines!==undefined)_lastDeclines=Number(declines)||0;
    var box=document.getElementById('searchbox'); if(!box)return;
    var host=box.querySelector('.search')||box;
    var el=document.getElementById('counters');
    var shown=_lastCounters.filter(function(c){ var dp=COFF_DECLINED[String(c.offer_id)]; return dp===undefined||dp!==Number(c.price); });
    if(!shown.length&&!(_lastViewers>0)&&!(_lastDeclines>0)){ if(el&&el.parentNode)el.parentNode.removeChild(el); COFF_EXPANDED=false; box.classList.remove('choosing'); chooserH(false); return; }
    injectCofferCss();
    if(!el){ el=document.createElement('div'); el.id='counters'; host.appendChild(el); }
    // Riders who PASSED on the price — honest signal that the offer is low; nudges a raise.
    var passed=_lastDeclines>0?('<div class="coffdecl">'+_lastDeclines+(_lastDeclines===1?' rider':' riders')+' passed on this price — raising your offer helps</div>'):'';
    if(shown.length){
      // Bids exist → the panel becomes ONLY the chooser (owner: "exactly as in the image"). The 'choosing'
      // class hides every sibling in .search; chooserH enforces the full-screen floor on EVERY render, so
      // it holds on tall phones and re-applies if anything (a drag, a repaint) shrank the sheet.
      box.classList.add('choosing');
      try{ chooserH(true); }catch(e){}
      el.innerHTML='<button type="button" class="coffcancel" id="coffcancel"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M18 6 6 18M6 6l12 12"/></svg>Cancel request</button>'
       +'<div class="cofferh2">Choose your rider</div>'
       +'<div class="coffverified"><span class="vck">✓</span>All riders verified</div>'
       +passed
       +shown.map(function(c){
        var id=esc(String(c.offer_id)), nm=esc(c.rider_name||'A rider'), ini=esc((String(c.rider_name||'R').trim().charAt(0)||'R').toUpperCase());
        var av=c.photo?('<div class="coffav hasimg" style="position:relative">'+ini+'<img src="'+esc(String(c.photo))+'" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()"></div>'):('<div class="coffav">'+ini+'</div>');
        var tag=c.took_price?'<span class="cofftag">Your fare</span>':'<span class="cofftag counter">Rider\\'s offer</span>';
        var veh=(String(c.vehicle||'bike')==='keke')?'Keke':'Motorbike';
        // Rating is the decision-maker — it gets its own LOUD line (gold star, bold number, count),
        // rides beside it; "New rider" only when there is truly no history.
        var stat=c.rating!=null
          ?('<span class="cofrate"><span class="cofgold">★</span> '+Number(c.rating).toFixed(2)+(c.rating_count?('<span class="cofcnt">('+c.rating_count+')</span>'):'')+'</span>')
          :(c.trips?'':'<span class="cofnew">New rider</span>');   // rides but never rated ≠ new — show the rides alone
        var rides=c.trips?('<span class="cofrides2">'+c.trips+' ride'+(c.trips===1?'':'s')+'</span>'):'';
        return '<div class="coffer">'
          +'<div class="coffprice">₦'+Number(c.price||0).toLocaleString()+(c.eta_mins?('<span class="coffeta2">'+c.eta_mins+' min away</span>'):'')+'</div>'
          +tag
          +'<div class="coffhead">'
          +av
          +'<div class="coffid"><div class="cofn">'+nm+'</div><div class="cofmeta">'+stat+rides+'</div><div class="coffveh">'+veh+'</div></div>'
          +'</div><div class="coffact"><button type="button" class="coffdecline" data-off="'+id+'">Decline</button><button type="button" class="cofa" data-off="'+id+'">Accept</button></div></div>';
      }).join('');
      var _cc=document.getElementById('coffcancel'); if(_cc)_cc.onclick=function(){ cancelOrd(); };
      Array.prototype.forEach.call(el.querySelectorAll('.cofa'),function(b){ b.onclick=function(){ acceptCounter(b.getAttribute('data-off'), b); }; });
      Array.prototype.forEach.call(el.querySelectorAll('.coffdecline'),function(b){ b.onclick=function(){ var oid=b.getAttribute('data-off'); var c=_lastCounters.filter(function(x){return String(x.offer_id)===oid;})[0]; COFF_DECLINED[oid]=c?Number(c.price):1; fetch(api('action=declineoffer&order='+encodeURIComponent(ORDNUM)+'&offer='+encodeURIComponent(oid)),_postOpt()).catch(function(){}); renderCounters(_lastCounters, _lastViewers, _lastDeclines); }; });
    } else {
      COFF_EXPANDED=false;
      box.classList.remove('choosing');
      chooserH(false);
      el.innerHTML=(_lastViewers>0?('<div class="coffview"><span class="coffdot"></span>'+_lastViewers+(_lastViewers===1?' rider is':' riders are')+' viewing your request…</div>'):'')+passed;
    }
  }
  function acceptCounter(offerId, btn){
    if(btn){ btn.disabled=true; btn.textContent='…'; }
    var _to={}; try{ if(window.AbortSignal&&AbortSignal.timeout)_to={signal:AbortSignal.timeout(25000)}; }catch(e){}
    fetch(api('action=acceptcounter&order='+encodeURIComponent(ORDNUM)+'&offer='+encodeURIComponent(offerId)),Object.assign({method:'POST'},_to))
     .then(function(r){return r.json();}).then(function(j){
       if(j&&j.ok){ var el=document.getElementById('counters'); if(el&&el.parentNode)el.parentNode.removeChild(el); var bx=document.getElementById('searchbox'); if(bx)bx.classList.remove('choosing'); chooserH(false); applyStatus('assigned'); try{ sheetH(0.6); }catch(e){} return; }
       if(j&&j.error==='taken'){ alert('That rider just took another order — we\\'re still finding you one.'); return; }
       if(btn){ btn.disabled=false; btn.textContent='Accept'; }
       alert('Could not accept just now — please try again.');
     }).catch(function(){ if(btn){ btn.disabled=false; btn.textContent='Accept'; } alert('Network hiccup — try again.'); });
  }
  function _postOpt(){ var o={method:'POST'}; try{ if(window.AbortSignal&&AbortSignal.timeout)o.signal=AbortSignal.timeout(25000); }catch(e){} return o; }
  // inDrive-style waiting controls (only in "pick your rider" mode = own order, still searching, auto-accept OFF):
  // a search countdown, "raise your offer" stepper, and the auto-accept toggle.
  function renderNegControls(s){
    var show=ORDER_OWN&&(trkState==='searching'||trkState==='settle')&&s&&s.auto_accept===false;
    var el=document.getElementById('negctl');
    if(!show){ if(el&&el.parentNode)el.parentNode.removeChild(el); stopNegTimer(); return; }
    var box=document.getElementById('searchbox'); if(!box)return;
    var host=box.querySelector('.search')||box;
    NEG_BASE=Number(s.base)||NEG_BASE||0;
    if(!(NEG_RAISE>=NEG_BASE)) NEG_RAISE=NEG_BASE;
    injectCofferCss();
    if(!el){
      el=document.createElement('div'); el.id='negctl'; el.className='negctl';
      el.innerHTML=
        '<div class="negcount"><span class="coffdot"></span><span id="negtimer">Finding you the best rider…</span></div>'
       +'<div class="negdiv"></div>'
       +'<div class="negrow"><div><div class="neglbl">Raise your offer</div><div class="negsub">A little more brings riders faster</div></div>'
         +'<div class="negstep"><button type="button" class="negbtn" id="negminus">−</button><span class="negamt" id="negamt"></span><button type="button" class="negbtn" id="negplus">+</button></div></div>'
       +'<button type="button" class="negraise" id="negraise" disabled>Raise offer</button>'
       +'<div class="negdiv"></div>'
       +'<div class="negrow"><div><div class="neglbl">Auto-accept</div><div class="negsub" id="negtogsub"></div></div><div class="negtog" id="negtog"><span></span></div></div>';
      var cnt=document.getElementById('counters');
      if(cnt) host.insertBefore(el,cnt); else host.appendChild(el);
      document.getElementById('negminus').onclick=function(){ NEG_RAISE=Math.max(NEG_BASE,NEG_RAISE-100); updateNeg(); };
      document.getElementById('negplus').onclick=function(){ NEG_RAISE=NEG_RAISE+100; updateNeg(); };
      document.getElementById('negraise').onclick=function(){ commitRaise(); };
      document.getElementById('negtog').onclick=function(){ toggleAutoAccept(); };
      startNegTimer();
    }
    updateNeg();
  }
  function updateNeg(){
    var a=document.getElementById('negamt'); if(a)a.textContent='₦'+NEG_RAISE.toLocaleString();
    var r=document.getElementById('negraise'); if(r)r.disabled=!(NEG_RAISE>NEG_BASE);
    var sub=document.getElementById('negtogsub'); if(sub)sub.textContent='Match instantly at ₦'+NEG_BASE.toLocaleString();
  }
  function commitRaise(){
    var b=document.getElementById('negraise'); if(b){ b.disabled=true; b.textContent='Raising…'; }
    var amt=NEG_RAISE;
    fetch(api('action=raiseoffer&order='+encodeURIComponent(ORDNUM)+'&amount='+amt),_postOpt())
     .then(function(r){return r.json();}).then(function(j){
       if(j&&j.ok){ NEG_BASE=Number(j.base)||amt; NEG_RAISE=NEG_BASE; resetNegTimer(); }
       if(b){ b.textContent='Raise offer'; } updateNeg();
     }).catch(function(){ if(b){ b.disabled=false; b.textContent='Raise offer'; } });
  }
  function toggleAutoAccept(){
    var t=document.getElementById('negtog'); var on=!(t&&t.classList.contains('on'));
    if(t)t.classList.toggle('on',on);
    fetch(api('action=setautoaccept&order='+encodeURIComponent(ORDNUM)+'&on='+(on?'1':'0')),_postOpt())
     .then(function(r){return r.json();}).then(function(j){
       if(j&&j.assigned){ applyStatus('assigned'); return; }
       if(!(j&&j.ok)){ if(t)t.classList.toggle('on',!on); alert('Could not update auto-accept — please try again.'); }
     }).catch(function(){ if(t)t.classList.toggle('on',!on); alert('Network hiccup — auto-accept unchanged.'); });
  }
  function startNegTimer(){ if(NEG_TIMER)return; NEG_LEFT=120; tickNeg(); NEG_TIMER=setInterval(tickNeg,1000); }
  function resetNegTimer(){ NEG_LEFT=120; tickNeg(); }
  function stopNegTimer(){ if(NEG_TIMER){ clearInterval(NEG_TIMER); NEG_TIMER=null; } }
  function tickNeg(){
    var t=document.getElementById('negtimer'); if(!t){ stopNegTimer(); return; }
    if(NEG_LEFT>0){ NEG_LEFT--; var m=Math.floor(NEG_LEFT/60), sc=NEG_LEFT%60; t.textContent='Finding you the best rider · '+m+':'+(sc<10?'0':'')+sc; }
    else { t.textContent='Taking a while — raise your offer to reach more riders'; }
  }
  function startPoll(ms){
    stopPoll();
    pollT=setInterval(function(){
      pollN++;
      if(pollN>400){ stopPoll(); return; }
      if(trkState==='searching'&&pollN===30) trackUI('settle');
      fetch(api('action=orderstatus&order='+encodeURIComponent(ORDNUM))).then(function(r){return r.json();}).then(function(s){
        // Rider identity rides along with the status — if it arrives AFTER the "assigned" repaint,
        // refresh the panel once so the name + Call button appear without waiting for the next stage.
        var hadRider=!!(RIDER&&(RIDER.name||RIDER.phone));
        if(s&&(s.rider_name||s.rider_phone)) RIDER={name:String(s.rider_name||''),phone:String(s.rider_phone||'')};
        if(s){ ORDER_OWN=!!s.own; if(s.rated)ORDER_RATED=true; }   // own-fleet + already-rated flags for the rating widget
        // Handover code: repaint once when it first arrives so the receiver sees it without waiting for
        // the next milestone (the poll runs every 5s while a rider is on the job).
        // Unread rider messages → badge the chat button; refresh the thread if it's open.
        if(s&&typeof s.unread!=='undefined'){
          var uWas=CHAT_UNREAD; CHAT_UNREAD=CHAT_OPEN?0:(Number(s.unread)||0);
          if(CHAT_OPEN&&Number(s.unread)>0)refreshChat();
          if(!CHAT_OPEN&&CHAT_UNREAD!==uWas&&trkState)trackUI(trkState);
        }
        if(s&&(s.my_code||s.code_set)){
          var codeWas=MY_CODE;
          MY_CODE=String(s.my_code||''); CODE_SET=!!s.code_set;
          if(MY_CODE&&MY_CODE!==codeWas&&trkState) trackUI(trkState);
        }
        // Keep the AGREED price in sync (a counter-accept changes delivery_fee) — the Order accordion,
        // the cash note and the pay-online button label all read it.
        if(s&&Number(s.base)>0&&ORDER_META&&Number(s.base)!==Number(ORDER_META.fee)){
          ORDER_META.fee=Number(s.base);
          if(MODE==='pod'&&!ORDER_PAID&&feeLine)feeLine='The receiver pays <b>₦'+Number(s.base).toLocaleString()+'</b> in cash on delivery.';
        }
        applyStatus(String((s&&s.status)||''));
        // CASH order flipped to paid (payonline webhook landed) → repaint once: note becomes "✅ Paid online",
        // the pay button disappears, and the Updates story records it.
        if(s&&s.cash===false&&MODE==='pod'&&!ORDER_PAID&&RUNNING_STATES.indexOf(trkState)>-1){
          ORDER_PAID=true; trkLog('Paid online'); trackUI(trkState);
        }
        // Rider price counters while still searching — let the customer accept one right here.
        if(trkState==='searching'||trkState==='settle') renderCounters((s&&s.counters)||[], (s&&s.viewers)||0, (s&&s.declines)||0); else renderCounters([], 0, 0);
        renderNegControls(s);
        if(!hadRider&&RIDER&&(RIDER.name||RIDER.phone)&&RUNNING_STATES.indexOf(trkState)>-1) trackUI(trkState);
        // Live rider position + ETA on the map while the job is running.
        if(s&&RUNNING_STATES.indexOf(trkState)>-1){
          updateRider(Number(s.rider_lat),Number(s.rider_lng));
          var eb=document.getElementById('eta');
          if(eb&&s.eta_mins){ eb.textContent='~'+s.eta_mins+' min'; eb.style.display='block'; }
          // Shipday-style card: "8 mins" pill next to the headline + "Est. arrival at 1:04 PM" line.
          if(s.eta_mins){
            var ep=document.getElementById('etapill'); if(ep){ ep.textContent=s.eta_mins+(Number(s.eta_mins)===1?' min':' mins'); ep.style.display='inline-block'; }
            var esl=document.getElementById('estline'); if(esl)esl.textContent='Est. arrival at '+fmtClock(new Date(Date.now()+Number(s.eta_mins)*60000));
          }
        }
      }).catch(function(){});
    },ms);
  }
  function applyStatus(raw){
    if(trkState==='cancelled')return;   // a poll already in flight must never repaint a cancelled order
    // A cancelled order (cancelled here, in chat, or by the team) must LEAVE the radar — not sit on
    // "Finding your rider" forever. orderstatus now reports 'cancelled'; show it and stop polling.
    if(raw==='cancelled'){ trkState='cancelled'; trkLog('Order cancelled'); if(radarM){try{map.removeLayer(radarM);}catch(e){}radarM=null;} clearRider(); trackUI('cancelled'); stopPoll(); return; }
    var st=(raw==='assigned'||raw==='pickedup'||raw==='ontheway'||raw==='arrived'||raw==='delivered'||raw==='failed')?raw:'';
    if(!st||st===trkState)return;
    if(st==='assigned')track('rider_assigned');
    trkLog(trkHead(st)[0]);
    trkState=st;
    if(st!=='failed')doneN=stageN(st);
    if(radarM){try{map.removeLayer(radarM);}catch(e){} radarM=null;}
    trackUI(st);
    if(st==='delivered'||st==='failed'){ stopPoll(); clearRider(); if(st==='delivered') maybeRenderRating(); }
    else { startPoll(5000); }   // matched — LIVE tracking: poll every 5s so the rider pin moves continuously
  }
  // ── Rate your rider ── after an own-fleet delivery, let the customer give 1–5 stars.
  function injectRateCss(){ if(document.getElementById('ratecss'))return; var s=document.createElement('style'); s.id='ratecss'; s.textContent=
    '#ratebox{margin-top:16px;background:#fff;border:1px solid var(--line,#ece3ef);border-radius:16px;padding:16px;text-align:center}'
   +'.rateh{font-size:14px;font-weight:800;color:var(--ink,#241826);margin-bottom:12px}'
   +'.stars{display:flex;justify-content:center;gap:8px}'
   +'.star{font-size:34px;line-height:1;color:#d9cfe0;cursor:pointer;transition:transform .1s ease}.star:active{transform:scale(.9)}.star.on{color:#F2B01E}'
   +'.ratethx{font-size:14px;font-weight:700;color:var(--plum,#4F074C)}';
   document.head.appendChild(s); }
  function maybeRenderRating(){
    if(!ORDER_OWN||ORDER_RATED)return;
    var box=document.getElementById('searchbox'); if(!box)return;
    var host=box.querySelector('.search')||box;
    if(document.getElementById('ratebox'))return;
    injectRateCss();
    var el=document.createElement('div'); el.id='ratebox';
    el.innerHTML='<div class="rateh">How was your rider?</div><div class="stars">'+[1,2,3,4,5].map(function(n){return '<span class="star" data-n="'+n+'">&#9733;</span>';}).join('')+'</div>';
    host.appendChild(el);
    var stars=el.querySelectorAll('.star');
    Array.prototype.forEach.call(stars,function(st){
      st.onmouseover=function(){ var n=+st.getAttribute('data-n'); Array.prototype.forEach.call(stars,function(s2){ s2.classList.toggle('on', (+s2.getAttribute('data-n'))<=n); }); };
      st.onclick=function(){ rateOrder(+st.getAttribute('data-n')); };
    });
  }
  function rateOrder(n){
    ORDER_RATED=true;
    var el=document.getElementById('ratebox'); if(el){ var stars=el.querySelectorAll('.star'); Array.prototype.forEach.call(stars,function(s2){ s2.classList.toggle('on',(+s2.getAttribute('data-n'))<=n); s2.onclick=null; s2.onmouseover=null; }); }
    fetch(api('action=rate&order='+encodeURIComponent(ORDNUM)+'&rating='+n),{method:'POST'}).then(function(r){return r.json();}).then(function(j){
      var e=document.getElementById('ratebox'); if(e){ var h=e.querySelector('.rateh'); if(h)h.innerHTML='<span class="ratethx">Thanks for rating '+n+'/5 &#10024;</span>'; }
    }).catch(function(){});
  }
  // Cancel the live order server-side (strictly POD + unpaid + not picked up — the server re-checks).
  // reason='edit' → the order is being REPLACED (the customer is adjusting a pin and re-booking), so the
  // server skips the "your order is cancelled" WhatsApp and softens the team alert. Default = a real cancel.
  function doCancel(onOk, reason){
    var eb=document.getElementById('trkedit'), cbb=document.getElementById('trkcancel');
    var editing=(reason==='edit');
    if(eb){ eb.disabled=true; if(editing)eb.textContent='Reopening…'; }
    if(cbb){ cbb.disabled=true; if(!editing)cbb.textContent='Cancelling…'; }
    // Belt-and-braces timeout: the button must NEVER hang forever, whatever the network does.
    var _to={}; try{ if(window.AbortSignal&&AbortSignal.timeout)_to={signal:AbortSignal.timeout(25000)}; }catch(e){}
    fetch(api('action=cancelorder&order='+encodeURIComponent(ORDNUM)+(editing?'&reason=edit':'')),_to).then(function(r){return r.json();}).then(function(s){
      if(s&&(s.cancelled||s.already)){ onOk(); return; }
      if(s&&s.error==='too-late'){ alert('The rider already has your parcel — message us on WhatsApp and we will sort it out'); trackUI(trkState); return; }
      alert('Could not cancel just now — please try again, or message us on WhatsApp.'); trackUI(trkState);
    }).catch(function(){ alert('Network hiccup — please try again.'); trackUI(trkState); });
  }
  function cancelOrd(){
    if(!confirm('Cancel this delivery? Nothing has been paid, so there is no charge.'))return;
    doCancel(function(){
      stopPoll(); if(radarM){try{map.removeLayer(radarM);}catch(e){} radarM=null;}
      clearRider();
      trkState='cancelled'; trackUI('cancelled');
    });
  }
  // "Edit location" = cancel the unpaid order, keep EVERYTHING typed, reopen the map at step 1 —
  // they adjust a pin and re-book at the honest new price. No stale price ever rides along.
  function editLoc(){
    if(!confirm('Change a location? We\\'ll reopen the map with all your details kept — nothing has been paid, and you just book again at the right price for the new route.'))return;
    doCancel(function(){
      stopPoll(); if(radarM){try{map.removeLayer(radarM);}catch(e){} radarM=null;}
      clearRider();
      var bx=document.getElementById('searchbox'); if(bx&&bx.parentNode)bx.parentNode.removeChild(bx);
      trkState=''; doneN=1; ORDNUM='';
      var g=document.getElementById('go'); if(g){g.disabled=false; g.textContent='Confirm & book';}
      showStep(1);
    },'edit');
  }
  function showSearching(j){
    ['step-route','step-pickup','step-details','step-pay'].forEach(function(id){ var e=document.getElementById(id); if(e)e.style.display='none'; });
    var sh=document.querySelector('.sheet');
    if(sh&&!document.getElementById('searchbox')){ var bx=document.createElement('div'); bx.id='searchbox'; sh.appendChild(bx); }
    feeLine=j.fee?('The receiver pays <b>₦'+Number(j.fee).toLocaleString()+'</b> in cash on delivery.'):(j.cod_booked?'Your full breakdown is in your WhatsApp chat':'');
    // MODE and ORDNUM must be set BEFORE the first render — the cancel/edit buttons key off them,
    // and the searching phase is exactly when those buttons matter most.
    MODE=j.cod_booked?'cod':'pod'; pollN=0; ORDNUM=j.order_number||'';
    // Fresh order → fresh story for the Updates accordion, and remember what was booked for the Order one.
    TRK_LOG=[]; trkLog('Order placed'); ORDER_PAID=false;
    ORDER_META={ item:val('item')||'', pu:(picked.pickup?picked.pickup.address:''), doff:(picked.dropoff?picked.dropoff.address:''), fee:(j.fee?Number(j.fee):(OFFER!=null?Number(OFFER):(mapFee?Number(mapFee):0))) };
    trkState='searching'; doneN=1; trackUI('searching');
    try{ sheetH(0.44); }catch(e){}
    if(picked.pickup){
      try{ map.flyTo([picked.pickup.lat,picked.pickup.lng],16,{duration:.9}); }catch(e){}
      try{ radarM=L.marker([picked.pickup.lat,picked.pickup.lng],{interactive:false,zIndexOffset:-200,icon:L.divIcon({className:'',iconSize:[18,18],iconAnchor:[9,9],html:'<div class="radar"><span></span><span></span></div>'})}).addTo(map); }catch(e){}
    }
    if(ORDNUM){ startPoll(8000); }
    else { setTimeout(function(){ if(trkState==='searching')trackUI('settle'); },150000); }
  }
  document.getElementById('go').onclick=function(){
    var codOn=document.getElementById('codbox').checked;
    // Negotiation model: the order goes out pay-on-delivery at the customer's stated price so riders can
    // take it or counter, and money moves only after they agree (cash at the door, or Pay online on the
    // tracker). The server enforces this too — this just keeps the client honest. COD keeps its own path.
    var payVal=(!codOn&&NEGO.enabled)?'pod':(codOn?'cod':(function(){ var r=document.querySelector('input[name=pay]:checked'); return r?r.value:'now'; })());
    if(!codOn&&NEGO.enabled)codOn=false;
    var goodsVal=codOn?Number((document.getElementById('goods').value||'').replace(/[^0-9.]/g,'')):0;
    if(codOn&&!(goodsVal>0)){ alert('Please enter how much we should collect from the buyer.'); return; }
    if(codOn&&mapFee&&(goodsVal-Math.min(3000,Math.round(goodsVal*COD_PCT/100))-Number(mapFee))<=0){ alert('That amount is too low to cover our fee and the delivery — please enter a higher amount.'); return; }
    var acctNo='',bankCode='',bankName='';
    if(codOn&&!BANK_SAVED){ acctNo=(document.getElementById('acctno').value||'').replace(/\\D/g,''); bankCode=SEL_BANK_CODE; bankName=SEL_BANK_NAME; }
    var b=document.getElementById('go'); b.disabled=true; b.textContent='Booking…';
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      session:SESSION,pickup:picked.pickup,dropoff:picked.dropoff,
      sender_name:val('sname'),sender_phone:val('sphone'),receiver_name:val('rname'),receiver_phone:val('rphone'),item:val('item'),delivery_instruction:val('dinstr'),
      pay_method:payVal,cod:codOn,goods_value:goodsVal,account_number:acctNo,bank_code:bankCode,bank_name:bankName,
      offered_price:(OFFER!=null?OFFER:0),
      auto_pick:(AUTO_PICK===null?'':(AUTO_PICK?'1':'0'))
    })})
     .then(r=>r.json()).then(j=>{
       if(j&&(j.pay_url||j.booked||j.cod_booked))track('booked');
       // App (pay now): the server returns a payment link — go straight to secure checkout, no WhatsApp.
       if(j&&j.pay_url){ document.getElementById('app').innerHTML='<div class="done"><h2>Opening secure payment…</h2><p class="muted">One moment</p></div>'; window.location.href=j.pay_url; return; }
       // Rider dispatched now (pay-on-delivery or COD): keep the map alive and search Bolt-style —
       // radar pulse on the pickup, creeping bar, real "Rider assigned" the moment Shipday confirms.
       if(j&&(j.booked||j.cod_booked)){ showSearching(j); return; }
       // Chat sessions: the order + price are waiting in WhatsApp (reply YES to pay).
       // Chat sessions finish in WhatsApp. In the APP there is no chat to return to — and landing here at
       // all means the booking didn't complete, so say that honestly and let them try again in place.
       document.getElementById('app').innerHTML=APPMODE
         ? '<div class="done"><h2>Couldn\\'t finish that booking</h2><p class="muted">Nothing was charged. Please try again.</p><button type="button" id="retrybook" style="max-width:280px;margin:18px auto 0">Try again</button></div>'
         : '<div class="done"><h2>All set!</h2><p class="muted">Your order &amp; price are waiting in your WhatsApp chat.</p>'+waCta()+'</div>';
       var _rb=document.getElementById('retrybook'); if(_rb)_rb.onclick=function(){ location.reload(); };
     }).catch(function(){ b.disabled=false; b.textContent='Confirm & book'; alert('Network hiccup — try again.'); });
  };
}
</script></body></html>`;
// The "Back to WhatsApp" buttons must return the customer to the number Adanova is ACTUALLY logged in
// on — not a hardcoded one. connectedPhone is the live session number; swap it into each page at serve
// time so the button always opens the right chat (and auto-follows any future number change).
const withWa = (html) => html.split('2349110218825').join(connectedPhone || '2347071180251');
app.get('/map', (req, res) => { res.type('html').send(withWa(MAP_PAGE)); });
// Short-link redirects so booking links are tidy in chat: /m/:t → /map?session=:t (etc.)
app.get('/m/:t', (req, res) => res.redirect(302, `/map?session=${encodeURIComponent(req.params.t)}`));
app.get('/q/:t', (req, res) => res.redirect(302, `/quote?session=${encodeURIComponent(req.params.t)}`));
app.get('/w/:t', (req, res) => res.redirect(302, `/waybill?session=${encodeURIComponent(req.params.t)}`));
app.get('/v/:t', (req, res) => res.redirect(302, `/vendor?session=${encodeURIComponent(req.params.t)}`));

// ── International / Waybill quote calculator (the INTL/WAYBILL twin of the map) ──
// Pricing is recomputed server-side by the Supabase quotePicker function (intlPricing).
// Shared premium styling for the no-map booking pages (international & waybill) — matches the
// clean white + green look of the local map page.
// ── Shared premium design system (the map page's tokens/components, for the no-map booking pages) ──
const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;
const BASE_CSS = `:root{--plum:#4F074C;--plum-d:#3A0537;--pink:#E23A7C;--pink-soft:#FCEBF2;--lilac:#FBE9F1;--ink:#241a29;--ink-2:#6a626f;--ink-3:#a8a0ae;--line:#ece7ef;--line-2:#ded6e2;--surface:#fff;--bg:#FBF3F7;--amber:#b45309;--amber-line:#ffe0a6;--amber-bg:#fff8ec;--r:14px;--r-lg:18px;--r-xl:26px;--ease:cubic-bezier(.23,1,.32,1);--sh-1:0 1px 2px rgba(58,5,55,.05),0 3px 10px rgba(58,5,55,.05);--sh-pop:0 18px 44px rgba(58,5,55,.16)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font-family:'Inter',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
input,button,textarea,select{font-family:inherit}
.wrap{max-width:480px;margin:0 auto;background:var(--bg);min-height:100vh;min-height:100dvh;position:relative}
.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,#5b0a57,var(--plum-d));color:#fff;padding:26px 22px 44px}
.hero::after{content:"";position:absolute;right:-60px;top:-70px;width:220px;height:220px;border-radius:50%;background:radial-gradient(closest-side,rgba(226,58,124,.55),transparent);pointer-events:none}
.hero .glow{position:absolute;right:-18px;top:-14px;font-size:148px;opacity:.10;transform:rotate(-12deg);pointer-events:none;line-height:1}
.hero h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-.02em;position:relative}
.hero p{margin:9px 0 0;font-size:13.5px;color:#ecd6e7;line-height:1.55;max-width:330px;position:relative}
.chips{display:flex;gap:7px;margin-top:15px;flex-wrap:wrap;position:relative}
.chip{background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.17);color:#f4e6f0;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:20px}
.sheet,.body{position:relative;z-index:2;background:var(--surface);border-radius:var(--r-xl) var(--r-xl) 0 0;margin-top:-24px;padding:14px 18px 26px;box-shadow:0 -10px 30px rgba(58,5,55,.07);animation:rise .45s var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
h2{margin:2px 2px 16px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.sec{font-size:11.5px;font-weight:700;color:var(--ink-2);text-transform:uppercase;letter-spacing:.07em;margin:22px 2px 10px}
.sec:first-child{margin-top:6px}
.lbl{font-size:12.5px;color:var(--ink-2);font-weight:600;margin:14px 2px 7px}
.req{color:var(--pink);font-weight:700}
input:not([type=radio]):not([type=checkbox]),select,textarea{width:100%;padding:14px 15px;border:1px solid var(--line);background:#fff;border-radius:var(--r);font-size:16px;color:var(--ink);outline:none;-webkit-appearance:none;appearance:none;transition:border-color .15s var(--ease),box-shadow .15s var(--ease)}
input::placeholder,textarea::placeholder{color:var(--ink-3)}
input:not([type=radio]):not([type=checkbox]):focus,select:focus,textarea:focus{border-color:var(--plum);box-shadow:0 0 0 3px rgba(79,7,76,.10)}
select{padding-right:40px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' stroke='%236a626f' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 15px center}
textarea{min-height:66px;resize:none;line-height:1.45}
.fld{position:relative;margin-bottom:11px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.mt{margin-top:9px}
.sug,.sugbox{position:absolute;z-index:2000;left:0;right:0;top:100%;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);margin-top:5px;box-shadow:var(--sh-pop);overflow:hidden;max-height:232px;overflow-y:auto}
.sug div,.sugbox div{padding:13px 15px;font-size:15px;border-bottom:1px solid var(--line);color:var(--ink);cursor:pointer}
.sug div:last-child,.sugbox div:last-child{border-bottom:0}
.sug div:active,.sugbox div:active{background:var(--lilac)}
.gpsbtn,.locp{position:absolute;border:0;background:transparent;color:var(--plum);cursor:pointer;font-size:19px;display:flex;align-items:center;justify-content:center;border-radius:10px;transition:transform .12s var(--ease),background .15s var(--ease)}
.gpsbtn{top:0;right:0;height:50px;width:46px}
.locp{right:5px;top:8px;width:36px;height:36px;line-height:1}
.gpsbtn:active,.locp:active{transform:scale(.9);background:rgba(79,7,76,.08)}
.gpsbtn:disabled{opacity:.5}
.locin{padding-right:44px}
.pills{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pill{border:1.5px solid var(--line);border-radius:var(--r-lg);padding:13px 14px;cursor:pointer;background:#fff;transition:border-color .15s var(--ease),background .15s var(--ease),transform .12s var(--ease)}
.pill:active{transform:scale(.98)}
.pill.on{border-color:var(--pink);background:var(--pink-soft)}
.pill .pt{font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;color:var(--ink)}
.pill .pd{font-size:11.5px;color:var(--ink-2);margin-top:4px;line-height:1.3}
.pill.on .pt{color:#B02063}
.states{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.st{padding:14px;border:1.5px solid var(--line);border-radius:var(--r-lg);text-align:center;cursor:pointer;background:#fff;transition:border-color .15s var(--ease),background .15s var(--ease),transform .12s var(--ease)}
.st:active{transform:scale(.98)}
.st b{display:block;font-size:15px;font-weight:700;color:var(--ink)}
.st span{font-size:12.5px;color:var(--ink-2)}
.st.on{border-color:var(--pink);background:var(--pink-soft)}.st.on b,.st.on span{color:#B02063}
.feebig,.estcard{display:none;align-items:center;justify-content:space-between;gap:12px;background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 18px;margin:16px 0 2px}
.feebig .l,.estcard .l,.feebig .lbl{font-size:13px;color:var(--ink-2);font-weight:600}
.feebig .sub,.estcard .sub{font-size:12px;color:var(--ink-2);margin-top:3px;font-weight:500;line-height:1.3}
.feebig .amt,.estcard .amt{font-size:23px;font-weight:800;color:var(--plum);letter-spacing:-.02em;white-space:nowrap}
.ord{border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 13px;margin:12px 0;position:relative;background:#fcfafd}
.ord .rm{position:absolute;top:8px;right:9px;color:#c0392b;background:none;border:0;font-size:22px;cursor:pointer;line-height:1}
.ord .cap{font-size:11px;font-weight:800;color:var(--plum);letter-spacing:.09em;text-transform:uppercase;margin:0 0 9px}
.same{background:none;border:0;color:var(--pink);font-size:12.5px;font-weight:700;cursor:pointer;padding:6px 2px 0}
.add{width:100%;margin:8px 0 2px;padding:14px;border:1.5px dashed var(--line-2);background:#fff;color:var(--plum);border-radius:var(--r);font-size:14.5px;font-weight:700;cursor:pointer;transition:background .15s var(--ease)}
.add:active{background:var(--lilac)}
.payopt{display:flex;align-items:center;gap:11px;padding:14px;border:1px solid var(--line);border-radius:var(--r);margin-bottom:9px;font-size:14.5px;font-weight:500;color:var(--ink);cursor:pointer;transition:border-color .15s var(--ease),background .15s var(--ease)}
.payopt input{width:19px;height:19px;accent-color:var(--plum);flex:none}
.payopt:has(input:checked){border-color:var(--plum);background:var(--lilac)}
.review{border:1px solid #f0d9e8;background:var(--pink-soft);border-radius:var(--r-lg);padding:15px;margin-top:14px}
.review .rr{display:flex;justify-content:space-between;font-size:14px;padding:5px 0;color:var(--plum-d)}
.review .tot{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:var(--plum);border-top:1px solid #f0d9e8;margin-top:8px;padding-top:10px}
#go,.go{width:100%;margin-top:14px;padding:16px;border:0;border-radius:var(--r-lg);background:var(--plum);color:#fff;font-size:16.5px;font-weight:700;letter-spacing:-.01em;-webkit-appearance:none;cursor:pointer;box-shadow:0 6px 18px rgba(79,7,76,.26);transition:transform .14s var(--ease),background .2s var(--ease)}
#go:active:not(:disabled),.go:active:not(:disabled){transform:scale(.985)}
#go:disabled,.go:disabled{background:var(--line);color:var(--ink-3);box-shadow:none;cursor:default}
.bar{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;background:#fff;border-top:1px solid var(--line);padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:14px;box-shadow:0 -8px 26px rgba(58,5,55,.09);z-index:1500}
.bar .bamt .s{font-size:10.5px;color:var(--ink-2);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.bar .bamt .v{font-size:18px;font-weight:800;letter-spacing:-.01em;color:var(--plum)}
.bar #go{flex:1;margin-top:0;box-shadow:none;padding:15px}
.err{color:#c0392b;font-size:13px;min-height:15px;margin-top:6px}
.muted{color:var(--ink-2);font-size:12.5px;text-align:center;margin:20px 0 2px}
.done{text-align:center;padding:56px 24px}.done h2{font-size:24px;color:var(--plum-d);font-weight:800}
.wabtn{display:inline-block;margin-top:20px;padding:16px 30px;background:var(--plum);color:#fff;border-radius:var(--r-lg);text-decoration:none;font-weight:700;font-size:16.5px;box-shadow:0 6px 18px rgba(79,7,76,.26)}
.reveal{animation:fade .35s var(--ease)}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
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
.fld input:focus,.fld select:focus{border-color:#4F074C;box-shadow:0 0 0 3px rgba(37,211,102,.12)}
.req{color:#4F074C}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sugbox{position:absolute;z-index:50;left:0;right:0;background:#fff;border:1px solid #edeff2;border-radius:13px;margin-top:4px;box-shadow:0 12px 30px rgba(14,23,38,.12);overflow:hidden}
.gpsbtn{position:absolute;top:0;right:0;height:52px;width:46px;border:0;background:transparent;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#4F074C}.gpsbtn:disabled{opacity:.5}
.sugbox div{padding:14px;font-size:15px;border-bottom:1px solid #f2f4f6;cursor:pointer}
.sugbox div:active{background:#FBF3F9}
.states{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}
.st{padding:14px;border:1px solid #e6e9ed;border-radius:13px;text-align:center;cursor:pointer}
.st b{display:block;font-size:15px;font-weight:700}
.st span{font-size:12.5px;color:#6b7280}
.st.on{border-color:#E23A7C;background:#FCEBF2}.st.on b,.st.on span{color:#B02063}
.feebig{display:none;align-items:center;justify-content:space-between;border:1px solid #e6e9ed;border-radius:14px;padding:15px 18px;margin:14px 0 2px}
.feebig .l{font-size:13px;color:#6b7280;font-weight:600}
.feebig .sub{font-size:12px;color:#9aa0a6;margin-top:2px}
.feebig .amt{font-size:22px;font-weight:800;letter-spacing:-.01em}
button{width:100%;padding:17px;border:0;border-radius:14px;background:#4F074C;color:#fff;font-size:17px;font-weight:800;margin-top:14px;-webkit-appearance:none}
button:disabled{background:#F0D9E8}
.done{text-align:center;padding:48px 22px}.done h2{font-size:22px;color:#3A0537}
.muted{color:#9aa0a6;font-size:12.5px;text-align:center;margin-top:24px}
.wabtn{display:inline-block;margin-top:18px;padding:16px 28px;background:#4F074C;color:#fff;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px}
.err{color:#c0392b;font-size:13px;min-height:16px;margin-top:6px}`;

// ── INTERNATIONAL shipping page (rider-first estimate) — premium look, no waybill ──
// ── Shared "experience" kit (quote / waybill / bulk) ── tap-first affordances that replace
// form-feel: flag destination chips, a living route strip, item chips, count-up price moments,
// state pills, press feedback. Presentation only — every field id and payload stays identical.
const EXP_CSS = `
.destgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:2px 0 6px}
.dchip{display:flex;align-items:center;gap:10px;padding:13px 12px;border:1.5px solid var(--line-2);border-radius:14px;background:#fff;cursor:pointer;text-align:left;box-shadow:none;width:auto;transition:transform .16s cubic-bezier(.23,1,.32,1),border-color .2s ease,background .2s ease}
.dchip:active{transform:scale(.97)}
.dchip.on{border-color:var(--plum);background:var(--lilac)}
.dchip .fl{font-size:22px;flex:none;line-height:1}
.dchip .dn{font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.2}
.morec{display:block;width:100%;margin:8px 0 0;padding:11px 0;background:none;border:none;box-shadow:none;color:var(--plum);font-size:13px;font-weight:700;cursor:pointer;transition:opacity .16s ease}
.morec:active{opacity:.7}
.morewrap{display:none;margin-top:4px}
.morewrap.on{display:block;animation:qexpin .2s cubic-bezier(.23,1,.32,1)}
@keyframes qexpin{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.routestrip{display:none;align-items:center;justify-content:center;gap:9px;background:var(--plum);color:#fff;border-radius:14px;padding:11px 14px;margin:0 0 16px;font-size:13.5px;font-weight:700;animation:qexpin .25s cubic-bezier(.23,1,.32,1)}
.routestrip.on{display:flex}
.routestrip .rsarrow{opacity:.65;font-size:12px;letter-spacing:.06em}
.routestrip .rsflag{font-size:17px;line-height:1}
.echips{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px}
.echips button{flex:0 0 auto;width:auto;padding:9px 14px;border-radius:999px;border:1.5px solid var(--line-2);background:#fff;font-size:13px;font-weight:700;color:var(--ink-2);box-shadow:none;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.echips button:active{transform:scale(.95)}
.echips button.on{border-color:var(--plum);background:var(--plum);color:#fff}
.amtpop{animation:amtin .3s cubic-bezier(.23,1,.32,1)}
@keyframes amtin{from{transform:scale(.92);opacity:.5}to{transform:none;opacity:1}}
.stategrid{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 2px}
.stategrid button{flex:0 0 auto;width:auto;padding:9px 13px;border-radius:999px;border:1.5px solid var(--line-2);background:#fff;font-size:12.5px;font-weight:700;color:var(--ink-2);box-shadow:none;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.stategrid button:active{transform:scale(.95)}
.stategrid button.on{border-color:var(--plum);background:var(--plum);color:#fff}
`;
// Count-up: a price that lands with weight instead of just appearing. Correctness first —
// the FINAL value is written synchronously (rAF can be throttled to zero in backgrounded
// WebViews), then the 500ms count runs purely as decoration when frames actually fire.
const EXP_JS = `
function countUp(elm,target,prefix){
  if(!elm)return;
  var fin=(prefix||'')+'\\u20A6'+Number(target).toLocaleString();
  elm.textContent=fin;
  try{ elm.classList.remove('amtpop'); void elm.offsetWidth; elm.classList.add('amtpop'); }catch(e){}
  try{
    var start=null,dur=500;
    requestAnimationFrame(function frame(ts){
      if(start===null)start=ts;
      var p=Math.min(1,(ts-start)/dur); p=1-Math.pow(1-p,3);
      elm.textContent=(prefix||'')+'\\u20A6'+Math.round(target*p).toLocaleString();
      if(p<1)requestAnimationFrame(frame); else elm.textContent=fin;
    });
  }catch(e){ elm.textContent=fin; }
}
`;
// ── FLOW_CSS: the silhouette killer (quote / waybill / bulk) ── a form is a silhouette:
// letterhead hero → white sheet → labeled boxes → submit. This const deletes the silhouette by
// cascade (embedded AFTER BASE_CSS, same selectors win later): inputs become borderless
// underline ANSWERS, caps labels become big conversational questions, the hero becomes a
// whisper, the white paper becomes the blush canvas (white survives only on tappable objects),
// and the price becomes a full-plum moment. Zero markup or logic required by this const alone.
const FLOW_CSS = `
@keyframes chapin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
input:not([type=radio]):not([type=checkbox]),textarea{border:0;border-bottom:1.5px solid var(--line-2);border-radius:0;background:transparent;padding:13px 2px;font-size:17px;font-weight:600;transition:border-color .18s var(--ease);box-shadow:none}
input:not([type=radio]):not([type=checkbox]):focus,textarea:focus{border-color:var(--plum);box-shadow:none}
input::placeholder,textarea::placeholder{font-weight:500}
.sec{font-size:19px;font-weight:800;color:var(--ink);text-transform:none;letter-spacing:-.02em;margin:28px 2px 4px}
.sec:first-child{margin-top:8px}
.lbl{font-size:15px;font-weight:700;color:var(--ink);margin:20px 2px 2px}
.hero{padding:14px 20px 26px}
.hero h1{font-size:17px}
.hero p{display:none}
.hero .glow{font-size:72px;opacity:.08}
.hero .chips{display:none}
.sheet,.body{background:transparent;box-shadow:none;border-radius:0}
.chap{display:none}
.chap.on{display:block;animation:chapin .26s var(--ease)}
.qh{font-size:26px}
.step.on>*{animation:chapin .26s var(--ease) both}
.step.on>*:nth-child(2){animation-delay:.04s}
.step.on>*:nth-child(3){animation-delay:.08s}
.step.on>*:nth-child(4){animation-delay:.12s}
.step.on>*:nth-child(n+5){animation-delay:.14s}
.estcard,.feebig{background:var(--plum);border:0;border-radius:16px}
.estcard .l,.feebig .l{color:#fff}
.estcard .sub,.feebig .sub{color:#ecd6e7}
.estcard .amt,.feebig .amt{color:#fff;font-size:30px;font-weight:800}
`;
// ── Shared pickup tracker (quote + waybill pages) ── the map page's tracker, panel-only (these
// pages have no map): live stages rail, rider card with Call, resume via check.active. Same class
// names/motion as the map tracker so the whole product feels like one system.
const TRACK_CSS = `
.search{text-align:center;padding:18px 6px 4px;animation:searchin .18s cubic-bezier(.23,1,.32,1)}
@keyframes searchin{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.search h2{font-size:20px;font-weight:800;color:var(--plum-d);letter-spacing:-.02em;margin:0 0 6px}
.livedot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pink);margin:0 8px 2px 0;vertical-align:middle;animation:livep 1.6s cubic-bezier(.23,1,.32,1) infinite}
@keyframes livep{0%,100%{box-shadow:0 0 0 0 rgba(226,58,124,.35)}50%{box-shadow:0 0 0 6px rgba(226,58,124,0)}}
.search .smut{font-size:13.5px;color:var(--ink-2);line-height:1.45;margin:0 0 2px}
.search .ssub{font-size:12px;color:var(--ink-3);margin:12px 0 0;line-height:1.4}
.sbar{height:4px;border-radius:99px;background:var(--line);overflow:hidden;margin:15px 10px 4px}
.sfill{height:100%;width:6%;border-radius:99px;background:var(--plum);animation:screep 75s cubic-bezier(.25,.6,.3,1) forwards}
@keyframes screep{0%{width:6%}15%{width:34%}45%{width:60%}100%{width:88%}}
.trk{margin:14px auto 2px;text-align:left;max-width:300px}
.tkrow{position:relative;display:flex;align-items:center;gap:12px;padding:8px 0;animation:tkrowin .22s cubic-bezier(.23,1,.32,1) both}
@keyframes tkrowin{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.tkrow:nth-child(2){animation-delay:.04s}.tkrow:nth-child(3){animation-delay:.08s}.tkrow:nth-child(4){animation-delay:.12s}
.tkrow+.tkrow::before{content:'';position:absolute;left:10px;top:-8px;width:2px;height:16px;border-radius:2px;background:var(--line-2)}
.tkrow+.tkrow.tk-done::before,.tkrow+.tkrow.tk-cur::before{background:var(--plum)}
.tkd{width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;position:relative;z-index:1}
.tk-done .tkd{background:var(--plum);color:#fff;animation:tkin .22s cubic-bezier(.23,1,.32,1) both}
.tkrow:nth-child(2).tk-done .tkd{animation-delay:.04s}.tkrow:nth-child(3).tk-done .tkd{animation-delay:.08s}.tkrow:nth-child(4).tk-done .tkd{animation-delay:.12s}
@keyframes tkin{from{transform:scale(.6);opacity:.4}to{transform:scale(1);opacity:1}}
.tk-cur .tkd{background:#fff;border:2px solid var(--pink);animation:tkpulse 1.6s ease-in-out infinite}
.tk-todo .tkd{background:#fff;border:2px solid var(--line-2)}
.tkl{font-size:14px;font-weight:600;color:var(--ink)}
.tk-todo .tkl{color:var(--ink-3);font-weight:500}
.tk-cur .tkl{color:var(--plum-d);font-weight:700}
@keyframes tkpulse{0%,100%{box-shadow:0 0 0 3px rgba(226,58,124,.20)}50%{box-shadow:0 0 0 8px rgba(226,58,124,.06)}}
.riderrow{display:flex;align-items:center;gap:11px;margin:12px auto 0;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:13px;text-align:left;max-width:300px;animation:riderin .22s cubic-bezier(.23,1,.32,1)}
@keyframes riderin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.rdrav{flex:none;width:38px;height:38px;border-radius:50%;background:var(--plum);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800}
.rdrmeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rdrcap{font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--ink-3);text-transform:uppercase}
.riderrow .rdrnm{font-size:14px;font-weight:800;color:var(--plum-d);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.riderrow .rdrcall{flex:none;display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 15px;border-radius:11px;background:var(--plum);color:#fff;font-size:12.5px;font-weight:800;text-decoration:none;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.riderrow .rdrcall:active{transform:scale(.96)}
`;
const TRACK_JS = `
function ldlTracker(opts){
  var st='',done=1,pn=0,timer=null,RID=null,ORD='',L=opts.labels;
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function stageN(s){return s==='assigned'?2:(s==='ontheway'?3:4);}
  function head(s){return L.heads[s]||L.heads.searching;}
  function ui(state){
    var mount=document.getElementById(opts.mount); if(!mount)return;
    var rows='',i,cls;
    for(i=0;i<4;i++){cls='tk-todo';if(i<done)cls='tk-done';else if(i===done&&state!=='failed')cls='tk-cur';
      rows+='<div class="tkrow '+cls+'"><span class="tkd">'+(i<done?'✓':'')+'</span><span class="tkl">'+L.stages[i]+'</span></div>';}
    var h=head(state);
    var rr='';
    if(RID&&(RID.name||RID.phone)&&(state==='assigned'||state==='ontheway')){
      var ini=(RID.name||'').trim().charAt(0).toUpperCase()||'🛵';
      rr='<div class="riderrow"><div class="rdrav">'+esc(ini)+'</div><div class="rdrmeta"><span class="rdrcap">Your rider</span><span class="rdrnm">'+esc(RID.name||'On the job')+'</span></div>'
        +(RID.phone?('<a class="rdrcall" href="tel:'+esc(String(RID.phone).replace(/[^\\d+]/g,''))+'">📞 Call</a>'):'')+'</div>';
    }
    mount.innerHTML='<div class="search"><h2>'+((state==='searching'||state==='settle')?'<span class="livedot"></span>':'')+h[0]+'</h2><p class="smut">'+h[1]+'</p>'
      +((state==='searching'||state==='settle')?'<div class="sbar"><div class="sfill"></div></div>':'')
      +'<div class="trk">'+rows+'</div>'+rr
      +((state==='delivered'||state==='failed')?(opts.doneHtml||''):'<p class="ssub">You can close this page — every update also lands in your WhatsApp chat.</p>')
      +'</div>';
  }
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  function apply(raw){
    if(st==='cancelled')return;
    // A cancelled order must LEAVE the radar, not sit on "Finding your rider" forever. Self-contained
    // render (no dependency on the per-page labels) so every flow shows a clean cancelled state.
    if(raw==='cancelled'){ st='cancelled'; stop(); var mc=document.getElementById(opts.mount); if(mc)mc.innerHTML='<div class="search"><h2>Order cancelled</h2><p class="smut">This delivery was cancelled. You can book again anytime.</p>'+(opts.doneHtml||'')+'</div>'; return; }
    var s=(raw==='assigned'||raw==='ontheway'||raw==='delivered'||raw==='failed')?raw:'';
    if(!s||s===st)return;
    st=s; if(s!=='failed')done=stageN(s);
    ui(s);
    if(s==='delivered'||s==='failed'){stop();} else {poll(15000);}
  }
  function poll(ms){
    stop();
    timer=setInterval(function(){
      pn++; if(pn>400){stop();return;}
      if(st===''&&pn===30)ui('settle');
      fetch(opts.api+'?action=orderstatus&session='+encodeURIComponent(opts.session)+'&order='+encodeURIComponent(ORD))
        .then(function(r){return r.json();}).then(function(j){
          var had=!!(RID&&(RID.name||RID.phone));
          if(j&&(j.rider_name||j.rider_phone))RID={name:String(j.rider_name||''),phone:String(j.rider_phone||'')};
          apply(String((j&&j.status)||''));
          if(!had&&RID&&(RID.name||RID.phone)&&(st==='assigned'||st==='ontheway'))ui(st);
        }).catch(function(){});
    },ms);
  }
  return {open:function(orderNumber,status){
    ORD=String(orderNumber||''); st=''; done=1; pn=0; RID=null;
    ui('searching');
    if(status)apply(String(status));
    if(ORD&&st!=='delivered'&&st!=='failed')poll(st?15000:8000);
  }};
}
`;
const QUOTE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Ship internationally &mdash; Lasalu Drop</title>
<meta name="theme-color" content="#4F074C">
${FONT_LINK}<style>${BASE_CSS}${TRACK_CSS}${EXP_CSS}${FLOW_CSS}
.wrap{padding-bottom:96px}
/* The sheet reaches the action bar, so a short step never leaves a dead pale band. */
.sheet{display:flex;flex-direction:column;min-height:calc(100vh - 232px)}
.steps{display:flex;gap:6px;padding:0 4px 16px}
.sd{flex:1;height:4px;border-radius:2px;background:var(--line-2);transition:background .3s var(--ease)}
.sd.on{background:var(--pink)}
.qh{font-size:26px;font-weight:800;letter-spacing:-.4px;color:var(--ink);margin:2px 0 6px;line-height:1.22}
.qs{font-size:14px;color:var(--ink-2);margin:0 0 18px;line-height:1.5}
.step{display:none}
.step.on{display:block;animation:qin .28s var(--ease)}
@keyframes qin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
/* Service cards. The label block is a COLUMN — inline spans would run the title and
   the detail together on one line, which is exactly how this shipped the first time. */
.svc{display:flex;flex-direction:column;gap:11px}
.scard{display:flex;align-items:center;gap:14px;padding:16px;border:1.5px solid var(--line-2);border-radius:var(--r);background:#fff;cursor:pointer;transition:border-color .2s var(--ease),background .2s var(--ease);width:100%;text-align:left;box-shadow:none}
.scard.on{border-color:var(--plum);background:var(--lilac)}
.scard:active{transform:scale(.995)}
.scard .ic{width:26px;height:26px;flex:none;fill:none;stroke:var(--plum);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.scard .txt{display:flex;flex-direction:column;gap:3px;min-width:0}
.scard .st1{display:block;font-size:16.5px;font-weight:700;color:var(--ink);line-height:1.2}
.scard .st2{display:block;font-size:13px;color:var(--ink-2);line-height:1.35}
/* estcard is NOT in BASE_CSS - it was an undefined class on the old page, which is
   why the amount crammed into the label. Defined properly here. JS flips it to flex.
   NOTE: never put a backtick in this file - it terminates the page template literal. */
.estcard{display:none;align-items:center;justify-content:space-between;gap:14px;background:var(--plum);border:0;border-radius:16px;padding:16px 18px;margin:8px 0 2px}
.estcard .l{font-size:13.5px;font-weight:700;color:#fff}
.estcard .sub{font-size:12px;color:#ecd6e7;line-height:1.45;margin-top:3px}
.estcard .amt{font-size:30px;font-weight:800;color:#fff;white-space:nowrap;flex:none}
.wq{display:flex;gap:8px;margin:2px 0 14px;flex-wrap:wrap}
.wq button{flex:0 0 auto;width:auto;padding:9px 15px;border-radius:999px;border:1.5px solid var(--line-2);background:#fff;font-size:14px;font-weight:700;color:var(--ink-2);box-shadow:none}
.wq button.on{border-color:var(--plum);background:var(--plum);color:#fff}
.sum{background:var(--lilac);border:1px solid #F3D9E5;border-radius:var(--r);padding:15px;margin-bottom:14px}
.sum .r{display:flex;justify-content:space-between;gap:14px;padding:7px 0;font-size:14px}
.sum .r .k{color:var(--ink-2);flex:0 0 auto}
.sum .r .v{color:var(--ink);font-weight:700;text-align:right}
.sum .tot{border-top:1px solid #F3D9E5;margin-top:8px;padding-top:12px}
.sum .tot .v{font-size:19px;font-weight:800}
.note{font-size:12.5px;color:var(--ink-2);line-height:1.55;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r);padding:12px;margin-bottom:14px}
/* Footer sits at the bottom of the sheet rather than floating under a short step. */
.pw{margin-top:auto;padding-top:22px}
.nav{display:flex;gap:10px;align-items:center;flex:1}
.back{flex:0 0 auto;width:auto;padding:0 18px;height:52px;background:#fff;border:1.5px solid var(--line-2);color:var(--ink-2);font-weight:700;border-radius:var(--r);box-shadow:none}
/* No estimate yet = no estimate readout. A bare dash reads as broken. */
#estwrap{display:none}
#estwrap.on{display:block}</style></head><body><div class="wrap" id="app">
<div class="hero"><div class="glow"></div>
<h1>Ship internationally</h1>
<p>Door pickup in Port Harcourt, delivered worldwide. You only pay after our rider weighs it.</p></div>
<div class="sheet">
<div class="steps"><div class="sd on" id="sd0"></div><div class="sd" id="sd1"></div><div class="sd" id="sd2"></div><div class="sd" id="sd3"></div><div class="sd" id="sd4"></div></div>
<div class="routestrip" id="rstrip"><span class="rsflag"></span><span>Port Harcourt</span><span class="rsarrow">&mdash;&nbsp;&nbsp;&mdash;</span><span class="rsflag" id="rsflag"></span><span id="rsname"></span></div>

<div class="step on" id="s0">
<div class="qh">How should it fly?</div>
<div class="qs">Most people send Air Express. Cargo is cheaper for big, heavy loads.</div>
<div class="svc">
<button type="button" class="scard on" data-svc="express"><svg class="ic" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg><span class="txt"><span class="st1">Air Express</span><span class="st2">Worldwide &middot; 3&ndash;7 days</span></span></button>
<button type="button" class="scard" data-svc="cargo"><svg class="ic" viewBox="0 0 24 24"><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg><span class="txt"><span class="st1">Air Cargo</span><span class="st2">UK, USA, Canada &amp; Ghana &middot; 10kg and above</span></span></button>
</div>
</div>

<div class="step" id="s1">
<div class="qh">Where is it going?</div>
<div class="qs">Tap the country, then tell us roughly how heavy it is.</div>
<div class="destgrid" id="destgrid">
<button type="button" class="dchip" data-c="UNITED KINGDOM (Z1)"><span class="fl"></span><span class="dn">United Kingdom</span></button>
<button type="button" class="dchip" data-c="USA (Z3)"><span class="fl"></span><span class="dn">United States</span></button>
<button type="button" class="dchip" data-c="CANADA (Z3)"><span class="fl"></span><span class="dn">Canada</span></button>
<button type="button" class="dchip" data-c="GHANA (Z2)"><span class="fl"></span><span class="dn">Ghana</span></button>
<button type="button" class="dchip" data-c="UNITED ARAB EMIRATES (Z6)"><span class="fl"></span><span class="dn">UAE &middot; Dubai</span></button>
<button type="button" class="dchip" data-c="GERMANY (Z4)"><span class="fl"></span><span class="dn">Germany</span></button>
<button type="button" class="dchip" data-c="ITALY (Z4)"><span class="fl"></span><span class="dn">Italy</span></button>
<button type="button" class="dchip" data-c="CHINA (Z7)"><span class="fl"></span><span class="dn">China</span></button>
</div>
<button type="button" class="morec" id="morec">More countries &#9662;</button>
<div class="morewrap" id="morewrap">
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
</div>
<div class="lbl">About how heavy?</div>
<div class="wq" id="wq"></div>
<div class="fld"><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="Or type the weight in kg"></div>
<div class="lbl">What is it worth? <span class="req">*</span></div>
<div class="fld"><input id="value" type="number" min="1" inputmode="numeric" placeholder="Needed for customs"></div>
<div class="estcard" id="fee"></div>
<div class="err" id="err"></div>
</div>

<div class="step" id="s2">
<div class="qh">Where do we collect it?</div>
<div class="qs">Our rider comes to this address, weighs the item in front of you, and packs it there.</div>
<div class="two"><div class="fld"><input id="sname" placeholder="Your name"></div><div class="fld"><input id="sphone" type="tel" inputmode="tel" placeholder="Your phone *"></div></div>
<div class="lbl">Pickup address <span class="req">*</span></div>
<div class="fld"><input id="paddr" placeholder="Start typing your address&hellip;" autocomplete="off" style="padding-right:44px"><button type="button" id="ploc" class="gpsbtn" aria-label="Use my current location"></button><div class="sugbox" id="psug" style="display:none"></div></div>
</div>

<div class="step" id="s3">
<div class="qh">Who is receiving it?</div>
<div class="qs">Their address abroad, so we can deliver to their door.</div>
<div class="two"><div class="fld"><input id="rname" placeholder="Receiver name"></div><div class="fld"><input id="rphone" type="tel" inputmode="tel" placeholder="Their phone"></div></div>
<div class="lbl">Delivery address abroad</div>
<div class="fld"><input id="daddr" placeholder="Street, city, postcode&hellip;" autocomplete="off"><div class="sugbox" id="dsug" style="display:none"></div></div>
<div class="lbl">What are you sending?</div>
<div class="echips" id="qitems">
<button type="button" data-i="Documents">Documents</button>
<button type="button" data-i="Clothes">Clothes</button>
<button type="button" data-i="Foodstuff">Foodstuff</button>
<button type="button" data-i="Phone / electronics">Electronics</button>
<button type="button" data-i="Cosmetics">Cosmetics</button>
<button type="button" data-i="Medication">Medication</button>
</div>
<div class="fld"><input id="item" placeholder="Or type it &mdash; e.g. documents, clothes, a phone"></div>
<div class="lbl">Anything we should know? <span style="font-weight:600;text-transform:none;letter-spacing:0;color:#aab0b8">&mdash; optional</span></div>
<div class="fld"><textarea id="dinstr" placeholder="e.g. call on arrival, fragile, leave at reception"></textarea></div>
</div>

<div class="step" id="s4">
<div class="qh">Check it over</div>
<div class="qs">Nothing is charged now.</div>
<div class="sum" id="sumbox"></div>
<div class="note">This is an <b>estimate</b>. Our rider weighs the item in front of you and the exact price is confirmed then &mdash; it can go down if it is lighter. You pay only after it is weighed.</div>
<div class="err" id="err2"></div>
</div>

<p class="muted pw">Powered by Lasalu Drop Logistics</p>
</div>
<div class="bar"><div class="bamt" id="estwrap"><div class="s">Estimate</div><div class="v" id="baramt">&mdash;</div></div><div class="nav"><button type="button" class="back" id="back" style="display:none">Back</button><button id="go">Continue</button></div></div>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||'';
var VALID=SESSION?'1':'0';
var API='https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker';
var lastPrice=null,lastEtd='',t,SVC='express',STEP=0,LAST=4,APPMODE=false;
function el(id){return document.getElementById(id);}
function svc(){return SVC;}
function val(id){var e=el(id);return e?(e.value||'').trim():'';}
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
${TRACK_JS}
// Live pickup tracker (same system as the local-delivery map): stages, rider card, resume.
var QLBL={stages:['Pickup booked','Rider assigned','Item picked up','At our hub'],heads:{
  searching:['Sending a rider your way\u2026','A rider comes to collect and weigh your item \u2014 you pay nothing until then.'],
  settle:['Still matching a rider \ud83d\udef5','Hold tight \u2014 the moment one accepts, this page updates.'],
  assigned:['Rider assigned \ud83c\udf89','Your rider is heading to you now to collect your item.'],
  ontheway:['Item picked up \ud83d\udef5','Heading to our hub \u2014 your exact price lands in WhatsApp right after weighing.'],
  delivered:['At our hub \u2705','We weigh it now and send your exact price + secure payment link on WhatsApp.'],
  failed:['Pickup hit a snag \ud83d\ude15','No stress \u2014 our team is on it and will message you on WhatsApp.']}};
function openTracker(ord,stat){
  el('app').innerHTML='<div id="ldltrk"></div>';
  // No "Back to WhatsApp" in the native app \u2014 the app owns its own navigation.
  ldlTracker({api:API,session:SESSION,mount:'ldltrk',labels:QLBL,
    doneHtml:(APPMODE?'':'<a class="wabtn" href="https://wa.me/2349110218825" style="margin-top:14px">Back to WhatsApp \u2192</a>')}).open(ord,stat);
}
(function(){if(!SESSION)return;setTimeout(function(){try{fetch(API+'?action=check&session='+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement('div');b.style.cssText='position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif';b.textContent='This link has already been used or expired \u2014 ask us for a fresh one.';document.body.appendChild(b);}if(j&&j.app_origin)APPMODE=true;if(j&&j.active&&j.active.order_number){openTracker(j.active.order_number,j.active.status||'');}}).catch(function(){});}catch(e){}},0);})();

function showStep(n){
  STEP=n;
  for(var i=0;i<=LAST;i++){var st=el('s'+i);if(st)st.className=(i===n)?'step on':'step';var d=el('sd'+i);if(d)d.className=(i<=n)?'sd on':'sd';}
  el('back').style.display=n===0?'none':'block';
  if(n===LAST)buildSummary();
  el('go').textContent=(n===LAST)?(APPMODE?'Confirm pickup':'Request pickup'):'Continue';
  window.scrollTo({top:0,behavior:'smooth'});
  syncEst();syncGo();
}
function stepOk(n){
  if(n===0)return true;
  if(n===1)return !!lastPrice;
  if(n===2)return !!(val('sname')&&phoneOk(val('sphone'))&&val('paddr'));
  if(n===3)return !!(val('rname')&&phoneOk(val('rphone'))&&val('daddr')&&val('item'));
  return !!lastPrice;
}
function syncGo(){el('go').disabled=!stepOk(STEP);}
// The bar estimate is hidden on the step that already shows the estimate card --
// the same number twice on one screen reads as a mistake.
function syncEst(){el('estwrap').className=(lastPrice&&STEP!==1)?'bamt on':'bamt';}
function buildSummary(){
  var rows=''
   +'<div class="r"><span class="k">Service</span><span class="v">'+(SVC==='cargo'?'Air Cargo':'Air Express')+'</span></div>'
   +'<div class="r"><span class="k">Going to</span><span class="v">'+esc(val('country').replace(/\\s*\\(Z\\d\\)\\s*$/,''))+'</span></div>'
   +'<div class="r"><span class="k">Weight</span><span class="v">'+esc(el('weight').value)+' kg</span></div>'
   +'<div class="r"><span class="k">Pickup</span><span class="v">'+esc(val('paddr'))+'</span></div>'
   +'<div class="r"><span class="k">Receiver</span><span class="v">'+esc(val('rname'))+'</span></div>'
   +'<div class="r"><span class="k">Their address</span><span class="v">'+esc(val('daddr'))+'</span></div>'
   +'<div class="r"><span class="k">Item</span><span class="v">'+esc(val('item'))+'</span></div>'
   +'<div class="r tot"><span class="k">Estimate</span><span class="v">~&#8358;'+Number(lastPrice||0).toLocaleString()+'</span></div>';
  el('sumbox').innerHTML=rows;
}
function useLoc(){var b=el('ploc');if(!b)return;b.onclick=function(){if(!navigator.geolocation){alert('Location is not available here \u2014 please type your address.');return;}b.classList.add('busy');b.disabled=true;navigator.geolocation.getCurrentPosition(function(pos){el('paddr').value='Getting address\u2026';fetch(API+'?action=reverse&session='+encodeURIComponent(SESSION)+'&lat='+pos.coords.latitude+'&lng='+pos.coords.longitude).then(function(r){return r.json();}).then(function(j){el('paddr').value=(j&&j.address)?j.address:'My current location';b.classList.remove('busy');b.disabled=false;syncGo();}).catch(function(){el('paddr').value='My current location';b.classList.remove('busy');b.disabled=false;syncGo();});},function(){b.classList.remove('busy');b.disabled=false;alert('Could not get your location \u2014 please allow access or type your address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});};}
function pickupCity(){return /owerri|\\bimo\\b/i.test(val('paddr'))?'OWERRI':'PORT_HARCOURT';}
function wireAuto(inId,sugId,region){
  var inp=el(inId),sug=el(sugId),tt;
  inp.addEventListener('input',function(){
    clearTimeout(tt);var q=inp.value.trim();if(q.length<2){sug.style.display='none';return;}
    tt=setTimeout(function(){
      fetch(API+'?action=autocomplete&session='+encodeURIComponent(SESSION)+'&q='+encodeURIComponent(q)+(region?'&region='+region:'')).then(function(r){return r.json();}).then(function(j){
        sug.innerHTML='';(j.predictions||[]).forEach(function(p){
          var dv=document.createElement('div');dv.textContent=p.label;
          dv.onclick=function(){inp.value=p.label;sug.style.display='none';syncGo();};
          sug.appendChild(dv);
        });
        sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';
      }).catch(function(){sug.style.display='none';});
    },300);
  });
  inp.addEventListener('blur',function(){setTimeout(function(){sug.style.display='none';},200);});
}
function snapWeight(){var w=parseFloat(el('weight').value);if(!isNaN(w)&&w>0)el('weight').value=(Math.ceil(w*2)/2).toFixed(1);}
function markWq(){var w=el('weight').value;Array.prototype.forEach.call(document.querySelectorAll('#wq button'),function(b){b.className=(b.getAttribute('data-kg')===w)?'on':'';});}
${EXP_JS}
// Flags for the route strip (fallback for the long tail). Keys = the select's country token.
var FLAGS={'UNITED KINGDOM':'\\u{1F1EC}\\u{1F1E7}','IRELAND REP OF':'\\u{1F1EE}\\u{1F1EA}','USA':'\\u{1F1FA}\\u{1F1F8}','CANADA':'\\u{1F1E8}\\u{1F1E6}','GHANA':'\\u{1F1EC}\\u{1F1ED}','UNITED ARAB EMIRATES':'\\u{1F1E6}\\u{1F1EA}','GERMANY':'\\u{1F1E9}\\u{1F1EA}','FRANCE':'\\u{1F1EB}\\u{1F1F7}','ITALY':'\\u{1F1EE}\\u{1F1F9}','SPAIN':'\\u{1F1EA}\\u{1F1F8}','NETHERLANDS':'\\u{1F1F3}\\u{1F1F1}','CHINA':'\\u{1F1E8}\\u{1F1F3}','INDIA':'\\u{1F1EE}\\u{1F1F3}','SOUTH AFRICA':'\\u{1F1FF}\\u{1F1E6}','AUSTRALIA':'\\u{1F1E6}\\u{1F1FA}','SAUDI ARABIA':'\\u{1F1F8}\\u{1F1E6}','TURKEY':'\\u{1F1F9}\\u{1F1F7}','BRAZIL':'\\u{1F1E7}\\u{1F1F7}','KENYA':'\\u{1F1F0}\\u{1F1EA}','EGYPT':'\\u{1F1EA}\\u{1F1EC}','BELGIUM':'\\u{1F1E7}\\u{1F1EA}','SWEDEN':'\\u{1F1F8}\\u{1F1EA}','QATAR':'\\u{1F1F6}\\u{1F1E6}','KUWAIT':'\\u{1F1F0}\\u{1F1FC}','JAPAN':'\\u{1F1EF}\\u{1F1F5}','MALAYSIA':'\\u{1F1F2}\\u{1F1FE}'};
function stripCty(v){return String(v||'').replace(/\\s*\\(Z\\d\\)\\s*$/,'');}
// The living route strip:PH <flag> <country>, alive from the moment a country is chosen.
function syncStrip(){
  var c=val('country'), rs=el('rstrip');
  if(!c){ if(rs)rs.className='routestrip'; return; }
  var name=stripCty(c);
  el('rsflag').textContent=FLAGS[name]||'\\u{1F30D}';
  // Title-case, but leave short acronyms alone (USA/UAE read wrong as 'Usa').
  el('rsname').textContent=(name.length<=3)?name:name.toLowerCase().replace(/\\b[a-z]/g,function(m){return m.toUpperCase();});
  if(rs)rs.className='routestrip on';
}
// Destination chips: tap = pick. They drive the SAME hidden select, so the payload
// and every existing listener stay untouched. The full list lives behind "More countries".
function markDest(){var c=val('country');Array.prototype.forEach.call(document.querySelectorAll('#destgrid .dchip'),function(b){b.className='dchip'+(b.getAttribute('data-c')===c?' on':'');});}
Array.prototype.forEach.call(document.querySelectorAll('#destgrid .dchip'),function(b){
  b.onclick=function(){ el('country').value=b.getAttribute('data-c'); markDest(); syncStrip(); recalc(); };
});
var _mc=el('morec'); if(_mc)_mc.onclick=function(){ var mw=el('morewrap'); var on=mw.className.indexOf('on')<0; mw.className='morewrap'+(on?' on':''); _mc.innerHTML=on?'Fewer countries \\u25B4':'\\u{1F30D} More countries \\u25BE'; };
// Item chips → the same #item input (typing anything custom un-marks the chips).
Array.prototype.forEach.call(document.querySelectorAll('#qitems button'),function(b){
  b.onclick=function(){ var on=b.className==='on'; Array.prototype.forEach.call(document.querySelectorAll('#qitems button'),function(x){x.className='';}); if(!on){b.className='on';el('item').value=b.getAttribute('data-i');} else el('item').value=''; syncGo(); };
});
el('item').addEventListener('input',function(){ var v=val('item'); Array.prototype.forEach.call(document.querySelectorAll('#qitems button'),function(x){x.className=(x.getAttribute('data-i')===v)?'on':'';}); });
function recalc(){
  lastPrice=null;el('fee').style.display='none';el('baramt').textContent='\u2014';syncEst();el('err').textContent='';
  var d=val('country'),w=parseFloat(el('weight').value),v=parseFloat(el('value').value);
  if(!d||isNaN(w)||w<=0){syncGo();return;}
  if(isNaN(v)||v<=0){el('err').textContent='Add what the item is worth to see your estimate.';syncGo();return;}
  el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Calculating\u2026</div></div><div class="amt">\u2026</div>';
  var qs='action=price&session='+encodeURIComponent(SESSION)+'&mode='+svc()+'&destination='+encodeURIComponent(d)+'&weight='+w+'&value='+v+'&pickup_city='+pickupCity();
  fetch(API+'?'+qs).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;lastEtd=j.etd||'';
      el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Estimate \u00B7 '+(j.ship_mode==='cargo'?'Air Cargo':'Air Express')+'</div><div class="sub">confirmed after the rider weighs it'+(j.etd?(' \u2022 '+j.etd):'')+'</div></div><div class="amt"></div>';
      // The price LANDS (count-up + pop) instead of just appearing \u2014 the moment of the page.
      countUp(el('fee').querySelector('.amt'),Number(j.price),'~');
      countUp(el('baramt'),Number(j.price),'~');syncEst();}
    else{el('fee').style.display='none';el('baramt').textContent='\u2014';
      if(j&&j.error==='cargo_min_weight')el('err').textContent='Air Cargo needs 10kg or more \u2014 use Air Express for lighter parcels.';
      else if(j&&j.error==='cargo_unavailable')el('err').textContent='Air Cargo goes to the UK, USA, Canada and Ghana only \u2014 use Air Express here.';
      else if(j&&j.error==='unknown_country')el('err').textContent='Pick a destination from the list.';
    }
    syncGo();
  }).catch(function(){el('fee').style.display='none';el('baramt').textContent='\u2014';syncGo();});
}
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);if(d.length===10&&d.charAt(0)!=='0')d='0'+d;return d.length===11&&d.charAt(0)==='0';}
// Phone fields NEVER scold you mid-typing. A half-typed number is not a mistake, it is
// an unfinished thought -- turning the field red at digit 6 is the app calling you wrong
// before you have finished speaking. So: clear any complaint while typing, and only
// judge the number once you leave the field. Continue stays disabled either way, which
// is the quiet signal that something is still missing.
function clearPhoneErr(id){var e=el(id);if(e)e.style.borderColor='';var w=document.getElementById(id+'_pe');if(w&&w.parentNode)w.parentNode.removeChild(w);}
function showPhoneErr(id){
  var e=el(id);if(!e)return;var v=(e.value||'').trim();
  if(!v||phoneOk(v)){clearPhoneErr(id);return;}
  e.style.borderColor='#dc2626';
  var box=e.closest('.row2,.two,.fld')||e.parentNode;
  var w=document.getElementById(id+'_pe');
  if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;line-height:1.45;margin:5px 2px 0';w.textContent='Nigerian numbers have 11 digits \u2014 e.g. 08012345678';box.parentNode.insertBefore(w,box.nextSibling);}
}
function flagPhone(id){
  var e=el(id);if(!e)return;
  e.addEventListener('input',function(){clearPhoneErr(id);syncGo();});
  e.addEventListener('blur',function(){
    var s=(e.value||''),d='';
    for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')d+=c;}
    if(d.slice(0,3)==='234')d=d.slice(3);
    while(d.charAt(0)==='0')d=d.slice(1);
    if(d)e.value='0'+d;
    showPhoneErr(id);syncGo();
  });
}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking\u2026';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:svc(),destination:val('country'),weight:parseFloat(el('weight').value),value:parseFloat(el('value').value)||0,pickup_city:pickupCity(),
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:val('daddr'),item:val('item'),delivery_instruction:val('dinstr')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok&&j.booked){
      // Rider dispatched \u2192 live tracker (Bolt-style), not a static note. Fallback text only
      // when Shipday auto-dispatch failed (no order to track \u2014 the team books it manually).
      if(j.order_number){openTracker(j.order_number,'');}
      else el('app').innerHTML='<div class="done"><h2>Pickup booked</h2><p class="muted">A rider will be assigned to come and weigh your item. The moment it is weighed we send your exact price and a payment link \u2014 nothing is charged before that.</p></div>';
    }
    else if(j&&j.ok){el('app').innerHTML='<div class="done"><h2>All set</h2><p class="muted">Your estimate is waiting in your WhatsApp chat \u2014 reply YES there to send the rider.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp</a></div>';}
    else{b.disabled=false;b.textContent=APPMODE?'Confirm pickup':'Request pickup';el('err2').textContent=(j&&j.error==='value_required')?'Please enter what the item is worth.':(j&&j.error)?('Could not book: '+j.error):'Something went wrong \u2014 try again.';}
  }).catch(function(){b.disabled=false;b.textContent=APPMODE?'Confirm pickup':'Request pickup';alert('Network hiccup \u2014 try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a quote again.</p></div>';}
else{
  var WQ=[1,2,5,10,20];
  el('wq').innerHTML=WQ.map(function(k){return '<button type="button" data-kg="'+k+'">'+k+'kg</button>';}).join('');
  Array.prototype.forEach.call(document.querySelectorAll('#wq button'),function(b){b.onclick=function(){el('weight').value=b.getAttribute('data-kg');markWq();recalc();};});
  Array.prototype.forEach.call(document.querySelectorAll('.scard'),function(p){p.onclick=function(){SVC=p.getAttribute('data-svc');Array.prototype.forEach.call(document.querySelectorAll('.scard'),function(x){x.className='scard';});p.className='scard on';recalc();
    // The tap IS the answer — page turns itself (260ms lets the selection state register visually).
    if(STEP===0)setTimeout(function(){if(STEP===0)showStep(1);},260);};});
  el('weight').addEventListener('input',function(){markWq();recalc();});
  el('weight').addEventListener('blur',function(){snapWeight();markWq();recalc();});
  el('country').addEventListener('change',function(){markDest();syncStrip();recalc();});
  el('value').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,350);});
  ['sname','paddr','rname','daddr','item'].forEach(function(id){el(id).addEventListener('input',syncGo);});
  flagPhone('sphone');flagPhone('rphone');
  wireAuto('paddr','psug','ng');wireAuto('daddr','dsug','');useLoc();
  el('back').onclick=function(){if(STEP>0)showStep(STEP-1);};
  el('go').onclick=function(){if(STEP<LAST){if(stepOk(STEP))showStep(STEP+1);}else{book();}};
  showStep(0);
}
</script></body></html>`;
app.get('/quote', (req, res) => { res.type('html').send(withWa(QUOTE_PAGE)); });

// ── WAYBILL page (interstate, flat under 5kg) — its own simple premium page ──
const WAYBILL_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send a waybill — Lasalu Drop</title>
<meta name="theme-color" content="#4F074C">
${FONT_LINK}<style>${BASE_CSS}${TRACK_CSS}${EXP_CSS}${FLOW_CSS}
/* Paged wizard (quote-page model): one question per SCREEN, progress dots, floating Back/Continue. */
/* ── App-feel layer ── fare-board destination cards, ✓ tap acknowledgment, cascading screen
   entrances, centered announce-the-number weight, growing route strip, pressable bar. */
.states{gap:10px}
.st{position:relative;padding:18px 14px;border-radius:16px;transition:transform .16s var(--ease),border-color .2s ease,background .2s ease}
.st:active{transform:scale(.97)}
.st b{font-size:18px;letter-spacing:-.02em}
.st span{font-size:14px;font-weight:800;color:var(--plum);margin-top:3px;display:block}
.st.on::after{content:'✓';position:absolute;top:8px;right:10px;width:20px;height:20px;border-radius:50%;background:var(--plum);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
.stategrid button{padding:11px 16px;font-size:13.5px}
.chap>.sec:first-child{font-size:24px;margin-top:10px}
/* Bring the wizard content down into the thumb-reach zone — it used to cluster at the top with
   dead space below the tap targets. The dots + route strip stay up; only the question + controls drop. */
.chap.on{animation:none;margin-top:18vh}
.chap.on>*{animation:chapin .26s var(--ease) both}
.chap.on>*:nth-child(2){animation-delay:.05s}
.chap.on>*:nth-child(3){animation-delay:.1s}
.chap.on>*:nth-child(4){animation-delay:.15s}
.chap.on>*:nth-child(n+5){animation-delay:.18s}
#weight{text-align:center;font-size:30px;font-weight:800}
.feebig{box-shadow:0 10px 26px rgba(79,7,76,.22)}
.wbar button{transition:transform .16s var(--ease)}
.wbar button:active{transform:scale(.97)}
/* One-tap "I'm the sender / receiver" — same mechanic as the map. The question header
   becomes a flex row so the tick sits at its right edge; the question text keeps its size. */
.secme{display:flex;align-items:center;gap:10px}
.melab{flex:none;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--plum);cursor:pointer;-webkit-user-select:none;user-select:none;padding:10px 0 10px 12px;margin-left:auto;transition:transform .16s var(--ease)}
.melab:active{transform:scale(.96)}
.melab input{width:18px;height:18px;accent-color:var(--plum);margin:0;cursor:pointer;flex:none}
.steps{display:flex;gap:6px;padding:14px 2px 2px}
.sd{flex:1;height:4px;border-radius:2px;background:var(--line-2);transition:background .3s var(--ease)}
.sd.on{background:var(--pink)}
.wbar{position:fixed;left:16px;right:16px;bottom:14px;z-index:80;display:flex;gap:10px;max-width:448px;margin:0 auto}
.wbar .back{flex:0 0 auto;width:auto;padding:0 18px;height:52px;background:#fff;border:1.5px solid var(--line-2);color:var(--ink-2);font-weight:700;border-radius:14px;box-shadow:none}
.wbar #go{flex:1;box-shadow:0 10px 26px rgba(79,7,76,.35)}
.body{padding-bottom:130px}
.parkinfo{display:none;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r-lg);padding:14px 16px;margin:14px 0 2px;font-size:13px;color:#7a4d10;line-height:1.55}
.parkinfo b{color:#5c3a0c;font-weight:700}
.orsplit{display:flex;align-items:center;gap:12px;color:var(--ink-3);font-size:11px;font-weight:700;margin:16px 2px 12px;text-transform:uppercase;letter-spacing:.08em}
.orsplit::before,.orsplit::after{content:"";flex:1;height:1px;background:var(--line)}</style></head><body><div class="wrap" id="app">
<div class="hero"><div class="glow"></div>
<h1>Send a waybill</h1>
<p>Nationwide via our trusted parks — GUO · GIG · Rivers Joy. We pick up from your door, your receiver collects at the destination park.</p></div>
<div class="body">
<div class="steps"><div class="sd on" id="wd0"></div><div class="sd" id="wd1"></div><div class="sd" id="wd2"></div><div class="sd" id="wd3"></div></div>
<div class="routestrip" id="wstrip"><span class="rsflag"></span><span>Door pickup</span><span class="rsarrow">&mdash;&nbsp;&nbsp;&mdash;</span><span id="wsname"></span></div>
<div class="chap on" id="ch1">
<div class="sec" style="margin-top:6px">Where is it going?</div>
<div class="states" id="states">
<div class="st" data-s="LAGOS"><b>Lagos</b><span>₦10,000</span></div>
<div class="st" data-s="ABUJA"><b>Abuja</b><span>₦10,000</span></div>
<div class="st" data-s="ABA"><b>Aba</b><span>₦5,000</span></div>
<div class="st" data-s="OWERRI"><b>Owerri</b><span>₦6,000</span></div>
</div>
<div class="orsplit">or tap any other state</div>
<div class="stategrid" id="stategrid"></div>
</div>
<div class="chap" id="ch2">
<div class="sec">About how heavy? <span class="req">*</span></div>
<div class="echips" id="wkg"></div>
<div class="fld"><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="Or type the kg"></div>
<div class="feebig" id="fee"></div>
<div class="parkinfo" id="parkinfo"></div>
<div class="err" id="err"></div>
</div>
<div class="chap" id="ch3">
<div class="sec">Where does our rider collect it? <span class="req">*</span></div>
<div class="fld"><input id="paddr" placeholder="Start typing your address…" autocomplete="off" style="padding-right:44px"><button type="button" id="ploc" class="gpsbtn" aria-label="Use my current location"></button><div class="sugbox" id="psug" style="display:none"></div></div>
<div class="sec secme">Who is sending?<label class="melab" id="wme_s_w" style="display:none"><input type="checkbox" id="wme_s">I&rsquo;m the sender</label></div>
<div class="two"><div class="fld"><input id="sname" placeholder="Sender's name"></div><div class="fld"><input id="sphone" type="tel" inputmode="tel" placeholder="Sender's phone"></div></div>
</div>
<div class="chap" id="ch4">
<div class="sec secme"><span id="wrecvq">Who collects it at the park?</span><label class="melab" id="wme_r_w" style="display:none"><input type="checkbox" id="wme_r">I&rsquo;m the receiver</label></div>
<div class="two"><div class="fld"><input id="rname" placeholder="Receiver's name"></div><div class="fld"><input id="rphone" type="tel" inputmode="tel" placeholder="Receiver's phone *"></div></div>
<div class="echips" id="witems">
<button type="button" data-i="Documents">Documents</button>
<button type="button" data-i="Clothes">Clothes</button>
<button type="button" data-i="Foodstuff">Foodstuff</button>
<button type="button" data-i="Phone / electronics">Electronics</button>
<button type="button" data-i="Provisions">Provisions</button>
</div>
<div class="fld"><input id="item" placeholder="Or type what you're sending&hellip;"></div>
<div class="fld"><input id="dinstr" placeholder="Note for our rider — optional" maxlength="200"></div>
</div>
<div class="wbar"><button type="button" class="back" id="wback" style="display:none">Back</button><button id="go" disabled>Continue</button></div>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div></div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="This link has already been used or expired — go back to WhatsApp and ask me for a fresh link";document.body.appendChild(b);}if(j&&j.app_origin)APPMODE=true;if(j&&j.rider_cities&&typeof DOORCSV!=="undefined"){DOORCSV=String(j.rider_cities);if(typeof syncMode==="function")syncMode();if(typeof state!=="undefined"&&state&&typeof recalc==="function")recalc();}if(j&&(j.me_name||j.me_phone)){WBNAME=String(j.me_name||'');WBPHONE=String(j.me_phone||'');if(typeof wInitMe==="function")wInitMe();}if(j&&j.active&&j.active.order_number&&typeof openTracker==="function"){openTracker(j.active.order_number,j.active.status||"");}}).catch(function(){});}catch(e){}},0);})();
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker";
// Booker identity for the one-tap "I'm the sender / receiver" ticks (from the check response).
var WBNAME='', WBPHONE='', WMESIDE='', WMEFILL_S=false, WMEFILL_R=false;
// app_origin: opened from the native app, NOT from a WhatsApp chat link. In the app there is no
// "Back to WhatsApp" — that button/copy is nonsense there (mirrors the map page's app behaviour).
var APPMODE=false;
// The done-screen CTA: a WhatsApp return for chat-link users; nothing for app users (the app owns
// its own navigation, and updates land in the app's own order list).
function waCta(){ return APPMODE ? '' : '<a class="wabtn" href="https://wa.me/2349110218825" style="margin-top:14px">Back to WhatsApp \\u2192</a>'; }
${TRACK_JS}
// Live pickup tracker (same system as local delivery). Waybill riders are booked by the team
// after confirmation, so this mostly lights up via RESUME — reopening the page with a live
// hub-bound pickup drops straight into its tracker.
var WLBL={stages:['Pickup booked','Rider assigned','Item picked up','At our hub'],heads:{
  searching:['Sending a rider your way…','A rider comes to collect your parcel for the trip.'],
  settle:['Still matching a rider','Hold tight — the moment one accepts, this page updates.'],
  assigned:['Rider assigned','Your rider is heading to you now to collect your parcel.'],
  ontheway:['Parcel picked up','Heading to our hub — next stop, the park/carrier for its trip.'],
  delivered:['At our hub','We hand it to the park/carrier next and send your waybill details on WhatsApp.'],
  failed:['Pickup hit a snag','No stress — our team is on it and will message you on WhatsApp.']}};
function openTracker(ord,stat){
  el('app').innerHTML='<div class="body"><div id="ldltrk"></div></div>';
  ldlTracker({api:API,session:SESSION,mount:'ldltrk',labels:WLBL,
    doneHtml:waCta()}).open(ord,stat);
}
var lastPrice=null, state="", isPark=false, t;
var FLAT={LAGOS:1,ABUJA:1,ABA:1,OWERRI:1};
var NAMES={LAGOS:'Lagos',ABUJA:'Abuja',ABA:'Aba',OWERRI:'Owerri','AKWA IBOM':'Akwa Ibom','CROSS RIVER':'Cross River'};
function el(id){return document.getElementById(id);}
function val(id){return (el(id).value||'').trim();}
function useLoc(){var b=el('ploc');if(!b)return;b.onclick=function(){if(!navigator.geolocation){alert('Location is not available here — please type your address.');return;}var prev=b.textContent;b.textContent='…';b.disabled=true;navigator.geolocation.getCurrentPosition(function(pos){el('paddr').value='Getting address…';fetch(API+'?action=reverse&session='+encodeURIComponent(SESSION)+'&lat='+pos.coords.latitude+'&lng='+pos.coords.longitude).then(function(r){return r.json();}).then(function(j){el('paddr').value=(j&&j.address)?j.address:'My current location';b.textContent=prev;b.disabled=false;validate();}).catch(function(){el('paddr').value='My current location';b.textContent=prev;b.disabled=false;validate();});},function(){b.textContent=prev;b.disabled=false;alert('Couldn\\'t get your location — please allow access or type your address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});};}
function nameOf(s){return NAMES[s]||(s?s.charAt(0)+s.slice(1).toLowerCase():s);}
// Where LDL's OWN connecting riders deliver the destination leg to the DOOR. Same source of
// truth as chat (app_settings.rider_cities via check response); this is only the fallback.
var DOORCSV='Owerri, Port Harcourt, Umuahia, Lagos, Ibadan';
var STATECITY={ABIA:'Umuahia',IMO:'Owerri',OYO:'Ibadan',BAYELSA:'Yenagoa',RIVERS:'Port Harcourt'};
// Returns the MATCHED rider city/state name (so copy can say exactly where), or null → park pickup.
function doorFor(s){
  if(!s)return null;
  var cands=[nameOf(s)], extra=STATECITY[s]||'';
  if(extra){var xs=extra.split(',');for(var i=0;i<xs.length;i++){if(xs[i])cands.push(xs[i]);}}
  var list=DOORCSV.split(',');
  for(var a=0;a<cands.length;a++){var c=cands[a].toLowerCase().replace(/^\\s+|\\s+$/g,'');
    for(var b2=0;b2<list.length;b2++){var L=list[b2].toLowerCase().replace(/^\\s+|\\s+$/g,'');
      if(L&&L===c)return cands[a];}}
  return null;
}
// The three-leg journey, told honestly: 1) our rider brings it to Waterlines park (paid now-side),
// 2) the park's waybill fee — confirmed LIVE at the park and told to you before it's paid,
// 3) door states only: our connecting rider delivers to the receiver's door (charged on arrival).
function legsHTML(dest,doorName){
  return '<div style="margin-top:10px;line-height:1.7">'
    +'<b>How you pay, as it moves:</b><br>'
    +'1) Now — our rider, your door &rarr; <b>Waterlines park</b><br>'
    +'2) At the park — the park&rsquo;s waybill fee, <b>confirmed live</b> and told to you before it&rsquo;s paid'
    +(doorName?('<br>3) On arrival — our rider in <b>'+doorName+'</b> delivers to the receiver&rsquo;s door (<b>charged separately</b> when it lands)'):'')
    +'</div>';
}
function parkHTML(dest,over5,doorName){
  var last=doorName
    ?('<b>Door delivery:</b> our own rider in <b>'+doorName+'</b> picks it up at the park and delivers it <b>to your receiver&rsquo;s door</b>.')
    :('Your receiver collects it at the <b>'+dest+' park</b>.');
  if(over5)return 'For a heavier item (over 5kg), our team works out the best price and confirms it in your chat '+last;
  return 'We waybill to <b>'+dest+'</b> through our partner parks. Our rider takes your item to the park and <b>confirms we can waybill it there</b>. '+last+legsHTML(dest,doorName);
}
${EXP_JS}
function selectState(s,fromCard){state=s;lastPrice=null;isPark=false;
  Array.prototype.forEach.call(document.querySelectorAll('.st'),function(x){x.className='st'+(x.getAttribute('data-s')===s?' on':'');});
  Array.prototype.forEach.call(document.querySelectorAll('#stategrid button'),function(x){x.className=(x.getAttribute('data-s')===s)?'on':'';});
  var ws=el('wstrip'); if(ws){ if(s){el('wsname').textContent=nameOf(s)+(FLAT[s]?'':' park'); ws.className='routestrip on';} else ws.className='routestrip'; }
  recalc();}
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
  lastPrice=null;isPark=false;el('fee').style.display='none';el('parkinfo').style.display='none';el('err').textContent='';
  if(!state){validate();return;}
  var w=parseFloat(el('weight').value);
  if(!FLAT[state]){ // any other state → via a partner park (no instant price)
    isPark=true;el('parkinfo').style.display='block';el('parkinfo').innerHTML=parkHTML(nameOf(state),false,doorFor(state));validate();return;
  }
  if(isNaN(w)||w<=0){validate();return;}
  el('fee').style.display='flex';el('fee').innerHTML='<div class="l">Calculating…</div>';
  fetch(API+'?action=price&session='+encodeURIComponent(SESSION)+'&mode=waybill&destination='+encodeURIComponent(state)+'&weight='+w).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;var _dn=doorFor(state);
      // Owner-confirmed money semantics (2026-07-24): the flat price covers leg 1) (pickup →
      // Waterlines) + leg 2) (the park's waybill) ONLY. The door leg 3) is charged on arrival.
      el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Waybill to '+nameOf(state)+'</div><div class="sub">up to 5kg • covers pickup + the park waybill</div>'
        +(_dn?('<div class="sub">our rider in '+_dn+' then delivers to the door — that delivery fee is <b>charged on arrival</b>, not in this price</div>')
             :('<div class="sub">receiver collects at the '+nameOf(state)+' park — nothing more to pay</div>'))
        +'</div><div class="amt"></div>';
      countUp(el('fee').querySelector('.amt'),Number(j.price),'');}
    else if(j&&j.park){isPark=true;el('fee').style.display='none';el('parkinfo').style.display='block';el('parkinfo').innerHTML=parkHTML(nameOf(state),!!j.over5,doorFor(state));}
    else{el('fee').style.display='none';}
    validate();
  }).catch(function(){el('fee').style.display='none';validate();});
}
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);if(d.length===10&&d.charAt(0)!=='0')d='0'+d;return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=el(id);if(!e)return;function u(){var v=(e.value||'').trim();var bad=v&&!phoneOk(v);e.style.borderColor=bad?'#dc2626':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',function(){var s=(e.value||''),d='';for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')d+=c;}if(d.slice(0,3)==='234')d=d.slice(3);while(d.charAt(0)==='0')d=d.slice(1);if(d)e.value='0'+d;e.dispatchEvent(new Event('input'));});}
function validate(){var w=parseFloat(el('weight').value);var ok=state&&!isNaN(w)&&w>0&&(isPark||lastPrice)&&val('paddr')&&val('rname')&&phoneOk(val('rphone'))&&(!val('sphone')||phoneOk(val('sphone')))&&val('item');el('go').disabled=!ok;}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:'waybill',destination:state,weight:parseFloat(el('weight').value)||1,
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:'',item:val('item'),delivery_instruction:val('dinstr')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){
      // App users get an in-app confirmation (no WhatsApp); chat-link users get the WhatsApp copy + button.
      var line=APPMODE
        ?(j.park?'Your waybill request is in — our team confirms the park &amp; exact price shortly, right here in the app.':'Your pickup is set — we&rsquo;ll keep you posted in the app.')
        :(j.park?'Your waybill request is in — our team confirms the park &amp; exact price in your WhatsApp chat.':'Your order &amp; price are waiting in your WhatsApp chat.');
      el('app').innerHTML='<div class="body"><div class="done"><h2>All set!</h2><p class="muted">'+line+'</p>'+waCta()+'</div></div>';
    }
    else{b.disabled=false;b.textContent='Confirm & book';el('err').textContent=(j&&j.error)?('Couldn\\'t book: '+j.error):'Something went wrong — try again.';}
  }).catch(function(){b.disabled=false;b.textContent='Confirm & book';alert('Network hiccup — try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="body"><div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a waybill again.</p></div></div>';}
else{
  Array.prototype.forEach.call(document.querySelectorAll('.st'),function(b){b.onclick=function(){selectState(b.getAttribute('data-s'),true);};});
  // Every other state = a tappable pill (the select was the last form-feel holdout here).
  // ABIA included (it was missing from the original select) — Umuahia is a connecting-rider
  // door-delivery city, so Abia must be selectable beyond the Aba flat card.
  var OTHERS=['ABIA','ADAMAWA','AKWA IBOM','ANAMBRA','BAUCHI','BAYELSA','BENUE','BORNO','CROSS RIVER','DELTA','EBONYI','EDO','EKITI','ENUGU','GOMBE','JIGAWA','KADUNA','KANO','KATSINA','KEBBI','KOGI','KWARA','NASARAWA','NIGER','OGUN','ONDO','OSUN','OYO','PLATEAU','SOKOTO','TARABA','YOBE','ZAMFARA'];
  el('stategrid').innerHTML=OTHERS.map(function(s){return '<button type="button" data-s="'+s+'">'+nameOf(s)+'</button>';}).join('');
  Array.prototype.forEach.call(document.querySelectorAll('#stategrid button'),function(b){b.onclick=function(){selectState(b.getAttribute('data-s'),false);};});
  // Weight = a tap, not a keyboard: destination-tap → weight-tap → the price lands. Typing stays possible.
  el('wkg').innerHTML=[1,2,3,5].map(function(k){return '<button type="button" data-kg="'+k+'">'+k+' kg</button>';}).join('');
  Array.prototype.forEach.call(document.querySelectorAll('#wkg button'),function(b){b.onclick=function(){el('weight').value=b.getAttribute('data-kg');Array.prototype.forEach.call(document.querySelectorAll('#wkg button'),function(x){x.className=(x===b)?'on':'';});recalc();};});
  el('weight').addEventListener('input',function(){var w=el('weight').value;Array.prototype.forEach.call(document.querySelectorAll('#wkg button'),function(x){x.className=(x.getAttribute('data-kg')===w)?'on':'';});});
  // ── Paged wizard engine ── each question is its own SCREEN (quote-page model): ch1..ch4
  // become pages, dots track progress, the floating bar is Continue until the last page,
  // then the real Confirm & book. validate() stays untouched inside; its full-form disabled
  // verdict only rules the FINAL page — earlier pages gate on just their own question.
  var WSTEP=0, WLAST=3;
  function wStepOk(n){
    if(n===0)return !!state;
    if(n===1)return !!(lastPrice||isPark);
    if(n===2)return !!val('paddr')&&(!val('sphone')||phoneOk(val('sphone')));
    return true;
  }
  function wSyncGo(){
    var g=el('go');
    if(WSTEP<WLAST){ g.disabled=!wStepOk(WSTEP); }
    // at WLAST validate() has already set g.disabled from the full form — leave it be
  }
  function wShow(n){
    WSTEP=n;
    for(var i=0;i<=WLAST;i++){
      var st=el('ch'+(i+1)); if(st)st.className='chap'+(i===n?' on':'');
      var d=el('wd'+i); if(d)d.className='sd'+(i<=n?' on':'');
    }
    el('wback').style.display=n===0?'none':'block';
    el('go').textContent=(n===WLAST)?'Confirm & book':'Continue';
    window.scrollTo({top:0,behavior:'smooth'});
    if(n===WLAST)validate(); else wSyncGo();
  }
  // The route strip GROWS as answers land — destination, then "· 2kg" — a ticket assembling,
  // not a header. Runs on every validate() so every existing listener feeds it for free.
  function updStrip(){
    if(!state)return;
    var w=parseFloat(el('weight').value);
    el('wsname').textContent=nameOf(state)+(FLAT[state]?'':' park')+((!isNaN(w)&&w>0)?(' · '+w+'kg'):'');
  }
  // ── One-tap identity (same mechanic as the map's "I am the sender / receiver") ── ticking a
  // side fills it with the booker's own name + number; you can only be one side, so the other
  // tick hides. Untick to clear. Typing over it just works — nothing is a mode.
  function wDigTail(v){ var s=String(v||''),d='',i,c; for(i=0;i<s.length;i++){ c=s.charAt(i); if(c>='0'&&c<='9')d+=c; } return d.slice(-10); }
  function wIsMyNum(v){ return !!(WBPHONE&&v&&wDigTail(v)===wDigTail(WBPHONE)); }
  function wInitMe(){ // reveal the ticks only once we actually know the booker (else they'd be dead)
    var sw=el('wme_s_w'), rw=el('wme_r_w');
    if(sw)sw.style.display=WBPHONE?'':'none';
    if(rw)rw.style.display=WBPHONE?'':'none';
    wUpdateMe();
  }
  function wUpdateMe(){
    var a=el('wme_s'), b=el('wme_r'), aw=el('wme_s_w'), bw=el('wme_r_w');
    if(a)a.checked=(WMESIDE==='send');
    if(b)b.checked=(WMESIDE==='recv');
    if(aw)aw.style.display=(WMESIDE==='recv'||!WBPHONE)?'none':'';
    if(bw)bw.style.display=(WMESIDE==='send'||!WBPHONE)?'none':'';
  }
  function wClearMe(side){
    var n,p;
    if(side==='send'&&WMEFILL_S){ n=el('sname'); p=el('sphone');
      if(n&&n.value===(WBNAME||''))n.value=''; if(p&&wIsMyNum(p.value)){ p.value=''; p.dispatchEvent(new Event('input')); } WMEFILL_S=false; }
    if(side==='recv'&&WMEFILL_R){ n=el('rname'); p=el('rphone');
      if(n&&n.value===(WBNAME||''))n.value=''; if(p&&wIsMyNum(p.value)){ p.value=''; p.dispatchEvent(new Event('input')); } WMEFILL_R=false; }
  }
  function wSetMe(side){
    if(WMESIDE===side){ wClearMe(side); WMESIDE=''; wUpdateMe(); validate(); return; }
    if(WMESIDE)wClearMe(WMESIDE);
    WMESIDE=side;
    if(WBPHONE){
      var n,p;
      if(side==='send'){ n=el('sname'); p=el('sphone');
        if(n&&(!n.value||WMEFILL_S))n.value=WBNAME||''; if(p){ p.value=WBPHONE; p.dispatchEvent(new Event('blur')); } WMEFILL_S=true; }
      else { n=el('rname'); p=el('rphone');
        if(n&&(!n.value||WMEFILL_R))n.value=WBNAME||''; if(p){ p.value=WBPHONE; p.dispatchEvent(new Event('blur')); } WMEFILL_R=true; }
    }
    wUpdateMe(); validate();
  }
  var _wv=validate; validate=function(){_wv(); wSyncGo(); updStrip();};
  // Door vs park changes what page four ASKS: door destinations need the receiver's address
  // (it rides in delivery_instruction — the payload stays identical), park destinations only
  // need who collects. Re-synced whenever the destination or the rider-cities list changes.
  function syncMode(){
    var dn=doorFor(state), q=el('wrecvq'), di=el('dinstr');
    if(q)q.textContent=dn?'Who receives it at their door?':'Who collects it at the park?';
    if(di)di.placeholder=dn?('Receiver\\u2019s address in '+dn+' + any note for the rider'):'Note for our rider — optional';
  }
  syncMode();
  // The tap IS the answer on page one — picking a destination turns the page itself.
  var _ss=selectState; selectState=function(s,f){_ss(s,f); syncMode(); if(WSTEP===0&&state)setTimeout(function(){if(WSTEP===0)wShow(1);},260);};
  el('wback').onclick=function(){if(WSTEP>0)wShow(WSTEP-1);};
  wShow(0);
  Array.prototype.forEach.call(document.querySelectorAll('#witems button'),function(b){
    b.onclick=function(){var on=b.className==='on';Array.prototype.forEach.call(document.querySelectorAll('#witems button'),function(x){x.className='';});if(!on){b.className='on';el('item').value=b.getAttribute('data-i');}else el('item').value='';validate();};
  });
  el('item').addEventListener('input',function(){var v=val('item');Array.prototype.forEach.call(document.querySelectorAll('#witems button'),function(x){x.className=(x.getAttribute('data-i')===v)?'on':'';});});
  el('weight').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,300);});
  ['sname','sphone','paddr','rname','rphone','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  flagPhone('sphone');flagPhone('rphone');
  wireAuto('paddr','psug');useLoc();
  var _ms=el('wme_s'); if(_ms)_ms.onchange=function(){ wSetMe('send'); };
  var _mr=el('wme_r'); if(_mr)_mr.onchange=function(){ wSetMe('recv'); };
  wInitMe();  // if the check response already set WBPHONE before init ran, reveal now
  el('go').onclick=function(){ if(WSTEP<WLAST){ if(wStepOk(WSTEP))wShow(WSTEP+1); } else { book(); } };
}
</script></body></html>`;
app.get('/waybill', (req, res) => { res.type('html').send(withWa(WAYBILL_PAGE)); });

// ── Vendor bulk order form (trusted vendors) — add several buyer orders, we book + collect COD ──
const VENDOR_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send orders — Lasalu Drop</title>
${FONT_LINK}<style>${BASE_CSS}</style></head><body>
<div class="wrap" id="app">
  <div class="hero"><h1>Send your orders</h1><p>Add each customer's order — we pick up from your shop, deliver, and collect their payment. You get paid out daily.</p></div>
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
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="This link has already been used or expired — go back to WhatsApp and ask me for a fresh link";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/vendorOrders";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
function el(id){return document.getElementById(id)}
var n=0;
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);if(d.length===10&&d.charAt(0)!=='0')d='0'+d;return d.length===11&&d.charAt(0)==='0';}
function flagPhoneEl(bp){if(!bp)return;function u(){var v=(bp.value||'').trim();var bad=v&&!phoneOk(v);bp.style.borderColor=bad?'#dc2626':'';var box=bp.closest('.row2')||bp.parentNode;var w=box.parentNode.querySelector('.bpe-'+(box.dataset.pe||''));if(bad){if(!w){var tag=String(n);box.dataset.pe=tag;w=document.createElement('div');w.className='bpe-'+tag;w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}bp.addEventListener('input',u);bp.addEventListener('blur',function(){var s=(bp.value||''),d='';for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')d+=c;}if(d.slice(0,3)==='234')d=d.slice(3);while(d.charAt(0)==='0')d=d.slice(1);if(d)bp.value='0'+d;bp.dispatchEvent(new Event('input'));});}
function collect(){var out=[];document.querySelectorAll('.ord').forEach(function(d){var o={};d.querySelectorAll('input[data-f]').forEach(function(i){o[i.getAttribute('data-f')]=i.value.trim().replace(/^\\s*/,'');});var pk=d.querySelector('input[data-f=pickup_address]'),dr=d.querySelector('input[data-f=delivery_address]');if(pk&&pk.dataset.coords)o.pickup_coords=pk.dataset.coords;if(dr&&dr.dataset.coords)o.delivery_coords=dr.dataset.coords;out.push(o);});return out;}
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
    fetch(API+'?session='+encodeURIComponent(SESSION),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:SESSION,shop_address:el('shop').value.trim(),orders:collect()})})
     .then(function(r){return r.json()}).then(function(j){
       if(j.error){b.disabled=false;b.textContent='Book all orders';el('out').innerHTML='<p style="color:#c0392b">'+j.error+'</p>';return;}
       var lines=(j.results||[]).map(function(r){return r.ok?(''+r.buyer+' — booked, buyer pays ₦'+r.total.toLocaleString()):(''+(r.buyer||'an order')+' — '+r.error);}).join('<br>');
       el('app').innerHTML='<div class="done"><h2>Done!</h2><p class="muted">'+j.booked+' order(s) booked. We\\'ve sent each buyer their payment link.</p><div style="text-align:left;font-size:14px;margin:14px 0">'+lines+'</div><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
     }).catch(function(){b.disabled=false;b.textContent='Book all orders';alert('Network hiccup — try again.');});
  };
}
</script></body></html>`;
app.get('/vendor', (req, res) => { res.type('html').send(withWa(VENDOR_PAGE)); });

// ── Bulk deliveries page: a client with SEVERAL deliveries adds them all (each its own pickup →
// drop-off), reviews the total, then pays once (or pay-on-delivery). Talks to the bulkOrders fn. ──
const BULK_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Multiple deliveries — Lasalu Drop</title>
${FONT_LINK}<style>${BASE_CSS}${FLOW_CSS}
/* The CTA floats app-style; the review renders above it. */
#go{position:fixed;left:16px;right:16px;bottom:14px;max-width:448px;margin:0 auto;z-index:80;box-shadow:0 10px 26px rgba(79,7,76,.35)}
.body{padding-bottom:130px}
/* Batch tracker: one row per delivery, live status chip per rider. */
.btrk{margin-top:6px}
.btrow{display:flex;align-items:center;gap:10px;padding:12px 13px;background:#fff;border:1px solid var(--line-2);border-radius:13px;margin-bottom:9px;animation:btin .22s cubic-bezier(.23,1,.32,1) both}
@keyframes btin{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.btrow:nth-child(2){animation-delay:.04s}.btrow:nth-child(3){animation-delay:.08s}.btrow:nth-child(4){animation-delay:.12s}.btrow:nth-child(5){animation-delay:.16s}.btrow:nth-child(6){animation-delay:.2s}
.btrow .nm{flex:1;min-width:0;font-size:13.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btrow .rd{display:block;font-size:11px;font-weight:600;color:var(--ink-3);margin-top:2px}
.bchip{flex:none;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:99px;font-size:11.5px;font-weight:800}
.bc-wait{background:var(--bg);color:var(--ink-2);border:1px solid var(--line-2)}
.bc-asg{background:var(--lilac);color:var(--plum)}
.bc-otw{background:var(--pink-soft);color:#a3255f}
.bc-del{background:#e8f6ec;color:#166534}
.bc-fail{background:#fdecec;color:#b3261e}
.bdot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:blivep 1.6s cubic-bezier(.23,1,.32,1) infinite}
@keyframes blivep{0%,100%{opacity:1}50%{opacity:.35}}
.btmore{display:block;width:100%;margin:12px 0 0;padding:11px 0;background:none;border:none;color:var(--plum);font-size:13px;font-weight:700;cursor:pointer;transition:transform .16s cubic-bezier(.23,1,.32,1),opacity .16s ease}
.btmore:active{transform:scale(.98);opacity:.75}
/* Composer feel: a sticky running count + cards that visibly complete as you fill them. */
.dropbar{position:sticky;top:8px;z-index:40;display:none;align-items:center;gap:7px;background:var(--plum);color:#fff;border-radius:999px;padding:9px 16px;margin:2px auto 12px;font-size:12.5px;font-weight:700;box-shadow:0 6px 18px rgba(58,5,55,.25);width:max-content;max-width:100%}
.dropbar b{font-size:14px}
.dropbar .sep{opacity:.55}
.ord{transition:border-color .25s ease,background .25s ease}
.ord.done{border-color:#b9e2c4;background:#fbfffc}
.ord .cap .capnm{color:var(--plum);text-transform:none;letter-spacing:0}
.okdot{display:inline-flex;width:15px;height:15px;border-radius:50%;background:#16a34a;color:#fff;font-size:10px;align-items:center;justify-content:center;vertical-align:1px;margin-left:2px}
.same:active,.rm:active,.locp:active{transform:scale(.94)}
.same,.rm,.locp{transition:transform .16s cubic-bezier(.23,1,.32,1)}
</style></head><body>
<div class="wrap" id="app">
  <div class="hero"><h1>Multiple deliveries</h1><p>Add each delivery — pickup, drop-off, who's receiving and what you're sending. We price them all and send a rider to each.</p></div>
  <div class="body">
    <div class="row2"><input id="sname" placeholder="Your name"><input id="sphone" placeholder="Your phone" inputmode="tel"></div>
    <div class="dropbar" id="dropbar"><b id="dbN">0</b>&nbsp;<span id="dbW">drops</span> <span class="sep">&middot;</span> <span id="dbR">0 ready</span></div>
    <div id="deliveries"></div>
    <button class="add" id="add">+ Add another delivery</button>
    <div class="sec">How will you pay?</div>
    <label class="payopt"><input type="radio" name="pay" value="now" checked> Pay all now — one payment</label>
    <label class="payopt" id="opt-pod" style="display:none"><input type="radio" name="pay" value="pod"> Pay on delivery — cash to each rider</label>
    <button class="go" id="go" disabled>Review &amp; book</button>
    <div id="out"></div>
  </div>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/bulkOrders";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
// app_origin: opened from the native app — no "Back to WhatsApp" (there's no chat to return to).
var APPMODE=false;
function waCta(){ return APPMODE ? '' : '<a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp \\u2192</a>'; }
function el(id){return document.getElementById(id)}
// ── Live batch tracker ── one row per delivery, chip flips as each rider moves
// (same status pipeline as the map page: webhook milestones + live Shipday fallback).
var BT={list:[],timer:null,pn:0,head:'',sub:''};
function bEsc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function bChip(st){
  if(st==='delivered')return '<span class="bchip bc-del">Delivered ✓</span>';
  if(st==='failed')return '<span class="bchip bc-fail">Failed</span>';
  if(st==='cancelled')return '<span class="bchip bc-fail">Cancelled</span>';
  if(st==='ontheway')return '<span class="bchip bc-otw"><span class="bdot"></span>On the way</span>';
  if(st==='assigned')return '<span class="bchip bc-asg"><span class="bdot"></span>Rider assigned</span>';
  return '<span class="bchip bc-wait"><span class="bdot"></span>Finding rider…</span>';
}
function btRender(){
  var rows=BT.list.map(function(o){return '<div class="btrow"><div class="nm">'+bEsc(o.receiver||'Delivery')+(o.rider?'<span class="rd">'+bEsc(o.rider)+'</span>':'')+'</div>'+bChip(o.status)+'</div>';}).join('');
  var doneAll=BT.list.length&&BT.list.every(function(o){return o.status==='delivered'||o.status==='failed'||o.status==='cancelled';});
  el('app').innerHTML='<div class="hero"><h1>'+BT.head+'</h1><p>'+BT.sub+'</p></div><div class="body"><div class="btrk">'+rows+'</div>'
    +(doneAll?waCta():('<p style="font-size:12px;color:#a8a0ae;text-align:center;margin-top:10px">Updates land here'+(APPMODE?'':' and in your WhatsApp chat')+' — you can close this page.</p>'))
    +'<button type="button" id="btmore" class="btmore">＋ Book more deliveries</button></div>';
  var mb=el('btmore'); if(mb)mb.onclick=function(){ try{sessionStorage.setItem('ldl_skipresume','1');}catch(e){} location.reload(); };
  if(doneAll&&BT.timer){clearInterval(BT.timer);BT.timer=null;}
}
function btPoll(){
  if(BT.timer)clearInterval(BT.timer);
  BT.timer=setInterval(function(){
    BT.pn++; if(BT.pn>360){clearInterval(BT.timer);BT.timer=null;return;}
    fetch(api('action=batchstatus&orders='+encodeURIComponent(BT.list.map(function(o){return o.n;}).join(','))))
      .then(function(r){return r.json();}).then(function(j){
        if(!j||!j.list)return;
        var by={}; j.list.forEach(function(x){by[x.n]=x;});
        var chg=false;
        BT.list.forEach(function(o){var u=by[o.n]; if(u){ if((u.status||'')!==o.status||String(u.rider||'')!==String(o.rider||''))chg=true; o.status=u.status||o.status; o.rider=u.rider||o.rider; }});
        if(chg)btRender();
      }).catch(function(){});
  },10000);
}
function openBatch(list,head,sub){ BT.list=list; BT.head=head; BT.sub=sub; BT.pn=0; btRender(); btPoll(); }
(function(){if(!SESSION)return;setTimeout(function(){fetch(api("action=check")).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999";b.textContent="This link has already been used or expired — go back to WhatsApp and ask me for a fresh link";document.body.appendChild(b);}if(j&&j.app_origin)APPMODE=true;}).catch(function(){});},0);})();
var n=0, PODOK=false, quoted=null, POD_SUR=0;
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);if(d.length===10&&d.charAt(0)!=='0')d='0'+d;return d.length===11&&d.charAt(0)==='0';}
function flagPhone(inp){if(!inp)return;function u(){var v=(inp.value||'').trim();var bad=v&&!phoneOk(v);inp.style.borderColor=bad?'#dc2626':'';}inp.addEventListener('input',u);inp.addEventListener('blur',function(){var s=(inp.value||''),d='';for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')d+=c;}if(d.slice(0,3)==='234')d=d.slice(3);while(d.charAt(0)==='0')d=d.slice(1);if(d)inp.value='0'+d;inp.dispatchEvent(new Event('input'));});}
function wireAuto(inp,sug){var t;inp.addEventListener('input',function(){inp.dataset.coords='';clearTimeout(t);var q=inp.value.trim();quoted=null;syncGo();if(q.length<2){sug.style.display='none';return;}t=setTimeout(function(){fetch(api('action=autocomplete&q='+encodeURIComponent(q))).then(function(r){return r.json()}).then(function(j){sug.innerHTML='';(j.predictions||[]).forEach(function(p){var x=document.createElement('div');x.textContent=p.label;x.onclick=function(){inp.value=p.label;inp.dataset.coords='';sug.style.display='none';syncGo();};sug.appendChild(x);});sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';});},300);});}
function useLoc(inp){if(!inp)return;if(!navigator.geolocation){alert('Location not available on this device — please type the address.');return;}var old=inp.value;inp.value='Locating…';navigator.geolocation.getCurrentPosition(function(pos){var la=pos.coords.latitude,ln=pos.coords.longitude;inp.dataset.coords=la+','+ln;inp.value='My current location';fetch(api('action=reverse&lat='+la+'&lng='+ln)).then(function(r){return r.json()}).then(function(j){if(j&&j.label)inp.value=''+j.label;syncGo();}).catch(function(){syncGo();});},function(){inp.value=old;alert('Couldn\\'t get your location — please allow location access, or type the address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});}
function collect(){var out=[];document.querySelectorAll('.ord').forEach(function(d){var o={};d.querySelectorAll('input[data-f]').forEach(function(i){o[i.getAttribute('data-f')]=i.value.trim().replace(/^\\s*/,'');});var pk=d.querySelector('input[data-f=pickup_address]'),dr=d.querySelector('input[data-f=delivery_address]');if(pk&&pk.dataset.coords)o.pickup_coords=pk.dataset.coords;if(dr&&dr.dataset.coords)o.delivery_coords=dr.dataset.coords;out.push(o);});return out;}
function rowsValid(){var os=collect();return os.length>0&&os.every(function(o){return o.pickup_address&&o.delivery_address&&o.receiver_name&&phoneOk(o.receiver_phone)&&o.item;});}
function senderValid(){return el('sname').value.trim()&&phoneOk(el('sphone').value);}
function syncGo(){quoted=null;el('go').textContent='Review \\u0026 book';var ok=senderValid()&&rowsValid();el('go').disabled=!ok;var r=el('review');if(r)r.remove();}
// Living card headers + the sticky counter: each drop renumbers, takes its receiver's name,
// and earns a green ✓ the moment it's complete — the batch builds visibly instead of form-ly.
function rowDone(d){
  var g=function(f){var i=d.querySelector('input[data-f='+f+']');return i?i.value.trim():'';};
  var ph=g('receiver_phone').replace(/\\D/g,'');
  return !!(g('pickup_address')&&g('delivery_address')&&g('receiver_name')&&ph.length>=10&&g('item'));
}
function refreshHds(){
  var cards=el('deliveries').children, ready=0;
  Array.prototype.forEach.call(cards,function(d,ix){
    var ok=rowDone(d); if(ok)ready++;
    d.className='ord'+(ok?' done':'');
    var cap=d.querySelector('.cap');
    var rn=(d.querySelector('input[data-f=receiver_name]')||{value:''}).value.trim();
    if(cap)cap.innerHTML='DROP '+(ix+1)+(rn?' \\u00B7 <span class="capnm">'+bEsc(rn)+'</span>':'')+(ok?' <span class="okdot">\\u2713</span>':'');
  });
  var db=el('dropbar');
  if(db){ db.style.display=cards.length?'flex':'none'; el('dbN').textContent=cards.length; el('dbW').textContent=cards.length===1?'drop':'drops'; el('dbR').textContent=ready+' ready'; }
}
function addDelivery(){
  n++;var d=document.createElement('div');d.className='ord';
  d.innerHTML='<button class="rm" title="Remove">×</button>'
    +'<div class="cap">DELIVERY '+n+'</div>'
    +'<div style="position:relative"><input class="locin" placeholder="Pickup address" data-f="pickup_address" autocomplete="off"><button type="button" class="locp" title="Use my location"></button><div class="sug" style="display:none"></div></div>'
    +'<button class="same" type="button">↑ same pickup as above</button>'
    +'<div style="position:relative" class="mt"><input class="locin" placeholder="Drop-off address" data-f="delivery_address" autocomplete="off"><button type="button" class="locp" title="Use my location"></button><div class="sug" style="display:none"></div></div>'
    +'<div class="row2 mt"><input placeholder="Receiver name" data-f="receiver_name"><input placeholder="Receiver phone" data-f="receiver_phone" inputmode="tel"></div>'
    +'<input class="mt" placeholder="What are you sending? (e.g. food, documents)" data-f="item">';
  el('deliveries').appendChild(d);
  d.querySelector('.rm').onclick=function(){d.remove();syncGo();refreshHds();};
  var ins=d.querySelectorAll('input[data-f]');
  var pins=d.querySelectorAll('.sug');
  wireAuto(d.querySelector('input[data-f=pickup_address]'),pins[0]);
  wireAuto(d.querySelector('input[data-f=delivery_address]'),pins[1]);
  d.querySelectorAll('.locp').forEach(function(b){b.onclick=function(){useLoc(b.previousElementSibling);};});
  d.querySelector('.same').onclick=function(){var prev=d.previousElementSibling;var src=prev?prev.querySelector('input[data-f=pickup_address]'):null;var tgt=d.querySelector('input[data-f=pickup_address]');if(src&&src.value){tgt.value=src.value;tgt.dataset.coords=src.dataset.coords||'';syncGo();}};
  flagPhone(d.querySelector('input[data-f=receiver_phone]'));
  ins.forEach(function(i){i.addEventListener('input',function(){syncGo();refreshHds();});});
  syncGo();refreshHds();
}
function payMethod(){var r=document.querySelector('input[name=pay]:checked');return r?r.value:'now';}
function doBook(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(api(''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender_name:el('sname').value.trim(),sender_phone:el('sphone').value.trim(),pay_method:payMethod(),deliveries:collect()})})
   .then(function(r){return r.json()}).then(function(j){
     if(j.error){b.disabled=false;b.textContent='Confirm';el('out').innerHTML='<div class="err">Couldn\\'t book: '+j.error+'</div>';return;}
     if(j.mode==='now'&&j.payment_url){el('app').innerHTML='<div class="done"><h2>Redirecting to payment…</h2><p class="muted">Total ₦'+Number(j.total).toLocaleString()+' for '+j.count+' deliveries.</p></div>';location.href=j.payment_url;return;}
     var skipped=(j.errors&&j.errors.length)?' <b>'+j.errors.length+' address(es) couldn\\'t be booked</b> — our team will follow up on those.':'';
     // Booked riders → LIVE batch tracker (a chip per delivery), not a static goodbye.
     if(j.orders&&j.orders.length){
       openBatch(j.orders.map(function(o){return {n:o.n,receiver:o.receiver,status:'',rider:''};}),
         'All set!',
         j.booked+' deliveries created — each receiver pays cash to their rider (total ₦'+Number(j.total).toLocaleString()+').'+skipped);
       return;
     }
     el('app').innerHTML='<div class="done"><h2>All set!</h2><p class="muted">'+j.booked+' deliveries created — a rider is being assigned to each. The receiver pays their delivery fee in cash when the rider arrives (total ₦'+Number(j.total).toLocaleString()+').'+skipped+'</p>'+waCta()+'</div>';
   }).catch(function(){b.disabled=false;b.textContent='Confirm';alert('Network hiccup — try again.');});
}
// Render the priced review from the quoted data + the selected pay method. Pay-on-delivery adds the surcharge
// to EACH drop (the rider collects it per drop), so the per-row fees, the total and the button all match what
// the riders actually collect — the same base+surcharge the server books and confirms by WhatsApp.
function renderReview(){
  if(!quoted) return;
  var pm=payMethod(), sur=(pm==='pod')?(Number(POD_SUR)||0):0, count=quoted.count||0;
  var rows=(quoted.priced||[]).map(function(r){ var fee=Number(r.delivery_fee)+sur; return '<div class="rr"><span>'+r.receiver_name+' — '+String(r.delivery_address).split(',')[0]+'</span><b>₦'+fee.toLocaleString()+'</b></div>'; }).join('');
  var total=Number(quoted.total)+sur*count;
  var warn=(quoted.errors&&quoted.errors.length)?'<div class="err">'+quoted.errors.length+' row(s) couldn\\'t be priced and were skipped — fix the address & try again.</div>':'';
  var note=(sur>0)?'<div style="font-size:12px;color:#6a626f;margin-top:6px">Includes ₦'+sur.toLocaleString()+' pay-on-delivery per drop — each rider collects the amount shown.</div>':'';
  var oldr=el('review');if(oldr)oldr.remove();
  var div=document.createElement('div');div.className='review';div.id='review';
  div.innerHTML=rows+'<div class="tot"><span>Total ('+count+')</span><span>₦'+total.toLocaleString()+'</span></div>'+note+warn;
  el('out').appendChild(div);
  el('go').textContent=pm==='pod'?('Confirm '+count+' deliveries — pay ₦'+total.toLocaleString()+' on delivery'):('Confirm \\u0026 pay ₦'+total.toLocaleString());
}
function doReview(){
  var b=el('go');b.disabled=true;b.textContent='Pricing…';
  fetch(api('action=quote'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveries:collect()})})
   .then(function(r){return r.json()}).then(function(j){
     b.disabled=false;
     if(!j.ok||!j.count){b.textContent='Review \\u0026 book';el('out').innerHTML='<div class="err">Couldn\\'t price these — check the addresses (pick a suggestion from the list).</div>';return;}
     quoted=j; renderReview();
   }).catch(function(){b.disabled=false;b.textContent='Review \\u0026 book';alert('Network hiccup — try again.');});
}
el('add').onclick=addDelivery;
['sname','sphone'].forEach(function(id){el(id).addEventListener('input',syncGo);});
flagPhone(el('sphone'));
document.querySelectorAll('input[name=pay]').forEach(function(r){r.addEventListener('change',renderReview);});
el('go').onclick=function(){if(quoted)doBook();else doReview();};
if(VALID!=='1'){el('app').innerHTML='<div class="hero"><h1>Link expired</h1><p>Head back to your chat and ask for a new bulk-delivery link.</p></div>';}
else{
  fetch(api('action=prefill')).then(function(r){return r.json()}).then(function(p){if(!p)return;
   // Deliveries still in motion own the screen (ride-app doctrine) — "＋ Book more" escapes to
   // the form and sets a one-shot flag so the reload doesn't bounce straight back here.
   if(p.active&&p.active.length){
     var skip=false; try{ skip=sessionStorage.getItem('ldl_skipresume')==='1'; if(skip)sessionStorage.removeItem('ldl_skipresume'); }catch(e){}
     if(!skip){ openBatch(p.active.map(function(o){return {n:o.n,receiver:o.receiver,status:o.status||'',rider:''};}), 'Your deliveries', 'Live status of each rider — updated as they move.'); return; }
   }
   if(p.name)el('sname').value=p.name;if(p.phone)el('sphone').value=p.phone;if(p.pod_allowed){PODOK=true;POD_SUR=Math.max(0,Number(p.pod_surcharge)||0);el('opt-pod').style.display='flex';if(POD_SUR>0){var ps=document.createElement('span');ps.style.cssText='color:#6a626f;font-size:12px;margin-left:6px';ps.textContent='(+₦'+POD_SUR.toLocaleString()+' each)';el('opt-pod').appendChild(ps);}}syncGo();});
  addDelivery();
}
</script></body></html>`;
// /bulk now serves the SAME map flow as /map, in batch mode (the page detects the /bulk path and
// lets you add several map-pinned drops, then books them together via bulkOrders). The old text-form
// BULK_PAGE is kept below for reference but no longer routed.
app.get('/bulk', (req, res) => { res.type('html').send(withWa(MAP_PAGE)); });
app.get('/b/:t', (req, res) => res.redirect(302, `/bulk?session=${encodeURIComponent(req.params.t)}`));

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

// ─── "Typing…" that stays lit until the reply actually lands ───
// WhatsApp auto-clears the "composing" presence after ~10s, so a single composing update dies
// mid-thought — the customer sees "typing…" flicker off, then a gap, then the message. Instead we
// REFRESH composing on an interval and stop it exactly when /send fires, so "typing…" shows right up
// until the message appears. A safety cap ends it if /send never arrives (e.g. an error upstream).
const typingState = new Map(); // jid -> { interval, maxTimer }

function stopTyping(jid, sendPaused = true) {
  const st = typingState.get(jid);
  if (st) { clearInterval(st.interval); clearTimeout(st.maxTimer); typingState.delete(jid); }
  if (sendPaused && sock) { try { sock.sendPresenceUpdate('paused', jid); } catch (e) { /* noop */ } }
}

async function startTyping(jid) {
  if (!sock) return;
  stopTyping(jid, false);                                    // reset any prior loop for this chat
  // WhatsApp only shows "typing…" if we subscribe to the contact's presence and appear online first.
  try { await sock.presenceSubscribe(jid); } catch (e) { /* noop */ }
  try { await sock.sendPresenceUpdate('available'); } catch (e) { /* noop */ }
  await new Promise(r => setTimeout(r, 250));
  try { await sock.sendPresenceUpdate('composing', jid); } catch (e) { /* noop */ }
  // Refresh every 6s (before WhatsApp's ~10s auto-clear) so the indicator never lapses mid-thought.
  const interval = setInterval(() => { try { if (sock) sock.sendPresenceUpdate('composing', jid); } catch (e) { /* noop */ } }, 6000);
  const maxTimer = setTimeout(() => stopTyping(jid, true), 45000);   // never "type" forever
  typingState.set(jid, { interval, maxTimer });
}

// Typing indicator — starts a self-refreshing "composing" that lives until /send stops it.
app.post('/typing', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    await startTyping(toJid(phone));
    res.json({ status: 'typing_started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message
// A booking link gets a clean tappable PREVIEW CARD (title + description) above the message. The URL
// STAYS in the text — WhatsApp only renders the card when the URL is present in the body (hiding it
// makes the card vanish). So: card on top (nice), the link still there and tappable (safe).
// Normalise any phone (typed local "0803…", "+234…", "234…", with spaces/dashes) into a WhatsApp JID.
// WhatsApp needs the international number with NO leading 0 and NO "+". Already-formed JIDs (@lid /
// @s.whatsapp.net) pass through untouched. Without this, sends to typed buyer/rider numbers silently fail.
function toJid(phone) {
  var p = String(phone == null ? '' : phone).trim();
  if (!p) return '';
  if (p.includes('@')) return p;
  var d = p.replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '0') d = '234' + d.slice(1);
  else if (d.length === 10) d = '234' + d;
  else if (d.length === 14 && d.slice(0, 4) === '2340') d = '234' + d.slice(4);
  return d + '@s.whatsapp.net';
}
function bookingPreview(text) {
  // Matches both the long form (/map?session=…) and the short form (/m/…, /q/…, /w/…, /v/…, /b/…).
  const m = String(text || '').match(/https?:\/\/[^\s]+\/(map|waybill|quote|vendor|bulk|m|q|w|v|b)(?:\/|\?session=)[^\s]*/i);
  if (!m) return null;
  // A RESUME/TRACKING link (view=track) reopens a LIVE order — "Create your delivery" copy on it told
  // customers to set up a trip they'd already booked. Give it its own card + call-to-action.
  if (/[?&]view=track\b/i.test(m[0])) {
    return { url: m[0], title: '📦 Track your delivery', description: 'Tap to see your rider offers & live status', cta: 'open your delivery' };
  }
  const kind = ({ m: 'map', q: 'quote', w: 'waybill', v: 'vendor', b: 'bulk' }[m[1].toLowerCase()] || m[1].toLowerCase());
  const meta = {
    map:     { title: '📍 Create your delivery',      description: 'Tap to set pickup & drop-off — takes 10 seconds' },
    waybill: { title: '🚚 Get your waybill price',     description: 'Tap to pick the state & weight' },
    quote:   { title: '🌍 Get your shipping estimate', description: 'Tap to pick country, weight & value' },
    vendor:  { title: '🛍️ Send your orders',          description: 'Tap to add your buyers & addresses' },
    bulk:    { title: '📦 Your deliveries',           description: 'Tap to add each pickup & drop-off — pay once' }
  }[kind] || { title: '📦 Lasalu Drop Logistics', description: 'Tap to continue' };
  return { url: m[0], ...meta, cta: 'create your delivery' };
}

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    const jid = toJid(phone);
    // "typing…" was kept alive while ADANOVA thought; stop the refresh loop (don't send 'paused' —
    // the outgoing message clears the indicator itself) and give ONE fresh composing tick so it stays
    // lit right up until this message lands, with no dead gap.
    stopTyping(jid, false);
    try { await sock.sendPresenceUpdate('composing', jid); } catch (e) { /* noop */ }
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
        else {
          // Re-add ONE clean call-to-action, with a BLANK LINE before it so the message breathes:
          //   <message>\n\n👇 *Tap the link below to create your delivery*\n<url>
          const i = body.indexOf(pv.url);
          const before = body.slice(0, i).replace(/[\s\n]+$/, '');
          const after = body.slice(i + pv.url.length);
          body = `${before}\n\n👇 *Tap the link below to ${pv.cta || 'create your delivery'}*\n${pv.url}${after}`;
        }
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
    const jid = toJid(phone);
    stopTyping(jid, false);
    try { await sock.sendPresenceUpdate('composing', jid); } catch (e) { /* noop */ }
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
