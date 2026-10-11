/**
 * Module: CRM (commercial). Contract business/v1.
 * Owns: customers, contacts, activities. Exposes customers.lookup/get to other modules.
 * Uses: nothing (first module; it depends only on the core).
 */
import { invalid } from "../../core/errors.js";

const CUSTOMER_TYPES = new Set(["company", "individual"]);
const STAGES = new Set(["lead", "prospect", "customer", "churned"]);

function validateCustomer(p, partial = false) {
  const out = {};
  if (!partial || p.name !== undefined) {
    if (typeof p.name !== "string" || p.name.trim().length < 2) throw invalid("Customer name required");
    out.name = p.name.trim();
  }
  if (p.type !== undefined || !partial) {
    const type = p.type ?? "company";
    if (!CUSTOMER_TYPES.has(type)) throw invalid("Invalid customer type", { type });
    out.type = type;
  }
  if (p.stage !== undefined || !partial) {
    const stage = p.stage ?? "lead";
    if (!STAGES.has(stage)) throw invalid("Invalid stage", { stage });
    out.stage = stage;
  }
  for (const k of ["cui", "regCom", "email", "phone", "address", "city", "county", "notes"]) {
    if (p[k] !== undefined) {
      if (typeof p[k] !== "string") throw invalid(`${k} must be a string`);
      out[k] = p[k].trim();
    }
  }
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags) || !p.tags.every((t) => typeof t === "string")) throw invalid("tags must be string[]");
    out.tags = p.tags;
  }
  return out;
}

export const crmModule = {
  id: "crm",
  name: "CRM",
  version: "1.0.0",
  contract: "business/v1",
  description: "Clienți, persoane de contact și activități comerciale.",
  provides: {
    customers: ["list", "get", "create", "update", "archive", "lookup"],
    contacts: ["list", "create", "update", "delete"],
    activities: ["list", "create"],
  },
  uses: [],
  permissions: [
    "crm:customers:list", "crm:customers:get", "crm:customers:create", "crm:customers:update", "crm:customers:archive", "crm:customers:lookup",
    "crm:contacts:list", "crm:contacts:create", "crm:contacts:update", "crm:contacts:delete",
    "crm:activities:list", "crm:activities:create",
  ],
  plans: {
    standard: { monthlyPriceBani: 4900, perSeat: false, description: "CRM standard — până la 3 utilizatori incluși" },
    team: { monthlyPriceBani: 2900, perSeat: true, description: "CRM per utilizator" },
  },
  handlers: {
    customers: {
      async list(ctx, { stage, q, includeArchived = false } = {}) {
        const needle = (q ?? "").toLowerCase();
        return ctx.collection("customers").list((c) => (includeArchived || !c.archived) && (!stage || c.stage === stage) && (!needle || c.name.toLowerCase().includes(needle) || (c.cui ?? "").includes(needle)));
      },
      async get(ctx, { id }) {
        return ctx.collection("customers").require(id);
      },
      /** Minimal projection for other modules (contracts, invoicing). */
      async lookup(ctx, { id }) {
        const c = ctx.collection("customers").require(id);
        return { id: c.id, name: c.name, cui: c.cui ?? null, type: c.type, stage: c.stage, archived: !!c.archived };
      },
      async create(ctx, payload) {
        const c = ctx.collection("customers").insert({ ...validateCustomer(payload), archived: false, ownerUserId: ctx.actor.userId }, "cus");
        ctx.audit("customer.created", { customerId: c.id });
        return c;
      },
      async update(ctx, { id, ...patch }) {
        const c = ctx.collection("customers").update(id, validateCustomer(patch, true));
        ctx.audit("customer.updated", { customerId: c.id });
        return c;
      },
      async archive(ctx, { id }) {
        const c = ctx.collection("customers").update(id, { archived: true });
        ctx.audit("customer.archived", { customerId: id });
        return c;
      },
    },
    contacts: {
      async list(ctx, { customerId } = {}) {
        return ctx.collection("contacts").list((c) => !customerId || c.customerId === customerId);
      },
      async create(ctx, { customerId, fullName, email = "", phone = "", roleTitle = "" }) {
        ctx.collection("customers").require(customerId);
        if (typeof fullName !== "string" || fullName.trim().length < 2) throw invalid("fullName required");
        return ctx.collection("contacts").insert({ customerId, fullName: fullName.trim(), email, phone, roleTitle }, "con");
      },
      async update(ctx, { id, ...patch }) {
        const allowed = {};
        for (const k of ["fullName", "email", "phone", "roleTitle"]) if (typeof patch[k] === "string") allowed[k] = patch[k];
        return ctx.collection("contacts").update(id, allowed);
      },
      async delete(ctx, { id }) {
        return { deleted: ctx.collection("contacts").delete(id) };
      },
    },
    activities: {
      async list(ctx, { customerId } = {}) {
        return ctx.collection("activities").list((a) => !customerId || a.customerId === customerId).sort((a, b) => b.at.localeCompare(a.at));
      },
      async create(ctx, { customerId, kind = "note", summary, at = new Date().toISOString() }) {
        ctx.collection("customers").require(customerId);
        if (!["note", "call", "meeting", "email", "task"].includes(kind)) throw invalid("Invalid activity kind", { kind });
        if (typeof summary !== "string" || !summary.trim()) throw invalid("summary required");
        return ctx.collection("activities").insert({ customerId, kind, summary: summary.trim(), at, byUserId: ctx.actor.userId }, "act");
      },
    },
  },
};
