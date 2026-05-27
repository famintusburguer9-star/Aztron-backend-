import { LoggerService } from './LoggerService.js';
import { exchangeAdapter } from './ExchangeAdapterService.js';
import { EventBus } from '../../src/services/EventBus.js';
import { RsiStrategy } from './RsiStrategy.js';
import { MacdStrategy } from './MacdStrategy.js';
import { BreakoutStrategy } from './BreakoutStrategy.js';

export class MultiStrategyService {
  private log: LoggerService;
  private strategies: any[] = [];
  private priceHistory: Map<string, number[]> = new Map();
  private symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  private running: boolean = false;
  private intervalId: any = null;

  constructor() {
    this.log = new LoggerService('MultiStrategyService');
    this.strategies = [
      new RsiStrategy(),
      new MacdStrategy(),
      new BreakoutStrategy()
    ];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.info('Multi-Strategy Service started');
    this.intervalId = setInterval(() => this.analyzeAll(), 10000);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.log.info('Multi-Strategy Service stopped');
  }

  private analyzeAll(): void {
    for (const symbol of this.symbols) {
      const currentPrice = exchangeAdapter.getCurrentPrice(symbol);
      if (currentPrice <= 0) continue;

      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
      }
      const history = this.priceHistory.get(symbol)!;
      history.push(currentPrice);
      if (history.length > 100) history.shift();

      const results: any[] = [];

      for (const strategy of this.strategies) {
        try {
          const result = strategy.analyze(symbol, currentPrice, history);
          if (result && result.confidence >= 50) {
            results.push(result);
            this.log.debug(`[${result.name}] ${result.signal} (${result.confidence}%)`);
          }
        } catch (err) {
          this.log.error(`Strategy ${strategy.constructor.name} failed`, err);
        }
      }

      if (results.length > 0) {
        const best = results.reduce((prev, curr) => 
          curr.confidence > prev.confidence ? curr : prev
        );

        if (best.signal !== 'HOLD') {
          this.log.info(`🏆 BEST SIGNAL: ${best.name} | ${best.signal} ${symbol} | ${best.confidence}% - ${best.reason}`);
          
          // Emite o sinal no eventBus
          aztronBus.emit('strategy:signal', {
            type: best.signal,
            symbol: symbol,
            price: currentPrice,
            confidence: best.confidence,
            reason: `${best.name}: ${best.reason}`,
            timestamp: Date.now()
          });
        }
      }
    }
  }
}

export const multiStrategyService = new MultiStrategyService();
export const aztronBus = new AztronEventBus();