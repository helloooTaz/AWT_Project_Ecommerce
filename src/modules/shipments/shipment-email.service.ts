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

  sendShipmentNotification(payload: ShipmentEmailPayload): Promise<boolean> {
    this.logger.log(
      `[Shipment Email Stub] Recording notification for ${payload.toEmail}, order ${payload.orderId}, via ${payload.carrier} (Tracking: ${payload.trackingNumber})`,
    );

    this.sentEmails.push({ ...payload });
    return Promise.resolve(true);
  }

  getDispatchedEmails(): ShipmentEmailPayload[] {
    return [...this.sentEmails];
  }

  clearDispatchedEmails(): void {
    this.sentEmails.length = 0;
  }
}
