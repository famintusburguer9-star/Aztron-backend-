import { LoggerService } from './LoggerService.js';
import { MarketDataService } from './MarketDataService.js';

export interface SlippageEstimate {
  symbol: string;
  estimatedPct: number;
  category: 'LOW' | 'MODERATE' | 'HIGH';
  advisory: string;
}

export class SlippageEstimatorService {
  private log = new LoggerService('SlippageEstimatorService');
  private market: MarketDataService;
  private history = new Map<string, number[]>(); // symbol → historical slippage samples

  constructor(market: MarketDataService) {
    this.market = market;
  }

  estimate(symbol: string, quantityUSDT: number): SlippageEstimate {
    const ticker = this.market.getTicker(symbol);
    if (!ticker) {
      return { symbol, estimatedPct: 0.05, category: 'MODERATE', advisory: 'Dados indisponíveis — usando estimativa padrão' };
    }

    const spread = ticker.spread; // already in %
    // Impact based on order size relative to daily volume
    const volumeUSDT = ticker.volume24h;
    const sizeImpact = volumeUSDT > 0 ? (quantityUSDT / volumeUSDT) * 100 : 0;

    // Estimated slippage = half spread + market impact
    const estimated = spread / 2 + sizeImpact * 0.1;

    const samples = this.history.get(symbol) ?? [];
    samples.push(estimated);
    if (samples.length > 20) samples.shift();
    this.history.set(symbol, samples);

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    let category: 'LOW' | 'MODERATE' | 'HIGH';
    let advisory: string;
    if (avg < 0.02) {
      category = 'LOW';
      advisory = 'Slippage baixo — execução eficiente esperada';
    } else if (avg < 0.08) {
      category = 'MODERATE';
      advisory = 'Slippage moderado — dentro do aceitável';
    } else {
      category = 'HIGH';
      advisory = 'Slippage alto — considere ordens limite';
    }

    return {
      symbol,
      estimatedPct: parseFloat(avg.toFixed(4)),
      category,
      advisory,
    };
  }

  recordActual(symbol: string, actualSlippagePct: number): void {
    const samples = this.history.get(symbol) ?? [];
    samples.push(actualSlippagePct);
    if (samples.length > 50) samples.shift();
    this.history.set(symbol, samples);
    this.log.debug('Actual slippage recorded', { symbol, actualSlippagePct });
  }
}
