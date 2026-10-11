/**
 * Audit log. Two scopes:
 *  - platform: operator actions (tenant created, module published, ...)
 *  - tenant: every gateway decision (allow/deny) for that tenant, stored INSIDE the tenant's own store
 *    so it is exported/backed up with the tenant and never visible to another tenant.
 */
import { now } from "../ids.js";

export class AuditService {
  #storage;
  #platform = [];
  constructor(storage) {
    this.#storage = storage;
  }
  platform(event, data = {}) {
    const entry = { at: now(), scope: "platform", event, ...data };
    this.#platform.push(entry);
    return entry;
  }
  tenant(tenantId, event, data = {}) {
    const col = this.#storage.forTenant(tenantId).collection("audit_log");
    return col.insert({ at: now(), scope: "tenant", event, ...data }, "aud");
  }
  listPlatform({ limit = 100 } = {}) {
    return this.#platform.slice(-limit).reverse();
  }
  listTenant(tenantId, { limit = 100 } = {}) {
    return this.#storage.forTenant(tenantId).collection("audit_log").list().slice(-limit).reverse();
  }
}
