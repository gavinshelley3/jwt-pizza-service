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
