import { DatabaseService } from './DatabaseService.js';
import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import { AIZtronLearningService } from './AIZtronLearningService.js';
import type { EngineSettings } from './types.js';

const OPTIMIZE_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MIN_TRADES_FOR_OPTIMIZATION = 5;

export class AIZtronOptimizerService {
  private log = new LoggerService('AIZtronOptimizerService');
  private db: DatabaseService;
  private learning: AIZtronLearningService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(db: DatabaseService, learning: AIZtronLearningService) {
    this.db = db;
    this.learning = learning;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.optimize(), OPTIMIZE_INTERVAL);
    this.log.info('AIZtronOptimizer started — cycle every 10 min');
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async optimize(): Promise<void> {
    const trades = this.db.getTrades().filter(t => t.status === 'CLOSED');
    if (trades.length < MIN_TRADES_FOR_OPTIMIZATION) {
      this.log.debug('Not enough trades to optimize', { count: trades.length });
      return;
    }

    const winRate = this.learning.computeWinRate();
    const settings = this.db.getSettings();
    const adjustments: string[] = [];
    const paramPatch: Partial<EngineSettings> = {};

    // Adjust EMA periods based on win rate trend
    if (winRate < 55) {
      // Widen EMA periods for stronger signals
      const newEma9 = Math.min(settings.ema9Period + 1, 15);
      const newEma21 = Math.min(settings.ema21Period + 2, 30);
      paramPatch.ema9Period = newEma9;
      paramPatch.ema21Period = newEma21;
      adjustments.push(`EMA período ajustado ${settings.ema9Period}→${newEma9}, ${settings.ema21Period}→${newEma21}`);
    } else if (winRate > 75) {
      // Tighten for more signals
      const newEma9 = Math.max(settings.ema9Period - 1, 5);
      paramPatch.ema9Period = newEma9;
      adjustments.push(`EMA9 ajustado para ${newEma9} (win rate elevado)`);
    }

    // Adjust SL/TP based on average win/loss ratio
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    if (losers.length > 0 && winners.length > 0) {
      const avgWin = winners.reduce((s, t) => s + t.pnl, 0) / winners.length;
      const avgLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0) / losers.length);
      const rr = avgWin / avgLoss;
      if (rr < 1.5 && settings.tpDistance < 5) {
        const newTp = +(settings.tpDistance + 0.5).toFixed(1);
        paramPatch.tpDistance = newTp;
        adjustments.push(`TP aumentado para ${newTp}% (R:R = ${rr.toFixed(2)})`);
      }
    }

    // Adjust confidence threshold
    if (winRate < 55 && settings.minConfidence < 80) {
      paramPatch.minConfidence = settings.minConfidence + 5;
      adjustments.push(`Confiança mínima aumentada para ${paramPatch.minConfidence}%`);
    }

    if (adjustments.length === 0) {
      this.log.info('Optimization complete — no changes needed', { winRate: winRate.toFixed(1) });
      return;
    }

    // Apply the parameter changes
    this.db.updateSettings(paramPatch);

    // Record optimization
    this.db.addOptimizationEntry({
      winRate: parseFloat(winRate.toFixed(1)),
      adjustments: adjustments.join('; '),
      parameters: paramPatch,
      timestamp: new Date().toISOString(),
    });

    const thought = `IA v${this.db.getAiState().version} deployada — ${adjustments[0]}`;
    this.db.addAiThought(thought);
    eventBus.emit('ai:thought', thought);
    this.db.addAlert('INFO', `AI Optimizer: parâmetros atualizados — ${adjustments.join(', ')}`);
    this.log.info('Optimization applied', { adjustments, winRate: winRate.toFixed(1) });
  }

  /** Force an immediate optimization cycle (e.g., after deploy) */
  async forceOptimize(): Promise<void> {
    return this.optimize();
  }
}
