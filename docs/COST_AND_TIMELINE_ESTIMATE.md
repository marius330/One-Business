# ESTIMARE DE COSTURI ȘI CALENDAR

Estimări de lucru, nu oferte. Ipoteze: echipă mică (1 arhitect/auditor, 1–2 dezvoltatori, 1 cercetare/produs), lucru cu agenți AI pentru
implementare, infrastructură cloud UE. Toate sumele fără TVA, în EUR. Validarea pieței (Manus) poate schimba prețurile și volumele.

## 1. Calendar

| Fază | Durată | Conținut |
| --- | --- | --- |
| Sprint 0 | gata | arhitectură, contracte, prototip cu teste (acest repository) |
| Sprinturi 1–6 | 6 săptămâni | implementare producție (vezi `MVP_IMPLEMENTATION_PLAN.md`) |
| Sprint 7 | 1 săptămână | audit de securitate, penetrare, remedieri |
| Sprint 8 | 1–2 săptămâni | beta închis cu 5–10 SRL-uri |
| **Total până la beta** | **8–9 săptămâni** | |
| Etapa 2 (Inventar, Facturare + e-Factura, self-service, plăți) | +6–8 săptămâni | |
| Etapa 3 (Financiar, HR) | +6 săptămâni | |

## 2. Efort de dezvoltare (zile-om)

| Componentă | Zile | Observații |
| --- | --- | --- |
| Portare core TS + Postgres + RLS + migrații | 8 | nucleul există, se portează |
| Identitate (sesiuni, MFA, rate limit, roluri UI) | 5 | |
| Subscription Engine + Stripe + job lunar + PDF facturi | 6 | |
| Gateway + registru + catalog UI | 3 | logica există în prototip |
| CRM (backend + frontend) | 7 | |
| Contracte + Workflow + notificări email | 6 | |
| Dashboard administrativ + export/backup/restore + audit viewer | 5 | |
| Infra: Docker, IaC, CI/CD, staging/prod, monitorizare | 5 | |
| Audit securitate + remedieri | 5 | Claude + Codex |
| Beta, onboarding, corecturi | 6 | |
| **Total MVP** | **≈56 zile-om** | 8–9 săptămâni cu 1.5 FTE echivalent |

## 3. Costuri

### 3.1 Până la beta (one-off)

| Categorie | Estimare |
| --- | --- |
| Dezvoltare (56 zile × 300–450 EUR/zi, mix agenți AI + review uman) | 17.000 – 25.000 |
| Cercetare piață și testare UX (Manus + interviuri) | 1.500 – 3.000 |
| Design UI / design system | 2.000 – 4.000 |
| Audit securitate extern (opțional, recomandat înainte de date reale) | 3.000 – 6.000 |
| Juridic: termeni, GDPR/DPA, contract abonament | 1.500 – 3.000 |
| **Total** | **25.000 – 41.000 EUR** |

### 3.2 Operare lunară (recurent, până la ~200 tenanți)

| Categorie | Estimare / lună |
| --- | --- |
| Cloud (2 noduri app, Postgres managed cu PITR, Redis, storage, backup) | 250 – 500 |
| Email tranzacțional, SMS, monitorizare, erori | 60 – 150 |
| Plăți (Stripe ≈ 1.5% + 0.25 EUR / tranzacție) | variabil, ≈2% din încasări |
| e-Factura / ANAF | 0 (API public) |
| Domenii, certificate, licențe | 20 – 50 |
| Suport și mentenanță (0.3 FTE) | 1.500 – 2.500 |
| **Total** | **≈1.900 – 3.200 EUR** |

### 3.3 Prag de rentabilitate (ipoteză)

Venit mediu per tenant: 2 module × ≈45 RON ≈ 90 RON/lună ≈ 18 EUR. La 3.000 EUR costuri lunare, pragul este ≈170 tenanți plătitori.
Cu 3 module/tenant (≈27 EUR), pragul scade la ≈110. Țintă recomandată pentru 12 luni: 300–500 tenanți plătitori, de validat cu Manus.

## 4. Ce nu este inclus

Marketing și vânzări, costul unui agent/contabil partener, localizare în alte limbi, module terțe (marketplace etapa 4), SLA enterprise.
