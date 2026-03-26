const config = require("./config.js");

class LokiLogger {
  constructor(loggingConfig) {
    this.config = loggingConfig || {};
    this.source = this.config.source || "jwt-pizza-service";
    this.enabled = Boolean(
      this.config.endpointUrl && this.config.accountId && this.config.apiKey
    );

    if (!this.enabled) {
      console.warn(
        "Grafana logging disabled: missing LOKI_ENDPOINT_URL/LOGS_ACCOUNT_ID/LOGS_API_KEY."
      );
    }
  }

  httpLogger = (req, res, next) => {
    if (!this.enabled) {
      return next();
    }

    const start = process.hrtime.bigint();
    const originalSend = res.send.bind(res);
    let logged = false;

    const finalizeLog = (resBody) => {
      if (logged) {
        return;
      }
      logged = true;
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const logData = {
        authorized: Boolean(req.headers.authorization),
        path: req.originalUrl || req.url,
        method: (req.method || "GET").toUpperCase(),
        statusCode: res.statusCode,
        durationMs: Number(latencyMs.toFixed(3)),
        reqBody: this.serialize(req.body),
        resBody: this.serialize(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, "http-req", logData, {
        user_id: req.user?.id ?? req.user?.userId ?? undefined,
        trace_id: req.headers["x-trace-id"],
      });
    };

    res.send = (body) => {
      finalizeLog(body);
      return originalSend(body);
    };

    res.on("finish", () => {
      finalizeLog();
    });

    next();
  };

  log(level = "info", type = "custom", payload = {}, metadata = undefined) {
    if (!this.enabled) {
      return;
    }

    const valueEntry = [this.nowString(), this.sanitize(payload)];
    if (metadata && this.hasMetadata(metadata)) {
      valueEntry.push(metadata);
    }

    const event = {
      streams: [
        {
          stream: {
            component: this.source,
            level,
            type,
          },
          values: [valueEntry],
        },
      ],
    };

    this.sendLogToGrafana(event).catch((error) => {
      console.error("[logger] Failed to push log to Grafana Loki", error.message);
    });
  }

  logDbQuery(sql, details = {}) {
    if (!this.enabled) {
      return;
    }
    this.log("info", "db-query", {
      sql,
      durationMs:
        typeof details.durationMs === "number"
          ? Number(details.durationMs.toFixed(3))
          : undefined,
      paramCount: details.paramCount,
      rowCount: details.rowCount,
      affectedRows: details.affectedRows,
      insertId: details.insertId,
      success: details.success,
      error: details.error,
    });
  }

  logFactoryRequest(details = {}) {
    if (!this.enabled) {
      return;
    }
    this.log(details.success ? "info" : "warn", "factory-request", {
      durationMs:
        typeof details.latencyMs === "number"
          ? Number(details.latencyMs.toFixed(3))
          : undefined,
      statusCode: details.status,
      success: details.success,
      requestBody: details.requestBody,
      responseBody: details.responseBody,
      dinerId: details.dinerId,
      franchiseId: details.franchiseId,
      storeId: details.storeId,
    });
  }

  logException(error, context = {}) {
    if (!this.enabled) {
      return;
    }
    this.log("error", "unhandled-exception", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      ...context,
    });
  }

  statusToLogLevel(statusCode) {
    if (!Number.isFinite(statusCode)) {
      return "info";
    }
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  nowString() {
    return `${BigInt(Date.now()) * 1000000n}`;
  }

  sanitize(payload) {
    if (payload === undefined || payload === null) {
      return "";
    }
    if (typeof payload === "string") {
      return this.maskSecretsInString(payload);
    }
    try {
      const masked = this.maskSecrets(payload);
      return typeof masked === "string" ? masked : JSON.stringify(masked);
    } catch (error) {
      return this.serialize(payload);
    }
  }

  serialize(value) {
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    if (Buffer.isBuffer(value)) {
      return value.toString("utf8");
    }
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return `[unserializable:${error.message}]`;
    }
  }

  hasMetadata(metadata) {
    return Object.values(metadata).some(
      (value) => value !== undefined && value !== null && value !== ""
    );
  }

  maskSecrets(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => this.maskSecrets(entry));
    }
    if (value && typeof value === "object") {
      const clone = {};
      for (const [key, val] of Object.entries(value)) {
        if (typeof key === "string" && key.toLowerCase().includes("password")) {
          clone[key] = "*****";
        } else {
          clone[key] = this.maskSecrets(val);
        }
      }
      return clone;
    }
    if (typeof value === "string") {
      return this.maskSecretsInString(value);
    }
    return value;
  }

  maskSecretsInString(value) {
    if (typeof value !== "string") {
      return value;
    }
    return value
      .replace(/("password"\s*:\s*")([^"]*)(")/gi, '$1*****$3')
      .replace(/(\\\"password\\\"\s*:\s*\\")(.*?)(\\")/gi, '$1*****$3');
  }

  async sendLogToGrafana(event) {
    const response = await fetch(this.config.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.accountId}:${this.config.apiKey}`,
      },
      body: JSON.stringify(event),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(5000)
          : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Grafana Loki error (${response.status}): ${text}`);
    }
  }
}

module.exports = new LokiLogger(config.logging);
