// Shared test utilities and mocks for route tests.
const mockDb = {
  addUser: jest.fn(),
  getUser: jest.fn(),
  updateUser: jest.fn(),
  loginUser: jest.fn(),
  isLoggedIn: jest.fn(),
  logoutUser: jest.fn(),
  getMenu: jest.fn(),
  addMenuItem: jest.fn(),
  getOrders: jest.fn(),
  addDinerOrder: jest.fn(),
  getFranchises: jest.fn(),
  getUserFranchises: jest.fn(),
  createFranchise: jest.fn(),
  deleteFranchise: jest.fn(),
  getFranchise: jest.fn(),
  createStore: jest.fn(),
  deleteStore: jest.fn(),
};

jest.mock("../database/database.js", () => {
  const Role = { Admin: "admin", Franchisee: "franchisee", Diner: "diner" };
  return { Role, DB: mockDb };
});

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn((payload) => `signed-${payload.id ?? "token"}`),
  verify: jest.fn(() => ({ id: 1, name: "Tester", email: "t@test.com", roles: [{ role: "diner" }] })),
}));
const jwt = require("jsonwebtoken");

global.fetch = jest.fn();

const { Role } = require("../database/database.js");
const app = require("../service");

const baseUser = (overrides = {}) => ({
  id: 10,
  name: "QA Diner",
  email: "qa@test.com",
  roles: [{ role: Role.Diner }],
  ...overrides,
});

const authHeader = (user = baseUser()) => {
  mockDb.isLoggedIn.mockResolvedValue(true);
  jwt.verify.mockReturnValue(user);
  return "Bearer valid.token.signature";
};

const resetMocks = () => {
  jest.clearAllMocks();
  mockDb.isLoggedIn.mockResolvedValue(false);
  global.fetch.mockReset();
};

module.exports = { app, mockDb, Role, baseUser, authHeader, resetMocks };
