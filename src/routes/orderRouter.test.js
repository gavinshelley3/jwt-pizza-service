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
      json: async () => ({ reportUrl: "http://report", jwt: "factory-jwt" }),
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
      json: async () => ({ reportUrl: "http://fail" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", header)
      .send({ franchiseId: 1, storeId: 2, items: [] });

    expect(res.status).toBe(500);
    expect(res.body.followLinkToEndChaos).toBe("http://fail");
  });
});
