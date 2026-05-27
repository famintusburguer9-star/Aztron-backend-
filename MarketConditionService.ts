import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';
import { computeRsi, computeAtr } from './StrategyService.js';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';

export interface MarketCondition {
  regime: MarketRegime;
  volatility: number;
  trend: number; // -100 to +100
  tradingFavorable: boolean;
  reason: string;
}

export class MarketConditionService {
  private log = new LoggerService('MarketConditionService');
  private market: MarketDataService;

  constructor(market: MarketDataService) {
    this.market = market;
  }

  analyze(symbol: string): MarketCondition {
    const candles = this.market.getKlines(symbol);
    if (candles.length < 20) {
      return { regime: 'UNKNOWN', volatility: 0, trend: 0, tradingFavorable: true, reason: 'Dados insuficientes' };
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const rsi = computeRsi(closes, 14);
    const atr = computeAtr(highs, lows, closes, 14);
    const currentPrice = closes[closes.length - 1];
    const atrPct = (atr / currentPrice) * 100;

    // Trend via linear regression slope
    const slope = linearSlope(closes.slice(-20));
    const trend = Math.max(-100, Math.min(100, slope * 1000));

    // Volatility classification
    const volatility = atrPct;

    let regime: MarketRegime;
    let reason: string;
    let tradingFavorable = true;

    if (atrPct > 2.5) {
      regime = 'VOLATILE';
      reason = `Alta volatilidade: ATR ${atrPct.toFixed(2)}%`;
      tradingFavorable = false;
    } else if (Math.abs(trend) > 30) {
      regime = trend > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
      reason = `Tendência ${trend > 0 ? 'alta' : 'baixa'} clara`;
    } else {
      regime = 'RANGING';
      reason = `Mercado lateral — RSI ${rsi.toFixed(1)}`;
      tradingFavorable = rsi < 40 || rsi > 60; // Trade bounces at extremes
    }

    return { regime, volatility, trend, tradingFavorable, reason };
  }
}

function linearSlope(data: number[]): number {
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (data[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den / yMean; // Normalized slope
}
