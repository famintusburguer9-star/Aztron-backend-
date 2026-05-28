const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Versão simplificada (sem Orchestrator)
let engineRunning = false;
let currentMode = 'PAPER';
let currentExchange = 'BYBIT';

// ========== ROTAS DA API ==========

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/status', (req, res) => {
  res.json({
    isRunning: engineRunning,
    mode: currentMode,
    exchange: currentExchange,
    config: { mode: currentMode, exchange: currentExchange }
  });
});

app.post('/api/aztron/start', (req, res) => {
  engineRunning = true;
  console.log('Engine started');
  res.json({ success: true, message: 'Engine started' });
});

app.post('/api/aztron/stop', (req, res) => {
  engineRunning = false;
  console.log('Engine stopped');
  res.json({ success: true, message: 'Engine stopped' });
});

app.post('/api/aztron/mode', (req, res) => {
  const { mode } = req.body;
  if (mode === 'PAPER' || mode === 'LIVE') {
    currentMode = mode;
    res.json({ success: true, mode });
  } else {
    res.status(400).json({ success: false, error: 'Invalid mode' });
  }
});

app.get('/api/trades', (req, res) => {
  res.json({ trades: [] });
});

app.get('/api/portfolio', (req, res) => {
  res.json({ totalValueInUsdt: 1000, usdtBalance: 1000, assetBalance: 0 });
});

app.get('/api/prices', (req, res) => {
  res.json({ BTCUSDT: 95000, ETHUSDT: 3500, BNBUSDT: 650 });
});

app.get('/api/alerts', (req, res) => {
  res.json({ alerts: [] });
});

// WebSocket
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.send(JSON.stringify({ type: 'connected' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AZTRON Backend running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
});
