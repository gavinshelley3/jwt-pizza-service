const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const metrics = require('../metrics.js');
const logger = require('../logger.js');

const authRouter = express.Router();

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 5;
const LOGIN_WINDOW_MS = 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;
const BACKOFF_THRESHOLD = 3;
const BACKOFF_STEP_MS = 200;
const BACKOFF_MAX_MS = 1000;
const LOCKED_RESPONSE_DELAY_MS = 500;
const loginAttempts = new Map();

const sleep = (ms = 0) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
const normalizeEmail = (value) => (typeof value === 'string' ? value.trim() : '');
const requestIp = (req) =>
  req.ip ||
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.headers['x-real-ip'] ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  'unknown';
const loginKey = (req, email) => `${requestIp(req)}:${(email || 'anonymous').toLowerCase()}`;

function resetLoginLimiter() {
  loginAttempts.clear();
}

function getAttemptEntry(key) {
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry) {
    entry = { attempts: 0, windowStart: now, lockUntil: 0 };
    loginAttempts.set(key, entry);
    return entry;
  }
  if (entry.lockUntil && entry.lockUntil <= now) {
    entry.lockUntil = 0;
    entry.attempts = 0;
    entry.windowStart = now;
  } else if (!entry.lockUntil && now - entry.windowStart > LOGIN_WINDOW_MS) {
    entry.attempts = 0;
    entry.windowStart = now;
  }
  return entry;
}

function registerFailure(key) {
  const now = Date.now();
  const entry = getAttemptEntry(key);
  entry.attempts += 1;
  if (entry.lockUntil && entry.lockUntil > now) {
    entry.lockUntil = now + LOCKOUT_MS;
  } else if (entry.attempts >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
    entry.lockUntil = now + LOCKOUT_MS;
  }
  const backoffSteps = Math.max(entry.attempts - BACKOFF_THRESHOLD + 1, 0);
  const delayMs = Math.min(backoffSteps * BACKOFF_STEP_MS, BACKOFF_MAX_MS);
  return { delayMs, locked: Boolean(entry.lockUntil && entry.lockUntil > now) };
}

function clearFailures(key) {
  loginAttempts.delete(key);
}

function isLocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) {
    return false;
  }
  const now = Date.now();
  if (entry.lockUntil && entry.lockUntil > now) {
    return true;
  }
  if (entry.lockUntil && entry.lockUntil <= now) {
    loginAttempts.delete(key);
  }
  return false;
}

function logFailedLogin(req, email, reason, extra = {}) {
  logger.log('warn', 'auth-login-failed', {
    reason,
    email: email || '<missing>',
    ip: requestIp(req),
    ...extra,
  });
}

const isAuthenticationError = (error) => {
  const status = error?.statusCode;
  return status === 401 || status === 404;
};

authRouter.docs = [
  {
    method: 'POST',
    path: '/api/auth',
    description: 'Register a new user',
    example: `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
    response: { user: { id: 2, name: 'pizza diner', email: 'd@jwt.com', roles: [{ role: 'diner' }] }, token: 'tttttt' },
  },
  {
    method: 'PUT',
    path: '/api/auth',
    description: 'Login existing user',
    example: `curl -X PUT localhost:3000/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
  {
    method: 'DELETE',
    path: '/api/auth',
    requiresAuth: true,
    description: 'Logout a user',
    example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer tttttt'`,
    response: { message: 'logout successful' },
  },
];

async function setAuthUser(req, res, next) {
  console.log('[auth] middleware entered', req.method, req.path);
  const token = readAuthToken(req);
  if (token) {
    console.log('[auth] header detected', req.method, req.path);
    try {
      if (await DB.isLoggedIn(token)) {
        // Check the database to make sure the token is valid.
        req.user = jwt.verify(token, config.jwtSecret);
        req.user.isRole = (role) => !!req.user.roles.find((r) => r.role === role);
        console.log('[auth] user resolved', req.user.id, req.method, req.path);
      } else {
        console.log('[auth] token not found in DB', req.method, req.path);
      }
    } catch {
      req.user = null;
      console.log('[auth] token verification failed', req.method, req.path);
    }
  } else if (req.path?.startsWith('/api')) {
    console.log('[auth] missing Authorization header', req.method, req.path);
  }
  next();
}

// Authenticate token
authRouter.authenticateToken = (req, res, next) => {
  if (!req.user) {
    metrics.recordAuthAttempt('token', false);
    return res.status(401).send({ message: 'unauthorized' });
  }
  metrics.recordAuthAttempt('token', true);
  next();
};

// register
authRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      metrics.recordAuthAttempt('register', false);
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    try {
      const user = await DB.addUser({ name, email, password, roles: [{ role: Role.Diner }] });
      const auth = await setAuth(user);
      metrics.recordAuthAttempt('register', true);
      res.json({ user: user, token: auth });
    } catch (error) {
      metrics.recordAuthAttempt('register', false);
      throw error;
    }
  })
);

// login
authRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const key = loginKey(req, normalizedEmail);

    if (isLocked(key)) {
      metrics.recordAuthAttempt('login', false);
      const { delayMs } = registerFailure(key);
      logFailedLogin(req, normalizedEmail, 'rate-limited');
      await sleep(Math.max(delayMs, LOCKED_RESPONSE_DELAY_MS));
      return res.status(401).json({ message: 'invalid email or password' });
    }

    if (isBlank(email) || isBlank(password)) {
      metrics.recordAuthAttempt('login', false);
      const { delayMs } = registerFailure(key);
      logFailedLogin(req, normalizedEmail, 'invalid-input');
      await sleep(delayMs);
      return res.status(401).json({ message: 'invalid email or password' });
    }

    try {
      const user = await DB.getUser(normalizedEmail, password);
      clearFailures(key);
      const auth = await setAuth(user);
      metrics.recordAuthAttempt('login', true);
      res.json({ user: user, token: auth });
    } catch (error) {
      if (isAuthenticationError(error)) {
        metrics.recordAuthAttempt('login', false);
        const { delayMs } = registerFailure(key);
        logFailedLogin(req, normalizedEmail, 'bad-credentials', { statusCode: error.statusCode });
        await sleep(delayMs);
        return res.status(401).json({ message: 'invalid email or password' });
      }
      metrics.recordAuthAttempt('login', false);
      throw error;
    }
  })
);

// logout
authRouter.delete(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    await clearAuth(req);
    metrics.recordAuthAttempt('logout', true);
    res.json({ message: 'logout successful' });
  })
);

async function setAuth(user) {
  const token = jwt.sign(user, config.jwtSecret);
  await DB.loginUser(user.id, token);
  return token;
}

async function clearAuth(req) {
  const token = readAuthToken(req);
  if (token) {
    await DB.logoutUser(token);
  }
}

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.split(' ')[1];
  }
  return null;
}

authRouter.resetLoginLimiter = resetLoginLimiter;

module.exports = { authRouter, setAuthUser, setAuth };
