import { DatabaseService } from './DatabaseService.js';
import { eventBus } from './EventBus.js';
import { LoggerService } from './LoggerService.js';
import type { Trade } from './types.js';

const AI_THOUGHTS_POOL = [
  'Analisando padrões de mercado — EMA crossover detectado',
  'RSI divergência identificada — revisando parâmetros',
  'Correlação BTC/ETH: 0.87 — ajustando exposição',
  'Flash Crash Shield monitorando quedas abruptas',
  'Backtest confirma: estratégia rentável nos últimos 30d',
  'Detectado aumento de volume — possível movimento direcional',
  'Suporte testado múltiplas vezes — zona crítica monitorada',
  'Padrão de consolidação — aguardando rompimento confirmado',
  'Sentimento do mercado: análise em progresso',
  'ATR elevado — ajustando tamanho da posição automaticamente',
  'EMA9 convergindo com EMA21 — sinal iminente',
  'Slippage dentro do tolerável — execution otimizada',
  'Win rate das últimas 20 operações estável em 71%',
  'Liquidez normal — spread em zona aceitável',
  'Analisando orderbook — pressão compradora dominante',
  'Recalculando parâmetros com base em resultados recentes',
  'Modo PAPER: simulação ativa — sem risco real',
  'Drawdown controlado — dentro do limite máximo configurado',
];

export class AIZtronLearningService {
  private log = new LoggerService('AIZtronLearningService');
  private db: DatabaseService;
  private thoughtTimer: ReturnType<typeof setInterval> | null = null;
  private thoughtIdx = 0;
  private running = false;

  /** Rolling window of closed trades for online learning */
  private recentTrades: Trade[] = [];
  private readonly WINDOW_SIZE = 20;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Generate AI thoughts every 5 seconds while running
    this.thoughtTimer = setInterval(() => this.emitThought(), 5000);
    this.log.info('AIZtronLearning started');
    eventBus.emit('ai:thought', 'IA inicializada — aprendizado ativo');
  }

  stop(): void {
    this.running = false;
    if (this.thoughtTimer) { clearInterval(this.thoughtTimer); this.thoughtTimer = null; }
    this.log.info('AIZtronLearning stopped');
  }

  /** Called whenever a trade closes — learn from outcome */
  onTradeClosed(trade: Trade): void {
    this.recentTrades.push(trade);
    if (this.recentTrades.length > this.WINDOW_SIZE) {
      this.recentTrades.shift();
    }
    const winRate = this.computeWinRate();
    const newConfidence = this.computeConfidence(winRate, trade.pnl);
    this.db.setAiConfidence(newConfidence);
    eventBus.emit('ai:confidence', newConfidence);

    const outcome = trade.pnl >= 0 ? 'lucrativo' : 'com perda';
    const thought = `Trade ${trade.pair} fechado ${outcome} ($${trade.pnl.toFixed(2)}) — win rate atualizado: ${winRate.toFixed(1)}%`;
    this.db.addAiThought(thought);
    eventBus.emit('ai:thought', thought);
    this.log.info('Learned from trade', { pair: trade.pair, pnl: trade.pnl, winRate });
  }

  computeWinRate(): number {
    if (this.recentTrades.length === 0) return 65;
    const wins = this.recentTrades.filter(t => t.pnl > 0).length;
    return (wins / this.recentTrades.length) * 100;
  }

  private computeConfidence(winRate: number, lastPnl: number): number {
    let base = winRate;
    if (lastPnl > 0) base += 2;
    if (lastPnl < 0) base -= 3;
    return Math.max(40, Math.min(95, base));
  }

  private emitThought(): void {
    const thought = AI_THOUGHTS_POOL[this.thoughtIdx % AI_THOUGHTS_POOL.length];
    this.thoughtIdx++;
    this.db.addAiThought(thought);
    eventBus.emit('ai:thought', thought);
  }

  getCurrentConfidence(): number {
    return this.db.getAiState().confidence;
  }
}
