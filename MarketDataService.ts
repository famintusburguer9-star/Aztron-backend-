import { eventBus } from './EventBus.js';
import { ExchangeAdapterService } from './ExchangeAdapterService.js';
import { LoggerService } from './LoggerService.js';
import type { Candle, Ticker } from './types.js';
import { computeEma, computeRsi, computeAtr } from './StrategyService.js';

const UPDATE_INTERVAL = 2000;
const KLINES_REFRESH = 120_000;
const MAX_PRICE_HISTORY = 200;

export class MarketDataService {
  private log = new LoggerService('MarketDataService');
  private adapter: ExchangeAdapterService;
  private tickers = new Map<string, Ticker>();
  private klines = new Map<string, Candle[]>();
  private priceHistory = new Map<string, number[]>(); // for synthetic klines
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private klinesTimer: ReturnType<typeof setInterval> | null = null;
  private pairs: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

  constructor(adapter: ExchangeAdapterService) {
    this.adapter = adapter;
    this.initDefaultTickers();
  }

  private initDefaultTickers(): void {
    const defaults: Record<string, number> = { BTCUSDT: 65240, ETHUSDT: 3418, BNBUSDT: 549.2 };
    for (const [symbol, price] of Object.entries(defaults)) {
      this.tickers.set(symbol, {
        symbol, price, prevPrice: price, bid: price * 0.9999, ask: price * 1.0001,
        spread: 0.02, change24h: 0, volume24h: price * 50000,
        rsi: 50, ema9: price, ema21: price, emaSignal: 'NEUTRAL', atr: price * 0.005,
        timestamp: Date.now(),
      });
    }
  }

  setPairs(pairs: string[]): void {
    this.pairs = pairs;
  }

  start(): void {
    this.fetchKlines();
    this.updateTimer = setInterval(() => this.updateFromAdapter(), UPDATE_INTERVAL);
    this.klinesTimer = setInterval(() => this.fetchKlines(), KLINES_REFRESH);
    this.log.info('MarketDataService started');
  }

  stop(): void {
    if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null; }
    if (this.klinesTimer) { clearInterval(this.klinesTimer); this.klinesTimer = null; }
    this.log.info('MarketDataService stopped');
  }

  private updateFromAdapter(): void {
    for (const symbol of this.pairs) {
      const raw = this.adapter.rawTickers.get(symbol);
      if (!raw || raw.price <= 0) continue;

      // Accumulate price history for synthetic klines
      const hist = this.priceHistory.get(symbol) ?? [];
      hist.push(raw.price);
      if (hist.length > MAX_PRICE_HISTORY) hist.shift();
      this.priceHistory.set(symbol, hist);

      const prev = this.tickers.get(symbol);

      // Use real klines if available, else synthetic from price history
      const candles = this.klines.get(symbol) ?? [];
      const syntheticCloses = hist.length >= 30 && candles.length === 0 ? hist : [];
      const closes = candles.length > 0 ? candles.map(c => c.close) : syntheticCloses;
      const highs = candles.length > 0 ? candles.map(c => c.high) : closes.map((p, i) => p * 1.001);
      const lows = candles.length > 0 ? candles.map(c => c.low) : closes.map((p, i) => p * 0.999);

      // Append the current price as the latest close for indicator calculations
      const closesWithCurrent = [...closes, raw.price];
      const ema9 = closesWithCurrent.length > 9 ? lastOf(computeEma(closesWithCurrent, 9)) : raw.price;
      const ema21 = closesWithCurrent.length > 21 ? lastOf(computeEma(closesWithCurrent, 21)) : raw.price;
      const rsi = closesWithCurrent.length > 14 ? computeRsi(closesWithCurrent, 14) : 50;
      const atr = closes.length > 14 ? computeAtr(highs, lows, closes, 14) : raw.price * 0.005;
      const emaSignal = ema9 > ema21 ? 'UP' as const : ema9 < ema21 ? 'DOWN' as const : 'NEUTRAL' as const;

      const spread = raw.ask > 0 && raw.bid > 0 ? ((raw.ask - raw.bid) / raw.price) * 100 : 0.02;

      const ticker: Ticker = {
        symbol,
        price: raw.price,
        prevPrice: prev?.price ?? raw.price,
        bid: raw.bid,
        ask: raw.ask,
        spread,
        change24h: raw.change24h,
        volume24h: raw.volume,
        rsi,
        ema9,
        ema21,
        emaSignal,
        atr,
        timestamp: Date.now(),
      };
      this.tickers.set(symbol, ticker);
      eventBus.emit('ticker:update', ticker);
    }
  }

  private async fetchKlines(): Promise<void> {
    for (const symbol of this.pairs) {
      const candles = await this.adapter.getKlines(symbol, '15', 100);
      if (candles.length > 0) {
        this.klines.set(symbol, candles);
        this.log.debug('Klines updated', { symbol, count: candles.length });
      } else {
        this.log.debug('Using synthetic klines from price history', { symbol, histLen: this.priceHistory.get(symbol)?.length ?? 0 });
      }
    }
  }

  getTicker(symbol: string): Ticker | undefined {
    return this.tickers.get(symbol);
  }

  getAllTickers(): Ticker[] {
    return Array.from(this.tickers.values());
  }

  getKlines(symbol: string): Candle[] {
    return this.klines.get(symbol) ?? [];
  }
}

function lastOf(arr: number[]): number {
  return arr[arr.length - 1];
}
