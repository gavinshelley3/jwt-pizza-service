module.exports = {
  // Keep local defaults, but prefer runtime environment variables in CI/container.
  jwtSecret: process.env.JWT_SECRET || '',
  db: {
    connection: {
      // Use DB_HOSTNAME/DB_HOST in containers and keep 127.0.0.1 for local MySQL.
      host: process.env.DB_HOSTNAME || process.env.DB_HOST || '127.0.0.1',
      // Support both old and new variable names.
      user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.DB_CONNECTION_SECRET || '',
      database: process.env.DB_NAME || 'pizza',
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
  factory: {
    url: 'https://pizza-factory.cs329.click',
    apiKey: process.env.FACTORY_API_KEY || '',
  },
  metrics: {
    source: process.env.METRICS_SOURCE || 'jwt-pizza-service-dev',
    endpointUrl: process.env.METRICS_ENDPOINT_URL || '',
    accountId: process.env.METRICS_ACCOUNT_ID || '',
    apiKey: process.env.METRICS_API_KEY || '',
    intervalMs: Number(process.env.METRICS_INTERVAL_MS || 5000),
  },
};
