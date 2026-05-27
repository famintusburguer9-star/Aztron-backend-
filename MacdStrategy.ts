import { LoggerService } from './LoggerService.js';

export class MacdStrategy {
  private log: LoggerService;
  private fastPeriod: number = 12;
  private slowPeriod: number = 26;
  private signalPeriod: number = 9;

  constructor() {
    this.log = new LoggerService('MacdStrategy');
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  analyze(symbol: string, currentPrice: number, prices: number[]): any {
    if (prices.length < this.slowPeriod + this.signalPeriod) {
      return { 
        name: 'MACD', 
        signal: 'HOLD', 
        confidence: 0, 
        reason: 'Dados insuficientes', 
        indicators: { macd: 0, signal: 0, histogram: 0 } 
      };
    }

    const emaFast = this.calculateEMA(prices, this.fastPeriod);
    const emaSlow = this.calculateEMA(prices, this.slowPeriod);
    const macdLine = emaFast - emaSlow;

    // Calcula histórico do MACD para a linha de sinal
    const macdHistory: number[] = [];
    for (let i = this.slowPeriod; i < prices.length; i++) {
      const fast = this.calculateEMA(prices.slice(0, i + 1), this.fastPeriod);
      const slow = this.calculateEMA(prices.slice(0, i + 1), this.slowPeriod);
      macdHistory.push(fast - slow);
    }

    const signalLine = macdHistory.slice(-this.signalPeriod).reduce((a, b) => a + b, 0) / this.signalPeriod;
    const histogram = macdLine - signalLine;
    const prevHistogram = macdHistory.length > 1 ? (macdHistory[macdHistory.length - 2] - signalLine) : 0;

    let signal = 'HOLD';
    let confidence = 0;
    let reason = '';

    // Cruzamento de alta: histograma vira positivo
    if (histogram > 0 && prevHistogram <= 0) {
      signal = 'BUY';
      confidence = Math.min(90, 65 + Math.abs(histogram) * 50);
      reason = `MACD cruzou positivo (${histogram.toFixed(4)})`;
    }
    // Cruzamento de baixa: histograma vira negativo
    else if (histogram < 0 && prevHistogram >= 0) {
      signal = 'SELL';
      confidence = Math.min(90, 65 + Math.abs(histogram) * 50);
      reason = `MACD cruzou negativo (${histogram.toFixed(4)})`;
    }
    else {
      confidence = 0;
      reason = `MACD neutro (${histogram.toFixed(4)})`;
    }

    return {
      name: 'MACD',
      signal,
      confidence,
      reason,
      indicators: {
        macd: Number(macdLine.toFixed(4)),
        signal: Number(signalLine.toFixed(4)),
        histogram: Number(histogram.toFixed(4))
      }
    };
  }
}