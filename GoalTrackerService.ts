import { DatabaseService } from './DatabaseService.js';
import { LoggerService } from './LoggerService.js';
import type { GoalState } from './types.js';

export class GoalTrackerService {
  private log = new LoggerService('GoalTrackerService');
  private db: DatabaseService;
  private startTime = Date.now();
  private startingPnl: number;

  constructor(db: DatabaseService) {
    this.db = db;
    this.startingPnl = this.db.getRealizedPnl();
  }

  get(): GoalState {
    const settings = this.db.getSettings();
    const target = settings.goalAmount;
    const current = this.db.getRealizedPnl() - this.startingPnl;
    const percentComplete = target > 0 ? Math.min(100, (current / target) * 100) : 0;

    let estimatedCompletion: string | null = null;
    const elapsed = Date.now() - this.startTime;
    if (current > 0 && elapsed > 60000) {
      const ratePerMs = current / elapsed;
      const remaining = target - current;
      if (ratePerMs > 0) {
        const msNeeded = remaining / ratePerMs;
        estimatedCompletion = new Date(Date.now() + msNeeded).toISOString();
      }
    }

    return {
      target,
      current: parseFloat(current.toFixed(2)),
      percentComplete: parseFloat(percentComplete.toFixed(1)),
      startedAt: new Date(this.startTime).toISOString(),
      estimatedCompletion,
    };
  }
}
