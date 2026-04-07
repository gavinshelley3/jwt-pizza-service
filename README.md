# 🍕 jwt-pizza-service

![GitHub Actions coverage](./badges/coverage-total.svg)
![Coverage badge](https://pizza-factory.cs329.click/api/badge/gs296/jwtpizzaservicecoverage)

Backend service for making JWT pizzas. This service tracks users and franchises and orders pizzas. All order requests are passed to the JWT Pizza Factory where the pizzas are made.

JWTs are used for authentication objects.

## Deployment

The service reads runtime configuration from environment variables. If variables are not provided, local defaults are used.

```js
module.exports = {
  // Your JWT secret can be any random string you would like. It just needs to be secret.
  jwtSecret: process.env.JWT_SECRET || "change-me",
  db: {
    connection: {
      host: process.env.DB_HOSTNAME || process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USERNAME || process.env.DB_USER || "root",
      password:
        process.env.DB_PASSWORD ||
        process.env.DB_CONNECTION_SECRET ||
        "change-me",
      database: process.env.DB_NAME || "pizza",
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
  factory: {
    url: "https://pizza-factory.cs329.click",
    apiKey: process.env.FACTORY_API_KEY || "change-me",
  },
};
```

For containerized deployment (ECR/ECS), provide DB and JWT secrets at runtime via AWS Secrets Manager or Parameter Store.

## Endpoints

You can get the documentation for all endpoints by making the following request.

```sh
curl localhost:3000/api/docs
```

## Development notes

Install the required packages.

```sh
npm install express jsonwebtoken mysql2 bcrypt
```

Nodemon is assumed to be installed globally so that you can have hot reloading when debugging.

```sh
npm -g install nodemon
```

## Chaos Testing

### Toggle the chaos flag
- `PUT /api/order/chaos/true` with an admin JWT enables chaos and returns `{ "chaos": true }`.
- `PUT /api/order/chaos/false` with an admin JWT disables chaos and returns `{ "chaos": false }`.
- Requests use the same JWT header as other admin-protected endpoints: `curl -X PUT localhost:3000/api/order/chaos/true -H 'Authorization: Bearer <admin token>'`.

### Local / remote testing
1. Start the service (`npm start`) or deploy as usual.
2. Enable chaos via the endpoint above.
3. Issue `POST /api/order` requests as a diner; roughly half should return `500` with the message `Chaos monkey`.
4. Disable chaos when finished to restore normal behavior.
5. For deterministic verification (e.g., CI), run `npm test -- src/routes/orderRouter.test.js`, which mocks randomness to exercise both chaos success and failure paths.

### Observability signals
- HTTP request logs: `logger.httpLogger` records each request with `type="http-req"`, capturing `method`, `path`, `statusCode`, and `durationMs`. (Inferred Loki alert: `sum(rate({component="jwt-pizza-service",type="http-req",method="POST",path="/api/order",statusCode="500"}[5m])) > 0`.)
- Factory / chaos logs: `logger.logFactoryRequest` emits `type="factory-request"` entries with `success` and `statusCode`, and chaos failures log `type="order-chaos"` with the `Chaos monkey` message. (Inferred Loki alert: `count_over_time({component="jwt-pizza-service",type=~"order-chaos|factory-request",success="false"}[5m]) > 0`.)
- Metrics: `metrics.pizzaPurchase` increments `pizza_creation_failures_total` for factory or chaos failures and `pizza_creation_latency_ms` for successful runs. (Inferred Grafana alert: `increase(pizza_creation_failures_total{service.name="jwt-pizza-service"}[5m]) > 0`.)

During chaos drills, watch the alerts above plus any dashboards that graph `pizza_creation_failures_total`, HTTP 500 counts for `POST /api/order`, and Loki searches for `Chaos monkey` or `type="factory-request" success=false`.

