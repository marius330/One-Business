/**
 * UNIVERSAL CORE — Business Edition. One call creates an isolated platform instance.
 * BUSINESS OS and MINTBERG would each call createCore() in their own process, with their own
 * storage, keys and configuration. Nothing here references any other product.
 */
import { IsolatedStorage } from "./storage/store.js";
import { AuditService } from "./audit/audit.js";
import { TenantService } from "./tenant/tenants.js";
import { IdentityService } from "./identity/identity.js";
import { ModuleRegistry } from "./registry/registry.js";
import { SubscriptionService } from "./subscription/subscription.js";
import { WorkflowService } from "./workflow/workflow.js";
import { CapabilityGateway } from "./gateway/gateway.js";

export const CORE_INFO = Object.freeze({ name: "UNIVERSAL CORE", edition: "business", version: "0.1.0", contracts: ["business/v1"] });

export function createCore({ clock = () => new Date(), validators = {} } = {}) {
  const storage = new IsolatedStorage();
  const audit = new AuditService(storage);
  const tenants = new TenantService({ audit, validators });
  const identity = new IdentityService({ storage, audit });
  const registry = new ModuleRegistry({ audit });
  const subscriptions = new SubscriptionService({ storage, registry, audit, clock });
  const workflow = new WorkflowService({ storage, clock });
  const gateway = new CapabilityGateway({ tenants, identity, subscriptions, registry, audit, workflow, storage });

  /** Platform-level helpers (operator / admin dashboard). */
  const platform = {
    /** Create a tenant together with its owner account and built-in roles. */
    onboardTenant({ cui, name, owner }) {
      const tenant = tenants.create({ cui, name });
      identity.ensureBuiltinRoles(tenant.id);
      const user = identity.createUser(tenant.id, { ...owner, role: "owner" });
      return { tenant, owner: user };
    },
    exportTenant: (tenantId) => storage.exportTenant(tenantId),
    restoreTenant: (tenantId, snapshot) => storage.importTenant(tenantId, snapshot),
    overview() {
      return tenants.list().map((t) => ({
        ...t,
        modules: subscriptions.list(t.id).map(({ moduleId, status, plan, trialEndsAt }) => ({ moduleId, status, plan, trialEndsAt })),
        users: identity.listUsers(t.id).length,
      }));
    },
  };

  return { info: CORE_INFO, storage, audit, tenants, identity, registry, subscriptions, workflow, gateway, platform };
}
