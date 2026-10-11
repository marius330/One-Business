/**
 * Subscription Engine.
 *
 * Each tenant pays monthly ONLY for the modules it activated. States per module subscription:
 *   trial -> active -> past_due -> suspended -> cancelled
 * Prices come from the module catalog (registry). Amounts are integers in bani (RON * 100).
 * This engine computes what is owed; payment collection (Stripe/Netopia/bank transfer) is an adapter.
 */
import { newId, now } from "../ids.js";
import { CoreError, invalid, notFound } from "../errors.js";

export const SUB_STATUS = Object.freeze({ TRIAL: "trial", ACTIVE: "active", PAST_DUE: "past_due", SUSPENDED: "suspended", CANCELLED: "cancelled" });
const USABLE = new Set([SUB_STATUS.TRIAL, SUB_STATUS.ACTIVE, SUB_STATUS.PAST_DUE]);
const DEFAULT_TRIAL_DAYS = 14;

export class SubscriptionService {
  #storage;
  #registry;
  #audit;
  #clock;
  constructor({ storage, registry, audit, clock = () => new Date() }) {
    this.#storage = storage;
    this.#registry = registry;
    this.#audit = audit;
    this.#clock = clock;
  }
  #subs(tenantId) {
    return this.#storage.forTenant(tenantId).collection("subscriptions");
  }

  activate(tenantId, moduleId, { plan = "standard", trial = false, trialDays = DEFAULT_TRIAL_DAYS, seats = 1 } = {}) {
    const manifest = this.#registry.get(moduleId);
    if (!manifest) throw notFound("module", moduleId);
    const planDef = manifest.plans?.[plan];
    if (!planDef) throw invalid("Unknown plan for module", { moduleId, plan });
    if (!Number.isInteger(seats) || seats < 1) throw invalid("seats must be >= 1");
    const subs = this.#subs(tenantId);
    const existing = subs.list((s) => s.moduleId === moduleId)[0];
    const start = this.#clock();
    const trialEndsAt = trial ? new Date(start.getTime() + trialDays * 86400000).toISOString() : null;
    const data = {
      moduleId,
      moduleVersion: manifest.version,
      plan,
      seats,
      status: trial ? SUB_STATUS.TRIAL : SUB_STATUS.ACTIVE,
      startedAt: start.toISOString(),
      trialEndsAt,
      currentPeriodStart: start.toISOString(),
      currentPeriodEnd: new Date(new Date(start).setMonth(start.getMonth() + 1)).toISOString(),
      cancelledAt: null,
      suspendedAt: null,
      suspendReason: null,
    };
    const sub = existing ? subs.update(existing.id, data) : subs.insert(data, "sub");
    this.#audit.tenant(tenantId, "subscription.activated", { moduleId, plan, trial });
    return sub;
  }
  cancel(tenantId, moduleId) {
    return this.#transition(tenantId, moduleId, SUB_STATUS.CANCELLED, { cancelledAt: now() }, "subscription.cancelled");
  }
  suspend(tenantId, moduleId, reason = "non_payment") {
    return this.#transition(tenantId, moduleId, SUB_STATUS.SUSPENDED, { suspendedAt: now(), suspendReason: reason }, "subscription.suspended");
  }
  markPastDue(tenantId, moduleId) {
    return this.#transition(tenantId, moduleId, SUB_STATUS.PAST_DUE, {}, "subscription.past_due");
  }
  reactivate(tenantId, moduleId) {
    return this.#transition(tenantId, moduleId, SUB_STATUS.ACTIVE, { suspendedAt: null, suspendReason: null }, "subscription.reactivated");
  }
  #transition(tenantId, moduleId, status, patch, event) {
    const subs = this.#subs(tenantId);
    const sub = subs.list((s) => s.moduleId === moduleId)[0];
    if (!sub) throw notFound("subscription", moduleId);
    const next = subs.update(sub.id, { status, ...patch });
    this.#audit.tenant(tenantId, event, { moduleId, status });
    return next;
  }

  get(tenantId, moduleId) {
    return this.#subs(tenantId).list((s) => s.moduleId === moduleId)[0];
  }
  list(tenantId) {
    return this.#subs(tenantId).list();
  }

  /** The single source of truth used by the gateway: may this tenant use this module right now? */
  isUsable(tenantId, moduleId) {
    const sub = this.get(tenantId, moduleId);
    if (!sub || !USABLE.has(sub.status)) return { ok: false, reason: sub ? `subscription_${sub.status}` : "no_subscription" };
    if (sub.status === SUB_STATUS.TRIAL && sub.trialEndsAt && new Date(sub.trialEndsAt) < this.#clock()) return { ok: false, reason: "trial_expired" };
    return { ok: true, sub };
  }
  activeModules(tenantId) {
    return this.list(tenantId).filter((s) => this.isUsable(tenantId, s.moduleId).ok).map((s) => s.moduleId);
  }

  /** Monthly invoice preview: one line per billable module. Trials are 0. VAT is applied by the billing adapter. */
  computeInvoice(tenantId, { period = this.#clock().toISOString().slice(0, 7) } = {}) {
    const lines = [];
    for (const sub of this.list(tenantId)) {
      if (![SUB_STATUS.ACTIVE, SUB_STATUS.PAST_DUE].includes(sub.status)) continue;
      const manifest = this.#registry.get(sub.moduleId);
      const planDef = manifest?.plans?.[sub.plan];
      if (!planDef) continue;
      const unit = planDef.monthlyPriceBani;
      const qty = planDef.perSeat ? sub.seats : 1;
      lines.push({ moduleId: sub.moduleId, plan: sub.plan, description: `${manifest.name} — plan ${sub.plan}`, quantity: qty, unitPriceBani: unit, totalBani: unit * qty });
    }
    const subtotalBani = lines.reduce((a, l) => a + l.totalBani, 0);
    const vatRate = 21; // Romania standard VAT; configurable per billing adapter
    const vatBani = Math.round((subtotalBani * vatRate) / 100);
    return { id: newId("inv"), tenantId, period, currency: "RON", lines, subtotalBani, vatRate, vatBani, totalBani: subtotalBani + vatBani, generatedAt: now() };
  }
}
