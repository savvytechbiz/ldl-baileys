const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const Groq = require('groq-sdk');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const BASE44_WEBHOOK = process.env.BASE44_WEBHOOK_URL || '';
const AUTH_FOLDER = './auth_info';

let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected';
let connectedPhone = null;
let isConnecting = false;
let contacts = {};
let settings = {
  ai_enabled: true,
  ai_reply_cap: 10,
  ai_delay_seconds: 2,
  sales_prompt: `You are a customer service agent for Lasalu Drop Logistics (LDL). 
LDL is a fast and reliable delivery/logistics company in Nigeria. 
Be friendly, professional, and concise. 
When asked about pricing, say rates start from ₦500 for local deliveries. 
Always speak AS the business, never from the customer's perspective.
Keep replies short — max 3 sentences.`,
  routing_prompt: `You handle routing and delivery tracking queries for LDL. 
Help customers with: Where is my package? Delivery timelines? Pickup scheduling?
Be reassuring and helpful. Keep replies short.`,
  verification_prompt: `You handle order confirmation and payment verification for LDL.
Help confirm orders and payments. Ask for order ID if needed. Keep replies short.`
};
let aiReplyCounts = {};

async function getAIReply(incomingMessage, phoneNumber) {
  if (!GROQ_API_KEY) return null;
  try {
    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const systemPrompt = `Business name: Lasalu Drop Logistics (LDL). Business type: Logistics and delivery services in Nigeria.
Always reply as LDL staff to the customer. Never reply from the customer's perspective.
${settings.sales_prompt}`;
    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: incomingMessage }
      ],
      temperature: 0.7,
      max_tokens: 200
    });
    return response.choices[0]?.message?.content || null;
  } catch (err) {
    console.error('Groq error:', err.message);
    return null;
  }
}

async function connectWhatsApp() {
  if (isConnecting) {
    console.log('Already connecting, skipping duplicate call');
    return;
  }
  isConnecting = true;
  connectionStatus = 'connecting';
  currentQR = null;

  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }),
    browser: ['LDL Swift Reply', 'Chrome', '120.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await qrcode.toDataURL(qr);
      connectionStatus = 'qr_ready';
      console.log('QR code generated — waiting for scan');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : null;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      connectionStatus = 'disconnected';
      connectedPhone = null;
      currentQR = null;
      isConnecting = false;
      console.log('Connection closed. Status code:', statusCode, 'Logged out:', loggedOut);

      if (loggedOut || statusCode === 401 || statusCode === 440) {
        console.log('Clearing auth...');
        if (fs.existsSync(AUTH_FOLDER)) {
          fs.rmSync(AUTH_FOLDER, { recursive: true });
        }
      }

      if (!loggedOut) {
        setTimeout(connectWhatsApp, 3000);
      }
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      currentQR = null;
      isConnecting = false;
      connectedPhone = sock.user?.id?.split(':')[0] || null;
      console.log('WhatsApp connected! Phone:', connectedPhone);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const from = msg.key.remoteJid;
      if (!from || from.endsWith('@g.us')) continue;

      const phoneNumber = from.replace('@s.whatsapp.net', '');
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';
      if (!text) continue;

      console.log(`📩 Message from ${phoneNumber}: ${text}`);

      if (!contacts[phoneNumber]) {
        contacts[phoneNumber] = { name: phoneNumber, messages: [], ai_enabled: true };
      }
      contacts[phoneNumber].messages.push({
        id: Date.now().toString(),
        content: text,
        direction: 'received',
        timestamp: new Date().toISOString(),
        is_ai_reply: false
      });
      contacts[phoneNumber].last_message = text;
      contacts[phoneNumber].last_message_date = new Date().toISOString();

      const contactAiEnabled = contacts[phoneNumber].ai_enabled !== false;
      const globalAiEnabled = settings.ai_enabled;
      const replyCount = aiReplyCounts[phoneNumber] || 0;
      const underCap = replyCount < settings.ai_reply_cap;

      if (globalAiEnabled && contactAiEnabled && underCap) {
        await new Promise(r => setTimeout(r, settings.ai_delay_seconds * 1000));
        const aiReply = await getAIReply(text, phoneNumber);
        if (aiReply) {
          await sock.sendMessage(from, { text: aiReply });
          aiReplyCounts[phoneNumber] = replyCount + 1;
          contacts[phoneNumber].messages.push({
            id: Date.now().toString(),
            content: aiReply,
            direction: 'sent',
            timestamp: new Date().toISOString(),
            is_ai_reply: true
          });
          console.log(`🤖 AI replied to ${phoneNumber}: ${aiReply}`);
        }
      }
    }
  });
}

