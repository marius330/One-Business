/**
 * Workflow Engine (minimal): deadlines, notifications, approvals.
 * Stored per tenant. Modules schedule items through the gateway context (ctx.workflow.*).
 */
import { invalid } from "../errors.js";

export class WorkflowService {
  #storage;
  #clock;
  constructor({ storage, clock = () => new Date() }) {
    this.#storage = storage;
    this.#clock = clock;
  }
  #items(tenantId) {
    return this.#storage.forTenant(tenantId).collection("workflow_items");
  }
  schedule(tenantId, { type, dueAt, module, ref, title, assigneeUserId = null, meta = {} }) {
    if (!type || !dueAt || !module || !ref) throw invalid("type, dueAt, module, ref required");
    if (Number.isNaN(Date.parse(dueAt))) throw invalid("dueAt must be ISO date");
    return this.#items(tenantId).insert({ type, dueAt, module, ref, title, assigneeUserId, meta, status: "pending", notifiedAt: null }, "wf");
  }
  cancelByRef(tenantId, module, ref) {
    const items = this.#items(tenantId);
    let n = 0;
    for (const it of items.list((i) => i.module === module && i.ref === ref && i.status === "pending")) {
      items.update(it.id, { status: "cancelled" });
      n++;
    }
    return n;
  }
  complete(tenantId, id) {
    return this.#items(tenantId).update(id, { status: "done" });
  }
  list(tenantId, { module, status = "pending" } = {}) {
    return this.#items(tenantId).list((i) => (!module || i.module === module) && (!status || i.status === status)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
  /** Items due within `horizonDays` (default 30). Used by dashboards and notification senders. */
  upcoming(tenantId, { horizonDays = 30, module } = {}) {
    const limit = new Date(this.#clock().getTime() + horizonDays * 86400000).toISOString();
    return this.list(tenantId, { module }).filter((i) => i.dueAt <= limit);
  }
  /** Mark items as notified; returns the notifications that would be delivered (email/SMS adapters later). */
  dispatchDue(tenantId) {
    const nowIso = this.#clock().toISOString();
    const items = this.#items(tenantId);
    const out = [];
    for (const it of items.list((i) => i.status === "pending" && !i.notifiedAt && i.dueAt <= nowIso)) {
      items.update(it.id, { notifiedAt: nowIso });
      out.push({ channel: "in_app", to: it.assigneeUserId, title: it.title, ref: it.ref, module: it.module });
    }
    return out;
  }
}
