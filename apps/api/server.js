/**
 * BUSINESS OS — HTTP API (prototype, zero dependencies).
 *
 * Tenant-facing:
 *   POST /api/v1/auth/login            { cui, email, password } -> { token }
 *   POST /api/v1/auth/logout
 *   POST /api/v1/gateway               { module, capability, action, payload }   (Bearer token)
 *   GET  /api/v1/me                    actor + active modules
 *   GET  /api/v1/me/subscriptions, /api/v1/me/invoice-preview, /api/v1/me/audit, /api/v1/me/export (owner only)
 *   GET  /api/v1/contracts             supported contract versions (public)
 * Platform operator (X-Platform-Key header, separate from tenant auth):
 *   GET  /api/v1/platform/overview, /api/v1/platform/catalog, /api/v1/platform/audit
 *   POST /api/v1/platform/tenants      { cui, name, owner:{email,password,fullName} }
 *   POST /api/v1/platform/tenants/:id/modules { moduleId, plan, trial }
 *   POST /api/v1/platform/tenants/:id/status  { status, reason }
 *   GET  /api/v1/platform/tenants/:id/export
 *   POST /api/v1/platform/tenants/:id/restore (body = snapshot)
 * Admin dashboard: GET /admin
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createCore, CORE_INFO } from "../../core/index.js";
import { registerBusinessModules } from "../../modules/index.js";
import { seedSynthetic } from "../../seed/synthetic.js";
import { CoreError } from "../../core/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 1_000_000;

function sameKey(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) reject(new CoreError("PAYLOAD_TOO_LARGE", "Body too large", 413));
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new CoreError("VALIDATION_ERROR", "Invalid JSON", 400)); }
    });
    req.on("error", reject);
  });
}

export function createApp({ core, platformKey }) {
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null;
  const requireActor = (req) => {
    const token = bearer(req);
    if (!token) throw new CoreError("UNAUTHENTICATED", "Bearer token required", 401);
    return core.identity.authenticate(token);
  };
  const requirePlatform = (req) => {
    if (!sameKey(req.headers["x-platform-key"], platformKey)) throw new CoreError("UNAUTHENTICATED", "Platform key invalid", 401);
  };
  const adminHtml = readFileSync(path.join(__dirname, "../admin/index.html"), "utf8");

  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const m = req.method;
    try {
      if (m === "GET" && p === "/health") return json(res, 200, { ok: true, core: CORE_INFO });
      if (m === "GET" && p === "/UNIVERSAL_CORE.json") return json(res, 200, JSON.parse(readFileSync(path.join(__dirname, "../../UNIVERSAL_CORE.json"), "utf8")));
      if (m === "GET" && p === "/api/v1/contracts") return json(res, 200, { contracts: CORE_INFO.contracts });
      if (m === "GET" && (p === "/admin" || p === "/admin/")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
        return res.end(adminHtml);
      }

      // ---- tenant auth
      if (m === "POST" && p === "/api/v1/auth/login") {
        const { cui, email, password } = await readBody(req);
        const tenant = core.tenants.findByCui(cui ?? "");
        if (!tenant) throw new CoreError("UNAUTHENTICATED", "Invalid credentials", 401);
        return json(res, 200, core.identity.login(tenant.id, email, password));
      }
      if (m === "POST" && p === "/api/v1/auth/logout") {
        core.identity.logout(bearer(req));
        return json(res, 200, { ok: true });
      }

      // ---- gateway
      if (m === "POST" && p === "/api/v1/gateway") {
        const actor = requireActor(req);
        const body = await readBody(req);
        const { module, capability, action, payload } = body;
        if (typeof module !== "string" || typeof capability !== "string" || typeof action !== "string") throw new CoreError("VALIDATION_ERROR", "module, capability, action required", 422);
        const result = await core.gateway.invoke({ actor, module, capability, action, payload });
        return json(res, 200, { result });
      }

      // ---- tenant self-service
      if (p.startsWith("/api/v1/me")) {
        const actor = requireActor(req);
        const t = actor.tenantId;
        if (m === "GET" && p === "/api/v1/me") return json(res, 200, { actor, tenant: core.tenants.get(t), activeModules: core.subscriptions.activeModules(t) });
        if (m === "GET" && p === "/api/v1/me/subscriptions") return json(res, 200, { subscriptions: core.subscriptions.list(t) });
        if (m === "GET" && p === "/api/v1/me/invoice-preview") {
          if (!core.identity.can(actor, "core:billing:read")) throw new CoreError("PERMISSION_DENIED", "Missing permission core:billing:read", 403);
          return json(res, 200, core.subscriptions.computeInvoice(t));
        }
        if (m === "GET" && p === "/api/v1/me/audit") {
          if (!core.identity.can(actor, "core:audit:read")) throw new CoreError("PERMISSION_DENIED", "Missing permission core:audit:read", 403);
          return json(res, 200, { entries: core.audit.listTenant(t, { limit: Number(url.searchParams.get("limit") ?? 100) }) });
        }
        if (m === "GET" && p === "/api/v1/me/export") {
          if (!core.identity.can(actor, "core:export:run")) throw new CoreError("PERMISSION_DENIED", "Missing permission core:export:run", 403);
          core.audit.tenant(t, "tenant.exported", { userId: actor.userId });
          return json(res, 200, core.platform.exportTenant(t));
        }
        if (m === "GET" && p === "/api/v1/me/workflow") return json(res, 200, { items: core.workflow.upcoming(t, { horizonDays: Number(url.searchParams.get("days") ?? 30) }) });
      }

      // ---- platform operator
      if (p.startsWith("/api/v1/platform/")) {
        requirePlatform(req);
        if (m === "GET" && p === "/api/v1/platform/overview") return json(res, 200, { core: CORE_INFO, tenants: core.platform.overview() });
        if (m === "GET" && p === "/api/v1/platform/catalog") return json(res, 200, { modules: core.registry.catalog() });
        if (m === "GET" && p === "/api/v1/platform/audit") return json(res, 200, { entries: core.audit.listPlatform() });
        if (m === "POST" && p === "/api/v1/platform/tenants") return json(res, 201, core.platform.onboardTenant(await readBody(req)));
        const match = p.match(/^\/api\/v1\/platform\/tenants\/([^/]+)\/(modules|status|export|restore|audit|invoice-preview)$/);
        if (match) {
          const [, tenantId, op] = match;
          core.tenants.require(tenantId);
          if (op === "modules" && m === "POST") {
            const { moduleId, plan, trial, seats, op: subOp } = await readBody(req);
            if (subOp === "suspend") return json(res, 200, core.subscriptions.suspend(tenantId, moduleId));
            if (subOp === "cancel") return json(res, 200, core.subscriptions.cancel(tenantId, moduleId));
            if (subOp === "reactivate") return json(res, 200, core.subscriptions.reactivate(tenantId, moduleId));
            return json(res, 200, core.subscriptions.activate(tenantId, moduleId, { plan, trial, seats }));
          }
          if (op === "status" && m === "POST") {
            const { status, reason } = await readBody(req);
            return json(res, 200, core.tenants.setStatus(tenantId, status, reason));
          }
          if (op === "export" && m === "GET") return json(res, 200, core.platform.exportTenant(tenantId));
          if (op === "restore" && m === "POST") return json(res, 200, core.platform.restoreTenant(tenantId, await readBody(req)));
          if (op === "audit" && m === "GET") return json(res, 200, { entries: core.audit.listTenant(tenantId) });
          if (op === "invoice-preview" && m === "GET") return json(res, 200, core.subscriptions.computeInvoice(tenantId));
        }
      }
      return json(res, 404, { error: "NOT_FOUND", message: `No route ${m} ${p}` });
    } catch (err) {
      if (err instanceof CoreError) return json(res, err.status, err.toJSON());
      console.error(err);
      return json(res, 500, { error: "INTERNAL", message: "Internal error" });
    }
  };
}

export async function startServer({ port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "127.0.0.1", seed = process.env.SEED !== "false", platformKey = process.env.PLATFORM_KEY } = {}) {
  const core = registerBusinessModules(createCore());
  if (seed) await seedSynthetic(core);
  const key = platformKey ?? randomBytes(24).toString("base64url");
  const server = http.createServer(createApp({ core, platformKey: key }));
  await new Promise((r) => server.listen(port, host, r));
  const addr = server.address();
  return { server, core, platformKey: key, url: `http://${host}:${addr.port}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url, platformKey } = await startServer();
  console.log(`BUSINESS OS prototype listening on ${url}`);
  console.log(`Admin dashboard: ${url}/admin   (platform key: ${platformKey})`);
  console.log(`Synthetic login: CUI RO41234567 / owner@alfa-demo.test / parola-demo-2026`);
}
