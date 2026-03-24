const os = require('os');
const config = require('./config.js');

class MetricsCollector {
  constructor(metricsConfig) {
    this.config = metricsConfig || {};
    this.enabled = Boolean(this.config.endpointUrl && this.config.accountId && this.config.apiKey);
    this.intervalMs = Number(this.config.intervalMs || 5000);
    this.headers = this.enabled
      ? {
          Authorization: `Basic ${Buffer.from(`${this.config.accountId}:${this.config.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        }
      : {};

    this.requestTotals = { total: 0, byMethod: {} };
    this.authAttempts = new Map(); // key => counter
    this.activeUsers = new Map(); // id => lastSeenMs
    this.httpLatency = { totalMs: 0, count: 0 };
    this.pizzaLatency = { totalMs: 0, count: 0 };
    this.pizzaStats = { sold: 0, failures: 0, revenue: 0 };

    if (this.enabled) {
      const timer = setInterval(() => {
        this.flush().catch((error) => {
          console.error('Failed to push metrics batch', error);
        });
      }, this.intervalMs);
      timer.unref?.();
      this.timer = timer;
    } else {
      console.warn(
        'Metrics disabled: missing METRICS_ENDPOINT_URL, METRICS_ACCOUNT_ID, or METRICS_API_KEY environment variables.'
      );
    }
  }

  requestTracker = (req, res, next) => {
    if (!this.enabled) {
      return next();
    }

    const start = process.hrtime.bigint();
    const method = (req.method || 'GET').toUpperCase();
    this.requestTotals.total += 1;
    this.requestTotals.byMethod[method] = (this.requestTotals.byMethod[method] || 0) + 1;

    const userId = req.user?.id ?? req.user?.userId;
    if (userId) {
      this.activeUsers.set(userId, Date.now());
    }

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.httpLatency.totalMs += durationMs;
      this.httpLatency.count += 1;
    });

