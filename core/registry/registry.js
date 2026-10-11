/**
 * Module Registry (PRIVATE).
 *
 * The public file UNIVERSAL_CORE.json is only a discovery point (where is the gateway, which contract
 * versions are supported). The full inventory of modules, capabilities and prices lives here, server-side.
 *
 * A manifest declares:
 *   id, name, version, contract ("business/v1"),
 *   provides: { capability: [actions] }       -> what this module exposes through the gateway
 *   uses:     [{ module, capability, actions }] -> what it is ALLOWED to call in other modules
 *   permissions: ["crm:customers:read", ...]    -> catalog shown in the role editor
 *   plans: { standard: { monthlyPriceBani, perSeat } }
 *   handlers: { capability: { action: async (ctx, payload) => result } }
 */
import { CoreError, invalid } from "../errors.js";

const SUPPORTED_CONTRACTS = new Set(["business/v1"]);
const ID_RE = /^[a-z][a-z0-9_]{1,30}$/;
const ACTION_RE = /^[a-z][a-zA-Z0-9_]{1,30}$/;

export function validateManifest(m) {
  if (!m || typeof m !== "object") throw invalid("Manifest must be an object");
  if (!ID_RE.test(m.id ?? "")) throw invalid("Manifest id invalid", { id: m.id });
  if (!SUPPORTED_CONTRACTS.has(m.contract)) throw invalid("Unsupported contract version", { contract: m.contract });
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? "")) throw invalid("Manifest version must be semver");
  if (!m.provides || typeof m.provides !== "object") throw invalid("Manifest.provides required");
  for (const [cap, actions] of Object.entries(m.provides)) {
    if (!ID_RE.test(cap)) throw invalid("Capability id invalid", { cap });
    if (!Array.isArray(actions) || !actions.every((a) => ACTION_RE.test(a))) throw invalid("Capability actions invalid", { cap });
    for (const a of actions) if (typeof m.handlers?.[cap]?.[a] !== "function") throw invalid("Missing handler", { cap, action: a });
  }
  for (const u of m.uses ?? []) {
    if (!ID_RE.test(u.module ?? "") || !ID_RE.test(u.capability ?? "")) throw invalid("uses entry invalid", u);
    if (!Array.isArray(u.actions) || !u.actions.length) throw invalid("uses.actions required", u);
  }
  if (!m.plans || !Object.keys(m.plans).length) throw invalid("Manifest.plans required");
  for (const [plan, def] of Object.entries(m.plans)) if (!Number.isInteger(def.monthlyPriceBani) || def.monthlyPriceBani < 0) throw invalid("Plan price invalid", { plan });
  return true;
}

export class ModuleRegistry {
  #modules = new Map();
  #audit;
  constructor({ audit }) {
    this.#audit = audit;
  }
  register(manifest) {
    validateManifest(manifest);
    if (this.#modules.has(manifest.id)) throw new CoreError("MODULE_EXISTS", `Module ${manifest.id} already registered`, 409);
    this.#modules.set(manifest.id, Object.freeze(manifest));
    this.#audit.platform("module.registered", { moduleId: manifest.id, version: manifest.version });
    return manifest;
  }
  get(id) {
    return this.#modules.get(id);
  }
  has(id) {
    return this.#modules.has(id);
  }
  /** Public catalog: no handlers, no internals. */
  catalog() {
    return [...this.#modules.values()].map(({ id, name, version, contract, description, provides, uses, permissions, plans }) => ({ id, name, version, contract, description, provides, uses, permissions, plans }));
  }
  /** Is module `from` allowed (by declaration) to call module `to`.`capability`.`action`? */
  mayCall(from, to, capability, action) {
    const m = this.#modules.get(from);
    if (!m) return false;
    return (m.uses ?? []).some((u) => u.module === to && u.capability === capability && u.actions.includes(action));
  }
}
