const express = require("express");
const { authRouter, setAuthUser } = require("./routes/authRouter.js");
const orderRouter = require("./routes/orderRouter.js");
const franchiseRouter = require("./routes/franchiseRouter.js");
const userRouter = require("./routes/userRouter.js");
const version = require("./version.json");
const config = require("./config.js");
const logger = require("./logger.js");
const metrics = require("./metrics.js");

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use(metrics.requestTracker);
app.use(logger.httpLogger);
app.use((req, res, next) => {
  console.log("[APP_TOP]", req.method, req.originalUrl || req.url);
  next();
});
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

const apiRouter = express.Router();
app.use("/api", apiRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/user", userRouter);
apiRouter.use("/order", orderRouter);
apiRouter.use("/franchise", franchiseRouter);

apiRouter.use("/docs", (req, res) => {
  res.json({
    version: version.version,
    endpoints: [
      ...authRouter.docs,
      ...userRouter.docs,
      ...orderRouter.docs,
      ...franchiseRouter.docs,
    ],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "welcome to JWT Pizza",
    version: version.version,
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    message: "unknown endpoint",
  });
});

// Default error handler for all exceptions and errors.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.logException(err, {
    path: req.originalUrl || req.url,
    method: req.method,
    statusCode: err.statusCode ?? 500,
    userId: req.user?.id,
  });
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
});

module.exports = app;
