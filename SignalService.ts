import { DatabaseService } from './DatabaseService.js';
import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';
import { StrategyService } from './StrategyService.js';
import type { EngineSettings, Signal } from './types.js';

export class SignalService {
  private log = new LoggerService('SignalService');
  private strategy: StrategyService;
  private market: MarketDataService;
  private db: DatabaseService;
  private lastSignalTime = new Map<string, number>();
  private MIN_SIGNAL_INTERVAL = 300_000; // 5 min cooldown per pair

  constructor(strategy: StrategyService, market: MarketDataService, db: DatabaseService) {
    this.strategy = strategy;
    this.market = market;
    this.db = db;
  }

  /**
   * Evaluate all active pairs and generate signals if conditions are met.
   * Called on every engine tick.
   */
  evaluateAll(settings: EngineSettings): Signal[] {
    const generated: Signal[] = [];

    for (const pair of settings.pairs) {
      const signal = this.evaluate(pair, settings);
      if (signal) generated.push(signal);
    }

    return generated;
  }

  evaluate(pair: string, settings: EngineSettings): Signal | null {
    // Enforce cooldown
    const now = Date.now();
    const last = this.lastSignalTime.get(pair) ?? 0;
    if (now - last < this.MIN_SIGNAL_INTERVAL) return null;

    const ticker = this.market.getTicker(pair);
    if (!ticker) return null;

    const result = this.strategy.analyze(pair, settings);
    if (!result) return null;

    // Filter by minimum confidence
    if (result.confidence < settings.minConfidence) {
      this.log.debug('Signal below confidence threshold', { pair, confidence: result.confidence, min: settings.minConfidence });
      return null;
    }

    const signal = this.db.addSignal({
      pair,
      type: result.type,
      price: ticker.price,
      confidence: result.confidence,
      reason: result.reason,
      ema9: result.ema9,
      ema21: result.ema21,
      rsi: result.rsi,
      macd: result.macd,
      atr: result.atr,
      acted: false,
      timestamp: new Date().toISOString(),
    });

    this.lastSignalTime.set(pair, now);
    eventBus.emit('signal:new', signal);
    this.log.info('Signal generated', { pair, type: result.type, confidence: result.confidence });

    return signal;
  }

  setMinInterval(ms: number): void {
    this.MIN_SIGNAL_INTERVAL = ms;
  }
}
