import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { OrderExpiryScheduler } from './order-expiry.scheduler';
import { OrderExpiryService } from './order-expiry.service';

describe('Order expiry scheduler', () => {
  const processBatch = jest.fn<Promise<number>, []>();
  let module: TestingModule;

  async function createScheduler(enabled: boolean) {
    module = await Test.createTestingModule({
      providers: [
        OrderExpiryScheduler,
        { provide: OrderExpiryService, useValue: { processBatch } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ORDER_EXPIRY_ENABLED' ? enabled : 1000,
          },
        },
      ],
    }).compile();
    return module.get(OrderExpiryScheduler);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    processBatch.mockReset().mockResolvedValue(0);
  });

  afterEach(async () => {
    await module?.close();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not start automatic work when disabled', async () => {
    const scheduler = await createScheduler(false);
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);
    expect(processBatch).not.toHaveBeenCalled();
  });

  it('runs on startup, skips overlapping ticks, and waits for work at shutdown', async () => {
    const scheduler = await createScheduler(true);
    let finish!: (count: number) => void;
    processBatch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    scheduler.onApplicationBootstrap();
    expect(processBatch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(processBatch).toHaveBeenCalledTimes(1);
    finish(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(processBatch).toHaveBeenCalledTimes(2);

    processBatch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await jest.advanceTimersByTimeAsync(1000);
    let stopped = false;
    const closing = scheduler.onModuleDestroy().then(() => {
      stopped = true;
    });
    await jest.advanceTimersByTimeAsync(2000);
    expect(stopped).toBe(false);
    expect(processBatch).toHaveBeenCalledTimes(3);
    finish(0);
    await closing;
    expect(stopped).toBe(true);
  });

  it('logs a generic failure and polls again on the next tick', async () => {
    const scheduler = await createScheduler(true);
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    processBatch.mockRejectedValueOnce(new Error('private database details'));
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledWith('Order expiry batch failed');
    expect(processBatch).toHaveBeenCalledTimes(2);
  });
});