    next();
  };

  recordAuthAttempt(type, success) {
    if (!this.enabled) {
      return;
    }
    const key = `${type}:${success ? 'success' : 'failure'}`;
    this.authAttempts.set(key, (this.authAttempts.get(key) || 0) + 1);
  }

  pizzaPurchase({ success, latencyMs, pizzas, revenue }) {
    if (!this.enabled) {
      return;
    }
    if (success) {
      this.pizzaStats.sold += pizzas;
      this.pizzaStats.revenue += revenue;
    } else {
      this.pizzaStats.failures += 1;
    }
    if (typeof latencyMs === 'number' && Number.isFinite(latencyMs)) {
      this.pizzaLatency.totalMs += latencyMs;
      this.pizzaLatency.count += 1;
    }
  }

  async flush() {
    if (!this.enabled) {
      return;
    }

    const metrics = [];
    const timeUnixNano = `${BigInt(Date.now()) * 1000000n}`;

    this.addHttpMetrics(metrics, timeUnixNano);
    this.addAuthMetrics(metrics, timeUnixNano);
    this.addActiveUserMetric(metrics, timeUnixNano);
    this.addSystemMetrics(metrics, timeUnixNano);
    this.addPizzaMetrics(metrics, timeUnixNano);
    this.addLatencyMetrics(metrics, timeUnixNano);

    if (!metrics.length) {
      return;
    }

    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'jwt-pizza-service' },
              },
              {
                key: 'service.instance.id',
                value: { stringValue: os.hostname() },
              },
            ],
          },
          scopeMetrics: [
            {
              metrics,
            },
          ],
        },
      ],
    };

    await fetch(this.config.endpointUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    }).then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          throw new Error(`Grafana metrics error (${response.status}): ${text}`);
        });
      }
      return response;
    });
  }

  addHttpMetrics(metrics, timeUnixNano) {
    if (!this.requestTotals.total) {
      return;
    }
    metrics.push(
      createSumMetric(
        'http_requests_total',
        '1',
        timeUnixNano,
        this.requestTotals.total,
        [{ key: 'source', value: { stringValue: this.config.source } }]
      )
    );

    Object.entries(this.requestTotals.byMethod).forEach(([method, value]) => {
      metrics.push(
        createSumMetric('http_requests_by_method_total', '1', timeUnixNano, value, [
          { key: 'method', value: { stringValue: method } },
          { key: 'source', value: { stringValue: this.config.source } },
        ])
      );
    });
  }

  addAuthMetrics(metrics, timeUnixNano) {
    if (!this.authAttempts.size) {
      return;
    }
    this.authAttempts.forEach((value, key) => {
      const [type, result] = key.split(':');
      metrics.push(
        createSumMetric('auth_attempts_total', '1', timeUnixNano, value, [
          { key: 'type', value: { stringValue: type } },
          { key: 'result', value: { stringValue: result } },
          { key: 'source', value: { stringValue: this.config.source } },
        ])
      );
    });
  }

  addActiveUserMetric(metrics, timeUnixNano) {
    const cutoff = Date.now() - 5 * 60 * 1000;
    let activeCount = 0;
    for (const [userId, lastSeen] of this.activeUsers.entries()) {
      if (lastSeen >= cutoff) {
        activeCount += 1;
      } else {
        this.activeUsers.delete(userId);
      }
    }
    metrics.push(
      createGaugeMetric(
        'active_users',
        '1',
        timeUnixNano,
        activeCount,
        [{ key: 'source', value: { stringValue: this.config.source } }]
      )
    );
  }

  addSystemMetrics(metrics, timeUnixNano) {
    if (!this.enabled) {
      return;
    }
    const cpu = Math.min((os.loadavg()[0] / os.cpus().length) * 100, 100).toFixed(2);
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memory = ((totalMemory - freeMemory) / totalMemory) * 100;

    metrics.push(
      createGaugeMetric(
        'cpu_percent',
        '%',
        timeUnixNano,
        Number(cpu),
        [{ key: 'source', value: { stringValue: this.config.source } }]
      )
    );
    metrics.push(
      createGaugeMetric(
        'memory_percent',
        '%',
        timeUnixNano,
        Number(memory.toFixed(2)),
        [{ key: 'source', value: { stringValue: this.config.source } }]
      )
    );
  }

  addPizzaMetrics(metrics, timeUnixNano) {
    if (this.pizzaStats.sold) {
      metrics.push(
        createSumMetric(
          'pizzas_sold_total',
          '1',
          timeUnixNano,
          this.pizzaStats.sold,
          [{ key: 'source', value: { stringValue: this.config.source } }]
        )
      );
    }
    if (this.pizzaStats.failures) {
      metrics.push(
        createSumMetric(
          'pizza_creation_failures_total',
          '1',
          timeUnixNano,
          this.pizzaStats.failures,
          [{ key: 'source', value: { stringValue: this.config.source } }]
        )
      );
    }
    if (this.pizzaStats.revenue) {
      metrics.push(
        createSumMetric(
          'pizza_revenue_total',
          'USD',
          timeUnixNano,
          Number(this.pizzaStats.revenue.toFixed(4)),
          [{ key: 'source', value: { stringValue: this.config.source } }],
          { valueType: 'double' }
        )
      );
    }
  }

  addLatencyMetrics(metrics, timeUnixNano) {
    if (this.httpLatency.count) {
      const avg = this.httpLatency.totalMs / this.httpLatency.count;
      metrics.push(
        createGaugeMetric(
          'service_latency_ms',
          'ms',
          timeUnixNano,
          Number(avg.toFixed(2)),
          [{ key: 'source', value: { stringValue: this.config.source } }]
        )
      );
      this.httpLatency = { totalMs: 0, count: 0 };
    }

    if (this.pizzaLatency.count) {
      const avg = this.pizzaLatency.totalMs / this.pizzaLatency.count;
      metrics.push(
        createGaugeMetric(
          'pizza_creation_latency_ms',
          'ms',
          timeUnixNano,
          Number(avg.toFixed(2)),
          [{ key: 'source', value: { stringValue: this.config.source } }]
        )
      );
      this.pizzaLatency = { totalMs: 0, count: 0 };
    }
  }
}

function createAttributes(attributes) {
  return attributes?.length ? attributes : [];
}

function createSumMetric(name, unit, timeUnixNano, value, attributes, options = {}) {
  const valueField = options.valueType === 'double' ? 'asDouble' : 'asInt';
  return {
    name,
    unit,
    sum: {
      aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
      isMonotonic: true,
      dataPoints: [
        {
          [valueField]: value,
          timeUnixNano,
          attributes: createAttributes(attributes),
        },
      ],
    },
  };
}

function createGaugeMetric(name, unit, timeUnixNano, value, attributes) {
  return {
    name,
    unit,
    gauge: {
      dataPoints: [
        {
          asDouble: value,
          timeUnixNano,
          attributes: createAttributes(attributes),
        },
      ],
    },
  };
}

const metrics = new MetricsCollector(config.metrics);

module.exports = metrics;
