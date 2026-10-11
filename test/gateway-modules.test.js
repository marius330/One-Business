import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCore, tenantWithOwner, call, rejectsWith } from "./helpers.js";

test("contracts reuses CRM customers through a declared dependency", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.subscriptions.activate(A.tenant.id, "contracts");
  const cust = await call(core, A.actor, "crm", "customers", "create", { name: "Client SRL" });
  const ctr = await call(core, A.actor, "contracts", "contracts", "create", { customerId: cust.id, title: "Servicii", startsAt: "2026-01-01", endsAt: "2026-12-31", valueBani: 100000, terms: [{ title: "Rata 1", dueAt: "2026-06-01" }] });
  assert.equal(ctr.customerName, "Client SRL");
  assert.equal(ctr.status, "draft");
  const deadlines = await call(core, A.actor, "contracts", "deadlines", "list", {});
  assert.deepEqual(deadlines.map((d) => d.type).sort(), ["contract.expiry", "contract.notice", "contract.term"]);
  assert.ok(deadlines.every((d) => d.module === "contracts" && d.ref === ctr.id));
  await call(core, A.actor, "contracts", "contracts", "setStatus", { id: ctr.id, status: "active" });
  await call(core, A.actor, "contracts", "contracts", "setStatus", { id: ctr.id, status: "terminated" });
  assert.equal((await call(core, A.actor, "contracts", "deadlines", "list", {})).length, 0);
  await rejectsWith(call(core, A.actor, "contracts", "contracts", "setStatus", { id: ctr.id, status: "active" }), "VALIDATION_ERROR");
});

test("a module cannot use a dependency the tenant has not paid for", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "contracts");
  const e = await rejectsWith(call(core, A.actor, "contracts", "contracts", "create", { customerId: "cus_x", title: "T", startsAt: "2026-01-01", endsAt: "2026-02-01" }), "DEPENDENCY_NOT_ACTIVE");
  assert.equal(e.details.module, "crm");
  assert.deepEqual(await call(core, A.actor, "contracts", "contracts", "list", {}), []);
});

test("undeclared cross-module calls are refused by the registry", async () => {
  const core = freshCore();
  core.registry.register({
    id: "rogue", name: "Rogue", version: "1.0.0", contract: "business/v1",
    provides: { probe: ["run"] }, uses: [], permissions: ["rogue:probe:run"], plans: { standard: { monthlyPriceBani: 0 } },
    handlers: { probe: { run: (ctx) => ctx.call("crm", "customers", "list", {}) } },
  });
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.subscriptions.activate(A.tenant.id, "rogue");
  await rejectsWith(call(core, A.actor, "rogue", "probe", "run", {}), "UNDECLARED_DEPENDENCY");
});

test("module-private collections are namespaced per module and per tenant", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  await call(core, A.actor, "crm", "customers", "create", { name: "Client N" });
  const names = core.storage.forTenant(A.tenant.id).collectionNames();
  assert.ok(names.includes("crm.customers"));
  assert.ok(!names.includes("customers"));
});

test("manifest validation rejects broken modules", () => {
  const core = freshCore();
  assert.throws(() => core.registry.register({ id: "xx", name: "X", version: "1.0.0", contract: "business/v9", provides: {}, plans: { s: { monthlyPriceBani: 1 } } }), /Unsupported contract/);
  assert.throws(() => core.registry.register({ id: "xx", name: "X", version: "1.0.0", contract: "business/v1", provides: { aa: ["bb"] }, plans: { s: { monthlyPriceBani: 1 } }, handlers: {} }), /Missing handler/);
  assert.throws(() => core.registry.register({ id: "crm", name: "X", version: "1.0.0", contract: "business/v1", provides: {}, plans: { s: { monthlyPriceBani: 1 } } }), /already registered/);
  const catalog = core.registry.catalog();
  assert.ok(catalog.every((m) => !("handlers" in m)));
});
