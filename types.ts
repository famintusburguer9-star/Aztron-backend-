export type Side = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type Mode = 'PAPER' | 'LIVE';
export type Exchange = 'BYBIT' | 'BINANCE';
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type EmaSignal = 'UP' | 'DOWN' | 'NEUTRAL';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  prevPrice: number;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  volume24h: number;
  rsi: number;
  ema9: number;
  ema21: number;
  emaSignal: EmaSignal;
  atr: number;
  timestamp: number;
}

export interface Signal {
  id: string;
  pair: string;
  type: Side;
  price: number;
  confidence: number;
  reason: string;
  ema9: number;
  ema21: number;
  rsi: number;
  macd: number;
  atr: number;
  acted: boolean;
  timestamp: string;
}

export interface Trade {
  id: string;
  pair: string;
  side: Side;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  confidence: number;
  strategy: string;
  exchange: Exchange;
  sl: number;
  tp: number;
  orderId?: string;
  timestamp: string;
  closedAt?: string;
}

export interface Position {
  pair: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  sl: number;
  tp: number;
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  read: boolean;
  timestamp: string;
}

export interface EngineSettings {
  running: boolean;
  mode: Mode;
  exchange: Exchange;
  pairs: string[];
  maxRisk: number;
  slDistance: number;
  tpDistance: number;
  aiOptimizer: boolean;
  patternRecognition: boolean;
  sentimentAnalysis: boolean;
  goalAmount: number;
  ema9Period: number;
  ema21Period: number;
  rsiPeriod: number;
  atrPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  minConfidence: number;
}

export interface Portfolio {
  totalValue: number;
  availableBalance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  positions: Position[];
}

export interface BacktestResult {
  id: string;
  pair: string;
  strategy: string;
  winRate: number;
  sharpe: number;
  drawdown: number;
  totalPnl: number;
  trades: number;
  verdict: 'APPROVED' | 'REJECTED';
  timestamp: string;
}

export interface SandboxResult {
  id: string;
  pair: string;
  testType: string;
  duration: number;
  score: number;
  pnl: number;
  winRate: number;
  status: 'APPROVED' | 'REJECTED';
  timestamp: string;
}

export interface OptimizationEntry {
  version: number;
  winRate: number;
  adjustments: string;
  parameters: Partial<EngineSettings>;
  timestamp: string;
}

export interface DeployVersion {
  version: string;
  status: 'SUCCESS' | 'FAILED';
  deployedBy: string;
  changelog: string;
  timestamp: string;
}

export interface FlashCrashEvent {
  id: string;
  pair: string;
  triggerType: string;
  priceChangePct: number;
  action: string;
  timestamp: string;
}

export interface SystemMetrics {
  engineRunning: boolean;
  uptime: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  tradesTotal: number;
  tradesOpen: number;
  signalsGenerated: number;
  latencyMs: number;
  bybitWsConnected: boolean;
  errors1h: number;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'Healthy' | 'Degraded' | 'Down';
}

export interface AiState {
  confidence: number;
  thoughts: string[];
  optimizationHistory: OptimizationEntry[];
  version: number;
}

export interface GoalState {
  target: number;
  current: number;
  percentComplete: number;
  startedAt: string;
  estimatedCompletion: string | null;
}

export interface MarketSentiment {
  value: number;
  classification: string;
  timestamp: string;
}

export interface ChartPattern {
  type: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  description: string;
}

export interface OhlcvApiResponse {
  retCode: number;
  result: {
    list: string[][];
  };
}
