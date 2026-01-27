const request = require("supertest");
const { app, mockDb, Role, baseUser, authHeader, resetMocks } = require("./testUtils");

beforeEach(resetMocks);

describe("auth endpoints", () => {
  test("rejects registration with missing fields", async () => {
    const res = await request(app).post("/api/auth").send({ email: "bad@test.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
    expect(mockDb.addUser).not.toHaveBeenCalled();
  });

  test("registers and logs in a new diner", async () => {
    const createdUser = { ...baseUser({ id: 2 }) };
    mockDb.addUser.mockResolvedValue(createdUser);
    mockDb.loginUser.mockResolvedValue();

    const res = await request(app)
      .post("/api/auth")
      .send({ name: createdUser.name, email: createdUser.email, password: "secret" });

    expect(res.status).toBe(200);
    expect(mockDb.addUser).toHaveBeenCalledWith({
      name: createdUser.name,
      email: createdUser.email,
      password: "secret",
      roles: [{ role: Role.Diner }],
    });
    expect(res.body.token).toBe("signed-2");
    expect(res.body.user).toMatchObject({ id: 2, email: createdUser.email, name: createdUser.name });
  });

  test("logs in an existing user and returns JWT", async () => {
    const existingUser = baseUser({ id: 5 });
    mockDb.getUser.mockResolvedValue(existingUser);
    mockDb.loginUser.mockResolvedValue();

    const res = await request(app).put("/api/auth").send({ email: existingUser.email, password: "secret" });

    expect(res.status).toBe(200);
    expect(mockDb.getUser).toHaveBeenCalledWith(existingUser.email, "secret");
    expect(res.body.token).toBe("signed-5");
    expect(res.body.user).toMatchObject({ id: 5, email: existingUser.email });
  });

  test("requires authentication to log out", async () => {
    mockDb.isLoggedIn.mockResolvedValue(false);
    const res = await request(app).delete("/api/auth");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
    expect(mockDb.logoutUser).not.toHaveBeenCalled();
  });

  test("logs out and revokes token", async () => {
    const header = authHeader(baseUser());
    const res = await request(app).delete("/api/auth").set("Authorization", header);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("logout successful");
    expect(mockDb.logoutUser).toHaveBeenCalledWith("valid.token.signature");
  });
});
