import { LoggerService } from './LoggerService.js';
import { exchangeAdapter } from './ExchangeAdapterService.js';
import { eventBus } from '../core/EventBus.js';

interface StrategyConfig {
  emaShort: number;
  emaLong: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
}

interface BacktestResult {
  config: StrategyConfig;
  winRate: number;
  totalTrades: number;
  profitLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  score: number;
}

export class BacktestAIService {
  private log: LoggerService;
  private running: boolean = false;
  private bestConfig: StrategyConfig | null = null;
  private bestScore: number = 0;

  constructor() {
    this.log = new LoggerService('BacktestAIService');
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.info('Backtest AI Service started');
    this.runOptimization();
  }

  stop(): void {
    this.running = false;
    this.log.info('Backtest AI Service stopped');
  }

  private async runOptimization(): Promise<void> {
    this.log.info('Starting parameter optimization...');

    // Gera todas as combinações de parâmetros
    const combinations = this.generateCombinations();
    this.log.info(`Testing ${combinations.length} combinations...`);

    let bestResult: BacktestResult | null = null;

    // Testa cada combinação (em lotes para não travar)
    for (let i = 0; i < combinations.length; i++) {
      const config = combinations[i];
      const result = await this.simulateConfig(config);

      if (result.score > this.bestScore) {
        this.bestScore = result.score;
        this.bestConfig = config;
        bestResult = result;
        this.log.info(`🎯 New best config! Score: ${result.score.toFixed(2)} | WinRate: ${result.winRate.toFixed(1)}% | P&L: $${result.profitLoss.toFixed(2)}`);

        // Emite evento para o frontend
        eventBus.emit('ai:optimization:progress', {
          current: i + 1,
          total: combinations.length,
          bestScore: this.bestScore,
          bestConfig: this.bestConfig
        });
      }

      // Mostra progresso a cada 10%
      if ((i + 1) % Math.ceil(combinations.length / 10) === 0) {
        this.log.info(`Progress: ${Math.round((i + 1) / combinations.length * 100)}%`);
      }
    }

    if (bestResult) {
      this.log.info(`✅ OPTIMIZATION COMPLETE! Best config: EMA ${bestResult.config.emaShort}/${bestResult.config.emaLong} | RSI ${bestResult.config.rsiPeriod} | SL ${bestResult.config.stopLossPercent}%`);
      eventBus.emit('ai:optimization:complete', {
        bestConfig: this.bestConfig,
        bestScore: this.bestScore,
        result: bestResult
      });
    }
  }

  private generateCombinations(): StrategyConfig[] {
    const combinations: StrategyConfig[] = [];

    const emaShortOptions = [5, 7, 9, 10, 12];
    const emaLongOptions = [13, 15, 18, 20, 21, 25];
    const rsiPeriodOptions = [7, 10, 12, 14];
    const rsiOverboughtOptions = [65, 70, 75];
    const rsiOversoldOptions = [25, 30, 35];
    const slOptions = [1, 1.5, 2, 2.5, 3];
    const tpOptions = [2, 3, 4, 5];

    for (const emaShort of emaShortOptions) {
      for (const emaLong of emaLongOptions) {
        if (emaShort >= emaLong) continue;
        for (const rsiPeriod of rsiPeriodOptions) {
          for (const rsiOverbought of rsiOverboughtOptions) {
            for (const rsiOversold of rsiOversoldOptions) {
              if (rsiOversold >= rsiOverbought) continue;
              for (const sl of slOptions) {
                for (const tp of tpOptions) {
                  combinations.push({
                    emaShort,
                    emaLong,
                    rsiPeriod,
                    rsiOverbought,
                    rsiOversold,
                    stopLossPercent: sl,
                    takeProfitPercent: tp
                  });
                }
              }
            }
          }
        }
      }
    }

    return combinations;
  }

  private async simulateConfig(config: StrategyConfig): Promise<BacktestResult> {
    // Simula 100 candles de preço
    const prices = this.generateMockPrices(100);
    let balance = 1000;
    let position = 0;
    let entryPrice = 0;
    let trades = 0;
    let wins = 0;
    let pnlHistory: number[] = [];

    for (let i = 50; i < prices.length; i++) {
      const currentPrice = prices[i];
      const emaShort = this.calculateEMA(prices.slice(0, i + 1), config.emaShort);
      const emaLong = this.calculateEMA(prices.slice(0, i + 1), config.emaLong);
      const rsi = this.calculateRSI(prices.slice(0, i + 1), config.rsiPeriod);

      // Estratégia combinada: EMA crossover + RSI
      const emaSignal = emaShort > emaLong ? 'BUY' : (emaShort < emaLong ? 'SELL' : 'HOLD');
      const rsiSignal = rsi <= config.rsiOversold ? 'BUY' : (rsi >= config.rsiOverbought ? 'SELL' : 'HOLD');

      if (position === 0 && emaSignal === 'BUY' && rsiSignal === 'BUY') {
        // Compra
        position = balance * 0.1 / currentPrice;
        entryPrice = currentPrice;
        balance -= position * currentPrice;
      } 
      else if (position > 0) {
        const profitPercent = (currentPrice - entryPrice) / entryPrice * 100;
        const stopHit = profitPercent <= -config.stopLossPercent;
        const targetHit = profitPercent >= config.takeProfitPercent;

        if (stopHit || targetHit || emaSignal === 'SELL') {
          const revenue = position * currentPrice;
          const profit = revenue - (position * entryPrice);
          balance += revenue;
          trades++;
          if (profit > 0) wins++;
          pnlHistory.push(profit);
          position = 0;
        }
      }
    }

    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const totalProfitLoss = balance - 1000;
    const avgProfit = pnlHistory.length > 0 ? pnlHistory.reduce((a,b) => a+b, 0) / pnlHistory.length : 0;
    const variance = pnlHistory.map(p => Math.pow(p - avgProfit, 2)).reduce((a,b) => a+b, 0) / (pnlHistory.length || 1);
    const sharpeRatio = avgProfit / (Math.sqrt(variance) || 1);

    // Score: winRate (40%) + profitLoss (30%) + sharpe (20%) + maxDrawdown (10%)
    const profitScore = Math.min(100, Math.max(0, totalProfitLoss / 10));
    const sharpeScore = Math.min(100, sharpeRatio * 20);
    const score = (winRate * 0.4) + (profitScore * 0.3) + (sharpeScore * 0.2) + (50 * 0.1);

    return {
      config,
      winRate,
      totalTrades: trades,
      profitLoss: totalProfitLoss,
      sharpeRatio,
      maxDrawdown: 0,
      score
    };
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

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  private generateMockPrices(count: number): number[] {
    const prices = [95000];
    for (let i = 1; i < count; i++) {
      const change = prices[i-1] * (Math.random() - 0.5) * 0.01;
      prices.push(prices[i-1] + change);
    }
    return prices;
  }

  getBestConfig(): StrategyConfig | null {
    return this.bestConfig;
  }
}

export const backtestAIService = new BacktestAIService();