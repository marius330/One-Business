import { createCore } from "../core/index.js";
import { registerBusinessModules } from "../modules/index.js";

export const PASS = "parola-de-test-123";

export function freshCore(opts) {
  return registerBusinessModules(createCore(opts));
}

export function tenantWithOwner(core, cui, name) {
  const { tenant, owner } = core.platform.onboardTenant({ cui, name, owner: { email: `owner@${cui.toLowerCase()}.test`, password: PASS, fullName: "Owner" } });
  const actor = core.identity.authenticate(core.identity.login(tenant.id, owner.email, PASS).token);
  return { tenant, owner, actor };
}

export const call = (core, actor, module, capability, action, payload) => core.gateway.invoke({ actor, module, capability, action, payload });

export async function rejectsWith(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (e.code !== code) throw new Error(`Expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  throw new Error(`Expected rejection ${code}, but promise resolved`);
}
