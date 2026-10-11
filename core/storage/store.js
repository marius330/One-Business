/**
 * Isolated per-tenant storage.
 *
 * Every tenant has its own physical namespace (a separate Map tree). A collection
 * handle is always obtained through `forTenant(tenantId)`, so there is no API that
 * can read across tenants. Records are stamped with `tenantId` and re-verified on
 * every read as defense in depth.
 *
 * Production mapping (see docs/TENANT_SECURITY_MODEL.md): one schema per tenant in
 * PostgreSQL (or one database for high-tier tenants) + row-level security.
 */
import { newId, now } from "../ids.js";
import { CoreError, notFound } from "../errors.js";

class Collection {
  #rows;
  #tenantId;
  #name;
  constructor(tenantId, name, rows) {
    this.#tenantId = tenantId;
    this.#name = name;
    this.#rows = rows;
  }
  #assertOwned(row) {
    if (row && row.tenantId !== this.#tenantId) {
      // Must never happen: indicates a storage bug. Fail closed.
      throw new CoreError("TENANT_ISOLATION_VIOLATION", "Record belongs to a different tenant", 500);
    }
    return row;
  }
  insert(data, prefix = "rec") {
    const id = data.id ?? newId(prefix);
    if (this.#rows.has(id)) throw new CoreError("CONFLICT", `Duplicate id ${id}`, 409);
    const row = { ...data, id, tenantId: this.#tenantId, createdAt: now(), updatedAt: now() };
    this.#rows.set(id, row);
    return structuredClone(row);
  }
  get(id) {
    const row = this.#assertOwned(this.#rows.get(id));
    return row ? structuredClone(row) : undefined;
  }
  require(id) {
    const row = this.get(id);
    if (!row) throw notFound(this.#name, id);
    return row;
  }
  update(id, patch) {
    const row = this.#assertOwned(this.#rows.get(id));
    if (!row) throw notFound(this.#name, id);
    const next = { ...row, ...patch, id, tenantId: this.#tenantId, updatedAt: now() };
    this.#rows.set(id, next);
    return structuredClone(next);
  }
  delete(id) {
    this.#assertOwned(this.#rows.get(id));
    return this.#rows.delete(id);
  }
  list(filter = () => true) {
    const out = [];
    for (const row of this.#rows.values()) if (filter(this.#assertOwned(row))) out.push(structuredClone(row));
    return out;
  }
  count() {
    return this.#rows.size;
  }
}

class TenantStore {
  #tenantId;
  #collections;
  constructor(tenantId, collections) {
    this.#tenantId = tenantId;
    this.#collections = collections;
  }
  get tenantId() {
    return this.#tenantId;
  }
  collection(name) {
    if (!this.#collections.has(name)) this.#collections.set(name, new Map());
    return new Collection(this.#tenantId, name, this.#collections.get(name));
  }
  collectionNames() {
    return [...this.#collections.keys()];
  }
}

export class IsolatedStorage {
  #tenants = new Map();

  forTenant(tenantId) {
    if (!tenantId || typeof tenantId !== "string") throw new CoreError("TENANT_REQUIRED", "tenantId is required", 500);
    if (!this.#tenants.has(tenantId)) this.#tenants.set(tenantId, new Map());
    return new TenantStore(tenantId, this.#tenants.get(tenantId));
  }

  hasTenant(tenantId) {
    return this.#tenants.has(tenantId);
  }

  /** Full export of ONE tenant's data. Never includes other tenants. */
  exportTenant(tenantId) {
    const store = this.forTenant(tenantId);
    const collections = {};
    for (const name of store.collectionNames()) collections[name] = store.collection(name).list();
    return { format: "one-business/tenant-export", version: 1, tenantId, exportedAt: now(), collections };
  }

  /** Restore a tenant snapshot. The snapshot's tenantId must match the target tenant. */
  importTenant(tenantId, snapshot, { replace = true } = {}) {
    if (snapshot?.format !== "one-business/tenant-export") throw new CoreError("INVALID_SNAPSHOT", "Unknown snapshot format", 422);
    if (snapshot.tenantId !== tenantId) throw new CoreError("SNAPSHOT_TENANT_MISMATCH", "Snapshot belongs to another tenant", 403);
    if (replace) this.#tenants.set(tenantId, new Map());
    const tree = this.#tenants.get(tenantId) ?? new Map();
    this.#tenants.set(tenantId, tree);
    for (const [name, rows] of Object.entries(snapshot.collections ?? {})) {
      const map = tree.get(name) ?? new Map();
      tree.set(name, map);
      for (const row of rows) {
        if (row.tenantId !== tenantId) throw new CoreError("SNAPSHOT_TENANT_MISMATCH", "Row belongs to another tenant", 403);
        map.set(row.id, structuredClone(row));
      }
    }
    return { restored: Object.keys(snapshot.collections ?? {}).length };
  }

  dropTenant(tenantId) {
    return this.#tenants.delete(tenantId);
  }
}
