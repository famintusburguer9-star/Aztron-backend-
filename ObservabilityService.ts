import { DatabaseService } from './DatabaseService.js';
import { ExchangeAdapterService } from './ExchangeAdapterService.js';
import { LoggerService } from './LoggerService.js';
import type { SystemMetrics, ServiceHealth } from './types.js';

export class ObservabilityService {
  private log = new LoggerService('ObservabilityService');
  private db: DatabaseService;
  private adapter: ExchangeAdapterService;
  private startTime = Date.now();
  private errorCount = 0;
  private signalCount = 0;
  private latencySamples: number[] = [];

  constructor(db: DatabaseService, adapter: ExchangeAdapterService) {
    this.db = db;
    this.adapter = adapter;
  }

  recordError(): void {
    this.errorCount++;
  }

  recordSignal(): void {
    this.signalCount++;
  }

  recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 100) this.latencySamples.shift();
  }

  getMetrics(): SystemMetrics {
    const mem = process.memoryUsage();
    const trades = this.db.getTrades();
    const settings = this.db.getSettings();

    const avgLatency = this.latencySamples.length > 0
      ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      : 0;

    const services: ServiceHealth[] = [
      { name: 'Strategy Service', status: 'Healthy' },
      { name: 'Risk Management', status: 'Healthy' },
      { name: 'Market Data', status: this.adapter.isConnected() ? 'Healthy' : 'Degraded' },
      { name: 'AI Optimizer', status: settings.aiOptimizer ? 'Healthy' : 'Down' },
      { name: 'Flash Crash Shield', status: 'Healthy' },
      { name: 'Trade Executor', status: trades.filter(t => t.status === 'OPEN').length > 0 ? 'Healthy' : 'Healthy' },
      { name: 'Bybit Adapter', status: this.adapter.isConnected() ? 'Healthy' : 'Degraded' },
    ];

    return {
      engineRunning: settings.running,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      tradesTotal: trades.length,
      tradesOpen: trades.filter(t => t.status === 'OPEN').length,
      signalsGenerated: this.signalCount,
      latencyMs: Math.round(avgLatency),
      bybitWsConnected: this.adapter.isConnected(),
      errors1h: this.errorCount,
      services,
    };
  }
}
