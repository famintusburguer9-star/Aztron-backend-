export interface StrategySignal {
  id: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  symbol: string;
  confidence: number;      // 0-100
  strategyName: string;
  reason: string;
  indicators: Record<string, any>;
  timestamp: number;
}

export interface StrategyConfig {
  enabled: boolean;
  minConfidence: number;    // mínimo para considerar (ex: 70%)
  weight: number;           // peso na decisão final
}

export interface StrategyResult {
  name: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  indicators: any;
}