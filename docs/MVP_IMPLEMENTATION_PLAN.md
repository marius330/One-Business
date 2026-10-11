# MVP IMPLEMENTATION PLAN

Obiectiv: un BUSINESS OS funcțional, cu Tenant Management, autentificare și permisiuni, Subscription Engine, Capability Gateway,
registru minimal de module, CRM comercial, Contracte și termene, Dashboard administrativ. Date sintetice până la validarea securității.

Nu așteptăm finalizarea întregului UNIVERSAL CORE general (~36 zile estimate anterior). Construim în paralel o versiune minimă,
compatibilă cu contractele `business/v1`, care este exact ceea ce conține acest repository.

## 1. Stack recomandat pentru producție

| Strat | Alegere | Motiv |
| --- | --- | --- |
| Backend | Node.js 22 + TypeScript, Fastify | același limbaj ca prototipul; `core/` se portează direct |
| DB | PostgreSQL 16, schemă per tenant + RLS, Prisma sau Drizzle cu migrații | izolare, backup/PITR matur |
| Auth | sesiuni server-side în Redis (sau Postgres), Argon2id, MFA TOTP | control revocare, fără JWT long-lived |
| Frontend | React + Vite (tenant app) și același stack pentru admin | o echipă, un design system |
| Joburi | BullMQ (Redis) pentru facturare lunară, notificări, exporturi | retry, programare |
| Plăți | Stripe (card) + transfer bancar; Netopia ca alternativă locală | adaptor, înlocuibil |
| e-Factura | adaptor SPV (ANAF OAuth) în modulul Facturare, etapa 2 | obligație legală B2B |
| Infra | Container (Docker) pe un cloud UE, 2 medii (staging, prod), IaC | separare completă de MINTBERG |
| Observabilitate | OpenTelemetry, loguri structurate cu `tenantId`, alerte | audit și incidente |

## 2. Etapele MVP (sprinturi de 1 săptămână)

| Sprint | Livrabil | Responsabil | Criteriu de acceptare |
| --- | --- | --- | --- |
| 0 (gata) | Arhitectură, contracte, prototip cu teste | Claude | acest repository; `npm test` verde |
| 1 | Schelet producție: TypeScript, Postgres, migrații, schema per tenant + RLS, `createCore` portat | Codex | testele din `test/` trec pe Postgres |
| 2 | Identitate: utilizatori, roluri, sesiuni Redis, MFA, rate limit; API auth | Codex | `permissions.test.js` + teste MFA |
| 3 | Subscription Engine + job lunar + adaptor Stripe (test mode) + facturi PDF | Codex | factură generată pentru tenant sintetic |
| 4 | Gateway + registru + CRM (frontend: clienți, contacte, activități) | Codex | fluxul CRM cap-coadă în UI |
| 5 | Contracte și termene (frontend) + Workflow (notificări email) | Codex | alerte de scadență trimise |
| 6 | Dashboard administrativ + export/backup/restore + audit viewer | Codex | restaurare într-o instanță curată |
| 7 | Audit de securitate (Claude), teste de penetrare pe izolare, remedieri | Claude + Codex | checklist §9 din TENANT_SECURITY_MODEL bifat |
| 8 | Beta închis: 5–10 SRL-uri (date reale după validare), onboarding asistat | Manus + echipa | NPS, bug-uri blocante = 0 |

Paralel (Manus, sprinturile 1–4): cercetare piață RO, prețuri concurență (SmartBill, Saga, Oblio, FGO, Keez, Pipedrive/HubSpot pentru CRM),
interviuri cu 15 antreprenori/contabili, testarea fluxurilor din prototip.

## 3. Sarcini concrete pentru Codex (sprint 1–2)

1. Portează `core/` în TypeScript păstrând API-ul public (`createCore`, servicii, `ctx`). Nu schimba semantica gateway-ului.
2. Implementează `IsolatedStorage` peste Postgres: `forTenant(id)` → client cu `SET search_path = t_<id>` + `SET app.tenant_id`; RLS pe fiecare tabel.
3. Validare CUI: checksum (algoritmul oficial, cheia 753292) + interogare ANAF (`/api/PlatitorTvaRest`) cu cache 24h; injectată prin `validators.cui`.
4. Migrații: `tenants`, `users`, `roles`, `sessions`, `subscriptions`, `audit_log`, `workflow_items`, `crm_customers`, `crm_contacts`, `crm_activities`, `contracts`.
5. Rulează testele existente ca teste de integrare (adaptor de test pe Postgres în Docker).

## 4. Definiția „gata” pentru MVP

- Toate testele de izolare și permisiuni trec pe Postgres.
- Un SRL se poate înregistra, activa CRM în trial, adăuga clienți, activa Contracte, primi alerte de scadență, vedea factura platformei, exporta datele.
- Un SRL cu doar Contracte nu poate folosi date CRM; un SRL suspendat nu poate folosi nimic.
- Operatorul vede toți tenanții, modulele, facturile și auditul, cu cheie separată și MFA.
- Nicio referință la MINTBERG/FORGE în cod, config sau infrastructură.
- Deploy pe staging doar după aprobarea explicită a proprietarului; producție doar după sprintul 7.

## 5. Riscuri

| Risc | Impact | Mitigare |
| --- | --- | --- |
| Scurgere între tenanți printr-o interogare fără filtru | critic | RLS + teste + review obligatoriu pe migrații |
| e-Factura/ANAF instabil | mediu | adaptor cu coadă și retry; modulul Facturare în etapa 2 |
| Prețuri greșite | mediu | validare Manus înainte de beta; prețuri în manifest, ușor de schimbat |
| Supra-inginerie a nucleului | mediu | nucleul rămâne minimal; funcții noi doar când al doilea modul le cere |
