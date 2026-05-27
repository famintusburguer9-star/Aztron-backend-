import { EventEmitter } from 'node:events';
import type { Signal, Ticker, Trade, Alert, FlashCrashEvent } from './types.js';

interface AztronEvents {
  'ticker:update': (ticker: Ticker) => void;
  'signal:new': (signal: Signal) => void;
  'trade:open': (trade: Trade) => void;
  'trade:close': (trade: Trade) => void;
  'alert:new': (alert: Alert) => void;
  'flashcrash:detected': (event: FlashCrashEvent) => void;
  'engine:started': () => void;
  'engine:stopped': () => void;
  'ai:thought': (thought: string) => void;
  'ai:confidence': (value: number) => void;
}

class TypedEventBus extends EventEmitter {
  on<K extends keyof AztronEvents>(event: K, listener: AztronEvents[K]): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  off<K extends keyof AztronEvents>(event: K, listener: AztronEvents[K]): this {
    return super.off(event, listener as (...args: any[]) => void);
  }

  emit<K extends keyof AztronEvents>(
    event: K,
    ...args: Parameters<AztronEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  once<K extends keyof AztronEvents>(event: K, listener: AztronEvents[K]): this {
    return super.once(event, listener as (...args: any[]) => void);
  }
}

export const eventBus = new TypedEventBus();
eventBus.setMaxListeners(50);
