import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/env.validation';
import { OrderExpiryService } from './order-expiry.service';

@Injectable()
export class OrderExpiryScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OrderExpiryScheduler.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;

  constructor(
    private readonly expiry: OrderExpiryService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('ORDER_EXPIRY_ENABLED', { infer: true })) return;
    const interval = this.config.get('ORDER_EXPIRY_POLL_INTERVAL_MS', {
      infer: true,
    });
    this.timer = setInterval(() => this.tick(), interval).unref();
    this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.inFlight;
  }

  private tick(): void {
    if (this.inFlight) return;
    this.inFlight = this.expiry
      .processBatch()
      .catch(() => {
        this.logger.error('Order expiry batch failed');
      })
      .then(() => {
        this.inFlight = undefined;
      });
  }
}
