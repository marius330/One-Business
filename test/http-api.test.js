import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../apps/api/server.js";
import { SYNTHETIC_PASSWORD } from "../seed/synthetic.js";

const srv = await startServer({ port: 0, platformKey: "test-platform-key" });
after(() => srv.server.close());

const post = (path, body, headers = {}) => fetch(srv.url + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (path, headers = {}) => fetch(srv.url + path, { headers });

test("health, discovery and contracts are public; registry is not", async () => {
  assert.equal((await get("/health")).status, 200);
  const disc = await (await get("/UNIVERSAL_CORE.json")).json();
  assert.ok(disc.discovery.gateway);
  assert.ok(!("modules" in disc));
  assert.equal((await get("/api/v1/platform/catalog")).status, 401);
  assert.equal((await get("/api/v1/platform/catalog", { "x-platform-key": "wrong" })).status, 401);
  assert.equal((await get("/api/v1/platform/catalog", { "x-platform-key": "test-platform-key" })).status, 200);
});

test("login + gateway over HTTP; tenant comes from the session", async () => {
  const login = await post("/api/v1/auth/login", { cui: "RO41234567", email: "owner@alfa-demo.test", password: SYNTHETIC_PASSWORD });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const auth = { authorization: `Bearer ${token}` };
  const r = await post("/api/v1/gateway", { module: "crm", capability: "customers", action: "list", payload: { tenantId: "ten_other" } }, auth);
  assert.equal(r.status, 200);
  const { result } = await r.json();
  assert.equal(result.length, 3);
  const me = await (await get("/api/v1/me", auth)).json();
  assert.deepEqual(me.activeModules.sort(), ["contracts", "crm"]);
  const inv = await (await get("/api/v1/me/invoice-preview", auth)).json();
  assert.equal(inv.lines.length, 2);
  const exp = await (await get("/api/v1/me/export", auth)).json();
  assert.equal(exp.tenantId, me.tenant.id);
});

test("employee is denied billing and archive over HTTP with stable error codes", async () => {
  const { token } = await (await post("/api/v1/auth/login", { cui: "RO41234567", email: "angajat@alfa-demo.test", password: SYNTHETIC_PASSWORD })).json();
  const auth = { authorization: `Bearer ${token}` };
  const inv = await get("/api/v1/me/invoice-preview", auth);
  assert.equal(inv.status, 403);
  assert.equal((await inv.json()).error, "PERMISSION_DENIED");
  const list = await (await post("/api/v1/gateway", { module: "crm", capability: "customers", action: "list" }, auth)).json();
  const r = await post("/api/v1/gateway", { module: "crm", capability: "customers", action: "archive", payload: { id: list.result[0].id } }, auth);
  assert.equal(r.status, 403);
});

test("trial tenant without contracts gets MODULE_NOT_ACTIVE; suspended tenant gets TENANT_SUSPENDED", async () => {
  const b = await (await post("/api/v1/auth/login", { cui: "RO52345678", email: "owner@beta-demo.test", password: SYNTHETIC_PASSWORD })).json();
  const rb = await post("/api/v1/gateway", { module: "contracts", capability: "contracts", action: "list" }, { authorization: `Bearer ${b.token}` });
  assert.equal((await rb.json()).error, "MODULE_NOT_ACTIVE");
  const c = await (await post("/api/v1/auth/login", { cui: "RO63456789", email: "owner@gama-demo.test", password: SYNTHETIC_PASSWORD })).json();
  const rc = await post("/api/v1/gateway", { module: "crm", capability: "customers", action: "list" }, { authorization: `Bearer ${c.token}` });
  assert.equal((await rc.json()).error, "MODULE_NOT_ACTIVE");
  // Operator suspends the whole tenant
  const ov = await (await get("/api/v1/platform/overview", { "x-platform-key": "test-platform-key" })).json();
  const gama = ov.tenants.find((t) => t.cui === "63456789");
  await post(`/api/v1/platform/tenants/${gama.id}/status`, { status: "suspended", reason: "test" }, { "x-platform-key": "test-platform-key" });
  const rc2 = await post("/api/v1/gateway", { module: "crm", capability: "customers", action: "list" }, { authorization: `Bearer ${c.token}` });
  assert.equal((await rc2.json()).error, "TENANT_SUSPENDED");
});

test("unknown routes and bad JSON are handled", async () => {
  assert.equal((await get("/api/v1/nope")).status, 404);
  const r = await fetch(srv.url + "/api/v1/auth/login", { method: "POST", body: "{bad", headers: { "content-type": "application/json" } });
  assert.equal(r.status, 400);
});
