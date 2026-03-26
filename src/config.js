const env = process.env;

const getEnvValue = (keys, fallback = "") => {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    if (env[key] !== undefined) {
      return env[key];
    }
    const upper = key.toUpperCase();
    if (env[upper] !== undefined) {
      return env[upper];
    }
    const lower = key.toLowerCase();
    if (env[lower] !== undefined) {
      return env[lower];
    }
  }
  return fallback;
};

module.exports = {
  // Keep local defaults, but prefer runtime environment variables in CI/container.
  jwtSecret: env.JWT_SECRET || '',
  db: {
    connection: {
      // Use DB_HOSTNAME/DB_HOST in containers and keep 127.0.0.1 for local MySQL.
      host: env.DB_HOSTNAME || env.DB_HOST || '127.0.0.1',
      // Support both old and new variable names.
      user: env.DB_USERNAME || env.DB_USER || 'root',
      password: env.DB_PASSWORD || env.DB_CONNECTION_SECRET || '',
      database: env.DB_NAME || 'pizza',
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
  factory: {
    url: 'https://pizza-factory.cs329.click',
    apiKey: env.FACTORY_API_KEY || '',
  },
  metrics: {
    source: env.METRICS_SOURCE || 'jwt-pizza-service-dev',
    endpointUrl: getEnvValue(['METRICS_ENDPOINT_URL', 'ENDPOINT_URL'], ''),
    accountId: getEnvValue(['METRICS_ACCOUNT_ID', 'ACCOUNT_ID'], ''),
    apiKey: getEnvValue(['METRICS_API_KEY', 'API_KEY'], ''),
    intervalMs: Number(env.METRICS_INTERVAL_MS || 5000),
  },
  logging: {
    source: getEnvValue(['LOGGING_SOURCE', 'LOGS_SOURCE', 'METRICS_SOURCE'], 'jwt-pizza-service'),
    endpointUrl: getEnvValue(['LOGGING_ENDPOINT_URL', 'LOKI_ENDPOINT_URL', 'LOGS_ENDPOINT_URL'], ''),
    accountId: getEnvValue(['LOGGING_ACCOUNT_ID', 'LOGS_ACCOUNT_ID'], ''),
    apiKey: getEnvValue(['LOGGING_API_KEY', 'LOGS_API_KEY'], ''),
  },
};
