import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';

export interface SpreadAnalysis {
  symbol: string;
  current: number;
  avg24h: number;
  status: 'NORMAL' | 'WIDE' | 'VERY_WIDE';
  favorable: boolean;
  message: string;
}

export class SpreadAnalyzerService {
  private log = new LoggerService('SpreadAnalyzerService');
  private market: MarketDataService;
  private spreadHistory = new Map<string, number[]>();
  private WIDE_THRESHOLD = 0.05; // 0.05%
  private VERY_WIDE_THRESHOLD = 0.15;

  constructor(market: MarketDataService) {
    this.market = market;
  }

  analyze(symbol: string): SpreadAnalysis {
    const ticker = this.market.getTicker(symbol);
    if (!ticker) {
      return { symbol, current: 0, avg24h: 0, status: 'NORMAL', favorable: true, message: 'Dados indisponíveis' };
    }

    const currentSpread = ticker.spread;
    const history = this.spreadHistory.get(symbol) ?? [];
    history.push(currentSpread);
    if (history.length > 288) history.shift(); // 24h at 5-min samples
    this.spreadHistory.set(symbol, history);

    const avg24h = history.length > 0
      ? history.reduce((a, b) => a + b, 0) / history.length
      : currentSpread;

    let status: SpreadAnalysis['status'];
    let message: string;
    if (currentSpread >= this.VERY_WIDE_THRESHOLD) {
      status = 'VERY_WIDE';
      message = `Spread muito alto (${currentSpread.toFixed(3)}%) — evitar entrada`;
    } else if (currentSpread >= this.WIDE_THRESHOLD) {
      status = 'WIDE';
      message = `Spread acima da média (${currentSpread.toFixed(3)}%) — cautela`;
    } else {
      status = 'NORMAL';
      message = `Spread normal (${currentSpread.toFixed(3)}%) — condições favoráveis`;
    }

    return {
      symbol,
      current: parseFloat(currentSpread.toFixed(4)),
      avg24h: parseFloat(avg24h.toFixed(4)),
      status,
      favorable: status === 'NORMAL',
      message,
    };
  }
}
