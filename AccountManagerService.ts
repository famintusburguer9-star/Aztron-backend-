import { DatabaseService } from './DatabaseService.js';
import { ExchangeAdapterService } from './ExchangeAdapterService.js';
import { LoggerService } from './LoggerService.js';

export interface AccountInfo {
  mode: string;
  exchange: string;
  balance: number;
  hasCredentials: boolean;
  apiKeyConfigured: boolean;
}

export class AccountManagerService {
  private log = new LoggerService('AccountManagerService');
  private adapter: ExchangeAdapterService;
  private db: DatabaseService;
  private cachedBalance: number = 10000;
  private lastBalanceFetch = 0;
  private BALANCE_TTL = 30_000;

  constructor(adapter: ExchangeAdapterService, db: DatabaseService) {
    this.adapter = adapter;
    this.db = db;
  }

  async getBalance(): Promise<number> {
    const now = Date.now();
    const settings = this.db.getSettings();

    if (settings.mode === 'PAPER') {
      return this.cachedBalance; // Paper balance
    }

    if (now - this.lastBalanceFetch > this.BALANCE_TTL) {
      try {
        this.cachedBalance = await this.adapter.getBalance();
        this.lastBalanceFetch = now;
      } catch (err) {
        this.log.error('Failed to fetch balance', { err: String(err) });
      }
    }

    return this.cachedBalance;
  }

  getInfo(): AccountInfo {
    const settings = this.db.getSettings();
    return {
      mode: settings.mode,
      exchange: settings.exchange,
      balance: this.cachedBalance,
      hasCredentials: this.adapter.hasCredentials,
      apiKeyConfigured: Boolean(process.env['BYBIT_API_KEY']),
    };
  }

  setPaperBalance(balance: number): void {
    this.cachedBalance = balance;
  }
}
