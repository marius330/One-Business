# UNIVERSAL CORE — BUSINESS CONTRACTS (business/v1)

Contractele sunt interfața stabilă dintre nucleu și module. Modulele depind **doar** de aceste contracte, nu de implementarea nucleului.
Schema formală este în `contracts/v1/`. O schimbare incompatibilă înseamnă `business/v2`, niciodată o modificare a `v1`.

## 1. Manifestul de modul

```js
{
  id: "contracts",                       // ^[a-z][a-z0-9_]{1,30}$ — identificator stabil
  name: "Contracte și termene",
  version: "1.0.0",                      // semver
  contract: "business/v1",               // versiunea contractului respectat
  description: "...",
  provides: { contracts: ["list", "get", "create", "setStatus"], deadlines: ["list", "upcoming"] },
  uses: [{ module: "crm", capability: "customers", actions: ["lookup"] }],
  permissions: ["contracts:contracts:list", ...],      // catalog pentru editorul de roluri
  plans: { standard: { monthlyPriceBani: 3900, perSeat: false, description: "..." } },
  handlers: { contracts: { list: async (ctx, payload) => ..., ... } }
}
```

Reguli:
- Fiecare acțiune din `provides` trebuie să aibă un handler. Registrul refuză manifestul altfel.
- `uses` este lista **completă** a apelurilor către alte module. Orice apel nedeclarat este refuzat la runtime (`UNDECLARED_DEPENDENCY`).
- Un modul nu poate declara `uses` către un modul inexistent în instanța curentă; apelul eșuează cu `NOT_FOUND`. Nu există descoperire dinamică a altor produse.
- `plans` este obligatoriu; un modul gratuit are `monthlyPriceBani: 0`.

## 2. Contextul de execuție (`ctx`)

Handler-ele primesc un `ctx` înghețat, construit de gateway. Este **singurul** acces al modulului la nucleu.

| Membru | Contract |
| --- | --- |
| `ctx.tenantId` | Tenantul curent, derivat din sesiune. Nu poate fi schimbat. |
| `ctx.actor` | `{ kind, tenantId, userId, email, role, permissions }` — înghețat. |
| `ctx.module` | Id-ul modulului care rulează. |
| `ctx.collection(name)` | Colecție privată, prefixată automat `modul.name`, în spațiul tenantului. |
| `ctx.workflow.schedule({ type, dueAt, ref, title, assigneeUserId?, meta? })` | Programează o scadență/notificare. |
| `ctx.workflow.cancelByRef(ref)` / `ctx.workflow.upcoming({ horizonDays })` | Gestionare scadențe proprii modulului. |
| `ctx.audit(event, data)` | Scrie în auditul tenantului, cu prefix `modul.event`. |
| `ctx.call(module, capability, action, payload)` | Apel cross-modul, verificat (vezi §4). |

Un modul **nu** primește: storage global, lista tenanților, alte sesiuni, secrete, registrul.

## 3. Invocarea prin gateway

Cerere HTTP: `POST /api/v1/gateway`, `Authorization: Bearer <token>`.

```json
{ "module": "crm", "capability": "customers", "action": "create", "payload": { "name": "Client SRL" } }
```

Ordinea verificărilor (toate pe server, toate auditate):

1. `UNAUTHENTICATED` — token lipsă/invalid/expirat sau utilizator dezactivat.
2. `TENANT_SUSPENDED` — tenantul nu este `active`.
3. `NOT_FOUND` — modul/capabilitate/acțiune nedeclarată în registru.
4. `MODULE_NOT_ACTIVE` — tenantul nu are abonament utilizabil (`details.reason`: `no_subscription`, `subscription_suspended`, `subscription_cancelled`, `trial_expired`).
5. `PERMISSION_DENIED` — rolul nu acordă `modul:capabilitate:acțiune`.
6. Payload-ul este curățat: `tenantId`, `actor`, `userId` sunt eliminate înainte de handler.

Răspuns: `{ "result": ... }` sau o eroare conform `contracts/v1/gateway-error.schema.json`.

## 4. Apeluri între module (`ctx.call`)

