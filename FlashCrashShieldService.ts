import { DatabaseService } from './DatabaseService.js';
import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import { TradeExecutorService } from './TradeExecutorService.js';
import type { FlashCrashEvent, Ticker } from './types.js';

interface PriceWindow {
  price: number;
  ts: number;
}

export class FlashCrashShieldService {
  private log = new LoggerService('FlashCrashShieldService');
  private db: DatabaseService;
  private executor: TradeExecutorService | null = null;
  private priceHistory = new Map<string, PriceWindow[]>();
  private shieldActive = false;
  private shieldTimer: ReturnType<typeof setTimeout> | null = null;

  // Thresholds: drop % within window (ms)
  private THRESHOLDS = [
    { windowMs: 1_000, dropPct: 1.5, label: '1s Drop' },
    { windowMs: 5_000, dropPct: 2.0, label: '5s Drop' },
    { windowMs: 15_000, dropPct: 3.5, label: '15s Drop' },
  ];
  private PAUSE_DURATION_MS = 300_000; // 5 minutes

  constructor(db: DatabaseService) {
    this.db = db;
  }

  setExecutor(executor: TradeExecutorService): void {
    this.executor = executor;
  }

  onTicker(ticker: Ticker): void {
    const sym = ticker.symbol;
    const now = Date.now();

    // Maintain rolling price window
    const history = this.priceHistory.get(sym) ?? [];
    history.push({ price: ticker.price, ts: now });
    // Keep only last 30 seconds
    const pruned = history.filter(p => now - p.ts <= 30_000);
    this.priceHistory.set(sym, pruned);

    if (this.shieldActive) return;

    for (const threshold of this.THRESHOLDS) {
      const windowStart = now - threshold.windowMs;
      const windowPrices = pruned.filter(p => p.ts >= windowStart);
      if (windowPrices.length < 2) continue;

      const windowHigh = Math.max(...windowPrices.map(p => p.price));
      const changePct = ((ticker.price - windowHigh) / windowHigh) * 100;

      if (changePct <= -threshold.dropPct) {
        this.trigger(sym, threshold.label, changePct);
        break;
      }
    }
  }

  private trigger(symbol: string, triggerType: string, changePct: number): void {
    this.shieldActive = true;
    const action = `Pausar trading por ${this.PAUSE_DURATION_MS / 60000} min`;

    this.log.warn('Flash crash detected!', { symbol, triggerType, changePct: changePct.toFixed(2) });

    const event: Omit<FlashCrashEvent, 'id'> = {
      pair: symbol,
      triggerType,
      priceChangePct: parseFloat(changePct.toFixed(2)),
      action,
      timestamp: new Date().toISOString(),
    };

    const saved = this.db.addFlashCrashEvent(event);
    eventBus.emit('flashcrash:detected', saved);
    this.db.addAlert('CRITICAL', `Flash Crash detectado: ${symbol} caiu ${Math.abs(changePct).toFixed(2)}% em ${triggerType} — ${action}`);

    // Close all positions
    this.executor?.closeAllPositions(`Flash Crash em ${symbol} (${triggerType})`);

    // Resume after pause
    this.shieldTimer = setTimeout(() => {
      this.shieldActive = false;
      this.log.info('Flash Crash Shield released — trading resumed');
      this.db.addAlert('INFO', 'Flash Crash Shield liberado — trading retomado');
    }, this.PAUSE_DURATION_MS);
  }

  isActive(): boolean {
    return this.shieldActive;
  }

  stop(): void {
    if (this.shieldTimer) { clearTimeout(this.shieldTimer); this.shieldTimer = null; }
  }
}
