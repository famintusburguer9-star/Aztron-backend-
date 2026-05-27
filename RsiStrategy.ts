import { LoggerService } from './LoggerService.js';

export class RsiStrategy {
  private log: LoggerService;
  private period: number = 14;
  private overbought: number = 70;
  private oversold: number = 30;

  constructor() {
    this.log = new LoggerService('RsiStrategy');
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;
    const recentPrices = prices.slice(-period - 1);

    for (let i = 1; i < recentPrices.length; i++) {
      const change = recentPrices[i] - recentPrices[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  analyze(symbol: string, currentPrice: number, prices: number[]): any {
    if (prices.length < this.period + 1) {
      return { name: 'RSI', signal: 'HOLD', confidence: 0, reason: 'Dados insuficientes', indicators: { rsi: 50 } };
    }

    const rsi = this.calculateRSI(prices, this.period);
    let signal = 'HOLD';
    let confidence = 0;
    let reason = '';

    if (rsi <= this.oversold) {
      signal = 'BUY';
      confidence = Math.min(95, 60 + (this.oversold - rsi) * 2);
      reason = `RSI oversold (${rsi.toFixed(1)}) → possível reversão alta`;
    } 
    else if (rsi >= this.overbought) {
      signal = 'SELL';
      confidence = Math.min(95, 60 + (rsi - this.overbought) * 2);
      reason = `RSI overbought (${rsi.toFixed(1)}) → possível reversão baixa`;
    }
    else {
      confidence = 0;
      reason = `RSI neutro (${rsi.toFixed(1)})`;
    }

    return {
      name: 'RSI',
      signal,
      confidence,
      reason,
      indicators: { rsi: Number(rsi.toFixed(2)) }
    };
  }
}