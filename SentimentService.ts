import { LoggerService } from './LoggerService.js';
import type { MarketSentiment } from './types.js';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const FNG_API = 'https://api.alternative.me/fng/?limit=1';

export class SentimentService {
  private log = new LoggerService('SentimentService');
  private cached: MarketSentiment | null = null;
  private lastFetch = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.fetch();
    this.timer = setInterval(() => this.fetch(), REFRESH_INTERVAL);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async get(): Promise<MarketSentiment> {
    if (this.cached && Date.now() - this.lastFetch < REFRESH_INTERVAL) {
      return this.cached;
    }
    await this.fetch();
    return this.cached ?? this.fallback();
  }

  private async fetch(): Promise<void> {
    try {
      const res = await fetch(FNG_API, { signal: AbortSignal.timeout(6000) });
      const json = await res.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
      const item = json.data?.[0];
      if (!item) return;
      this.cached = {
        value: parseInt(item.value, 10),
        classification: item.value_classification,
        timestamp: new Date().toISOString(),
      };
      this.lastFetch = Date.now();
      this.log.debug('Sentiment updated', { value: this.cached.value, classification: this.cached.classification });
    } catch (err) {
      this.log.warn('Failed to fetch sentiment', { err: String(err) });
    }
  }

  private fallback(): MarketSentiment {
    return { value: 50, classification: 'Neutral', timestamp: new Date().toISOString() };
  }

  /** Returns 'BULLISH' | 'BEARISH' | 'NEUTRAL' based on Fear & Greed */
  getBias(): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const v = this.cached?.value ?? 50;
    if (v >= 60) return 'BULLISH';
    if (v <= 40) return 'BEARISH';
    return 'NEUTRAL';
  }
}
