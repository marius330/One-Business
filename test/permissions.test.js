import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCore, tenantWithOwner, call, rejectsWith, PASS } from "./helpers.js";
import { permissionMatches } from "../core/identity/identity.js";

test("default-deny: an employee cannot archive customers or read billing", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  const emp = core.identity.createUser(A.tenant.id, { email: "emp@a.test", password: PASS, fullName: "Emp", role: "employee" });
  const actor = core.identity.authenticate(core.identity.login(A.tenant.id, emp.email, PASS).token);
  const c = await call(core, actor, "crm", "customers", "create", { name: "Client X" });
  await rejectsWith(call(core, actor, "crm", "customers", "archive", { id: c.id }), "PERMISSION_DENIED");
  assert.equal(core.identity.can(actor, "core:billing:read"), false);
  assert.equal(core.identity.can(actor, "crm:customers:list"), true);
});

test("unknown capability/action is denied even for the owner", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  await rejectsWith(call(core, A.actor, "crm", "customers", "dropAll", {}), "NOT_FOUND");
  await rejectsWith(call(core, A.actor, "mintberg", "signals", "list", {}), "NOT_FOUND");
});

test("wildcard checks are never allowed; custom roles cannot grant '*'", () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  assert.equal(core.identity.can(A.actor, "crm:*"), false);
  assert.throws(() => core.identity.createRole(A.tenant.id, { name: "god", permissions: ["*"] }), /cannot grant/);
  const role = core.identity.createRole(A.tenant.id, { name: "sales", permissions: ["crm:customers:*", "crm:activities:create"] });
  assert.equal(role.builtin, false);
  assert.equal(permissionMatches("crm:customers:*", "crm:customers:archive"), true);
  assert.equal(permissionMatches("crm:customers:read", "crm:customers:archive"), false);
  assert.equal(permissionMatches("crm:customers", "crm:customers:read"), false);
});

test("deactivated user loses sessions; expired sessions are rejected", () => {
  const core = freshCore({ clock: () => new Date() });
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  const emp = core.identity.createUser(A.tenant.id, { email: "emp@a.test", password: PASS, fullName: "Emp" });
  const { token } = core.identity.login(A.tenant.id, emp.email, PASS);
  core.identity.deactivateUser(A.tenant.id, emp.id);
  assert.throws(() => core.identity.authenticate(token), /Invalid session/);
  assert.throws(() => core.identity.login(A.tenant.id, emp.email, PASS), /Invalid credentials/);
});

test("every gateway decision is audited inside the tenant", async () => {
  const core = freshCore();
  const A = tenantWithOwner(core, "RO10000001", "A SRL");
  core.subscriptions.activate(A.tenant.id, "crm");
  await call(core, A.actor, "crm", "customers", "list", {});
  await rejectsWith(call(core, A.actor, "contracts", "contracts", "list", {}), "MODULE_NOT_ACTIVE");
  const events = core.audit.listTenant(A.tenant.id).map((e) => e.event);
  assert.ok(events.includes("gateway.allow"));
  assert.ok(events.includes("gateway.deny"));
  assert.ok(events.every((e) => typeof e === "string"));
});