```
contracts.create ──ctx.call("crm","customers","lookup")──▶ gateway ──▶ crm.customers.lookup
```

Verificări suplimentare față de §3:
- `UNDECLARED_DEPENDENCY` — modulul apelant nu a declarat perechea (modul țintă, capabilitate, acțiune) în `uses`.
- `DEPENDENCY_NOT_ACTIVE` — tenantul nu are abonament utilizabil pentru modulul țintă. O firmă care are doar Contracte nu poate crea contracte pe clienți CRM pe care nu îi plătește.
- Adâncime maximă 8 apeluri înlănțuite (`CALL_DEPTH_EXCEEDED`).
- Actorul și tenantul se propagă neschimbate. Un apel cross-modul nu poate escalada privilegii și nu poate schimba tenantul.
- Permisiunea actorului pe capabilitatea țintă **nu** este cerută pentru dependențe declarate (ex. un angajat cu drept de a crea contracte poate citi numele clientului prin `lookup`), pentru că dependența este un contract revizuit la publicarea modulului. Modulele expun pentru asta **proiecții minime** (`lookup`), nu înregistrări complete.

## 5. Permisiuni

Format: `modul:capabilitate:acțiune`. Exemple: `crm:customers:create`, `contracts:deadlines:upcoming`, `core:billing:read`, `core:export:run`.

- Rolurile pot folosi wildcard (`crm:*`, `crm:customers:*`); verificările **niciodată**.
- Rolurile custom nu pot acorda `*` (doar `owner` built-in îl are).
- Permisiunile nucleului: `core:users:*`, `core:audit:read`, `core:billing:read`, `core:billing:manage`, `core:export:run`, `core:workflow:read`.

## 6. Entități comune (Shared Business Entities)

În `business/v1` entitatea comună expusă este **clientul**, prin proiecția `crm.customers.lookup`:

```json
{ "id": "cus_…", "name": "Client SRL", "cui": "70000001", "type": "company", "stage": "customer", "archived": false }
```

Etapa 2 adaugă proiecții pentru `products` (Inventar), `suppliers`, `documents` și `transactions` (Facturare/Financiar), tot ca
acțiuni `lookup`/`list` cu câmpuri minime, declarate în `provides`.

## 7. Coduri de eroare stabile

| Cod | HTTP | Semnificație |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Sesiune lipsă/invalidă |
| `TENANT_SUSPENDED` | 403 | Tenant suspendat/închis |
| `MODULE_NOT_ACTIVE` | 403 | Modul neabonat/suspendat/trial expirat |
| `PERMISSION_DENIED` | 403 | Rolul nu are permisiunea |
| `UNDECLARED_DEPENDENCY` | 403 | Apel cross-modul nedeclarat |
| `DEPENDENCY_NOT_ACTIVE` | 403 | Modulul țintă nu este activ pentru tenant |
| `NOT_FOUND` | 404 | Capabilitate sau înregistrare inexistentă (în spațiul tenantului) |
| `VALIDATION_ERROR` | 422 | Payload invalid |
| `CONFLICT` | 409 | Duplicat (CUI, email, id) |
| `SNAPSHOT_TENANT_MISMATCH` | 403 | Restaurare cu snapshot al altui tenant |
| `TENANT_ISOLATION_VIOLATION` | 500 | Invariant de storage încălcat — bug, se oprește cererea |
| `INTERNAL` | 500 | Eroare neașteptată; detaliile nu se expun |

Important: `NOT_FOUND` se returnează și pentru înregistrările altui tenant. Nu există `FORBIDDEN` pentru acest caz, ca să nu se confirme existența.

## 8. Versionare și compatibilitate

- Nucleul anunță contractele suportate în `GET /api/v1/contracts` și în `UNIVERSAL_CORE.json`.
- Un modul declară un singur `contract`. Nucleul poate suporta simultan `v1` și `v2` în perioada de migrare.
- Semver pentru module: `major` = schimbare de `provides` incompatibilă; `minor` = acțiuni noi; `patch` = corecturi.
- Eliminarea unei acțiuni din `provides` cere verificarea că niciun manifest înregistrat nu o are în `uses` (verificare la publicare, etapa 2).
