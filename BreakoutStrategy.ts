import { LoggerService } from './LoggerService.js';

export class BreakoutStrategy {
  private log: LoggerService;
  private lookback: number = 24; // 24 horas
  private minVolume: number = 1.5; // 1.5x volume médio

  constructor() {
    this.log = new LoggerService('BreakoutStrategy');
  }

  analyze(symbol: string, currentPrice: number, prices: number[]): any {
    if (prices.length < this.lookback + 5) {
      return { 
        name: 'BREAKOUT', 
        signal: 'HOLD', 
        confidence: 0, 
        reason: 'Dados insuficientes', 
        indicators: { high24h: 0, low24h: 0, volumeRatio: 0 } 
      };
    }

    const recentPrices = prices.slice(-this.lookback);
    const high24h = Math.max(...recentPrices);
    const low24h = Math.min(...recentPrices);
    
    // Calcula volume médio (mock por enquanto)
    const avgVolume = 100;
    const currentVolume = Math.random() * 200;
    const volumeRatio = currentVolume / avgVolume;

    let signal = 'HOLD';
    let confidence = 0;
    let reason = '';

    // Breakout de alta: preço acima da máxima 24h com volume alto
    if (currentPrice > high24h && volumeRatio >= this.minVolume) {
      signal = 'BUY';
      confidence = Math.min(85, 55 + (volumeRatio - 1) * 20);
      reason = `Breakout alta (${currentPrice.toFixed(0)} > ${high24h.toFixed(0)}) com volume ${volumeRatio.toFixed(1)}x`;
    }
    // Breakout de baixa: preço abaixo da mínima 24h com volume alto
    else if (currentPrice < low24h && volumeRatio >= this.minVolume) {
      signal = 'SELL';
      confidence = Math.min(85, 55 + (volumeRatio - 1) * 20);
      reason = `Breakout baixa (${currentPrice.toFixed(0)} < ${low24h.toFixed(0)}) com volume ${volumeRatio.toFixed(1)}x`;
    }
    else {
      confidence = 0;
      reason = `Sem breakout (24h range: ${high24h.toFixed(0)} - ${low24h.toFixed(0)})`;
    }

    return {
      name: 'BREAKOUT',
      signal,
      confidence,
      reason,
      indicators: {
        high24h: Number(high24h.toFixed(2)),
        low24h: Number(low24h.toFixed(2)),
        volumeRatio: Number(volumeRatio.toFixed(2))
      }
    };
  }
}