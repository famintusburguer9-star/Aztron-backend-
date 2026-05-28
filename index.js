const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Importar o Orchestrator (que vai inicializar todos os serviços)
const { Orchestrator } = require('./Orchestrator');

// Inicializar o Orchestrator
const orchestrator = new Orchestrator(wss);
orchestrator.start();

// ========== ROTAS DA API ==========

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Status do sistema
app.get('/api/status', (req, res) => {
  res.json(orchestrator.getStatus());
});

// Iniciar o motor
app.post('/api/aztron/start', (req, res) => {
  orchestrator.startEngine();
  res.json({ success: true, message: 'Engine started' });
});

// Parar o motor
app.post('/api/aztron/stop', (req, res) => {
  orchestrator.stopEngine();
  res.json({ success: true, message: 'Engine stopped' });
});

// Mudar modo (PAPER/LIVE)
app.post('/api/aztron/mode', (req, res) => {
  const { mode } = req.body;
  orchestrator.setMode(mode);
  res.json({ success: true, mode });
});

// Mudar exchange (BINANCE/BYBIT)
app.post('/api/aztron/exchange', (req, res) => {
  const { exchange } = req.body;
  orchestrator.setExchange(exchange);
  res.json({ success: true, exchange });
});

// Listar trades
app.get('/api/trades', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const trades = await orchestrator.db.getTrades(limit);
  res.json({ trades: trades.data || [] });
});

// Listar sinais
app.get('/api/signals', (req, res) => {
  const signals = orchestrator.signal.getRecentSignals();
  res.json({ signals });
});

// Estatísticas do portfólio
app.get('/api/portfolio', (req, res) => {
  const portfolio = orchestrator.portfolio.getBalance();
  res.json(portfolio);
});

// Preços atuais
app.get('/api/prices', (req, res) => {
  const prices = orchestrator.adapter.getAllPrices();
  res.json(Object.fromEntries(prices));
});

// Alertas
app.get('/api/alerts', async (req, res) => {
  const alerts = await orchestrator.db.getUnresolvedAlerts();
  res.json({ alerts: alerts.data || [] });
});

// Resolver alerta
app.post('/api/alerts/:id/resolve', async (req, res) => {
  const id = parseInt(req.params.id);
  await orchestrator.db.resolveAlert(id);
  res.json({ success: true });
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.send(JSON.stringify({ type: 'connected' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AZTRON Backend running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
});
