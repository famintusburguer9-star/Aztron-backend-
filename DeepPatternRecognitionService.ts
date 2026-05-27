import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';
import type { Candle, ChartPattern } from './types.js';

export class DeepPatternRecognitionService {
  private log = new LoggerService('DeepPatternRecognitionService');
  private market: MarketDataService;

  constructor(market: MarketDataService) {
    this.market = market;
  }

  analyze(symbol: string): ChartPattern[] {
    const candles = this.market.getKlines(symbol);
    if (candles.length < 10) return [];

    const patterns: ChartPattern[] = [];

    const doji = this.detectDoji(candles);
    if (doji) patterns.push(doji);

    const engulfing = this.detectEngulfing(candles);
    if (engulfing) patterns.push(engulfing);

    const doubleTop = this.detectDoubleTop(candles);
    if (doubleTop) patterns.push(doubleTop);

    const hammer = this.detectHammer(candles);
    if (hammer) patterns.push(hammer);

    const breakout = this.detectBreakout(candles);
    if (breakout) patterns.push(breakout);

    return patterns;
  }

  private detectDoji(candles: Candle[]): ChartPattern | null {
    const last = candles[candles.length - 1];
    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;
    if (range === 0) return null;
    if (body / range < 0.1) {
      return {
        type: 'Doji',
        direction: 'NEUTRAL',
        confidence: 60,
        description: 'Doji detectado — indecisão no mercado',
      };
    }
    return null;
  }

  private detectEngulfing(candles: Candle[]): ChartPattern | null {
    if (candles.length < 2) return null;
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];
    const prevBearish = prev.close < prev.open;
    const currBullish = curr.close > curr.open;
    if (prevBearish && currBullish && curr.open < prev.close && curr.close > prev.open) {
      return {
        type: 'Bullish Engulfing',
        direction: 'BULLISH',
        confidence: 75,
        description: 'Engulfing bullish — possível reversão de alta',
      };
    }
    const prevBullish = prev.close > prev.open;
    const currBearish = curr.close < curr.open;
    if (prevBullish && currBearish && curr.open > prev.close && curr.close < prev.open) {
      return {
        type: 'Bearish Engulfing',
        direction: 'BEARISH',
        confidence: 75,
        description: 'Engulfing bearish — possível reversão de baixa',
      };
    }
    return null;
  }

  private detectDoubleTop(candles: Candle[]): ChartPattern | null {
    if (candles.length < 20) return null;
    const slice = candles.slice(-20);
    const highs = slice.map(c => c.high);
    const maxHigh = Math.max(...highs);
    const maxIdx = highs.indexOf(maxHigh);

    // Look for second peak near the first
    const rest = highs.slice(maxIdx + 3);
    const secondMax = Math.max(...rest);
    const tolerance = maxHigh * 0.005; // 0.5% tolerance

    if (Math.abs(secondMax - maxHigh) < tolerance && rest.length >= 3) {
      return {
        type: 'Double Top',
        direction: 'BEARISH',
        confidence: 70,
        description: `Topo duplo identificado em ~$${maxHigh.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      };
    }
    return null;
  }

  private detectHammer(candles: Candle[]): ChartPattern | null {
    const last = candles[candles.length - 1];
    const body = Math.abs(last.close - last.open);
    const lowerShadow = Math.min(last.open, last.close) - last.low;
    const upperShadow = last.high - Math.max(last.open, last.close);
    if (lowerShadow >= body * 2 && upperShadow < body * 0.3) {
      return {
        type: 'Hammer',
        direction: 'BULLISH',
        confidence: 68,
        description: 'Hammer detectado — rejeição na zona de suporte',
      };
    }
    return null;
  }

  private detectBreakout(candles: Candle[]): ChartPattern | null {
    if (candles.length < 20) return null;
    const prev = candles.slice(-20, -1);
    const resistance = Math.max(...prev.map(c => c.high));
    const support = Math.min(...prev.map(c => c.low));
    const last = candles[candles.length - 1];

    if (last.close > resistance * 1.005) {
      return {
        type: 'Breakout Alta',
        direction: 'BULLISH',
        confidence: 80,
        description: `Rompimento de resistência em $${resistance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      };
    }
    if (last.close < support * 0.995) {
      return {
        type: 'Breakout Baixa',
        direction: 'BEARISH',
        confidence: 80,
        description: `Rompimento de suporte em $${support.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      };
    }
    return null;
  }
}
