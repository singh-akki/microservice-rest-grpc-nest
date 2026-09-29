import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics for granular observability
const orderPlacementDuration = new Trend('ecom_order_placement_duration_ms');
const productBrowseDuration = new Trend('ecom_product_browse_duration_ms');
const metricsScrapeDuration = new Trend('ecom_metrics_scrape_duration_ms');
const successfulOrders = new Counter('ecom_successful_orders_total');
const failedOrders = new Counter('ecom_failed_orders_total');
const errorRate = new Rate('ecom_custom_error_rate');

export const options = {
  stages: [
    { duration: '5s', target: 10 },  // Ramp-up: 10 concurrent users
    { duration: '15s', target: 30 }, // Sustained load: 30 concurrent users
    { duration: '5s', target: 60 },  // Spike test: 60 concurrent users
    { duration: '5s', target: 0 },   // Cool-down
  ],
  thresholds: {
    // 95% of requests must complete below 500ms, 99% below 1000ms
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Overall unhandled failures below 10% (taking into account deliberate negative tests)
    http_req_failed: ['rate<0.10'],
    // Order placement SLA
    ecom_order_placement_duration_ms: ['p(95)<600'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function () {
  const correlationId = generateUuid();
  const idempotencyKey = `k6-order-${__VU}-${__ITER}-${Date.now()}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-correlation-id': correlationId,
  };

  // Group 1: Product Browsing
  group('Browse Products', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/products`, { headers: defaultHeaders });
    productBrowseDuration.add(Date.now() - start);

    const ok = check(res, {
      'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
      'received correlation id': (r) => !!r.headers['X-Correlation-Id'] || !!r.headers['x-correlation-id'],
    });

    if (!ok && res.status >= 500) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(0.3);

  // Group 2: Create Order (End-to-End Microservice Chain: Gateway -> Order Service -> gRPC Product Service -> RMQ)
  group('Place Order Flow', () => {
    const orderPayload = JSON.stringify({
      userId: generateUuid(),
      items: [
        {
          productId: generateUuid(),
          quantity: 1,
          price: 29.99,
        },
      ],
    });

    const orderHeaders = {
      ...defaultHeaders,
      'x-idempotency-key': idempotencyKey,
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/orders`, orderPayload, { headers: orderHeaders });
    orderPlacementDuration.add(Date.now() - start);

    // Depending on product existence/stock in DB, we expect either 201 (created), 400 (out of stock/invalid), or 401 (auth)
    const isValidResponse = check(res, {
      'order responded with recognized status': (r) => [201, 400, 401, 404].includes(r.status),
      'has correlation header': (r) => !!r.headers['X-Correlation-Id'] || !!r.headers['x-correlation-id'],
    });

    if (res.status === 201) {
      successfulOrders.add(1);
    } else if (res.status >= 500) {
      failedOrders.add(1);
      errorRate.add(1);
    }
  });

  sleep(0.2);

  // Group 3: Prometheus Metrics Scraping
  group('Scrape Metrics', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/metrics`);
    metricsScrapeDuration.add(Date.now() - start);

    check(res, {
      'metrics endpoint returns 200': (r) => r.status === 200,
      'contains ecom_http_requests_total': (r) => typeof r.body === 'string' && r.body.includes('ecom_http_requests_total'),
    });
  });

  sleep(0.5);
}
