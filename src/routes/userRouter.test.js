const request = require("supertest");
const { app, mockDb, Role, authHeader, baseUser, resetMocks } = require("./testUtils");

beforeEach(resetMocks);

describe("user endpoints", () => {
  test("returns current user profile", async () => {
    const user = baseUser({ id: 101 });
    const header = authHeader(user);

    const res = await request(app).get("/api/user/me").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(101);
    expect(res.body.email).toBe(user.email);
  });

  test("blocks profile update for other users", async () => {
    const user = baseUser({ id: 1, roles: [{ role: Role.Diner }] });
    const header = authHeader(user);

    const res = await request(app)
      .put("/api/user/99")
      .set("Authorization", header)
      .send({ name: "hacker" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unauthorized");
    expect(mockDb.updateUser).not.toHaveBeenCalled();
  });

  test("PUT /api/user persists name/email/password changes end-to-end", async () => {
    const user = baseUser({ id: 11, email: "old@test.com", name: "Old Name" });
    const header = authHeader(user);
    const updated = { ...user, name: "Updated Name", email: "new@test.com" };
    mockDb.updateUser.mockResolvedValue(updated);
    mockDb.loginUser.mockResolvedValue();
    mockDb.getUser.mockResolvedValue(updated);

    const updateRes = await request(app)
      .put("/api/user/11")
      .set("Authorization", header)
      .send({ name: updated.name, email: updated.email, password: "new-password" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.name).toBe("Updated Name");
    expect(updateRes.body.user.email).toBe("new@test.com");
    expect(updateRes.body.token).toBe("signed-11");
    expect(mockDb.updateUser).toHaveBeenCalledWith(11, updated.name, updated.email, "new-password");

    const loginRes = await request(app).put("/api/auth").send({ email: updated.email, password: "new-password" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.name).toBe("Updated Name");
    expect(loginRes.body.user.email).toBe("new@test.com");
    expect(mockDb.getUser).toHaveBeenCalledWith("new@test.com", "new-password");
  });

  test("GET /api/user unauthorized -> 401", async () => {
    const res = await request(app).get("/api/user");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("GET /api/user non-admin -> forbidden", async () => {
    const diner = baseUser({ roles: [{ role: Role.Diner }] });
    const header = authHeader(diner);

    const res = await request(app).get("/api/user").set("Authorization", header);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unauthorized");
  });

  test("GET /api/user admin -> 200 + users + more", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    const users = [{ id: 3, name: "Kai Chen", email: "d@jwt.com", roles: [{ role: Role.Diner }] }];
    mockDb.getUsers.mockResolvedValue({ users, more: true });

    const res = await request(app).get("/api/user").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual(users);
    expect(res.body.more).toBe(true);
    expect(mockDb.getUsers).toHaveBeenCalledWith(1, 10, "*");
  });

  test("GET /api/user supports page/limit behavior", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.getUsers.mockResolvedValue({ users: [], more: false });

    const res = await request(app).get("/api/user?page=3&limit=2").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(mockDb.getUsers).toHaveBeenCalledWith(3, 2, "*");
  });

  test("GET /api/user supports name filter wildcard input", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.getUsers.mockResolvedValue({ users: [], more: false });

    const res = await request(app).get("/api/user?name=Kai*").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(mockDb.getUsers).toHaveBeenCalledWith(1, 10, "Kai*");
  });

  test("GET /api/user excludes sensitive fields", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.getUsers.mockResolvedValue({
      users: [{ id: 3, name: "Kai Chen", email: "d@jwt.com", roles: [{ role: Role.Diner }] }],
      more: false,
    });

    const res = await request(app).get("/api/user").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.users[0].password).toBeUndefined();
    expect(res.body.users[0].hash).toBeUndefined();
  });

  test("DELETE /api/user unauthorized -> 401", async () => {
    const res = await request(app).delete("/api/user/11");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("DELETE /api/user non-admin -> forbidden", async () => {
    const user = baseUser({ roles: [{ role: Role.Diner }] });
    const header = authHeader(user);

    const res = await request(app).delete("/api/user/11").set("Authorization", header);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unauthorized");
    expect(mockDb.deleteUser).not.toHaveBeenCalled();
  });

  test("DELETE /api/user admin deletes target user", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.deleteUser.mockResolvedValue();

    const res = await request(app).delete("/api/user/11").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(mockDb.deleteUser).toHaveBeenCalledWith(11);
  });

  test("DELETE /api/user unknown id -> not-found", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.deleteUser.mockRejectedValue({ statusCode: 404, message: "unknown user" });

    const res = await request(app).delete("/api/user/999").set("Authorization", header);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("unknown user");
  });
});
