import { DatabaseService } from './DatabaseService.js';
import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';
import type { Portfolio, Position } from './types.js';

export class PortfolioService {
  private log = new LoggerService('PortfolioService');
  private db: DatabaseService;
  private market: MarketDataService;
  private paperBalance = 10000;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseService, market: MarketDataService) {
    this.db = db;
    this.market = market;
  }

  start(): void {
    // Snapshot portfolio value every 5 minutes
    this.snapshotTimer = setInterval(() => {
      const p = this.get();
      this.db.addPortfolioSnapshot(p.totalValue);
    }, 5 * 60 * 1000);
  }

  stop(): void {
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
  }

  get(realBalance?: number): Portfolio {
    const balance = realBalance ?? this.paperBalance;
    const openTrades = this.db.getOpenTrades();
    const positions: Position[] = [];
    let unrealizedPnl = 0;

    for (const trade of openTrades) {
      const ticker = this.market.getTicker(trade.pair);
      const currentPrice = ticker?.price ?? trade.entryPrice;
      const pnl = trade.side === 'BUY'
        ? (currentPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - currentPrice) * trade.quantity;
      const pnlPercent = trade.side === 'BUY'
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      unrealizedPnl += pnl;
      positions.push({
        pair: trade.pair,
        side: trade.side,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        currentPrice,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPercent.toFixed(2)),
        sl: trade.sl,
        tp: trade.tp,
      });
    }

    const realizedPnl = this.db.getRealizedPnl();
    const totalValue = balance + realizedPnl + unrealizedPnl;

    return {
      totalValue: parseFloat(totalValue.toFixed(2)),
      availableBalance: parseFloat((balance - positions.length * 200).toFixed(2)), // approx
      unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
      realizedPnl: parseFloat(realizedPnl.toFixed(2)),
      positions,
    };
  }

  updatePaperBalance(amount: number): void {
    this.paperBalance += amount;
  }

  getHistory(): number[] {
    return this.db.getPortfolioHistory();
  }
}
