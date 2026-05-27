import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import { exchangeAdapter } from './ExchangeAdapterService.js';

interface PricePoint {
  price: number;
  timestamp: number;
}

// ========== FUNÇÕES EXPORTADAS PARA OUTROS SERVIÇOS ==========

export function computeEma(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeRsi(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function computeAtr(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  const recentTrs = trs.slice(-period);
  return recentTrs.reduce((sum, tr) => sum + tr, 0) / period;
}

// ========== STRATEGY SERVICE PRINCIPAL ==========

export class StrategyService {
  private log: LoggerService;
  private priceHistory: Map<string, PricePoint[]> = new Map();
  private ema9: Map<string, number> = new Map();
  private ema21: Map<string, number> = new Map();
  private lastSignal: Map<string, string> = new Map();
  private running: boolean = false;
  private intervalId: any = null;

  constructor() {
    this.log = new LoggerService('StrategyService');
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.info('Strategy Service started');
    this.intervalId = setInterval(() => {
      this.analyze();
    }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.log.info('Strategy Service stopped');
  }

  private analyze(): void {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

    for (const symbol of symbols) {
      const currentPrice = exchangeAdapter.getCurrentPrice(symbol);
      if (currentPrice <= 0) continue;

      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
      }

      const history = this.priceHistory.get(symbol)!;
      history.push({ price: currentPrice, timestamp: Date.now() });

      while (history.length > 50) {
        history.shift();
      }

      if (history.length >= 21) {
        const prices = history.map(p => p.price);
        const ema9Value = computeEma(prices, 9);
        const ema21Value = computeEma(prices, 21);

        this.ema9.set(symbol, ema9Value);
        this.ema21.set(symbol, ema21Value);

        const prevEma9 = this.ema9.get(symbol + '_prev') || ema9Value;
        const prevEma21 = this.ema21.get(symbol + '_prev') || ema21Value;
        const lastSig = this.lastSignal.get(symbol) || '';

        if (ema9Value > ema21Value && prevEma9 <= prevEma21 && lastSig !== 'BUY') {
          this.lastSignal.set(symbol, 'BUY');
          this.log.info(`BUY SIGNAL for ${symbol} at $${currentPrice}`);
          eventBus.emit('strategy:signal', {
            type: 'BUY',
            symbol: symbol,
            price: currentPrice,
            confidence: 0.85,
            reason: 'Golden Cross'
          });
        }
        else if (ema9Value < ema21Value && prevEma9 >= prevEma21 && lastSig !== 'SELL') {
          this.lastSignal.set(symbol, 'SELL');
          this.log.info(`SELL SIGNAL for ${symbol} at $${currentPrice}`);
          eventBus.emit('strategy:signal', {
            type: 'SELL',
            symbol: symbol,
            price: currentPrice,
            confidence: 0.85,
            reason: 'Death Cross'
          });
        }

        this.ema9.set(symbol + '_prev', ema9Value);
        this.ema21.set(symbol + '_prev', ema21Value);
      }
    }
  }

  getIndicators(symbol: string): { ema9: number; ema21: number } {
    return {
      ema9: this.ema9.get(symbol) || 0,
      ema21: this.ema21.get(symbol) || 0
    };
  }
}

export const strategyService = new StrategyService();