import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCore, tenantWithOwner, call, rejectsWith } from "./helpers.js";

test("a tenant cannot read another tenant's records, even by id", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  const B = tenantWithOwner(core, "RO10000002", "B SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.subscriptions.activate(B.tenant.id, "crm");
  const custA = await call(core, A.actor, "crm", "customers", "create", { name: "Secret A" });
  await rejectsWith(call(core, B.actor, "crm", "customers", "get", { id: custA.id }), "NOT_FOUND");
  const listB = await call(core, B.actor, "crm", "customers", "list", {});
  assert.equal(listB.length, 0);
});

test("tenantId in the payload is ignored: the tenant always comes from the session", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  const B = tenantWithOwner(core, "RO10000002", "B SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.subscriptions.activate(B.tenant.id, "crm");
  const c = await call(core, B.actor, "crm", "customers", "create", { name: "Created by B", tenantId: A.tenant.id, userId: A.actor.userId });
  assert.equal(c.tenantId, B.tenant.id);
  assert.equal(c.ownerUserId, B.actor.userId);
  assert.equal((await call(core, A.actor, "crm", "customers", "list", {})).length, 0);
});

test("login is tenant-scoped: same email in two SRLs are different accounts", () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  const B = tenantWithOwner(core, "RO10000002", "B SRL");
  core.identity.createUser(A.tenant.id, { email: "shared@x.test", password: "parola-A-1234", fullName: "A" });
  core.identity.createUser(B.tenant.id, { email: "shared@x.test", password: "parola-B-1234", fullName: "B" });
  assert.throws(() => core.identity.login(A.tenant.id, "shared@x.test", "parola-B-1234"), /Invalid credentials/);
  const s = core.identity.login(B.tenant.id, "shared@x.test", "parola-B-1234");
  assert.equal(core.identity.authenticate(s.token).tenantId, B.tenant.id);
});

test("export contains only the tenant's own data; restore refuses another tenant's snapshot", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  const B = tenantWithOwner(core, "RO10000002", "B SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.subscriptions.activate(B.tenant.id, "crm");
  await call(core, A.actor, "crm", "customers", "create", { name: "Only A" });
  await call(core, B.actor, "crm", "customers", "create", { name: "Only B" });
  const snapA = core.platform.exportTenant(A.tenant.id);
  const rows = Object.values(snapA.collections).flat();
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.tenantId === A.tenant.id));
  assert.ok(!JSON.stringify(snapA).includes("Only B"));
  assert.throws(() => core.platform.restoreTenant(B.tenant.id, snapA), /another tenant/);
  // Round-trip restore for A
  await call(core, A.actor, "crm", "customers", "create", { name: "After snapshot" });
  core.platform.restoreTenant(A.tenant.id, snapA);
  const names = (await call(core, A.actor, "crm", "customers", "list", {})).map((c) => c.name);
  assert.deepEqual(names, ["Only A"]);
});

test("tenant CUI must be unique and well-formed", () => {
  const core = freshCore();
  tenantWithOwner(core, "RO10000001", "A SRL");
  assert.throws(() => tenantWithOwner(core, "10000001", "Dup SRL"), /already exists/);
  assert.throws(() => tenantWithOwner(core, "ROABC", "Bad SRL"), /CUI format invalid/);
});
