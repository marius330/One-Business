/**
 * Identity & Permissions.
 *
 * - Users belong to exactly one tenant (a person with two SRLs has two accounts; linking is a later feature).
 * - Roles are tenant-scoped. Built-in templates: owner, admin, accountant, employee. Custom roles allowed.
 * - Permissions are strings "module:capability:action" (e.g. "crm:customers:read"). Wildcards allowed
 *   in ROLE definitions only ("crm:*", "crm:customers:*"), never in checks.
 * - Default-deny: a permission must be explicitly granted by a role. There is no implicit access.
 * - Sessions: opaque random tokens, bound to (userId, tenantId). The tenant is ALWAYS derived from the
 *   session on the server, never from the request payload.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, newToken, now } from "../ids.js";
import { CoreError, invalid, notFound, unauthenticated } from "../errors.js";

export const BUILTIN_ROLES = Object.freeze({
  owner: { description: "Proprietar / administrator SRL. Acces complet, inclusiv abonamente și export.", permissions: ["*"] },
  admin: {
    description: "Administrator operațional. Toate modulele, fără abonamente/ștergere tenant.",
    permissions: ["crm:*", "contracts:*", "inventory:*", "invoicing:*", "finance:*", "hr:*", "core:workflow:*", "core:audit:read", "core:users:*"],
  },
  accountant: {
    description: "Contabil. Citire comercială + scriere pe facturare/financiar.",
    permissions: ["crm:customers:list", "crm:customers:get", "contracts:contracts:list", "contracts:contracts:get", "contracts:deadlines:*", "invoicing:*", "finance:*", "core:audit:read", "core:billing:read", "core:export:run"],
  },
  employee: {
    description: "Angajat. Operațiuni de zi cu zi, fără ștergeri și fără date financiare.",
    permissions: ["crm:customers:list", "crm:customers:get", "crm:customers:create", "crm:customers:update", "crm:contacts:*", "crm:activities:*", "contracts:contracts:list", "contracts:contracts:get", "contracts:deadlines:*", "core:workflow:read"],
  },
});

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** True if `granted` (may contain wildcards) covers `required` (never wildcards). */
export function permissionMatches(granted, required) {
  if (granted === "*") return true;
  const g = granted.split(":");
  const r = required.split(":");
  for (let i = 0; i < r.length; i++) {
    if (g[i] === "*") return true;
    if (g[i] !== r[i]) return false;
  }
  return g.length === r.length;
}

export class IdentityService {
  #storage;
  #audit;
  #sessions = new Map(); // token -> session (platform-level index; carries only ids)
  constructor({ storage, audit }) {
    this.#storage = storage;
    this.#audit = audit;
  }

  #users(tenantId) {
    return this.#storage.forTenant(tenantId).collection("users");
  }
  #roles(tenantId) {
    return this.#storage.forTenant(tenantId).collection("roles");
  }

  ensureBuiltinRoles(tenantId) {
    const roles = this.#roles(tenantId);
    for (const [name, def] of Object.entries(BUILTIN_ROLES)) {
      if (!roles.get(`role_${name}`)) roles.insert({ id: `role_${name}`, name, builtin: true, ...def });
    }
  }

  createRole(tenantId, { name, description = "", permissions = [] }) {
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(name ?? "")) throw invalid("Role name invalid");
    if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== "string")) throw invalid("permissions must be string[]");
    if (permissions.includes("*")) throw invalid("Custom roles cannot grant '*'");
    return this.#roles(tenantId).insert({ id: `role_${name}`, name, description, permissions, builtin: false });
  }
  listRoles(tenantId) {
    return this.#roles(tenantId).list();
  }

  createUser(tenantId, { email, password, fullName, role = "employee" }) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? "")) throw invalid("Email invalid");
    if (typeof password !== "string" || password.length < 10) throw invalid("Password must have at least 10 characters");
    this.ensureBuiltinRoles(tenantId);
    if (!this.#roles(tenantId).get(`role_${role}`)) throw invalid("Unknown role", { role });
    const users = this.#users(tenantId);
    if (users.list((u) => u.email === email.toLowerCase()).length) throw new CoreError("USER_EXISTS", "Email already registered in this tenant", 409);
    const user = users.insert({ email: email.toLowerCase(), fullName, role, passwordHash: hashPassword(password), active: true }, "usr");
    this.#audit.tenant(tenantId, "user.created", { userId: user.id, role });
    return this.#public(user);
  }
  #public(user) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
  listUsers(tenantId) {
    return this.#users(tenantId).list().map((u) => this.#public(u));
  }
  setUserRole(tenantId, userId, role) {
    if (!this.#roles(tenantId).get(`role_${role}`)) throw invalid("Unknown role", { role });
    return this.#public(this.#users(tenantId).update(userId, { role }));
  }
  deactivateUser(tenantId, userId) {
    const u = this.#users(tenantId).update(userId, { active: false });
    for (const [token, s] of this.#sessions) if (s.userId === userId) this.#sessions.delete(token);
    return this.#public(u);
  }

  /** Login is scoped to a tenant: the same email may exist in several SRLs. */
  login(tenantId, email, password) {
    const users = this.#users(tenantId);
    const user = users.list((u) => u.email === (email ?? "").toLowerCase())[0];
    if (!user || !user.active || !verifyPassword(password ?? "", user.passwordHash)) {
      this.#audit.tenant(tenantId, "auth.login_failed", { email });
      throw unauthenticated("Invalid credentials");
    }
    const token = newToken();
    const session = { token, userId: user.id, tenantId, createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
    this.#sessions.set(token, session);
    this.#audit.tenant(tenantId, "auth.login", { userId: user.id });
    return { token, expiresAt: session.expiresAt, user: this.#public(user) };
  }
  logout(token) {
    return this.#sessions.delete(token);
  }

  /** Resolve a token into an Actor. The actor's tenantId comes from the session only. */
  authenticate(token) {
    const session = this.#sessions.get(token);
    if (!session) throw unauthenticated("Invalid session");
    if (new Date(session.expiresAt) < new Date()) {
      this.#sessions.delete(token);
      throw unauthenticated("Session expired");
    }
    const user = this.#users(session.tenantId).get(session.userId);
    if (!user || !user.active) throw unauthenticated("User inactive");
    const role = this.#roles(session.tenantId).get(`role_${user.role}`);
    return Object.freeze({ kind: "user", tenantId: session.tenantId, userId: user.id, email: user.email, role: user.role, permissions: Object.freeze([...(role?.permissions ?? [])]) });
  }

  /** Default-deny permission check. */
  can(actor, required) {
    if (!actor || !Array.isArray(actor.permissions)) return false;
    if (required.includes("*")) return false; // never allow wildcard checks
    return actor.permissions.some((g) => permissionMatches(g, required));
  }
}
