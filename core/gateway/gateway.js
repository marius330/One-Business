/**
 * Capability Gateway ("UNIVERSAL GATE").
 *
 * The ONLY entry point through which module code runs. Every invocation is checked, in order:
 *   1. actor authenticated (token -> actor; tenant derived from session)
 *   2. tenant active (not suspended/closed)
 *   3. module registered and capability/action declared in `provides`
 *   4. tenant's subscription for the module is usable (trial/active/past_due, not expired)
 *   5. actor's role grants "module:capability:action" (default-deny)
 *   6. payload belongs to this request only; it can never select another tenant
 * Module-to-module calls go through ctx.call(), which additionally checks the caller module
 * declared the dependency in `uses` AND the target module is active for the tenant.
 * Every decision (allow/deny) is written to the tenant's audit log.
 */
import { CoreError, deny, notFound } from "../errors.js";

const MAX_CALL_DEPTH = 8;

export class CapabilityGateway {
  #deps;
  constructor(deps) {
    this.#deps = deps; // { tenants, identity, subscriptions, registry, audit, workflow, storage }
  }

  /** Public entry: invoked by the HTTP layer with the actor already resolved from the token. */
  async invoke({ actor, module, capability, action, payload = {} }) {
    const { tenants, identity, subscriptions, registry, audit } = this.#deps;
    if (!actor || !actor.tenantId) throw new CoreError("UNAUTHENTICATED", "Actor required", 401);
    const tenantId = actor.tenantId;
    const where = { module, capability, action, userId: actor.userId };
    const fail = (err) => {
      audit.tenant(tenantId, "gateway.deny", { ...where, code: err.code });
      throw err;
    };
    try {
      tenants.assertActive(tenantId);
    } catch (e) {
      fail(e);
    }
    const manifest = registry.get(module);
    if (!manifest || !manifest.provides[capability]?.includes(action)) fail(notFound("capability", `${module}.${capability}.${action}`));
    const usable = subscriptions.isUsable(tenantId, module);
    if (!usable.ok) fail(deny("MODULE_NOT_ACTIVE", `Module ${module} is not active for this tenant (${usable.reason})`, { module, reason: usable.reason }));
    const required = `${module}:${capability}:${action}`;
    if (!identity.can(actor, required)) fail(deny("PERMISSION_DENIED", `Missing permission ${required}`, { required }));

    const ctx = this.#context({ actor, tenantId, module, depth: 0 });
    const result = await manifest.handlers[capability][action](ctx, this.#sanitize(payload));
    audit.tenant(tenantId, "gateway.allow", where);
    return result;
  }

  /** Payload hygiene: callers can never smuggle tenant/actor identity through the body. */
  #sanitize(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const { tenantId, actor, userId, ...rest } = payload;
    return rest;
  }

  #context({ actor, tenantId, module, depth }) {
    const { registry, subscriptions, audit, workflow, storage } = this.#deps;
    const store = storage.forTenant(tenantId);
    const self = this;
    return Object.freeze({
      tenantId,
      actor,
      module,
      /** Module-private collections are namespaced by module id. */
      collection: (name) => store.collection(`${module}.${name}`),
      workflow: {
        schedule: (item) => workflow.schedule(tenantId, { ...item, module }),
        cancelByRef: (ref) => workflow.cancelByRef(tenantId, module, ref),
        upcoming: (opts) => workflow.upcoming(tenantId, { ...opts, module }),
      },
      audit: (event, data) => audit.tenant(tenantId, `${module}.${event}`, { userId: actor.userId, ...data }),
      /** Cross-module call. Same tenant, same actor, dependency must be declared. */
      async call(targetModule, capability, action, payload = {}) {
        if (depth >= MAX_CALL_DEPTH) throw new CoreError("CALL_DEPTH_EXCEEDED", "Too many nested module calls", 500);
        if (!registry.mayCall(module, targetModule, capability, action)) {
          audit.tenant(tenantId, "gateway.deny", { module: targetModule, capability, action, via: module, code: "UNDECLARED_DEPENDENCY" });
          throw deny("UNDECLARED_DEPENDENCY", `${module} did not declare use of ${targetModule}.${capability}.${action}`);
        }
        const target = registry.get(targetModule);
        if (!target || !target.provides[capability]?.includes(action)) throw notFound("capability", `${targetModule}.${capability}.${action}`);
        const usable = subscriptions.isUsable(tenantId, targetModule);
        if (!usable.ok) {
          audit.tenant(tenantId, "gateway.deny", { module: targetModule, capability, action, via: module, code: "DEPENDENCY_NOT_ACTIVE" });
          throw deny("DEPENDENCY_NOT_ACTIVE", `Module ${targetModule} required by ${module} is not active for this tenant`, { module: targetModule, reason: usable.reason });
        }
        // The actor's own permission on the target capability is NOT required for declared read dependencies
        // (e.g. contracts may look up a customer name), but the dependency itself must be a declared, versioned contract.
        const childCtx = self.#context({ actor, tenantId, module: targetModule, depth: depth + 1 });
        const result = await target.handlers[capability][action](childCtx, self.#sanitize(payload));
        audit.tenant(tenantId, "gateway.allow", { module: targetModule, capability, action, via: module, userId: actor.userId });
        return result;
      },
    });
  }
}
