import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import type { Candle, OhlcvApiResponse } from './types.js';

const BYBIT_REST = 'https://api.bybit.com';
const BYBIT_WS_LINEAR = 'wss://stream.bybit.com/v5/public/linear';
const PING_INTERVAL = 20_000;
const RECONNECT_DELAY = 5_000;

type WsTickerMsg = {
  topic: string;
  type: string;
  data: {
    symbol: string;
    lastPrice: string;
    bid1Price: string;
    ask1Price: string;
    volume24h: string;
    price24hPcnt: string;
  };
  ts: number;
};

interface TickerData {
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume: number;
}

export class ExchangeAdapterService {
  private log: LoggerService;
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pairs: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  private running = false;
  private apiKey: string;
  private apiSecret: string;
  readonly hasCredentials: boolean;
  readonly rawTickers: Map<string, TickerData> = new Map();

  constructor() {
    this.log = new LoggerService('ExchangeAdapterService');
    this.apiKey = process.env['BYBIT_API_KEY'] ?? '';
    this.apiSecret = process.env['BYBIT_API_SECRET'] ?? '';
    this.hasCredentials = Boolean(this.apiKey && this.apiSecret);
    this.log.info('ExchangeAdapterService initialized');
  }

  setPairs(pairs: string[]): void {
    this.pairs = pairs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.info('Starting Bybit WebSocket connection');
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.log.info('Disconnected from Bybit');
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(BYBIT_WS_LINEAR);

      this.ws.on('open', () => {
        this.log.info('Bybit WebSocket connected');
        this.subscribe();
        this.startPing();
        eventBus.emit('ai:thought', 'Conectado ao Bybit WebSocket — dados ao vivo ativos');
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const text = raw.toString();
          const msg = JSON.parse(text) as Partial<WsTickerMsg>;

          if (msg.topic?.startsWith('tickers.') && msg.data) {
            const d = msg.data;
            const bid = parseFloat(d.bid1Price) || 0;
            const ask = parseFloat(d.ask1Price) || 0;
            const lastPrice = parseFloat(d.lastPrice);
            const price = (Number.isFinite(lastPrice) && lastPrice > 0)
              ? lastPrice
              : (bid > 0 && ask > 0) ? (bid + ask) / 2 : (bid || ask);

            if (price <= 0) return;

            const volume = parseFloat(d.volume24h) || 0;
            const change24h = (parseFloat(d.price24hPcnt) || 0) * 100;
            const prev = this.rawTickers.get(d.symbol);

            this.rawTickers.set(d.symbol, {
              price,
              bid: bid || price,
              ask: ask || price,
              change24h: Number.isFinite(change24h) ? change24h : (prev?.change24h ?? 0),
              volume: volume || (prev?.volume ?? 0),
            });

            eventBus.emit('price:update', { symbol: d.symbol, price });
          }
        } catch (err) {
          // Silently ignore malformed messages
        }
      });

      this.ws.on('error', (err) => {
        this.log.error('WebSocket error', { err: String(err) });
      });

      this.ws.on('close', () => {
        this.log.warn('Bybit WebSocket closed — scheduling reconnect');
        this.clearTimers();
        if (this.running) {
          this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY);
        }
      });
    } catch (err) {
      this.log.error('Failed to connect', { err: String(err) });
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY);
      }
    }
  }

  private subscribe(): void {
    const args = this.pairs.map(p => `tickers.${p}`);
    this.ws?.send(JSON.stringify({ op: 'subscribe', args }));
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, PING_INTERVAL);
  }

  private clearTimers(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getCurrentPrice(symbol: string): number {
    const ticker = this.rawTickers.get(symbol);
    return ticker?.price ?? 0;
  }

  getAllPrices(): Map<string, number> {
    const prices = new Map<string, number>();
    for (const [symbol, ticker] of this.rawTickers.entries()) {
      prices.set(symbol, ticker.price);
    }
    return prices;
  }

  /** Gera candles baseados no preço do WebSocket (sem chamar REST) */
  async getKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    this.log.debug(`Generating ${limit} candles for ${symbol} from WebSocket price`);
    return this.generateCandlesFromWebSocket(symbol, limit);
  }

  /** Gera candles realistas baseados no preço atual do WebSocket */
  private generateCandlesFromWebSocket(symbol: string, limit: number): Candle[] {
    const currentPrice = this.getCurrentPrice(symbol);
    const basePrice = currentPrice > 0 ? currentPrice : 95000;
    const now = Date.now();
    const candles: Candle[] = [];
    let price = basePrice;

    for (let i = 0; i < limit; i++) {
      const variation = price * (Math.random() - 0.5) * 0.0005;
      const close = price + variation;
      candles.push({
        timestamp: now - (limit - i) * 60000,
        open: price,
        high: Math.max(price, close) + price * 0.001,
        low: Math.min(price, close) - price * 0.001,
        close: close,
        volume: Math.random() * 100 + 50
      });
      price = close;
    }
    return candles;
  }

  /** Place a market order (LIVE mode only) */
  async placeMarketOrder(params: {
    symbol: string;
    side: 'Buy' | 'Sell';
    qty: string;
    stopLoss?: string;
    takeProfit?: string;
  }): Promise<{ orderId: string | null; error: string | null }> {
    if (!this.hasCredentials) {
      return { orderId: null, error: 'No API credentials — PAPER mode only' };
    }
    const endpoint = '/v5/order/create';
    const body = JSON.stringify({
      category: 'spot',
      symbol: params.symbol,
      side: params.side,
      orderType: 'Market',
      qty: params.qty,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      timeInForce: 'IOC',
    });
    try {
      const timestamp = Date.now().toString();
      const signature = this.sign(timestamp, body);
      const res = await fetch(`${BYBIT_REST}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': this.apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': '5000',
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json() as { retCode: number; result?: { orderId: string }; retMsg?: string };
      if (json.retCode === 0 && json.result?.orderId) {
        return { orderId: json.result.orderId, error: null };
      }
      return { orderId: null, error: json.retMsg ?? 'Unknown error' };
    } catch (err) {
      return { orderId: null, error: String(err) };
    }
  }

  /** Close a position (market close) */
  async closePosition(symbol: string, side: 'Buy' | 'Sell', qty: string): Promise<boolean> {
    const closeSide = side === 'Buy' ? 'Sell' : 'Buy';
    const result = await this.placeMarketOrder({ symbol, side: closeSide, qty });
    return result.orderId !== null;
  }

  /** Get account balance (LIVE mode) */
  async getBalance(): Promise<number> {
    if (!this.hasCredentials) return 10000;
    const endpoint = '/v5/account/wallet-balance?accountType=UNIFIED&coin=USDT';
    const timestamp = Date.now().toString();
    const signature = this.sign(timestamp, `accountType=UNIFIED&coin=USDT`);
    try {
      const res = await fetch(`${BYBIT_REST}${endpoint}`, {
        headers: {
          'X-BAPI-API-KEY': this.apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': '5000',
        },
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json() as any;
      const equity = parseFloat(json?.result?.list?.[0]?.totalEquity ?? '0');
      return equity;
    } catch {
      return 0;
    }
  }

  private sign(timestamp: string, payload: string): string {
    const prehash = `${timestamp}${this.apiKey}5000${payload}`;
    return crypto.createHmac('sha256', this.apiSecret).update(prehash).digest('hex');
  }
}

export const exchangeAdapter = new ExchangeAdapterService();