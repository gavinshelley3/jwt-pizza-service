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

  test("updates own profile and returns new token", async () => {
    const user = baseUser({ id: 11 });
    const header = authHeader(user);
    const updated = { ...user, name: "Updated Name" };
    mockDb.updateUser.mockResolvedValue(updated);
    mockDb.loginUser.mockResolvedValue();

    const res = await request(app)
      .put("/api/user/11")
      .set("Authorization", header)
      .send({ name: updated.name, email: updated.email });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Updated Name");
    expect(res.body.token).toBe("signed-11");
    expect(mockDb.updateUser).toHaveBeenCalledWith(11, updated.name, updated.email, undefined);
  });

  test("delete endpoint is a stub", async () => {
    const user = baseUser();
    const header = authHeader(user);

    const res = await request(app).delete("/api/user/11").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("not implemented");
  });

  test("list endpoint is a stub", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);

    const res = await request(app).get("/api/user").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("not implemented");
    expect(res.body.users).toEqual([]);
  });
});