app.get('/', (req, res) => {
  res.json({ message: 'LDL Baileys WhatsApp Service is running!', status: 'online', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', connection: connectionStatus, phone: connectedPhone });
});

app.get('/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

app.get('/qr', (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'already_connected', phone: connectedPhone });
  }
  if (!currentQR) {
    return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
  }
  res.json({ status: 'qr_ready', qr: currentQR });
});

// FIX: was calling initializeWhatsApp() which doesn't exist
app.get('/session/reset', async (req, res) => {
  try {
    if (sock) {
      try { await sock.logout(); } catch(e) {}
      sock = null;
    }
    isConnecting = false;
    connectionStatus = 'disconnected';
    currentQR = null;
    connectedPhone = null;
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true });
    }
    setTimeout(() => connectWhatsApp(), 2000);
    res.json({ success: true, message: 'Session cleared, reinitializing...' });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.post('/session/start', async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'already_connected', phone: connectedPhone });
  }
  connectWhatsApp();
  res.json({ status: 'starting', message: 'Connection initiated, fetch /qr for QR code' });
});

app.post('/session/disconnect', async (req, res) => {
  try {
    if (sock) await sock.logout();
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    isConnecting = false;
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true });
    }
    res.json({ status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/session/clear', async (req, res) => {
  try {
    if (sock) { try { await sock.logout(); } catch {} }
    sock = null;
    isConnecting = false;
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true });
    }
    setTimeout(connectWhatsApp, 1000);
    res.json({ status: 'cleared', message: 'Auth cleared, reconnecting fresh...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  if (connectionStatus !== 'connected') return res.status(400).json({ error: 'WhatsApp not connected' });
  try {
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    if (!contacts[phone]) contacts[phone] = { name: phone, messages: [], ai_enabled: true };
    contacts[phone].messages.push({
      id: Date.now().toString(),
      content: message,
      direction: 'sent',
      timestamp: new Date().toISOString(),
      is_ai_reply: false
    });
    res.json({ status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/contacts', (req, res) => {
  const result = Object.entries(contacts).map(([phone, data]) => ({
    phone,
    name: data.name || phone,
    last_message: data.last_message || '',
    last_message_date: data.last_message_date || null,
    total_messages: data.messages?.length || 0,
    ai_replies_count: aiReplyCounts[phone] || 0,
    ai_enabled: data.ai_enabled !== false
  }));
  res.json(result);
});

app.get('/contacts/:phone/messages', (req, res) => {
  const { phone } = req.params;
  const contact = contacts[phone];
  if (!contact) return res.json([]);
  res.json(contact.messages || []);
});

app.post('/contacts/:phone/toggle-ai', (req, res) => {
  const { phone } = req.params;
  if (!contacts[phone]) contacts[phone] = { name: phone, messages: [], ai_enabled: true };
  contacts[phone].ai_enabled = !contacts[phone].ai_enabled;
  res.json({ phone, ai_enabled: contacts[phone].ai_enabled });
});

app.post('/settings', (req, res) => {
  const { ai_enabled, ai_reply_cap, ai_delay_seconds, sales_prompt, routing_prompt, verification_prompt } = req.body;
  if (ai_enabled !== undefined) settings.ai_enabled = ai_enabled;
  if (ai_reply_cap !== undefined) settings.ai_reply_cap = ai_reply_cap;
  if (ai_delay_seconds !== undefined) settings.ai_delay_seconds = ai_delay_seconds;
  if (sales_prompt) settings.sales_prompt = sales_prompt;
  if (routing_prompt) settings.routing_prompt = routing_prompt;
  if (verification_prompt) settings.verification_prompt = verification_prompt;
  res.json({ status: 'saved', settings });
});

app.get('/settings', (req, res) => {
  res.json(settings);
});

app.post('/test-ai', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const reply = await getAIReply(message, 'test');
  res.json({ reply });
});

app.listen(PORT, async () => {
  console.log(`🚀 LDL Baileys Service running on port ${PORT}`);
  await connectWhatsApp();
});
