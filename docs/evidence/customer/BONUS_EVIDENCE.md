# Customer Middleware and Interceptor Evidence

Contributor Git author `ihatephatcat` on `feature/customer`.

| Bonus | Implementation | Automated evidence | Viva demonstration |
| --- | --- | --- | --- |
| Middleware | [RequestLoggingMiddleware](../../../src/common/middleware/request-logging.middleware.ts), registered by [AppModule](../../../src/app.module.ts) and mounted before body parsing and Swagger by [configureApp](../../../src/app.setup.ts). | [HTTP foundation tests](../../../test/e2e/foundation.e2e.spec.ts) cover valid UUIDs, concurrent requests, envelope correlation, and safe log fields. | Call `GET /api/v1/health` and send malformed JSON to `POST /api/v1/checkout`. Match each `X-Request-ID` to `meta.requestId` and the log. Show the status and duration in both log entries. |
| Interceptor | [ResponseTimingInterceptor](../../../src/common/interceptors/response-timing.interceptor.ts), applied to [CheckoutController.checkout](../../../src/modules/checkout/checkout.controller.ts). | [Checkout tests](../../../test/e2e/checkout.e2e.spec.ts) cover the timing header on order creation, replay, and checkout exceptions alongside existing order, guard, and validation assertions. | Submit a successful checkout, replay the idempotency key, and try an empty cart. Compare `X-Response-Time` with the request log's end-to-end duration. |
