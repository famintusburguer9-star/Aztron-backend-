import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';
import { SignalService } from './SignalService.js';
import { TradeExecutorService } from './TradeExecutorService.js';
import { FlashCrashShieldService } from './FlashCrashShieldService.js';
import { AccountManagerService } from './AccountManagerService.js';
import { DatabaseService } from './DatabaseService.js';
import type { EngineSettings, Ticker } from './types.js';

const TICK_INTERVAL = 2000; // Evaluate every 2 seconds

export class MarketMultiplexerService {
  private log = new LoggerService('MarketMultiplexer');
  private market: MarketDataService;
  private signals: SignalService;
  private executor: TradeExecutorService;
  private shield: FlashCrashShieldService;
  private account: AccountManagerService;
  private db: DatabaseService;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    market: MarketDataService,
    signals: SignalService,
    executor: TradeExecutorService,
    shield: FlashCrashShieldService,
    account: AccountManagerService,
    db: DatabaseService,
  ) {
    this.market = market;
    this.signals = signals;
    this.executor = executor;
    this.shield = shield;
    this.account = account;
    this.db = db;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Listen for real-time ticker updates for flash crash shield
    eventBus.on('ticker:update', (ticker: Ticker) => {
      this.shield.onTicker(ticker);
      this.checkOpenTrades(ticker);
    });

    // Engine evaluation tick
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
    this.log.info('MarketMultiplexer started — monitoring all pairs');
  }

  stop(): void {
    this.running = false;
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    this.log.info('MarketMultiplexer stopped');
  }

  private async tick(): Promise<void> {
    const settings = this.db.getSettings();
    if (!settings.running || this.shield.isActive()) return;

    try {
      const balance = await this.account.getBalance();

      // Evaluate signals for all active pairs
      const newSignals = this.signals.evaluateAll(settings);

      // Execute signals that pass risk management
      for (const signal of newSignals) {
        await this.executor.execute(signal, balance, settings);
      }
    } catch (err) {
      this.log.error('Tick error', { err: String(err) });
    }
  }

  private async checkOpenTrades(ticker: Ticker): Promise<void> {
    const openTrades = this.db.getOpenTrades().filter(t => t.pair === ticker.symbol);
    for (const trade of openTrades) {
      await this.executor.checkAndClose(trade, ticker.price);
    }
  }
}
