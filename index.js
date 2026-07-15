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
<meta name="description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds.">
<meta property="og:title" content="📦 Set your delivery — Lasalu Drop">
<meta property="og:description" content="Pin your pickup & drop-off, get an instant price, and book your rider in seconds 🛵">
<meta property="og:type" content="website">
<meta name="theme-color" content="#4F074C">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --plum:#4F074C;--plum-d:#3A0537;--pink:#E23A7C;--pink-soft:#FCEBF2;--lilac:#F6EFF5;
  --ink:#241a29;--ink-2:#6a626f;--ink-3:#a8a0ae;
  --line:#ece7ef;--line-2:#ded6e2;--surface:#fff;--bg:#f7f4f8;
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
#map{position:absolute;inset:0}
.leaflet-container{z-index:1}
.scrim{position:absolute;left:0;right:0;bottom:0;height:78px;background:linear-gradient(to bottom,rgba(247,244,248,0),var(--bg));z-index:2;pointer-events:none}
.etabadge{position:absolute;top:16px;right:14px;z-index:1000;background:rgba(255,255,255,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:13px;padding:9px 13px;box-shadow:var(--sh-1);font-size:13.5px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:6px}
.etabadge .d{color:var(--ink-2);font-weight:500;font-size:12px}
.pricetop{position:absolute;bottom:22px;right:14px;z-index:1000;background:var(--plum);color:#fff;border-radius:15px;padding:9px 16px;box-shadow:0 8px 22px rgba(79,7,76,.34);white-space:nowrap;align-items:baseline;gap:8px}
.pricetop .cap{font-size:10.5px;font-weight:600;color:#e7b9df;text-transform:uppercase;letter-spacing:.09em}
.pricetop .amt{font-size:19px;font-weight:800;letter-spacing:-.02em}
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
.reuse a{display:inline-flex;align-items:center;background:var(--pink-soft);color:var(--plum);border:1px solid #f3d3e3;border-radius:99px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;margin-right:7px;transition:transform .12s var(--ease)}
.reuse a:active{transform:scale(.96)}
.reuse a.on{background:var(--plum);color:#fff;border-color:var(--plum)}
.payopt{display:flex;align-items:center;gap:11px;padding:14px;border:1px solid var(--line);border-radius:var(--r);margin-bottom:9px;font-size:14.5px;font-weight:500;color:var(--ink);cursor:pointer;transition:border-color .15s var(--ease),background .15s var(--ease)}
.payopt input{width:19px;height:19px;accent-color:var(--plum);flex:none}
.payopt:has(input:checked){border-color:var(--plum);background:var(--lilac)}
.payopt#opt-cod input{accent-color:var(--amber)}
.payopt#opt-cod:has(input:checked){border-color:var(--amber);background:var(--amber-bg)}
.feebig{display:none;align-items:center;justify-content:space-between;background:var(--lilac);border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 18px;margin:16px 0 0}
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
<div class="sec first">Route</div>
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
<div class="sec">Contacts</div>
<div class="lbl2">Pickup <span class="hint">— who we collect from</span></div>
<div class="row2"><input id="sname" placeholder="Name (optional)"><input id="sphone" type="tel" inputmode="tel" placeholder="Phone"></div>
<div class="lbl2">Receiver <span class="hint">— who we deliver to</span></div>
<div class="row2"><input id="rname" placeholder="Name (optional)"><input id="rphone" type="tel" inputmode="tel" placeholder="Phone"></div>
<div id="codrphint" class="hint" style="display:none;color:#b45309;margin:5px 2px 0">👆 For collect-on-delivery, add the <b>Receiver</b> (buyer) phone — they get the payment request.</div>
<div class="reuse" id="rrecv"></div>
<div class="sec">Package</div>
<input id="item" class="f1" placeholder="What are you sending? (e.g. food, documents)">
<input id="dinstr" class="f1" placeholder="Delivery instructions — optional (e.g. call on arrival, gate code)" maxlength="200" style="margin-top:10px">
<div id="paysel" style="margin-top:2px">
  <div class="sec">Payment</div>
  <div id="payradios">
    <label class="payopt"><input type="radio" name="pay" value="now" checked style="width:18px;height:18px;accent-color:#4F074C"> 💳 Pay now (card or transfer)</label>
    <label class="payopt" id="opt-pod" style="display:none"><input type="radio" name="pay" value="pod" style="width:18px;height:18px;accent-color:#4F074C"> 🛵 Pay on delivery — cash to the rider</label>
  </div>
  <label class="payopt" id="opt-cod" style="display:none"><input type="checkbox" id="codbox" style="width:18px;height:18px;accent-color:#b45309"> 📦 The buyer hasn't paid for the item yet — we collect it for you</label>
  <div id="codamt" style="display:none;margin-top:4px">
    <div style="font-size:12.5px;color:#6a626f;font-weight:700;margin:8px 2px 6px">How much should we collect from the buyer? (₦)</div>
    <input id="goods" type="number" inputmode="numeric" min="1" placeholder="e.g. 100000" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
    <div id="codbreak" style="display:none;margin-top:8px;background:#fff8ec;border:1px solid #ffe0a6;border-radius:12px;padding:12px 14px"></div>
    <div style="font-size:11.5px;color:#9a7b3a;margin-top:7px">The buyer pays this on delivery, <b>Lasalu collects it</b> (comes to us — <b>not your account</b>), and the rider hands over the item only once it's paid.</div>
    <div id="bankbox" style="display:none;margin-top:14px;border-top:1px dashed #ffe0a6;padding-top:12px">
      <div style="font-size:12.5px;color:#6a626f;font-weight:700;margin:0 2px 6px">💳 Where should we pay you? <span style="font-weight:500;color:#9a7b3a">(so we can settle you same-day)</span></div>
      <input id="acctno" type="text" inputmode="numeric" maxlength="10" placeholder="Account number (10 digits)" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
      <div style="position:relative;margin-top:8px">
        <input id="bankcode" type="text" autocomplete="off" placeholder="Type your bank name…" style="width:100%;padding:12px 14px;border:1px solid #ffe0a6;background:#fff8ec;border-radius:11px;font-size:15px;outline:none">
        <div id="banksug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:20;margin-top:4px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #ffe0a6;border-radius:11px;box-shadow:0 12px 32px rgba(58,5,55,.16)"></div>
      </div>
      <div id="acctname" style="display:none;margin-top:8px;font-size:13px;font-weight:700"></div>
    </div>
    <div id="banksaved" style="display:none;margin-top:14px;border-top:1px dashed #ffe0a6;padding-top:12px;font-size:13px;color:#166534">✅ We'll pay you to <b><span id="banklabel"></span></b>. <a href="#" id="bankchange" style="color:#E23A7C;text-decoration:underline;font-weight:600">change</a></div>
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
    ? '<div style="width:18px;height:18px;border-radius:50%;background:#4F074C;border:3px solid #fff;box-shadow:0 3px 8px rgba(79,7,76,.45)"></div>'
    : '<div style="width:18px;height:18px;border-radius:5px;background:#E23A7C;border:3px solid #fff;box-shadow:0 3px 8px rgba(226,58,124,.45)"></div>';
  return L.divIcon({className:'',iconSize:[24,24],iconAnchor:[12,12],html:c});
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
    // Just set the pin — we no longer auto-fill names/phones by side (the booker's own end is filled
    // server-side from their WhatsApp number, so tapping a pin never mis-assigns who's the sender/receiver).
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
  // Names are optional. Each phone must be valid or blank, and at least one must be filled (the other
  // person's) — we fill the blank side with the booker's own WhatsApp number server-side.
  var sp=val('sphone'), rp=val('rphone');
  var phonesOk=(!sp||phoneOk(sp))&&(!rp||phoneOk(rp))&&(phoneOk(sp)||phoneOk(rp));
  var cb=document.getElementById('codbox');
  // COD: the receiver IS the buyer, so their phone is required (they get the payment request).
  if(cb&&cb.checked) phonesOk=phonesOk&&phoneOk(rp);
  // Keep the COD "receiver phone needed" note in sync so the button is never silently dead.
  var crh=document.getElementById('codrphint'); if(crh) crh.style.display=(cb&&cb.checked&&!phoneOk(rp))?'block':'none';
  var ok = picked.pickup&&picked.dropoff&&val('item')&&phonesOk;
  if(ok&&cb&&cb.checked&&!BANK_SAVED) ok=ACCT_OK;
  document.getElementById('go').disabled=!ok;
}
// Decode a Google-encoded polyline into [lat,lng] points (so we can draw the route, Bolt-style).
function decodePoly(str){ var i=0,lat=0,lng=0,c=[]; while(i<str.length){ var b,sh=0,res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lat+=((res&1)?~(res>>1):(res>>1)); sh=0;res=0; do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<sh;sh+=5;}while(b>=0x20); lng+=((res&1)?~(res>>1):(res>>1)); c.push([lat/1e5,lng/1e5]); } return c; }
var routeLine=null, mapFee=null;
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
     if(j&&j.name){ ACCT_OK=true; nm.style.color='#166534'; nm.textContent='✅ '+j.name; }
     else { ACCT_OK=false; nm.style.color='#c0392b'; nm.textContent='Couldn\\'t verify that account — check the number and bank.'; }
   }).catch(function(){ nm.style.display='none'; });
}
function drawRoute(enc){ try{ var pts=decodePoly(enc); if(!pts.length)return; if(routeLine)map.removeLayer(routeLine); routeLine=L.polyline(pts,{color:'#E23A7C',weight:5,opacity:.85,lineJoin:'round'}).addTo(map); map.fitBounds(routeLine.getBounds(),{padding:[50,50],maxZoom:15}); }catch(e){} }
function quote(){
  var f=document.getElementById('fee'), pt=document.getElementById('pricetop');
  f.style.display='flex'; f.innerHTML='<div class="lbl">Calculating fee…</div>';
  if(pt){ pt.style.display='flex'; pt.innerHTML='<span class="cap">Fee</span><span class="amt">…</span>'; }
  fetch(api('action=price&plat='+picked.pickup.lat+'&plng='+picked.pickup.lng+'&dlat='+picked.dropoff.lat+'&dlng='+picked.dropoff.lng))
   .then(r=>r.json()).then(j=>{
     var e=document.getElementById('eta');
     if(j.price){
       mapFee=j.price;
       var sub=[]; if(j.min)sub.push('~'+j.min+' min trip'); if(j.km)sub.push('~'+j.km+' km');
       f.style.display='flex'; f.innerHTML='<div><div class="lbl">Delivery fee</div>'+(sub.length?('<div class="sub">'+sub.join(' · ')+'</div>'):'')+'</div><div class="amt">₦'+j.price.toLocaleString()+'</div>';
       // Prominent price badge pinned to the top of the map so the fee is visible at a glance.
       if(pt){ pt.style.display='flex'; pt.innerHTML='<span class="cap">Fee</span><span class="amt">₦'+j.price.toLocaleString()+'</span>'; }
       if(j.min){ e.style.display='flex'; e.innerHTML='🛵 '+j.min+' min <span class="d">trip</span>'; } else { e.style.display='none'; }
     } else { mapFee=null; f.style.display='none'; if(e)e.style.display='none'; if(pt)pt.style.display='none'; }
     if(typeof codBreak==='function') codBreak();
     if(j.polyline) drawRoute(j.polyline);
   }).catch(function(){ f.style.display='none'; if(pt)pt.style.display='none'; });
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
    // Do NOT pre-type the booker into Pickup — the whole point is "leave your own side blank, we use your
    // WhatsApp number." Prefilling here re-declared them as the sender and contradicted the hint.
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
    if(p.pod_allowed){ var po=document.getElementById('opt-pod'); po.style.display='flex'; if(p.pod_surcharge>0){ var ps=document.createElement('span'); ps.style.cssText='color:#6a626f;font-weight:600;margin-left:auto'; ps.textContent='+₦'+Number(p.pod_surcharge).toLocaleString(); po.appendChild(ps); } }
    if(p.cod_allowed){ document.getElementById('opt-cod').style.display='flex'; }
    if(p.cod_fee_pct!=null) COD_PCT=Number(p.cod_fee_pct)||1.75;
    if(p.has_bank){ BANK_SAVED=true; document.getElementById('banklabel').textContent=p.bank_label||'your saved account'; }
    validate(); step();
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
    document.getElementById('codamt').style.display=on?'block':'none';
    document.getElementById('payradios').style.display=on?'none':'block';
    // COD needs the receiver (buyer) phone — say so, so a blank field never leaves the button silently dead.
    var crh=document.getElementById('codrphint'); if(crh) crh.style.display=(on&&!phoneOk(val('rphone')))?'block':'none';
    // Ask for a payout account only if we don't already have one saved for this vendor.
    document.getElementById('banksaved').style.display=(on&&BANK_SAVED)?'block':'none';
    document.getElementById('bankbox').style.display=(on&&!BANK_SAVED)?'block':'none';
    if(on&&!BANK_SAVED) loadBanks();
    codBreak(); validate();
  });
  document.getElementById('goods').addEventListener('input',codBreak);
  document.getElementById('acctno').addEventListener('input',function(){ resolveAcct(); validate(); });
  // Searchable bank field: typing filters the list; a fresh edit clears any previous selection.
  var bankInp=document.getElementById('bankcode');
  bankInp.addEventListener('input',function(){ SEL_BANK_CODE=''; SEL_BANK_NAME=''; renderBankSug(bankInp.value); resolveAcct(); validate(); });
  bankInp.addEventListener('focus',function(){ renderBankSug(bankInp.value); });
  bankInp.addEventListener('blur',function(){ setTimeout(function(){ var b=document.getElementById('banksug'); if(b)b.style.display='none'; },150); });
  document.getElementById('bankchange').onclick=function(e){ e.preventDefault(); BANK_SAVED=false; ACCT_OK=false; SEL_BANK_CODE=''; SEL_BANK_NAME=''; bankInp.value='';
    document.getElementById('banksaved').style.display='none'; document.getElementById('bankbox').style.display='block'; loadBanks(); validate(); };
  document.getElementById('go').onclick=function(){
    var codOn=document.getElementById('codbox').checked;
    var payVal=codOn?'cod':(function(){ var r=document.querySelector('input[name=pay]:checked'); return r?r.value:'now'; })();
    var goodsVal=codOn?Number((document.getElementById('goods').value||'').replace(/[^0-9.]/g,'')):0;
    if(codOn&&!(goodsVal>0)){ alert('Please enter how much we should collect from the buyer.'); return; }
    if(codOn&&mapFee&&(goodsVal-Math.min(3000,Math.round(goodsVal*COD_PCT/100))-Number(mapFee))<=0){ alert('That amount is too low to cover our fee and the delivery — please enter a higher amount.'); return; }
    var acctNo='',bankCode='',bankName='';
    if(codOn&&!BANK_SAVED){ acctNo=(document.getElementById('acctno').value||'').replace(/\\D/g,''); bankCode=SEL_BANK_CODE; bankName=SEL_BANK_NAME; }
    var b=document.getElementById('go'); b.disabled=true; b.textContent='Booking…';
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      session:SESSION,pickup:picked.pickup,dropoff:picked.dropoff,
      sender_name:val('sname'),sender_phone:val('sphone'),receiver_name:val('rname'),receiver_phone:val('rphone'),item:val('item'),delivery_instruction:val('dinstr'),
      pay_method:payVal,cod:codOn,goods_value:goodsVal,account_number:acctNo,bank_code:bankCode,bank_name:bankName
    })})
     .then(r=>r.json()).then(j=>{
       document.getElementById('app').innerHTML='<div class="done"><h2>✅ All set!</h2><p class="muted">Your order &amp; price are waiting in your WhatsApp chat.</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
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
const BASE_CSS = `:root{--plum:#4F074C;--plum-d:#3A0537;--pink:#E23A7C;--pink-soft:#FCEBF2;--lilac:#F6EFF5;--ink:#241a29;--ink-2:#6a626f;--ink-3:#a8a0ae;--line:#ece7ef;--line-2:#ded6e2;--surface:#fff;--bg:#f7f4f8;--amber:#b45309;--amber-line:#ffe0a6;--amber-bg:#fff8ec;--r:14px;--r-lg:18px;--r-xl:26px;--ease:cubic-bezier(.23,1,.32,1);--sh-1:0 1px 2px rgba(58,5,55,.05),0 3px 10px rgba(58,5,55,.05);--sh-pop:0 18px 44px rgba(58,5,55,.16)}
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
const QUOTE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Ship internationally — Lasalu Drop</title>
<meta name="theme-color" content="#4F074C">
${FONT_LINK}<style>${BASE_CSS}
.wrap{padding-bottom:96px}</style></head><body><div class="wrap" id="app">
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
app.get('/quote', (req, res) => { res.type('html').send(withWa(QUOTE_PAGE)); });

// ── WAYBILL page (interstate, flat under 5kg) — its own simple premium page ──
const WAYBILL_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send a waybill — Lasalu Drop</title>
<meta name="theme-color" content="#4F074C">
${FONT_LINK}<style>${BASE_CSS}
.parkinfo{display:none;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r-lg);padding:14px 16px;margin:14px 0 2px;font-size:13px;color:#7a4d10;line-height:1.55}
.parkinfo b{color:#5c3a0c;font-weight:700}
.orsplit{display:flex;align-items:center;gap:12px;color:var(--ink-3);font-size:11px;font-weight:700;margin:16px 2px 12px;text-transform:uppercase;letter-spacing:.08em}
.orsplit::before,.orsplit::after{content:"";flex:1;height:1px;background:var(--line)}</style></head><body><div class="wrap" id="app">
<div class="hero"><div class="glow">🚚</div>
<h1>Send a waybill</h1>
<p>Nationwide via our trusted parks — GUO · GIG · Rivers Joy. We pick up from your door 🛵, your receiver collects at the destination park.</p></div>
<div class="body">
<div class="sec" style="margin-top:6px">Where is it going?</div>
<div class="states" id="states">
<div class="st" data-s="LAGOS"><b>Lagos</b><span>₦10,000</span></div>
<div class="st" data-s="ABUJA"><b>Abuja</b><span>₦10,000</span></div>
<div class="st" data-s="ABA"><b>Aba</b><span>₦5,000</span></div>
<div class="st" data-s="OWERRI"><b>Owerri</b><span>₦6,000</span></div>
</div>
<div class="orsplit">or any other state</div>
<div class="fld"><select id="otherstate">
<option value="">Choose another state — via partner park…</option>
<option value="ADAMAWA">Adamawa</option><option value="AKWA IBOM">Akwa Ibom</option><option value="ANAMBRA">Anambra</option><option value="BAUCHI">Bauchi</option><option value="BAYELSA">Bayelsa</option><option value="BENUE">Benue</option><option value="BORNO">Borno</option><option value="CROSS RIVER">Cross River</option><option value="DELTA">Delta</option><option value="EBONYI">Ebonyi</option><option value="EDO">Edo</option><option value="EKITI">Ekiti</option><option value="ENUGU">Enugu</option><option value="GOMBE">Gombe</option><option value="JIGAWA">Jigawa</option><option value="KADUNA">Kaduna</option><option value="KANO">Kano</option><option value="KATSINA">Katsina</option><option value="KEBBI">Kebbi</option><option value="KOGI">Kogi</option><option value="KWARA">Kwara</option><option value="NASARAWA">Nasarawa</option><option value="NIGER">Niger</option><option value="OGUN">Ogun</option><option value="ONDO">Ondo</option><option value="OSUN">Osun</option><option value="OYO">Oyo</option><option value="PLATEAU">Plateau</option><option value="SOKOTO">Sokoto</option><option value="TARABA">Taraba</option><option value="YOBE">Yobe</option><option value="ZAMFARA">Zamfara</option>
</select></div>
<div class="lbl">Weight (kg) <span class="req">*</span></div>
<div class="fld"><input id="weight" type="number" step="0.5" min="0.5" inputmode="decimal" placeholder="e.g. 2"></div>
<div class="feebig" id="fee"></div>
<div class="parkinfo" id="parkinfo"></div>
<div class="err" id="err"></div>
<div class="sec">Pickup — where our rider collects <span class="req">*</span></div>
<div class="fld"><input id="paddr" placeholder="Start typing your address…" autocomplete="off" style="padding-right:44px"><button type="button" id="ploc" class="gpsbtn" aria-label="Use my current location">📍</button><div class="sugbox" id="psug" style="display:none"></div></div>
<div class="sec">Sender</div>
<div class="two"><div class="fld"><input id="sname" placeholder="Sender's name"></div><div class="fld"><input id="sphone" type="tel" inputmode="tel" placeholder="Sender's phone"></div></div>
<div class="sec">Receiver <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-3)">— collects at the park</span></div>
<div class="two"><div class="fld"><input id="rname" placeholder="Receiver's name"></div><div class="fld"><input id="rphone" type="tel" inputmode="tel" placeholder="Receiver's phone *"></div></div>
<div class="fld"><input id="item" placeholder="What are you sending?"></div>
<div class="fld"><input id="dinstr" placeholder="Note for our rider — optional" maxlength="200"></div>
<button id="go" disabled>Confirm &amp; book</button>
<p class="muted">Powered by Lasalu Drop Logistics</p>
</div></div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
// A used/expired link must SAY so — before this, its inputs just sat silently dead (no suggestions).
(function(){if(!SESSION)return;setTimeout(function(){try{var base=(typeof API!=="undefined")?API:null;if(!base)return;fetch(base+"?action=check&session="+encodeURIComponent(SESSION)).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999;font-family:sans-serif";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});}catch(e){}},0);})();
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/quotePicker";
var lastPrice=null, state="", isPark=false, t;
var FLAT={LAGOS:1,ABUJA:1,ABA:1,OWERRI:1};
var NAMES={LAGOS:'Lagos',ABUJA:'Abuja',ABA:'Aba',OWERRI:'Owerri','AKWA IBOM':'Akwa Ibom','CROSS RIVER':'Cross River'};
function el(id){return document.getElementById(id);}
function val(id){return (el(id).value||'').trim();}
function useLoc(){var b=el('ploc');if(!b)return;b.onclick=function(){if(!navigator.geolocation){alert('Location is not available here — please type your address.');return;}var prev=b.textContent;b.textContent='…';b.disabled=true;navigator.geolocation.getCurrentPosition(function(pos){el('paddr').value='Getting address…';fetch(API+'?action=reverse&session='+encodeURIComponent(SESSION)+'&lat='+pos.coords.latitude+'&lng='+pos.coords.longitude).then(function(r){return r.json();}).then(function(j){el('paddr').value=(j&&j.address)?j.address:'My current location';b.textContent=prev;b.disabled=false;validate();}).catch(function(){el('paddr').value='My current location';b.textContent=prev;b.disabled=false;validate();});},function(){b.textContent=prev;b.disabled=false;alert('Couldn\\'t get your location — please allow access or type your address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});};}
function nameOf(s){return NAMES[s]||(s?s.charAt(0)+s.slice(1).toLowerCase():s);}
function parkHTML(dest,over5){return over5?'📦 For a heavier item (over 5kg), our team works out the best price and confirms it in your chat 🙏 Your receiver collects at the <b>'+dest+' park</b> — <b>no home delivery</b>.':'🚚 We waybill to <b>'+dest+'</b> through our partner parks. Our rider takes your item to the park and <b>confirms we can waybill it there</b>, then sends you the <b>exact fee</b> (worked out by weight). Your receiver collects it at the <b>'+dest+' park</b> — <b>no home delivery</b>.';}
function selectState(s,fromCard){state=s;lastPrice=null;isPark=false;Array.prototype.forEach.call(document.querySelectorAll('.st'),function(x){x.className='st'+(x.getAttribute('data-s')===s?' on':'');});if(fromCard)el('otherstate').value='';recalc();}
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
    isPark=true;el('parkinfo').style.display='block';el('parkinfo').innerHTML=parkHTML(nameOf(state),false);validate();return;
  }
  if(isNaN(w)||w<=0){validate();return;}
  el('fee').style.display='flex';el('fee').innerHTML='<div class="l">Calculating…</div>';
  fetch(API+'?action=price&session='+encodeURIComponent(SESSION)+'&mode=waybill&destination='+encodeURIComponent(state)+'&weight='+w).then(function(r){return r.json();}).then(function(j){
    if(j&&j.price){lastPrice=j.price;el('fee').style.display='flex';el('fee').innerHTML='<div><div class="l">Waybill to '+nameOf(state)+'</div><div class="sub">up to 5kg • receiver collects at the '+nameOf(state)+' park</div></div><div class="amt">₦'+Number(j.price).toLocaleString()+'</div>';}
    else if(j&&j.park){isPark=true;el('fee').style.display='none';el('parkinfo').style.display='block';el('parkinfo').innerHTML=parkHTML(nameOf(state),!!j.over5);}
    else{el('fee').style.display='none';}
    validate();
  }).catch(function(){el('fee').style.display='none';validate();});
}
function phoneOk(v){var d=(v||'').replace(/\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhone(id){var e=el(id);if(!e)return;function u(){var v=(e.value||'').trim();var bad=v&&!phoneOk(v);e.style.borderColor=bad?'#dc2626':'';var box=e.closest('.row2,.two,.fld')||e.parentNode;var w=document.getElementById(id+'_pe');if(bad){if(!w){w=document.createElement('div');w.id=id+'_pe';w.style.cssText='color:#dc2626;font-size:12px;margin:4px 2px 0';w.textContent='📵 That number looks off — Nigerian numbers are 11 digits (e.g. 08012345678).';box.parentNode.insertBefore(w,box.nextSibling);}}else if(w){w.parentNode.removeChild(w);}}e.addEventListener('input',u);e.addEventListener('blur',u);}
function validate(){var w=parseFloat(el('weight').value);var ok=state&&!isNaN(w)&&w>0&&(isPark||lastPrice)&&val('paddr')&&val('rname')&&phoneOk(val('rphone'))&&(!val('sphone')||phoneOk(val('sphone')))&&val('item');el('go').disabled=!ok;}
function book(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    session:SESSION,mode:'waybill',destination:state,weight:parseFloat(el('weight').value)||1,
    sender_name:val('sname'),sender_phone:val('sphone'),pickup_address:val('paddr'),receiver_name:val('rname'),receiver_phone:val('rphone'),delivery_address:'',item:val('item'),delivery_instruction:val('dinstr')
  })}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){el('app').innerHTML='<div class="body"><div class="done"><h2>✅ All set!</h2><p class="muted">'+(j.park?'Your waybill request is in — our team confirms the park &amp; exact price in your WhatsApp chat.':'Your order &amp; price are waiting in your WhatsApp chat.')+'</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div></div>';}
    else{b.disabled=false;b.textContent='Confirm & book';el('err').textContent=(j&&j.error)?('Couldn\\'t book: '+j.error):'Something went wrong — try again.';}
  }).catch(function(){b.disabled=false;b.textContent='Confirm & book';alert('Network hiccup — try again.');});
}
if(VALID!=='1'){el('app').innerHTML='<div class="body"><div class="done"><h2>Link expired</h2><p class="muted">Please head back to your chat and ask for a waybill again.</p></div></div>';}
else{
  Array.prototype.forEach.call(document.querySelectorAll('.st'),function(b){b.onclick=function(){selectState(b.getAttribute('data-s'),true);};});
  el('otherstate').addEventListener('change',function(){if(this.value){selectState(this.value,false);}else{state='';recalc();}});
  el('weight').addEventListener('input',function(){clearTimeout(t);t=setTimeout(recalc,300);});
  ['sname','sphone','paddr','rname','rphone','item'].forEach(function(id){el(id).addEventListener('input',validate);});
  flagPhone('sphone');flagPhone('rphone');
  wireAuto('paddr','psug');useLoc();
  el('go').onclick=book;
}
</script></body></html>`;
app.get('/waybill', (req, res) => { res.type('html').send(withWa(WAYBILL_PAGE)); });

// ── Vendor bulk order form (trusted vendors) — add several buyer orders, we book + collect COD ──
const VENDOR_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Send orders — Lasalu Drop</title>
${FONT_LINK}<style>${BASE_CSS}</style></head><body>
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
function collect(){var out=[];document.querySelectorAll('.ord').forEach(function(d){var o={};d.querySelectorAll('input[data-f]').forEach(function(i){o[i.getAttribute('data-f')]=i.value.trim().replace(/^📍\\s*/,'');});var pk=d.querySelector('input[data-f=pickup_address]'),dr=d.querySelector('input[data-f=delivery_address]');if(pk&&pk.dataset.coords)o.pickup_coords=pk.dataset.coords;if(dr&&dr.dataset.coords)o.delivery_coords=dr.dataset.coords;out.push(o);});return out;}
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
       var lines=(j.results||[]).map(function(r){return r.ok?('✅ '+r.buyer+' — booked, buyer pays ₦'+r.total.toLocaleString()):('⚠️ '+(r.buyer||'an order')+' — '+r.error);}).join('<br>');
       el('app').innerHTML='<div class="done"><h2>Done! 🙌</h2><p class="muted">'+j.booked+' order(s) booked. We\\'ve sent each buyer their payment link.</p><div style="text-align:left;font-size:14px;margin:14px 0">'+lines+'</div><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
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
${FONT_LINK}<style>${BASE_CSS}</style></head><body>
<div class="wrap" id="app">
  <div class="hero"><h1>Multiple deliveries 🛵</h1><p>Add each delivery — pickup, drop-off, who's receiving and what you're sending. We price them all and send a rider to each.</p></div>
  <div class="body">
    <div class="row2"><input id="sname" placeholder="Your name"><input id="sphone" placeholder="Your phone" inputmode="tel"></div>
    <div id="deliveries"></div>
    <button class="add" id="add">+ Add another delivery</button>
    <div class="lbl">Payment</div>
    <label class="payopt"><input type="radio" name="pay" value="now" checked> 💳 Pay all now — one payment</label>
    <label class="payopt" id="opt-pod" style="display:none"><input type="radio" name="pay" value="pod"> 🛵 Pay on delivery — cash to each rider</label>
    <button class="go" id="go" disabled>Review &amp; book</button>
    <div id="out"></div>
  </div>
</div>
<script>
var SESSION=new URLSearchParams(location.search).get('session')||"";
var VALID=SESSION?"1":"0";
var API="https://wbsczuwofdrliloueskw.supabase.co/functions/v1/bulkOrders";
function api(qs){return API+"?session="+encodeURIComponent(SESSION)+"&"+qs}
function el(id){return document.getElementById(id)}
(function(){if(!SESSION)return;setTimeout(function(){fetch(api("action=check")).then(function(r){return r.json();}).then(function(j){if(j&&j.valid===false){var b=document.createElement("div");b.style.cssText="position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-size:14px;text-align:center;z-index:99999";b.textContent="⚠️ This link has already been used or expired — go back to WhatsApp and ask me for a fresh link 🙌";document.body.appendChild(b);}}).catch(function(){});},0);})();
var n=0, PODOK=false, quoted=null;
function phoneOk(v){var d=(v||'').replace(/\\D/g,'');if(d.length===13&&d.slice(0,3)==='234')d='0'+d.slice(3);if(d.length===14&&d.slice(0,4)==='2340')d='0'+d.slice(4);return d.length===11&&d.charAt(0)==='0';}
function flagPhone(inp){if(!inp)return;function u(){var v=(inp.value||'').trim();var bad=v&&!phoneOk(v);inp.style.borderColor=bad?'#dc2626':'';}inp.addEventListener('input',u);inp.addEventListener('blur',u);}
function wireAuto(inp,sug){var t;inp.addEventListener('input',function(){inp.dataset.coords='';clearTimeout(t);var q=inp.value.trim();quoted=null;syncGo();if(q.length<2){sug.style.display='none';return;}t=setTimeout(function(){fetch(api('action=autocomplete&q='+encodeURIComponent(q))).then(function(r){return r.json()}).then(function(j){sug.innerHTML='';(j.predictions||[]).forEach(function(p){var x=document.createElement('div');x.textContent=p.label;x.onclick=function(){inp.value=p.label;inp.dataset.coords='';sug.style.display='none';syncGo();};sug.appendChild(x);});sug.style.display=(j.predictions&&j.predictions.length)?'block':'none';});},300);});}
function useLoc(inp){if(!inp)return;if(!navigator.geolocation){alert('Location not available on this device — please type the address.');return;}var old=inp.value;inp.value='📍 Locating…';navigator.geolocation.getCurrentPosition(function(pos){var la=pos.coords.latitude,ln=pos.coords.longitude;inp.dataset.coords=la+','+ln;inp.value='📍 My current location';fetch(api('action=reverse&lat='+la+'&lng='+ln)).then(function(r){return r.json()}).then(function(j){if(j&&j.label)inp.value='📍 '+j.label;syncGo();}).catch(function(){syncGo();});},function(){inp.value=old;alert('Couldn\\'t get your location — please allow location access, or type the address.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});}
function collect(){var out=[];document.querySelectorAll('.ord').forEach(function(d){var o={};d.querySelectorAll('input[data-f]').forEach(function(i){o[i.getAttribute('data-f')]=i.value.trim().replace(/^📍\\s*/,'');});var pk=d.querySelector('input[data-f=pickup_address]'),dr=d.querySelector('input[data-f=delivery_address]');if(pk&&pk.dataset.coords)o.pickup_coords=pk.dataset.coords;if(dr&&dr.dataset.coords)o.delivery_coords=dr.dataset.coords;out.push(o);});return out;}
function rowsValid(){var os=collect();return os.length>0&&os.every(function(o){return o.pickup_address&&o.delivery_address&&o.receiver_name&&phoneOk(o.receiver_phone)&&o.item;});}
function senderValid(){return el('sname').value.trim()&&phoneOk(el('sphone').value);}
function syncGo(){quoted=null;el('go').textContent='Review \\u0026 book';var ok=senderValid()&&rowsValid();el('go').disabled=!ok;var r=el('review');if(r)r.remove();}
function addDelivery(){
  n++;var d=document.createElement('div');d.className='ord';
  d.innerHTML='<button class="rm" title="Remove">×</button>'
    +'<div class="cap">DELIVERY '+n+'</div>'
    +'<div style="position:relative"><input class="locin" placeholder="Pickup address" data-f="pickup_address" autocomplete="off"><button type="button" class="locp" title="Use my location">📍</button><div class="sug" style="display:none"></div></div>'
    +'<button class="same" type="button">↑ same pickup as above</button>'
    +'<div style="position:relative" class="mt"><input class="locin" placeholder="Drop-off address" data-f="delivery_address" autocomplete="off"><button type="button" class="locp" title="Use my location">📍</button><div class="sug" style="display:none"></div></div>'
    +'<div class="row2 mt"><input placeholder="Receiver name" data-f="receiver_name"><input placeholder="Receiver phone" data-f="receiver_phone" inputmode="tel"></div>'
    +'<input class="mt" placeholder="What are you sending? (e.g. food, documents)" data-f="item">';
  el('deliveries').appendChild(d);
  d.querySelector('.rm').onclick=function(){d.remove();syncGo();};
  var ins=d.querySelectorAll('input[data-f]');
  var pins=d.querySelectorAll('.sug');
  wireAuto(d.querySelector('input[data-f=pickup_address]'),pins[0]);
  wireAuto(d.querySelector('input[data-f=delivery_address]'),pins[1]);
  d.querySelectorAll('.locp').forEach(function(b){b.onclick=function(){useLoc(b.previousElementSibling);};});
  d.querySelector('.same').onclick=function(){var prev=d.previousElementSibling;var src=prev?prev.querySelector('input[data-f=pickup_address]'):null;var tgt=d.querySelector('input[data-f=pickup_address]');if(src&&src.value){tgt.value=src.value;tgt.dataset.coords=src.dataset.coords||'';syncGo();}};
  flagPhone(d.querySelector('input[data-f=receiver_phone]'));
  ins.forEach(function(i){i.addEventListener('input',syncGo);});
  syncGo();
}
function payMethod(){var r=document.querySelector('input[name=pay]:checked');return r?r.value:'now';}
function doBook(){
  var b=el('go');b.disabled=true;b.textContent='Booking…';
  fetch(api(''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender_name:el('sname').value.trim(),sender_phone:el('sphone').value.trim(),pay_method:payMethod(),deliveries:collect()})})
   .then(function(r){return r.json()}).then(function(j){
     if(j.error){b.disabled=false;b.textContent='Confirm';el('out').innerHTML='<div class="err">Couldn\\'t book: '+j.error+'</div>';return;}
     if(j.mode==='now'&&j.payment_url){el('app').innerHTML='<div class="done"><h2>Redirecting to payment… 💳</h2><p class="muted">Total ₦'+Number(j.total).toLocaleString()+' for '+j.count+' deliveries.</p></div>';location.href=j.payment_url;return;}
     var skipped=(j.errors&&j.errors.length)?' <b>'+j.errors.length+' address(es) couldn\\'t be booked</b> — our team will follow up on those.':'';
     el('app').innerHTML='<div class="done"><h2>All set! 🙌</h2><p class="muted">'+j.booked+' deliveries created — a rider is being assigned to each. The receiver pays their delivery fee in cash when the rider arrives (total ₦'+Number(j.total).toLocaleString()+').'+skipped+'</p><a class="wabtn" href="https://wa.me/2349110218825">Back to WhatsApp →</a></div>';
   }).catch(function(){b.disabled=false;b.textContent='Confirm';alert('Network hiccup — try again.');});
}
function doReview(){
  var b=el('go');b.disabled=true;b.textContent='Pricing…';
  fetch(api('action=quote'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveries:collect()})})
   .then(function(r){return r.json()}).then(function(j){
     b.disabled=false;
     if(!j.ok||!j.count){b.textContent='Review \\u0026 book';el('out').innerHTML='<div class="err">Couldn\\'t price these — check the addresses (pick a suggestion from the list).</div>';return;}
     quoted=j;
     var rows=(j.priced||[]).map(function(r){return '<div class="rr"><span>'+r.receiver_name+' — '+String(r.delivery_address).split(',')[0]+'</span><b>₦'+Number(r.delivery_fee).toLocaleString()+'</b></div>';}).join('');
     var warn=(j.errors&&j.errors.length)?'<div class="err">'+j.errors.length+' row(s) couldn\\'t be priced and were skipped — fix the address & try again.</div>':'';
     var pm=payMethod();
     var oldr=el('review');if(oldr)oldr.remove();
     var div=document.createElement('div');div.className='review';div.id='review';
     div.innerHTML=rows+'<div class="tot"><span>Total ('+j.count+')</span><span>₦'+Number(j.total).toLocaleString()+'</span></div>'+warn;
     el('out').appendChild(div);
     el('go').textContent=pm==='pod'?('Confirm '+j.count+' deliveries — pay on delivery'):('Confirm \\u0026 pay ₦'+Number(j.total).toLocaleString());
   }).catch(function(){b.disabled=false;b.textContent='Review \\u0026 book';alert('Network hiccup — try again.');});
}
el('add').onclick=addDelivery;
['sname','sphone'].forEach(function(id){el(id).addEventListener('input',syncGo);});
flagPhone(el('sphone'));
document.querySelectorAll('input[name=pay]').forEach(function(r){r.addEventListener('change',function(){if(quoted){el('go').textContent=payMethod()==='pod'?('Confirm '+quoted.count+' deliveries — pay on delivery'):('Confirm \\u0026 pay ₦'+Number(quoted.total).toLocaleString());}});});
el('go').onclick=function(){if(quoted)doBook();else doReview();};
if(VALID!=='1'){el('app').innerHTML='<div class="hero"><h1>Link expired</h1><p>Head back to your chat and ask for a new bulk-delivery link.</p></div>';}
else{
  fetch(api('action=prefill')).then(function(r){return r.json()}).then(function(p){if(!p)return;if(p.name)el('sname').value=p.name;if(p.phone)el('sphone').value=p.phone;if(p.pod_allowed){PODOK=true;el('opt-pod').style.display='flex';}syncGo();});
  addDelivery();
}
</script></body></html>`;
app.get('/bulk', (req, res) => { res.type('html').send(withWa(BULK_PAGE)); });
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
  const kind = ({ m: 'map', q: 'quote', w: 'waybill', v: 'vendor', b: 'bulk' }[m[1].toLowerCase()] || m[1].toLowerCase());
  const meta = {
    map:     { title: '📍 Create your delivery',      description: 'Tap to set pickup & drop-off — takes 10 seconds' },
    waybill: { title: '🚚 Get your waybill price',     description: 'Tap to pick the state & weight' },
    quote:   { title: '🌍 Get your shipping estimate', description: 'Tap to pick country, weight & value' },
    vendor:  { title: '🛍️ Send your orders',          description: 'Tap to add your buyers & addresses' },
    bulk:    { title: '📦 Your deliveries',           description: 'Tap to add each pickup & drop-off — pay once' }
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
          body = `${before}\n\n👇 *Tap the link below to create your delivery*\n${pv.url}${after}`;
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
