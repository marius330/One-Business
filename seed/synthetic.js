/**
 * Synthetic data ONLY. No real companies, people or fiscal codes.
 * CUIs below are random digit strings that satisfy the format check; they are not real ANAF codes.
 */
import { createCore } from "../core/index.js";
import { registerBusinessModules } from "../modules/index.js";

export const SYNTHETIC_PASSWORD = "parola-demo-2026";

export function seedSynthetic(core = registerBusinessModules(createCore())) {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();

  // Tenant A: both modules active (paid)
  const a = core.platform.onboardTenant({ cui: "RO41234567", name: "Alfa Demo Consulting SRL", owner: { email: "owner@alfa-demo.test", password: SYNTHETIC_PASSWORD, fullName: "Ana Demo" } });
  core.identity.createUser(a.tenant.id, { email: "angajat@alfa-demo.test", password: SYNTHETIC_PASSWORD, fullName: "Andrei Demo", role: "employee" });
  core.identity.createUser(a.tenant.id, { email: "contabil@alfa-demo.test", password: SYNTHETIC_PASSWORD, fullName: "Alina Demo", role: "accountant" });
  core.subscriptions.activate(a.tenant.id, "crm", { plan: "standard" });
  core.subscriptions.activate(a.tenant.id, "contracts", { plan: "standard" });

  // Tenant B: CRM only, in trial
  const b = core.platform.onboardTenant({ cui: "RO52345678", name: "Beta Demo Logistics SRL", owner: { email: "owner@beta-demo.test", password: SYNTHETIC_PASSWORD, fullName: "Bogdan Demo" } });
  core.subscriptions.activate(b.tenant.id, "crm", { plan: "team", trial: true });

  // Tenant C: suspended (non-payment)
  const c = core.platform.onboardTenant({ cui: "RO63456789", name: "Gama Demo Retail SRL", owner: { email: "owner@gama-demo.test", password: SYNTHETIC_PASSWORD, fullName: "Carmen Demo" } });
  core.subscriptions.activate(c.tenant.id, "crm", { plan: "standard" });
  core.subscriptions.suspend(c.tenant.id, "crm", "non_payment");

  const asOwner = (t) => core.identity.authenticate(core.identity.login(t.tenant.id, t.owner.email, SYNTHETIC_PASSWORD).token);
  const call = (actor, module, capability, action, payload) => core.gateway.invoke({ actor, module, capability, action, payload });

  return (async () => {
    const ownerA = asOwner(a);
    const custA1 = await call(ownerA, "crm", "customers", "create", { name: "Client Demo Unu SRL", cui: "70000001", stage: "customer", city: "Cluj-Napoca", county: "Cluj", email: "contact@client-unu.test", tags: ["b2b"] });
    const custA2 = await call(ownerA, "crm", "customers", "create", { name: "Client Demo Doi SRL", cui: "70000002", stage: "prospect", city: "București", county: "București" });
    await call(ownerA, "crm", "customers", "create", { name: "Persoană Fizică Demo", type: "individual", stage: "lead", city: "Iași", county: "Iași" });
    await call(ownerA, "crm", "contacts", "create", { customerId: custA1.id, fullName: "Dan Contact Demo", email: "dan@client-unu.test", roleTitle: "Director" });
    await call(ownerA, "crm", "activities", "create", { customerId: custA1.id, kind: "meeting", summary: "Întâlnire de kick-off (date sintetice)." });
    await call(ownerA, "crm", "activities", "create", { customerId: custA2.id, kind: "call", summary: "Discuție ofertă (date sintetice)." });
    const ctr1 = await call(ownerA, "contracts", "contracts", "create", {
      customerId: custA1.id, title: "Contract servicii consultanță", number: "CT-2026-001", startsAt: day(-60), endsAt: day(40), valueBani: 1200000, noticeDays: 30,
      terms: [{ title: "Tranșa 2", dueAt: day(10), amountBani: 600000 }],
    });
    await call(ownerA, "contracts", "contracts", "setStatus", { id: ctr1.id, status: "active" });
    await call(ownerA, "contracts", "contracts", "create", { customerId: custA2.id, title: "Contract cadru livrări", startsAt: day(0), endsAt: day(365), valueBani: 4800000, noticeDays: 60 });

    const ownerB = asOwner(b);
    await call(ownerB, "crm", "customers", "create", { name: "Transport Demo Beta SRL", cui: "70000003", stage: "customer", city: "Timișoara", county: "Timiș" });
    await call(ownerB, "crm", "customers", "create", { name: "Depozit Demo SRL", cui: "70000004", stage: "lead" });

    return { core, tenants: { a, b, c } };
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { core } = await seedSynthetic();
  console.log(JSON.stringify(core.platform.overview(), null, 2));
}
