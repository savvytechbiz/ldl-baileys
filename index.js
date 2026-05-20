const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const Groq = require('groq-sdk');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// CORS - allow all origins
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
const AUTH_FOLDER = './auth_info';

let sock = null;
let currentQR = null;
          let connectionStatus = 'disconnected';
let connectedPhone = null;
let isConnecting = false;
let contacts = {};
let aiReplyCounts = {};

let settings = {
      ai_enabled: true,
      ai_reply_cap: 50,
      ai_delay_seconds: 2,
      sales_prompt: 'You are a helpful customer service assistant for Lasalu Drop Logistics (LDL). Be friendly, professional, and helpful.',
      routing_prompt: '',
      verification_prompt: ''
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
                        model: 'llama3-8b-8192',
                        max_tokens: 500,
                        temperature: 0.7
              });
              return completion.choices[0]?.message?.content || null;
      } catch (err) {
              console.error('AI reply error:', err.message);
              return null;
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
          if (!fs.existsSync(AUTH_FOLDER)) {
                    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
          }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

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
                                     const statusCode = lastDisconnect?.error instanceof Boom
                                       ? lastDisconnect.error.output.statusCode
                                                   : null;
                                     const loggedOut = statusCode === DisconnectReason.loggedOut;

                    connectionStatus = 'disconnected';
                                     connectedPhone = null;
                                     currentQR = null;
                                     isConnecting = false;

                    console.log('Connection closed. Status code:', statusCode, 'Logged out:', loggedOut);

                    if (loggedOut) {
                                  console.log('Logged out - clearing auth and waiting for manual reconnect');
                                  if (fs.existsSync(AUTH_FOLDER)) {
                                                  fs.rmSync(AUTH_FOLDER, { recursive: true });
                                  }
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
    if (msg.key.fromMe) continue;

    const phoneNumber = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    // NEW: Send message to your app via webhook
    try {
      const response = await fetch('https://lasalu-chat-flow.base44.app/api/functions/receiveMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer 53eb9215ee354bd38d017cfa7cbc574c`
        },
        body: JSON.stringify({
          from: phoneNumber,
          contact_name: msg.pushName || phoneNumber,
          message: text,
          timestamp: msg.messageTimestamp,
          is_group: msg.key.remoteJid?.endsWith('@g.us') || false
        })
      });
      console.log('Message webhook response:', await response.json());
    } catch (error) {
      console.error('Failed to send message to app:', error.message);
    }
  }
});

                    if (!text) continue;

                    console.log('Message from', phoneNumber + ':', text);

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
                                  const delayMs = (settings.ai_delay_seconds || 2) * 1000;
                                  setTimeout(async () => {
                                                  try {
                                                                    const aiReply = await getAIReply(text, phoneNumber);
                                                                    if (aiReply && sock) {
                                                                                        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
                                                                                        aiReplyCounts[phoneNumber] = (aiReplyCounts[phoneNumber] || 0) + 1;
                                                                                        contacts[phoneNumber].messages.push({
                                                                                                              id: Date.now().toString(),
                                                                                                              content: aiReply,
                                                                                                              direction: 'sent',
                                                                                                              timestamp: new Date().toISOString(),
                                                                                                              is_ai_reply: true
                                                                                            });
                                                                                        console.log('AI replied to', phoneNumber);
                                                                    }
                                                  } catch (e) {
                                                                    console.error('Error sending AI reply:', e.message);
                                                  }
                                  }, delayMs);
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

// Status endpoint
app.get('/status', (req, res) => {
      res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

// QR endpoint
app.get('/qr', (req, res) => {
      if (connectionStatus === 'connected') {
              return res.json({ status: 'already_connected', phone: connectedPhone });
      }
      if (!currentQR) {
              return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
      }
      res.json({ status: 'qr_ready', qr: currentQR });
});

// Connect endpoint
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

// Aliases for Base44 compatibility
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
              if (sock) { try { await sock.logout(); } catch {} }
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

// Disconnect
app.post('/disconnect', async (req, res) => {
      try {
              if (sock) { try { await sock.logout(); } catch {} }
              sock = null;
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

// Session clear
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
              setTimeout(connectWhatsApp, 2000);
              res.json({ status: 'cleared', message: 'Auth cleared, reconnecting fresh...' });
      } catch (err) {
              res.status(500).json({ error: err.message });
      }
});

// Session reset
app.get('/session/reset', async (req, res) => {
      try {
              if (sock) { try { await sock.logout(); } catch {} }
              sock = null;
              isConnecting = false;
              connectionStatus = 'disconnected';
              currentQR = null;
              if (fs.existsSync(AUTH_FOLDER)) {
                        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
              }
              setTimeout(connectWhatsApp, 2000);
              res.json({ status: 'reset', message: 'Session reset, reconnecting...' });
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

// Contacts
app.get('/contacts', (req, res) => {
      const list = Object.entries(contacts).map(([phone, data]) => ({
              phone,
              name: data.name || phone,
              last_message: data.last_message || '',
              last_message_date: data.last_message_date || '',
              ai_enabled: data.ai_enabled !== false,
              message_count: data.messages?.length || 0
      }));
      res.json({ contacts: list });
});

app.get('/contacts/:phone/messages', (req, res) => {
      const { phone } = req.params;
      const contact = contacts[phone];
      if (!contact) return res.json({ messages: [] });
      res.json({ messages: contact.messages || [] });
});

app.post('/contacts/:phone/toggle-ai', (req, res) => {
      const { phone } = req.params;
      if (!contacts[phone]) contacts[phone] = { name: phone, messages: [], ai_enabled: true };
      contacts[phone].ai_enabled = !contacts[phone].ai_enabled;
      res.json({ phone, ai_enabled: contacts[phone].ai_enabled });
});

// Settings
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
      console.log('Auto-starting WhatsApp connection...');
      setTimeout(connectWhatsApp, 3000);
});
