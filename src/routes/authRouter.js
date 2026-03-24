const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const metrics = require('../metrics.js');

const authRouter = express.Router();

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
    return res.status(401).send({ message: 'unauthorized' });
  }
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
    const { email, password } = req.body;
    try {
      const user = await DB.getUser(email, password);
      const auth = await setAuth(user);
      metrics.recordAuthAttempt('login', true);
      res.json({ user: user, token: auth });
    } catch (error) {
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

module.exports = { authRouter, setAuthUser, setAuth };
