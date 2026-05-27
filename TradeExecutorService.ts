import { DatabaseService } from './DatabaseService.js';
import { eventBus } from './EventBus.js';
import { ExchangeAdapterService } from './ExchangeAdapterService.js';
import { LoggerService } from './LoggerService.js';
import { RiskManagementService } from './RiskManagementService.js';
import type { EngineSettings, Signal, Trade } from './types.js';

export class TradeExecutorService {
  private log = new LoggerService('TradeExecutorService');
  private adapter: ExchangeAdapterService;
  private risk: RiskManagementService;
  private db: DatabaseService;

  constructor(
    adapter: ExchangeAdapterService,
    risk: RiskManagementService,
    db: DatabaseService,
  ) {
    this.adapter = adapter;
    this.risk = risk;
    this.db = db;
  }

  async execute(signal: Signal, balance: number, settings: EngineSettings): Promise<Trade | null> {
    const openTrades = this.db.getOpenTrades();
    const assessment = this.risk.assess(signal, balance, openTrades, settings);

    if (!assessment.approved) {
      this.log.warn('Trade rejected by risk manager', { reason: assessment.reason, pair: signal.pair });
      return null;
    }

    let orderId: string | undefined;

    if (settings.mode === 'LIVE' && this.adapter.hasCredentials) {
      this.log.info('Executing LIVE order', { pair: signal.pair, side: signal.type, qty: assessment.quantity });
      const result = await this.adapter.placeMarketOrder({
        symbol: signal.pair,
        side: signal.type === 'BUY' ? 'Buy' : 'Sell',
        qty: assessment.quantity.toString(),
        stopLoss: assessment.sl.toFixed(2),
        takeProfit: assessment.tp.toFixed(2),
      });
      if (result.error) {
        this.log.error('Order placement failed', { error: result.error, pair: signal.pair });
        this.db.addAlert('CRITICAL', `Falha ao executar ordem em ${signal.pair}: ${result.error}`);
        return null;
      }
      orderId = result.orderId ?? undefined;
      this.log.info('LIVE order placed', { orderId, pair: signal.pair });
    } else {
      this.log.info('PAPER trade executed', { pair: signal.pair, side: signal.type });
    }

    const trade = this.db.addTrade({
      pair: signal.pair,
      side: signal.type,
      status: 'OPEN',
      entryPrice: signal.price,
      quantity: assessment.quantity,
      pnl: 0,
      pnlPercent: 0,
      confidence: signal.confidence,
      strategy: 'EMA Crossover',
      exchange: settings.exchange,
      sl: assessment.sl,
      tp: assessment.tp,
      orderId,
      timestamp: new Date().toISOString(),
    });

    eventBus.emit('trade:open', trade);
    this.db.addAlert('INFO', `Trade aberto: ${signal.type} ${signal.pair} @ $${signal.price.toLocaleString()}`);
    this.log.info('Trade opened', { id: trade.id, pair: trade.pair, side: trade.side });
    return trade;
  }

  async checkAndClose(trade: Trade, currentPrice: number): Promise<boolean> {
    const shouldClose = this.shouldClose(trade, currentPrice);
    if (!shouldClose) return false;

    const pnlRaw = trade.side === 'BUY'
      ? (currentPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - currentPrice) * trade.quantity;
    const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'BUY' ? 1 : -1);

    if (trade.status === 'OPEN' && this.adapter.hasCredentials && this.db.getSettings().mode === 'LIVE') {
      const closeSide = trade.side === 'BUY' ? 'Buy' : 'Sell';
      await this.adapter.closePosition(trade.pair, closeSide, trade.quantity.toString());
    }

    const closed = this.db.updateTrade(trade.id, {
      status: 'CLOSED',
      exitPrice: currentPrice,
      pnl: parseFloat(pnlRaw.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      closedAt: new Date().toISOString(),
    });

    if (closed) {
      this.risk.recordLoss(pnlRaw);
      this.db.addRealizedPnl(pnlRaw);
      eventBus.emit('trade:close', closed);
      const verb = pnlRaw >= 0 ? 'ganhou' : 'perdeu';
      this.db.addAlert(
        pnlRaw >= 0 ? 'INFO' : 'WARNING',
        `Trade fechado: ${trade.pair} — ${verb} $${Math.abs(pnlRaw).toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
      );
      this.log.info('Trade closed', { id: trade.id, pnl: pnlRaw.toFixed(2) });
      return true;
    }
    return false;
  }

  private shouldClose(trade: Trade, price: number): boolean {
    if (trade.side === 'BUY') {
      if (price <= trade.sl) { this.log.info('Stop-loss hit', { pair: trade.pair, sl: trade.sl, price }); return true; }
      if (price >= trade.tp) { this.log.info('Take-profit hit', { pair: trade.pair, tp: trade.tp, price }); return true; }
    } else {
      if (price >= trade.sl) { this.log.info('Stop-loss hit (short)', { pair: trade.pair, sl: trade.sl, price }); return true; }
      if (price <= trade.tp) { this.log.info('Take-profit hit (short)', { pair: trade.pair, tp: trade.tp, price }); return true; }
    }
    return false;
  }

  async closeAllPositions(reason: string): Promise<void> {
    const open = this.db.getOpenTrades();
    this.log.warn('Closing all positions', { reason, count: open.length });
    for (const trade of open) {
      const ticker = { price: trade.entryPrice }; // fallback
      await this.checkAndClose({ ...trade, sl: -Infinity, tp: Infinity } as any, trade.entryPrice);
      this.db.updateTrade(trade.id, { status: 'CLOSED', closedAt: new Date().toISOString() });
    }
    if (open.length > 0) {
      this.db.addAlert('CRITICAL', `${open.length} posições fechadas: ${reason}`);
    }
  }
}
