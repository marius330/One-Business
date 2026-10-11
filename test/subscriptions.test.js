import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCore, tenantWithOwner, call, rejectsWith } from "./helpers.js";

test("a tenant pays only for activated modules; trials are free", () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm", { plan: "team", seats: 4 });
  core.subscriptions.activate(A.tenant.id, "contracts", { trial: true });
  const inv = core.subscriptions.computeInvoice(A.tenant.id);
  assert.deepEqual(inv.lines.map((l) => l.moduleId), ["crm"]);
  assert.equal(inv.lines[0].quantity, 4);
  assert.equal(inv.subtotalBani, 4 * 2900);
  assert.equal(inv.totalBani, inv.subtotalBani + inv.vatBani);
  assert.equal(inv.currency, "RON");
});

test("module gating: not subscribed -> denied; active -> allowed; suspended -> denied", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  await rejectsWith(call(core, A.actor, "crm", "customers", "list", {}), "MODULE_NOT_ACTIVE");
  core.subscriptions.activate(A.tenant.id, "crm");
  assert.deepEqual(await call(core, A.actor, "crm", "customers", "list", {}), []);
  core.subscriptions.suspend(A.tenant.id, "crm", "non_payment");
  const e = await rejectsWith(call(core, A.actor, "crm", "customers", "list", {}), "MODULE_NOT_ACTIVE");
  assert.equal(e.details.reason, "subscription_suspended");
  core.subscriptions.reactivate(A.tenant.id, "crm");
  assert.deepEqual(await call(core, A.actor, "crm", "customers", "list", {}), []);
});

test("trial expires with the clock", async () => {
  let t = new Date("2026-01-01T00:00:00Z");
  const core = freshCore({ clock: () => t });
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm", { trial: true, trialDays: 14 });
  assert.ok(core.subscriptions.isUsable(A.tenant.id, "crm").ok);
  t = new Date("2026-01-20T00:00:00Z");
  const e = await rejectsWith(call(core, A.actor, "crm", "customers", "list", {}), "MODULE_NOT_ACTIVE");
  assert.equal(e.details.reason, "trial_expired");
  assert.equal(core.subscriptions.computeInvoice(A.tenant.id).lines.length, 0);
});

test("suspended tenant is denied everything through the gateway", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  core.tenants.setStatus(A.tenant.id, "suspended", "manual");
  await rejectsWith(call(core, A.actor, "crm", "customers", "list", {}), "TENANT_SUSPENDED");
});

test("unknown module or plan cannot be activated", () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  assert.throws(() => core.subscriptions.activate(A.tenant.id, "mintberg"), /not found/);
  assert.throws(() => core.subscriptions.activate(A.tenant.id, "crm", { plan: "enterprise" }), /Unknown plan/);
});
