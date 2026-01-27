const request = require("supertest");
const { app, mockDb, Role, authHeader, baseUser, resetMocks } = require("./testUtils");

beforeEach(resetMocks);

describe("franchise endpoints", () => {
  test("lists franchises without auth", async () => {
    mockDb.getFranchises.mockResolvedValue([[{ id: 1, name: "pizzaPocket", stores: [] }], false]);

    const res = await request(app).get("/api/franchise?name=pizza*");

    expect(res.status).toBe(200);
    expect(res.body.franchises[0].name).toBe("pizzaPocket");
    expect(res.body.more).toBe(false);
    expect(mockDb.getFranchises).toHaveBeenCalledWith(undefined, undefined, undefined, "pizza*");
  });

  test("returns user's franchises when authorized", async () => {
    const user = baseUser({ id: 4, roles: [{ role: Role.Diner }] });
    const header = authHeader(user);
    const franchises = [{ id: 2, name: "My Franchise" }];
    mockDb.getUserFranchises.mockResolvedValue(franchises);

    const res = await request(app).get("/api/franchise/4").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(franchises);
    expect(mockDb.getUserFranchises).toHaveBeenCalledWith(4);
  });

  test("blocks franchise creation for non-admins", async () => {
    const user = baseUser({ roles: [{ role: Role.Diner }] });
    const header = authHeader(user);

    const res = await request(app).post("/api/franchise").set("Authorization", header).send({ name: "blocked" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to create a franchise");
    expect(mockDb.createFranchise).not.toHaveBeenCalled();
  });

  test("allows admins to create franchise", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    const created = { id: 9, name: "pizzaPocket", admins: [] };
    mockDb.createFranchise.mockResolvedValue(created);

    const res = await request(app).post("/api/franchise").set("Authorization", header).send({ name: "pizzaPocket" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
    expect(mockDb.createFranchise).toHaveBeenCalledWith({ name: "pizzaPocket" });
  });

  test("deletes a franchise", async () => {
    mockDb.deleteFranchise.mockResolvedValue();
    const res = await request(app).delete("/api/franchise/5");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("franchise deleted");
    expect(mockDb.deleteFranchise).toHaveBeenCalledWith(5);
  });

  test("allows admins to create a store", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.getFranchise.mockResolvedValue({ id: 3, admins: [] });
    mockDb.createStore.mockResolvedValue({ id: 12, name: "SLC" });

    const res = await request(app).post("/api/franchise/3/store").set("Authorization", header).send({ name: "SLC" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 12, name: "SLC" });
    expect(mockDb.createStore).toHaveBeenCalledWith(3, { name: "SLC" });
  });

  test("blocks store creation when user lacks franchise access", async () => {
    const diner = baseUser({ id: 2, roles: [{ role: Role.Diner }] });
    const header = authHeader(diner);
    mockDb.getFranchise.mockResolvedValue({ id: 5, admins: [] });

    const res = await request(app).post("/api/franchise/5/store").set("Authorization", header).send({ name: "LA" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to create a store");
    expect(mockDb.createStore).not.toHaveBeenCalled();
  });

  test("deletes a store when user authorized", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.getFranchise.mockResolvedValue({ id: 8, admins: [] });
    mockDb.deleteStore.mockResolvedValue();

    const res = await request(app).delete("/api/franchise/8/store/3").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("store deleted");
    expect(mockDb.deleteStore).toHaveBeenCalledWith(8, 3);
  });
});
