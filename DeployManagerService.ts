import { DatabaseService } from './DatabaseService.js';
import { LoggerService } from './LoggerService.js';
import { AIZtronOptimizerService } from './AIZtronOptimizerService.js';
import type { DeployVersion } from './types.js';

export class DeployManagerService {
  private log = new LoggerService('DeployManager');
  private db: DatabaseService;
  private optimizer: AIZtronOptimizerService;

  constructor(db: DatabaseService, optimizer: AIZtronOptimizerService) {
    this.db = db;
    this.optimizer = optimizer;
  }

  async deploy(changelog: string, deployedBy = 'Manual'): Promise<DeployVersion> {
    const current = this.db.getDeployHistory();
    const lastVersion = current[0]?.version ?? 'v0.0.0';
    const nextVersion = this.bumpVersion(lastVersion);

    this.log.info('Deploying new version', { version: nextVersion, deployedBy });

    let status: DeployVersion['status'] = 'SUCCESS';

    try {
      // Run optimization as part of the deploy process
      await this.optimizer.forceOptimize();
    } catch (err) {
      this.log.error('Deploy optimization failed', { err: String(err) });
      status = 'FAILED';
    }

    const version: DeployVersion = {
      version: nextVersion,
      status,
      deployedBy,
      changelog,
      timestamp: new Date().toISOString(),
    };

    this.db.addDeployVersion(version);

    if (status === 'SUCCESS') {
      this.db.addAlert('INFO', `Deploy ${nextVersion} bem-sucedido — ${changelog}`);
    } else {
      this.db.addAlert('CRITICAL', `Deploy ${nextVersion} falhou — verifique os logs`);
    }

    return version;
  }

  private bumpVersion(version: string): string {
    const match = version.match(/v(\d+)\.(\d+)\.(\d+)/);
    if (!match) return 'v1.0.0';
    const [, major, minor, patch] = match.map(Number);
    return `v${major}.${minor}.${patch + 1}`;
  }

  getHistory(): DeployVersion[] {
    return this.db.getDeployHistory();
  }
}
