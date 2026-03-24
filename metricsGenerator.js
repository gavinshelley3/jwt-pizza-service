const config = require("./config");

const authHeader = `Basic ${Buffer.from(
  `${config.accountId}:${config.apiKey}`,
).toString("base64")}`;

let requests = 0;
let latency = 0;

setInterval(() => {
  const cpuValue = Math.floor(Math.random() * 100) + 1;
  sendMetricToGrafana("cpu_percent", cpuValue, "gauge", "%");

  requests += Math.floor(Math.random() * 200) + 1;
  sendMetricToGrafana("requests_total", requests, "sum", "1");

  latency += Math.floor(Math.random() * 200) + 1;
  sendMetricToGrafana("latency_milliseconds_total", latency, "sum", "ms");
}, 1000);

async function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const dataPoint = {
    asInt: metricValue,
    timeUnixNano: `${BigInt(Date.now()) * 1000000n}`,
    attributes: [
      {
        key: "source",
        value: { stringValue: config.source },
      },
    ],
  };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit,
                [type]: {
                  dataPoints: [dataPoint],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === "sum") {
    const sum = metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type];
    sum.aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    sum.isMonotonic = true;
  }

  const body = JSON.stringify(metric);

  try {
    const response = await fetch(config.endpointUrl, {
      method: "POST",
      body,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `Failed to push ${metricName} (${response.status}): ${text.trim() || "No body"}\n${body}`,
      );
    } else {
      console.log(`Pushed ${metricName}`);
    }
  } catch (error) {
    console.error("Error pushing metrics:", error);
  }
}
