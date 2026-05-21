const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const PORT = process.env.PORT || 3000;
const AUTH_FOLDER = './auth_info';
const BASE44_APP_URL = process.env.BASE44_APP_URL || 'https://lasalu-chat-flow.base44.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected';
let connectedPhone = null;
let isConnecting = false;

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
          console.log('Logged out - clearing auth, waiting for manual reconnect');
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
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

        if (!text) continue;

        console.log('Message from', phoneNumber + ':', text);

        try {
          const payload = {
            from: phoneNumber,
            contact_name: msg.pushName || phoneNumber,
            message: text,
            timestamp: msg.messageTimestamp,
            is_group: msg.key.remoteJid?.endsWith('@g.us') || false,
            secret: WEBHOOK_SECRET
          };

          console.log('Sending to Base44:', `${BASE44_APP_URL}/api/functions/receiveMessage`);

          const response = await fetch(`${BASE44_APP_URL}/api/functions/receiveMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await response.json();
          console.log('Webhook response:', response.status, result);

          if (!response.ok) {
            console.error('Webhook failed:', response.status, result);
          }
        } catch (error) {
          console.error('Failed to send to Base44:', error.message);
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
  res.json({ message: 'LDL Baileys WhatsApp Service is running!', status: 'online', version: '3.0.0' });
});

// Status
app.get('/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

// QR
app.get('/qr', (req, res) => {
  if (connectionStatus === 'connected') return res.json({ status: 'already_connected', phone: connectedPhone });
  if (!currentQR) return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
  res.json({ status: 'qr_ready', qr: currentQR });
});

// Connect
app.post('/connect', async (req, res) => {
  try {
    if (connectionStatus === 'connected') return res.json({ status: 'ok', connection: connectionStatus, phone: connectedPhone });
    if (!isConnecting) connectWhatsApp();
    res.json({ status: 'ok', connection: 'connecting', message: 'Connection started, poll /status for QR' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Session aliases for Base44 compatibility
app.post('/session/start', async (req, res) => {
  try {
    if (connectionStatus === 'connected') return res.json({ status: 'ok', connection: connectionStatus, phone: connectedPhone });
    if (!isConnecting) connectWhatsApp();
    res.json({ status: 'ok', connection: 'connecting', message: 'Connection started, poll /status for QR' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/session/status', (req, res) => {
  res.json({ status: connectionStatus, phone: connectedPhone, qr: currentQR });
});

app.get('/session/qr', (req, res) => {
  if (connectionStatus === 'connected') return res.json({ status: 'already_connected', phone: connectedPhone });
  if (!currentQR) return res.json({ status: 'generating', message: 'QR not ready yet, try again in a few seconds' });
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

app.post('/session/clear', async (req, res) => {
  try {
    if (sock) { try { await sock.logout(); } catch {} }
    sock = null;
    isConnecting = false;
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true });
    setTimeout(connectWhatsApp, 2000);
    res.json({ status: 'cleared', message: 'Auth cleared, reconnecting fresh...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/session/reset', async (req, res) => {
  try {
    if (sock) { try { await sock.logout(); } catch {} }
    sock = null;
    isConnecting = false;
    connectionStatus = 'disconnected';
    currentQR = null;
    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    setTimeout(connectWhatsApp, 2000);
    res.json({ status: 'reset', message: 'Session reset, reconnecting...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    if (sock) { try { await sock.logout(); } catch {} }
    sock = null;
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    isConnecting = false;
    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true });
    res.json({ status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message
app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    if (connectionStatus !== 'connected' || !sock) return res.status(503).json({ error: 'WhatsApp not connected' });
    const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also support /message/send (used by Base44 aiAutoReply)
app.post('/message/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'to and message required' });
    if (connectionStatus !== 'connected' || !sock) return res.status(503).json({ error: 'WhatsApp not connected' });
    const jid = to.includes('@') ? to : to + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log('LDL Baileys Service running on port', PORT);
  console.log('BASE44_APP_URL:', BASE44_APP_URL);
  console.log('WEBHOOK_SECRET:', WEBHOOK_SECRET ? 'SET' : 'NOT SET ⚠️');
  console.log('Auto-starting WhatsApp connection...');
  setTimeout(connectWhatsApp, 3000);
});
