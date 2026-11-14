import { Injectable, Logger } from '@nestjs/common';

export interface ShipmentEmailPayload {
  toEmail: string;
  customerName: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  shippedAt: Date;
}

@Injectable()
export class ShipmentEmailService {
  private readonly logger = new Logger(ShipmentEmailService.name);

  private readonly sentEmails: ShipmentEmailPayload[] = [];

  async sendShipmentNotification(
    payload: ShipmentEmailPayload,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `[Shipment Email Stub] Recording notification for ${payload.toEmail}, order ${payload.orderId}, via ${payload.carrier} (Tracking: ${payload.trackingNumber})`,
      );

      this.sentEmails.push({ ...payload });

      await Promise.resolve();
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to send shipment notification for Order ${payload.orderId}: ${message}`,
        stack,
      );
      return false;
    }
  }

  getDispatchedEmails(): ShipmentEmailPayload[] {
    return [...this.sentEmails];
  }

  clearDispatchedEmails(): void {
    this.sentEmails.length = 0;
  }
}
