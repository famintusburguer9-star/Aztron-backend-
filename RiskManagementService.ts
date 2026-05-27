import { LoggerService } from './LoggerService.js';
import type { EngineSettings, Signal, Trade } from './types.js';

export interface RiskAssessment {
  approved: boolean;
  reason: string;
  quantity: number;
  sl: number;
  tp: number;
  riskAmount: number;
}

export class RiskManagementService {
  private log = new LoggerService('RiskManagementService');
  private MAX_OPEN_TRADES = 3;
  private MAX_DAILY_LOSS_PCT = 5;
  private dailyLoss = 0;

  assess(
    signal: Signal,
    balance: number,
    openTrades: Trade[],
    settings: EngineSettings,
  ): RiskAssessment {
    const deny = (reason: string): RiskAssessment => ({ approved: false, reason, quantity: 0, sl: 0, tp: 0, riskAmount: 0 });

    // 1. Max concurrent trades
    if (openTrades.length >= this.MAX_OPEN_TRADES) {
      return deny(`Max posições abertas (${this.MAX_OPEN_TRADES}) atingido`);
    }

    // 2. Duplicate pair check
    const hasPair = openTrades.some(t => t.pair === signal.pair && t.status === 'OPEN');
    if (hasPair) {
      return deny(`Já existe posição aberta em ${signal.pair}`);
    }

    // 3. Daily loss circuit breaker
    if (this.dailyLoss >= (balance * this.MAX_DAILY_LOSS_PCT) / 100) {
      return deny(`Daily loss limit atingido (${this.MAX_DAILY_LOSS_PCT}%)`);
    }

    // 4. Minimum balance
    if (balance < 100) {
      return deny('Saldo insuficiente (mínimo $100)');
    }

    // 5. Calculate position size (risk-based)
    const riskAmount = (balance * settings.maxRisk) / 100;
    const slPct = settings.slDistance / 100;
    const tpPct = settings.tpDistance / 100;

    const price = signal.price;
    const sl = signal.type === 'BUY'
      ? price * (1 - slPct)
      : price * (1 + slPct);
    const tp = signal.type === 'BUY'
      ? price * (1 + tpPct)
      : price * (1 - tpPct);

    const slDistance = Math.abs(price - sl);
    const quantity = slDistance > 0 ? riskAmount / slDistance : 0;

    if (quantity <= 0 || quantity * price < 10) {
      return deny('Position size muito pequena');
    }

    // 6. Use ATR-based SL override if ATR is significant
    const atrSl = signal.type === 'BUY'
      ? price - signal.atr * 1.5
      : price + signal.atr * 1.5;
    const atrTp = signal.type === 'BUY'
      ? price + signal.atr * 3
      : price - signal.atr * 3;

    const finalSl = signal.atr > 0 ? atrSl : sl;
    const finalTp = signal.atr > 0 ? atrTp : tp;

    this.log.info('Risk assessment approved', {
      pair: signal.pair,
      quantity: quantity.toFixed(4),
      sl: finalSl.toFixed(2),
      tp: finalTp.toFixed(2),
      riskAmount: riskAmount.toFixed(2),
    });

    return { approved: true, reason: 'OK', quantity: parseFloat(quantity.toFixed(4)), sl: finalSl, tp: finalTp, riskAmount };
  }

  recordLoss(amount: number): void {
    if (amount < 0) this.dailyLoss += Math.abs(amount);
  }

  resetDailyLoss(): void {
    this.dailyLoss = 0;
    this.log.info('Daily loss counter reset');
  }

  setMaxOpenTrades(n: number): void {
    this.MAX_OPEN_TRADES = n;
  }
}
