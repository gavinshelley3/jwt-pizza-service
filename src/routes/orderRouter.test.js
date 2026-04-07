const request = require("supertest");
const { app, mockDb, Role, authHeader, baseUser, resetMocks } = require("./testUtils");

beforeEach(resetMocks);

describe("order endpoints", () => {
  test("gets menu without authentication", async () => {
    const menu = [{ id: 1, title: "Veggie" }];
    mockDb.getMenu.mockResolvedValue(menu);

    const res = await request(app).get("/api/order/menu");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(menu);
    expect(mockDb.getMenu).toHaveBeenCalled();
  });

  test("denies adding menu items to non-admins", async () => {
    const header = authHeader(baseUser({ roles: [{ role: Role.Diner }] }));

    const res = await request(app).put("/api/order/menu").set("Authorization", header).send({ title: "New" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to add menu item");
    expect(mockDb.addMenuItem).not.toHaveBeenCalled();
  });

  test("allows admins to add menu items", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    mockDb.addMenuItem.mockResolvedValue({ id: 9 });
    const menu = [{ id: 9, title: "Student" }];
    mockDb.getMenu.mockResolvedValue(menu);

    const res = await request(app)
      .put("/api/order/menu")
      .set("Authorization", header)
      .send({ title: "Student", description: "Plain", image: "pizza9.png", price: 0.1 });

    expect(res.status).toBe(200);
    expect(mockDb.addMenuItem).toHaveBeenCalledWith({
      title: "Student",
      description: "Plain",
      image: "pizza9.png",
      price: 0.1,
    });
    expect(res.body).toEqual(menu);
  });

  test("returns orders for authenticated diner", async () => {
    const diner = baseUser({ id: 22 });
    const header = authHeader(diner);
    const orders = { dinerId: 22, orders: [{ id: 1 }], page: 1 };
    mockDb.getOrders.mockResolvedValue(orders);

    const res = await request(app).get("/api/order").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(orders);
    expect(mockDb.getOrders).toHaveBeenCalledWith(diner, undefined);
  });

  test("creates an order and forwards to factory", async () => {
    const diner = baseUser({ id: 31 });
    const header = authHeader(diner);
    mockDb.addDinerOrder.mockResolvedValue({ id: 5, items: [] });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reportUrl: "http://report", jwt: "factory-jwt" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", header)
      .send({ franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: "Veggie", price: 0.05 }] });

    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ id: 5 });
    expect(res.body.followLinkToEndChaos).toBe("http://report");
    expect(res.body.jwt).toBe("factory-jwt");
    expect(global.fetch).toHaveBeenCalled();
  });

  test("returns 500 when factory rejects order", async () => {
    const diner = baseUser({ id: 41 });
    const header = authHeader(diner);
    mockDb.addDinerOrder.mockResolvedValue({ id: 7, items: [] });
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ reportUrl: "http://fail" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", header)
      .send({ franchiseId: 1, storeId: 2, items: [] });

    expect(res.status).toBe(500);
    expect(res.body.followLinkToEndChaos).toBe("http://fail");
  });
  test("allows admins to enable chaos", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);

    const res = await request(app).put("/api/order/chaos/true").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chaos: true });
  });

  test("allows admins to disable chaos", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);
    await request(app).put("/api/order/chaos/true").set("Authorization", header);

    const res = await request(app).put("/api/order/chaos/false").set("Authorization", header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chaos: false });
  });

  test("rejects invalid chaos state", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const header = authHeader(admin);

    const res = await request(app).put("/api/order/chaos/not-real").set("Authorization", header);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("invalid chaos state");
  });

  test("requires auth for chaos toggle", async () => {
    const res = await request(app).put("/api/order/chaos/true");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("prevents non-admins from toggling chaos", async () => {
    const diner = baseUser({ roles: [{ role: Role.Diner }] });
    const header = authHeader(diner);

    const res = await request(app).put("/api/order/chaos/true").set("Authorization", header);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to toggle chaos");
  });

  test("creates an order when chaos is disabled", async () => {
    const diner = baseUser({ id: 61 });
    const header = authHeader(diner);
    mockDb.addDinerOrder.mockResolvedValue({ id: 11, items: [] });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reportUrl: "http://steady", jwt: "jwt-ok" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", header)
      .send({ franchiseId: 3, storeId: 4, items: [] });

    expect(res.status).toBe(200);
    expect(res.body.followLinkToEndChaos).toBe("http://steady");
    expect(global.fetch).toHaveBeenCalled();
  });

  test("fails an order when chaos is enabled and randomness triggers failure", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const adminHeader = authHeader(admin);
    await request(app).put("/api/order/chaos/true").set("Authorization", adminHeader);

    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.1);
    const diner = baseUser({ id: 71 });
    const dinerHeader = authHeader(diner);
    mockDb.addDinerOrder.mockResolvedValue({ id: 12, items: [] });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", dinerHeader)
      .send({ franchiseId: 5, storeId: 6, items: [] });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Chaos monkey");
    expect(global.fetch).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  test("allows orders when chaos is enabled but randomness passes", async () => {
    const admin = baseUser({ roles: [{ role: Role.Admin }] });
    const adminHeader = authHeader(admin);
    await request(app).put("/api/order/chaos/true").set("Authorization", adminHeader);

    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.9);
    const diner = baseUser({ id: 81 });
    const dinerHeader = authHeader(diner);
    mockDb.addDinerOrder.mockResolvedValue({ id: 13, items: [] });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reportUrl: "http://chaos-ok", jwt: "chaos-jwt" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", dinerHeader)
      .send({ franchiseId: 7, storeId: 8, items: [] });

    expect(res.status).toBe(200);
    expect(res.body.followLinkToEndChaos).toBe("http://chaos-ok");
    expect(global.fetch).toHaveBeenCalled();
    randomSpy.mockRestore();
  });

});
