/**
 * Module: Contracts & deadlines. Contract business/v1.
 * Owns: contracts, deadlines. Uses: crm.customers.lookup (declared dependency, read-only).
 * Deadlines are registered in the core Workflow Engine so the dashboard and notifications see them.
 */
import { invalid } from "../../core/errors.js";

const STATUSES = ["draft", "active", "expired", "terminated"];
const TRANSITIONS = { draft: ["active", "terminated"], active: ["expired", "terminated"], expired: [], terminated: [] };

export const contractsModule = {
  id: "contracts",
  name: "Contracte și termene",
  version: "1.0.0",
  contract: "business/v1",
  description: "Contracte comerciale, termene, scadențe și reînnoiri automate.",
  provides: {
    contracts: ["list", "get", "create", "setStatus"],
    deadlines: ["list", "upcoming"],
  },
  uses: [{ module: "crm", capability: "customers", actions: ["lookup"] }],
  permissions: ["contracts:contracts:list", "contracts:contracts:get", "contracts:contracts:create", "contracts:contracts:setStatus", "contracts:deadlines:list", "contracts:deadlines:upcoming"],
  plans: { standard: { monthlyPriceBani: 3900, perSeat: false, description: "Contracte standard — nelimitat, cu alerte de scadență" } },
  handlers: {
    contracts: {
      async list(ctx, { status, customerId } = {}) {
        return ctx.collection("contracts").list((c) => (!status || c.status === status) && (!customerId || c.customerId === customerId));
      },
      async get(ctx, { id }) {
        return ctx.collection("contracts").require(id);
      },
      async create(ctx, { customerId, title, number, startsAt, endsAt, valueBani = 0, currency = "RON", noticeDays = 30, autoRenew = false, terms = [] }) {
        if (!customerId) throw invalid("customerId required");
        // Cross-module read through the gateway. Fails if CRM is not active for this tenant.
        const customer = await ctx.call("crm", "customers", "lookup", { id: customerId });
        if (customer.archived) throw invalid("Customer is archived");
        if (typeof title !== "string" || !title.trim()) throw invalid("title required");
        if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) throw invalid("startsAt/endsAt must be ISO dates");
        if (endsAt <= startsAt) throw invalid("endsAt must be after startsAt");
        if (!Number.isInteger(valueBani) || valueBani < 0) throw invalid("valueBani must be a non-negative integer");
        if (!Array.isArray(terms)) throw invalid("terms must be an array");
        const contract = ctx.collection("contracts").insert(
          { customerId, customerName: customer.name, title: title.trim(), number: number ?? null, startsAt, endsAt, valueBani, currency, noticeDays, autoRenew, terms, status: "draft", createdBy: ctx.actor.userId },
          "ctr",
        );
        // Notice deadline: `noticeDays` before expiry.
        const noticeAt = new Date(new Date(endsAt).getTime() - noticeDays * 86400000).toISOString();
        ctx.workflow.schedule({ type: "contract.notice", dueAt: noticeAt, ref: contract.id, title: `Preaviz contract ${contract.title} (${customer.name})`, assigneeUserId: ctx.actor.userId });
        ctx.workflow.schedule({ type: "contract.expiry", dueAt: endsAt, ref: contract.id, title: `Expiră contractul ${contract.title} (${customer.name})`, assigneeUserId: ctx.actor.userId });
        for (const t of terms) {
          if (!t?.dueAt || !t?.title) throw invalid("Each term needs title and dueAt");
          ctx.workflow.schedule({ type: "contract.term", dueAt: t.dueAt, ref: contract.id, title: `${t.title} — ${contract.title}`, assigneeUserId: ctx.actor.userId, meta: { amountBani: t.amountBani ?? null } });
        }
        ctx.audit("contract.created", { contractId: contract.id, customerId });
        return contract;
      },
      async setStatus(ctx, { id, status }) {
        if (!STATUSES.includes(status)) throw invalid("Invalid status", { status });
        const c = ctx.collection("contracts").require(id);
        if (!TRANSITIONS[c.status].includes(status)) throw invalid(`Cannot move contract from ${c.status} to ${status}`);
        if (status === "terminated" || status === "expired") ctx.workflow.cancelByRef(id);
        const next = ctx.collection("contracts").update(id, { status });
        ctx.audit("contract.status", { contractId: id, status });
        return next;
      },
    },
    deadlines: {
      async list(ctx) {
        return ctx.workflow.upcoming({ horizonDays: 3650 });
      },
      async upcoming(ctx, { horizonDays = 30 } = {}) {
        return ctx.workflow.upcoming({ horizonDays });
      },
    },
  },
};
