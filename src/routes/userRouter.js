const express = require('express');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const { authRouter, setAuth } = require('./authRouter.js');

const userRouter = express.Router();

userRouter.docs = [
  {
    method: 'GET',
    path: '/api/user/me',
    requiresAuth: true,
    description: 'Get authenticated user',
    example: `curl -X GET localhost:3000/api/user/me -H 'Authorization: Bearer tttttt'`,
    response: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
  },
  {
    method: 'GET',
    path: '/api/user?page=1&limit=10&name=*',
    requiresAuth: true,
    description: 'List users (admin only) with pagination and name wildcard filter',
    example: `curl -X GET 'localhost:3000/api/user?page=1&limit=10&name=Kai*' -H 'Authorization: Bearer tttttt'`,
    response: { users: [{ id: 3, name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: 'diner' }] }], more: true },
  },
  {
    method: 'PUT',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Update user',
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
  {
    method: 'DELETE',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Delete user (admin only)',
    example: `curl -X DELETE localhost:3000/api/user/1 -H 'Authorization: Bearer tttttt'`,
    response: {},
  },
];

function parsePage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(parsed, 100);
}

// getUser
userRouter.get(
  '/me',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

// updateUser
userRouter.put(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;
    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const updatedUser = await DB.updateUser(userId, name, email, password);
    const auth = await setAuth(updatedUser);
    res.json({ user: updatedUser, token: auth });
  })
);

// deleteUser
userRouter.delete(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    await DB.deleteUser(Number(req.params.userId));
    res.json({});
  })
);

// listUsers
userRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const name = typeof req.query.name === 'string' && req.query.name.length > 0 ? req.query.name : '*';

    const { users, more } = await DB.getUsers(page, limit, name);
    res.json({ users, more });
  })
);

module.exports = userRouter;
