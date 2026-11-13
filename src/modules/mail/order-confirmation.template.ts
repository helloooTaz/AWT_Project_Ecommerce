export interface OrderConfirmation {
  customerName: string;
  orderId: string;
  totalMinor: string;
  items: readonly {
    nameSnapshot: string;
    sizeSnapshot: string;
    colorSnapshot: string;
    quantity: number;
  }[];
}

const wholeTaka = new Intl.NumberFormat('en-US');

function formatBdt(minor: string): string {
  const amount = BigInt(minor);
  const fraction = (amount % 100n).toString().padStart(2, '0');
  return `BDT ${wholeTaka.format(amount / 100n)}.${fraction}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderOrderConfirmation(order: OrderConfirmation) {
  const subject = 'Your THREAD order is confirmed';
  const total = formatBdt(order.totalMinor);
  const items = order.items.map((item) => {
    return `${item.quantity} × ${item.nameSnapshot} (${item.sizeSnapshot}, ${item.colorSnapshot})`;
  });
  const text = [
    'THREAD',
    '',
    `Hi ${order.customerName},`,
    'Your payment was confirmed.',
    `Order reference: ${order.orderId}`,
    '',
    ...items,
    '',
    `Total paid: ${total}`,
    'Thank you for shopping with THREAD.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f5f5f3;color:#232321;font-family:Arial,sans-serif">
  <main style="max-width:540px;margin:auto;padding:24px;background:#fff">
    <p style="font-weight:bold;letter-spacing:0.2em">THREAD</p>
    <h1 style="font-size:24px">Order confirmed</h1>
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Your payment was confirmed.</p>
    <p><strong>Order reference</strong><br>${escapeHtml(order.orderId)}</p>
    <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <p><strong>Total paid</strong> ${total}</p>
    <p>Thank you for shopping with THREAD.</p>
  </main>
</body>
</html>`;
  return { subject, text, html };
}
