import { randomUUID } from 'node:crypto';
import { JsonStore } from './storage.js';
import type {
  Alert,
  BacktestResult,
  DeployVersion,
  EngineSettings,
  FlashCrashEvent,
  OptimizationEntry,
  SandboxResult,
  Signal,
  Trade,
} from './types.js';

interface DbSchema {
  trades: Trade[];
  signals: Signal[];
  alerts: Alert[];
  flashCrashEvents: FlashCrashEvent[];
  optimizationHistory: OptimizationEntry[];
  deployHistory: DeployVersion[];
  backtestHistory: BacktestResult[];
  sandboxHistory: SandboxResult[];
  settings: EngineSettings;
  aiVersion: number;
  aiConfidence: number;
  aiThoughts: string[];
  realizedPnl: number;
  portfolioHistory: number[];
}

const DEFAULT_SETTINGS: EngineSettings = {
  running: false,
  mode: 'PAPER',
  exchange: 'BYBIT',
  pairs: ['BTCUSDT', 'ETHUSDT'],
  maxRisk: 2,
  slDistance: 1.5,
  tpDistance: 3,
  aiOptimizer: true,
  patternRecognition: true,
  sentimentAnalysis: false,
  goalAmount: 10000,
  ema9Period: 9,
  ema21Period: 21,
  rsiPeriod: 14,
  atrPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  minConfidence: 65,
};

const DEFAULTS: DbSchema = {
  trades: [],
  signals: [],
  alerts: [
    {
      id: randomUUID(),
      severity: 'INFO',
      message: 'AZTRON Engine inicializado. Aguardando comandos.',
      read: false,
      timestamp: new Date().toISOString(),
    },
  ],
  flashCrashEvents: [],
  optimizationHistory: [
    {
      version: 1,
      winRate: 68.3,
      adjustments: 'Parâmetros iniciais de produção',
      parameters: {},
      timestamp: new Date(Date.now() - 864000000).toISOString(),
    },
  ],
  deployHistory: [
    {
      version: 'v1.0.0',
      status: 'SUCCESS',
      deployedBy: 'Manual',
      changelog: 'Release inicial do AZTRON Engine',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
  backtestHistory: [],
  sandboxHistory: [],
  settings: DEFAULT_SETTINGS,
  aiVersion: 1,
  aiConfidence: 65,
  aiThoughts: [],
  realizedPnl: 0,
  portfolioHistory: [],
};

export class DatabaseService {
  private store: JsonStore<DbSchema & Record<string, unknown>>;

  constructor() {
    this.store = new JsonStore<DbSchema & Record<string, unknown>>('main', DEFAULTS as DbSchema & Record<string, unknown>);
  }

  // Settings
  getSettings(): EngineSettings {
    return this.store.get('settings');
  }

  updateSettings(patch: Partial<EngineSettings>): EngineSettings {
    const current = this.store.get('settings');
    const updated = { ...current, ...patch };
    this.store.set('settings', updated);
    return updated;
  }

  // Trades
  getTrades(): Trade[] {
    return this.store.get('trades');
  }

  addTrade(trade: Omit<Trade, 'id'>): Trade {
    const t: Trade = { id: randomUUID(), ...trade };
    const trades = this.store.get('trades');
    this.store.set('trades', [t, ...trades]);
    return t;
  }

  updateTrade(id: string, patch: Partial<Trade>): Trade | null {
    const trades = this.store.get('trades');
    const idx = trades.findIndex(t => t.id === id);
    if (idx === -1) return null;
    trades[idx] = { ...trades[idx], ...patch };
    this.store.set('trades', trades);
    return trades[idx];
  }

  getOpenTrades(): Trade[] {
    return this.store.get('trades').filter(t => t.status === 'OPEN');
  }

  // Signals
  getSignals(limit = 20): Signal[] {
    return this.store.get('signals').slice(0, limit);
  }

  addSignal(signal: Omit<Signal, 'id'>): Signal {
    const s: Signal = { id: randomUUID(), ...signal };
    const signals = this.store.get('signals');
    this.store.set('signals', [s, ...signals.slice(0, 99)]);
    return s;
  }

  // Alerts
  getAlerts(): Alert[] {
    return this.store.get('alerts');
  }

  addAlert(severity: Alert['severity'], message: string): Alert {
    const a: Alert = {
      id: randomUUID(),
      severity,
      message,
      read: false,
      timestamp: new Date().toISOString(),
    };
    const alerts = this.store.get('alerts');
    this.store.set('alerts', [a, ...alerts.slice(0, 199)]);
    return a;
  }

  markAlertRead(id: string): void {
    const alerts = this.store.get('alerts');
    const idx = alerts.findIndex(a => a.id === id);
    if (idx !== -1) {
      alerts[idx].read = true;
      this.store.set('alerts', alerts);
    }
  }

  // Flash crash events
  getFlashCrashEvents(): FlashCrashEvent[] {
    return this.store.get('flashCrashEvents');
  }

  addFlashCrashEvent(event: Omit<FlashCrashEvent, 'id'>): FlashCrashEvent {
    const e: FlashCrashEvent = { id: randomUUID(), ...event };
    const events = this.store.get('flashCrashEvents');
    this.store.set('flashCrashEvents', [e, ...events.slice(0, 49)]);
    return e;
  }

  // AI state
  getAiState() {
    return {
      confidence: this.store.get('aiConfidence'),
      thoughts: this.store.get('aiThoughts'),
      optimizationHistory: this.store.get('optimizationHistory'),
      version: this.store.get('aiVersion'),
    };
  }

  setAiConfidence(value: number): void {
    this.store.set('aiConfidence', Math.round(value * 10) / 10);
  }

  addAiThought(thought: string): void {
    const thoughts = this.store.get('aiThoughts');
    this.store.set('aiThoughts', [thought, ...thoughts.slice(0, 49)]);
  }

  addOptimizationEntry(entry: Omit<OptimizationEntry, 'version'>): void {
    const version = this.store.get('aiVersion') + 1;
    this.store.set('aiVersion', version);
    const history = this.store.get('optimizationHistory');
    this.store.set('optimizationHistory', [{ ...entry, version }, ...history.slice(0, 19)]);
  }

  // Deploy history
  getDeployHistory(): DeployVersion[] {
    return this.store.get('deployHistory');
  }

  addDeployVersion(v: DeployVersion): void {
    const history = this.store.get('deployHistory');
    this.store.set('deployHistory', [v, ...history.slice(0, 49)]);
  }

  // Backtest / Sandbox
  getBacktestHistory(): BacktestResult[] {
    return this.store.get('backtestHistory');
  }

  addBacktestResult(r: BacktestResult): void {
    const h = this.store.get('backtestHistory');
    this.store.set('backtestHistory', [r, ...h.slice(0, 49)]);
  }

  getSandboxHistory(): SandboxResult[] {
    return this.store.get('sandboxHistory');
  }

  addSandboxResult(r: SandboxResult): void {
    const h = this.store.get('sandboxHistory');
    this.store.set('sandboxHistory', [r, ...h.slice(0, 49)]);
  }

  // Portfolio history
  getPortfolioHistory(): number[] {
    return this.store.get('portfolioHistory');
  }

  addPortfolioSnapshot(value: number): void {
    const h = this.store.get('portfolioHistory');
    this.store.set('portfolioHistory', [...h.slice(-99), value]);
  }

  getRealizedPnl(): number {
    return this.store.get('realizedPnl');
  }

  addRealizedPnl(amount: number): void {
    const current = this.store.get('realizedPnl');
    this.store.set('realizedPnl', current + amount);
  }

  flush(): void {
    this.store.flush();
  }
}
