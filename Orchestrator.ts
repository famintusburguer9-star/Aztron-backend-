import { WebSocketServer } from 'ws';
import { multiStrategyService } from '../services/MultiStrategyService.js';
import { backtestAIService } from '../services/BacktestAIService.js';
import { AccountManagerService } from './AccountManagerService.js';
import { AIZtronLearningService } from './AIZtronLearningService.js';
import { AIZtronOptimizerService } from './AIZtronOptimizerService.js';
import { BacktestService } from './BacktestService.js';
import { DatabaseService } from './DatabaseService.js';
import { DeepPatternRecognitionService } from './DeepPatternRecognitionService.js';
import { DeployManagerService } from './DeployManagerService.js';
import { eventBus } from './EventBus.js';
import { ExchangeAdapterService } from './ExchangeAdapterService.js';
import { FlashCrashShieldService } from './FlashCrashShieldService.js';
import { GoalTrackerService } from './GoalTrackerService.js';
import { LoggerService } from './LoggerService.js';
import { MarketConditionService } from './MarketConditionService.js';
import { MarketDataService } from './MarketDataService.js';
import { MarketMultiplexerService } from './MarketMultiplexerService.js';
import { ObservabilityService } from './ObservabilityService.js';
import { PortfolioService } from './PortfolioService.js';
import { RiskManagementService } from './RiskManagementService.js';
import { SandboxRunner } from './SandboxRunner.js';
import { SentimentService } from './SentimentService.js';
import { SignalService } from './SignalService.js';
import { SlippageEstimatorService } from './SlippageEstimatorService.js';
import { SpreadAnalyzerService } from './SpreadAnalyzerService.js';
import { StrategyService } from './StrategyService.js';
import { TradeExecutorService } from './TradeExecutorService.js';

export class Orchestrator {
  private log = new LoggerService('Orchestrator');
  private wss: WebSocketServer;

  // ─── All services ────────────────────────────────────────────────────────
  readonly db: DatabaseService;
  readonly adapter: ExchangeAdapterService;
  readonly market: MarketDataService;
  readonly strategy: StrategyService;
  readonly signal: SignalService;
  readonly risk: RiskManagementService;
  readonly executor: TradeExecutorService;
  readonly shield: FlashCrashShieldService;
  readonly account: AccountManagerService;
  readonly portfolio: PortfolioService;
  readonly learning: AIZtronLearningService;
  readonly optimizer: AIZtronOptimizerService;
  readonly backtest: BacktestService;
  readonly sandbox: SandboxRunner;
  readonly sentiment: SentimentService;
  readonly patterns: DeepPatternRecognitionService;
  readonly slippage: SlippageEstimatorService;
  readonly spread: SpreadAnalyzerService;
  readonly condition: MarketConditionService;
  readonly multiplexer: MarketMultiplexerService;
  readonly observability: ObservabilityService;
  readonly goal: GoalTrackerService;
  readonly deploy: DeployManagerService;
  readonly multiStrategy: typeof multiStrategyService;
  readonly backtestAI: typeof backtestAIService;

  constructor(wss: WebSocketServer) {
    this.wss = wss;

    // ─── Instantiate all services in dependency order ──────────────────────
    this.db = new DatabaseService();
    this.adapter = new ExchangeAdapterService();
    this.market = new MarketDataService(this.adapter);
    this.strategy = new StrategyService(this.market);
    this.risk = new RiskManagementService();
    this.signal = new SignalService(this.strategy, this.market, this.db);
    this.executor = new TradeExecutorService(this.adapter, this.risk, this.db);
    this.shield = new FlashCrashShieldService(this.db);
    this.shield.setExecutor(this.executor);
    this.account = new AccountManagerService(this.adapter, this.db);
    this.portfolio = new PortfolioService(this.db, this.market);
    this.learning = new AIZtronLearningService(this.db);
    this.optimizer = new AIZtronOptimizerService(this.db, this.learning);
    this.backtest = new BacktestService(this.adapter, this.db);
    this.sandbox = new SandboxRunner(this.market, this.strategy, this.risk, this.db);
    this.sentiment = new SentimentService();
    this.patterns = new DeepPatternRecognitionService(this.market);
    this.slippage = new SlippageEstimatorService(this.market);
    this.spread = new SpreadAnalyzerService(this.market);
    this.condition = new MarketConditionService(this.market);
    this.multiplexer = new MarketMultiplexerService(
      this.market, this.signal, this.executor, this.shield, this.account, this.db,
    );
    this.observability = new ObservabilityService(this.db, this.adapter);
    this.goal = new GoalTrackerService(this.db);
    this.deploy = new DeployManagerService(this.db, this.optimizer);
    this.multiStrategy = multiStrategyService;
    this.backtestAI = backtestAIService;
  }

