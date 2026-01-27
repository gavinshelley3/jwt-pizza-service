const request = require("supertest");
const { app, authHeader, baseUser, resetMocks } = require("./testUtils");

beforeEach(resetMocks);

describe("service shell endpoints", () => {
  test("returns welcome message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/welcome to JWT Pizza/i);
    expect(res.body.version).toBeDefined();
  });

  test("aggregates docs with config", async () => {
    const res = await request(app).get("/api/docs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body.endpoints.length).toBeGreaterThan(4);
    expect(res.body.config).toHaveProperty("factory");
    expect(res.body.config).toHaveProperty("db");
  });

  test("returns 404 for unknown endpoints", async () => {
    const res = await request(app).get("/no/such/path");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("unknown endpoint");
  });

  test("surfaces router errors with status code", async () => {
    const user = baseUser();
    const header = authHeader(user);
    const res = await request(app).post("/api/franchise").set("Authorization", header).send({ name: "new" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to create a franchise");
  });
});
