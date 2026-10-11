/**
 * Tenant Management. A tenant = one SRL, identified by CUI (fiscal code) and an internal id.
 * Tenant records live in the PLATFORM store (operator-level), never inside another tenant.
 */
import { newId, now } from "../ids.js";
import { CoreError, invalid, notFound } from "../errors.js";

export const TENANT_STATUS = Object.freeze({ ACTIVE: "active", SUSPENDED: "suspended", CLOSED: "closed" });

/**
 * Format validation only. Checksum + ANAF lookup are MVP tasks (see MVP_IMPLEMENTATION_PLAN.md)
 * and must be injected through `validators.cui` so the core stays generic.
 */
export function normalizeCui(raw) {
  if (typeof raw !== "string") throw invalid("CUI must be a string");
  const digits = raw.trim().toUpperCase().replace(/^RO/, "").replace(/\s+/g, "");
  if (!/^\d{2,10}$/.test(digits)) throw invalid("CUI format invalid (expected 2-10 digits, optional RO prefix)", { cui: raw });
  return digits;
}

export class TenantService {
  #tenants = new Map(); // id -> tenant
  #byCui = new Map();
  #audit;
  #validators;
  constructor({ audit, validators = {} }) {
    this.#audit = audit;
    this.#validators = validators;
  }

  create({ cui, name, country = "RO", plan = "standard" }) {
    const normalized = normalizeCui(cui);
    if (this.#validators.cui && !this.#validators.cui(normalized)) throw invalid("CUI failed validation", { cui });
    if (!name || typeof name !== "string") throw invalid("Tenant name required");
    if (this.#byCui.has(normalized)) throw new CoreError("TENANT_EXISTS", "A tenant with this CUI already exists", 409);
    const tenant = {
      id: newId("ten"),
      cui: normalized,
      name: name.trim(),
      country,
      plan,
      status: TENANT_STATUS.ACTIVE,
      createdAt: now(),
      updatedAt: now(),
    };
    this.#tenants.set(tenant.id, tenant);
    this.#byCui.set(normalized, tenant.id);
    this.#audit.platform("tenant.created", { tenantId: tenant.id, cui: normalized });
    return structuredClone(tenant);
  }

  get(id) {
    const t = this.#tenants.get(id);
    return t ? structuredClone(t) : undefined;
  }
  require(id) {
    const t = this.get(id);
    if (!t) throw notFound("tenant", id);
    return t;
  }
  findByCui(cui) {
    const id = this.#byCui.get(normalizeCui(cui));
    return id ? this.get(id) : undefined;
  }
  list() {
    return [...this.#tenants.values()].map((t) => structuredClone(t));
  }
  setStatus(id, status, reason = "") {
    if (!Object.values(TENANT_STATUS).includes(status)) throw invalid("Unknown tenant status", { status });
    const t = this.#tenants.get(id);
    if (!t) throw notFound("tenant", id);
    t.status = status;
    t.updatedAt = now();
    this.#audit.platform("tenant.status", { tenantId: id, status, reason });
    return structuredClone(t);
  }
  assertActive(id) {
    const t = this.require(id);
    if (t.status !== TENANT_STATUS.ACTIVE) throw new CoreError("TENANT_SUSPENDED", `Tenant is ${t.status}`, 403, { tenantId: id });
    return t;
  }
}