  async start(): Promise<void> {
    this.log.info('AZTRON Engine starting...');

    // Start always-on services
    this.adapter.start();
    this.market.start();
    this.sentiment.start();
    this.portfolio.start();
    this.multiStrategy.start();
    this.backtestAI.start();
    this.setupEventBroadcast();
    this.setupTradeCloseListener();
    this.setupDailyReset();

    this.log.info('AZTRON Engine ready', {
      hasCredentials: this.adapter.hasCredentials,
      mode: this.db.getSettings().mode,
    });
  }

  startEngine(): void {
    const settings = this.db.updateSettings({ running: true });
    this.learning.start();
    this.optimizer.start();
    this.multiplexer.start();
    eventBus.emit('engine:started');
    this.db.addAlert('INFO', `Engine iniciado em modo ${settings.mode}`);
    this.log.info('Engine started', { mode: settings.mode });
  }

  stopEngine(): void {
    this.db.updateSettings({ running: false });
    this.learning.stop();
    this.optimizer.stop();
    this.multiplexer.stop();
    eventBus.emit('engine:stopped');
    this.db.addAlert('INFO', 'Engine parado pelo usuário');
    this.log.info('Engine stopped');
  }

  async shutdown(): Promise<void> {
    this.log.info('Shutting down AZTRON Engine...');
    this.stopEngine();
    this.adapter.stop();
    this.market.stop();
    this.sentiment.stop();
    this.portfolio.stop();
    this.multiStrategy.stop();
    this.backtestAI.stop();
    this.shield.stop();
    this.db.flush();
    this.log.info('Shutdown complete');
  }

  /** Broadcast real-time events to all WebSocket clients */
  private setupEventBroadcast(): void {
    const broadcast = (type: string, data: unknown): void => {
      const msg = JSON.stringify({ type, data, ts: Date.now() });
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    };

    eventBus.on('ticker:update', ticker => broadcast('ticker', ticker));
    eventBus.on('signal:new', signal => broadcast('signal', signal));
    eventBus.on('trade:open', trade => broadcast('trade_open', trade));
    eventBus.on('trade:close', trade => broadcast('trade_close', trade));
    eventBus.on('alert:new', alert => broadcast('alert', alert));
    eventBus.on('ai:thought', thought => broadcast('ai_thought', thought));
    eventBus.on('ai:confidence', value => broadcast('ai_confidence', value));
    eventBus.on('flashcrash:detected', event => broadcast('flashcrash', event));
    eventBus.on('engine:started', () => broadcast('engine_status', { running: true }));
    eventBus.on('engine:stopped', () => broadcast('engine_status', { running: false }));
    eventBus.on('multi:strategy:signal', signal => broadcast('multi_signal', signal));
    eventBus.on('ai:optimization:progress', progress => broadcast('optimization_progress', progress));
    eventBus.on('ai:optimization:complete', result => broadcast('optimization_complete', result));
  }

  private setupTradeCloseListener(): void {
    eventBus.on('trade:close', trade => {
      this.learning.onTradeClosed(trade);
    });
  }

  private setupDailyReset(): void {
    const msUntilMidnight = (): number => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      return midnight.getTime() - now.getTime();
    };
    const schedule = (): void => {
      setTimeout(() => {
        this.risk.resetDailyLoss();
        this.log.info('Daily loss counter reset');
        schedule();
      }, msUntilMidnight());
    };
    schedule();
  }
}

// Singleton — shared across routes
let instance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!instance) throw new Error('Orchestrator not initialized');
  return instance;
}

export function initOrchestrator(wss: WebSocketServer): Orchestrator {
  instance = new Orchestrator(wss);
  return instance;
}