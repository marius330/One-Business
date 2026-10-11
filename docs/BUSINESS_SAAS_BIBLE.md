# BUSINESS SAAS BIBLE

Versiunea 0.1 — documentul de referință pentru BUSINESS OS. Orice decizie de produs sau tehnică se verifică față de acest document.

## 1. Ce construim

Nu construim un CRM, un inventar sau o aplicație de facturare. Construim o **fabrică de produse SaaS**: UNIVERSAL CORE este
infrastructura comună, iar BUSINESS OS este primul produs comercial construit deasupra ei. Fiecare funcționalitate nouă reutilizează
infrastructura existentă în loc să o reconstruiască.

```
┌──────────────────────────────────────────────────────────────────┐
│  BUSINESS OS — SaaS modular pentru firme din România              │
│  CRM · Inventar · Contracte · Facturare · Financiar · HR          │
├──────────────────────────────────────────────────────────────────┤
│  UNIVERSAL CORE — BUSINESS EDITION                                │
│  Identitate · firme · abonamente · permisiuni · date · API ·      │
│  automatizări                                                     │
├──────────────────────────────────────────────────────────────────┤
│  Shared Capability Gateway                                        │
│  Modulele descoperă și folosesc numai funcțiile autorizate        │
├────────────────┬────────────────┬─────────────────┬──────────────┤
│ Baze de date   │ Stocare și     │ Joburi și       │ Audit și     │
│ izolate        │ backup         │ notificări      │ securitate   │
└────────────────┴────────────────┴─────────────────┴──────────────┘
```

## 2. Ce câștigăm

- Dezvoltăm inițial **CRM**. Acesta folosește serviciile comune: autentificare, clienți, documente, notificări, abonamente, audit.
- Adăugăm **Inventar**: nu reconstruim nimic din cele de mai sus. Inventarul reutilizează identitatea firmei, utilizatorii, clienții, notificările.
- Adăugăm **Facturare**: poate folosi produsele din Inventar și clienții din CRM, **dar numai dacă firma are drepturile și modulele necesare**.
- O firmă care cumpără doar Inventar **nu plătește pentru CRM**.

Valoarea comercială stă în două locuri: în fiecare aplicație și în infrastructura proprie. Același nucleu poate susține în viitor
BUSINESS OS (SRL-uri), UNIVERSITY OS (universități), MINTBERG (trading și cercetare) și alte produse SaaS.

## 3. Regula esențială: separarea completă de MINTBERG

Reutilizăm **codul generic și contractele** UNIVERSAL CORE, **nu aceeași instanță operațională**.

| Componentă | MINTBERG | BUSINESS OS |
| --- | --- | --- |
| Cod generic UNIVERSAL CORE | Reutilizabil | Reutilizabil |
| Baze de date | Separate | Separate |
| Utilizatori și autentificare | Separate | Separate |
| Chei și secrete | Separate | Separate |
| Gateway | Instanță proprie | Instanță proprie |
| Date financiare | Private | Private per SRL |
| Deploy și backup | Independente | Independente |

Nu trebuie să existe posibilitatea ca un modul BUSINESS OS să descopere accidental date sau capabilități interne MINTBERG.
În cod: `createCore()` (în `core/index.js`) creează o instanță complet izolată; nu există nicio referință, import sau URL către
MINTBERG/FORGE în acest repository, iar registrul de module acceptă doar manifeste înregistrate explicit în procesul BUSINESS OS.

## 4. Cele 12 decizii obligatorii

| # | Decizie | Unde se aplică în prototip |
| --- | --- | --- |
| 1 | BUSINESS OS este separat operațional de FORGE/MINTBERG | repository propriu, instanță proprie de core, chei proprii |
| 2 | Reutilizăm doar cod generic, contracte și componente autorizate | `core/` nu conține logică de produs; modulele stau în `modules/` |
| 3 | Fiecare SRL este un tenant izolat | `core/storage/store.js` — namespace fizic per tenant |
| 4 | Fiecare modul are permisiuni distincte | permisiuni `modul:capabilitate:acțiune`, declarate în manifest |
| 5 | Acces default-deny verificat pe server | `IdentityService.can()` + `CapabilityGateway.invoke()` |
| 6 | `UNIVERSAL_CORE.json` este doar punct de descoperire | fișierul public conține doar rute, nu inventar |
| 7 | Registrul complet rămâne privat | `core/registry/registry.js`, expus doar operatorului cu cheie de platformă |
| 8 | Modulele comunică prin Gateway și contracte versionate | `ctx.call()` + `uses` declarat + `contract: "business/v1"` |
| 9 | Fiecare firmă plătește numai modulele activate | `SubscriptionService.computeInvoice()` |
| 10 | Datele unui SRL nu pot fi accesate de alt SRL | teste `test/tenant-isolation.test.js` |
| 11 | Nu există acces implicit la resursele MINTBERG | nicio dependență; modul necunoscut → `NOT_FOUND` |
| 12 | Export, backup, restaurare și audit sunt obligatorii | `exportTenant/importTenant`, `AuditService` |

## 5. Business SaaS Foundation — cele șase funcții comune

1. **Tenant Management** — fiecare SRL are un spațiu de date izolat, identificat prin CUI și un ID intern (`ten_…`).
2. **Identity & Permissions** — proprietar, administrator, contabil, angajat și roluri configurabile; sesiuni legate de (utilizator, tenant).
3. **Subscription Engine** — module activate, planuri lunare, perioade de probă, suspendare, facturare.
4. **Shared Business Entities** — clienți, furnizori, produse, documente, tranzacții comerciale (în MVP: clienți prin CRM; restul în etapele următoare).
5. **Workflow Engine** — notificări, scadențe, aprobări, automatizări.
6. **Capability Registry** — fiecare modul declară ce servicii oferă (`provides`) și ce poate reutiliza (`uses`).

Fiecare modul nou trece prin **UNIVERSAL GATE** (Capability Gateway) înainte să acceseze informații.
**Atenție:** dreptul de a folosi o funcție nu înseamnă dreptul de a vedea datele altui SRL. Gateway-ul verifică separat
(a) tenantul activ, (b) modulul abonat, (c) permisiunea rolului, (d) dependența declarată, iar datele sunt citite exclusiv din
spațiul tenantului curent.

## 6. Modelul de produs

### 6.1 Entități principale

| Entitate | Proprietar | Descriere |
| --- | --- | --- |
| Tenant | Core | Un SRL. CUI unic, status `active/suspended/closed`. |
| User | Core (per tenant) | Email unic în interiorul tenantului. Un rol. |
| Role | Core (per tenant) | Set de permisiuni. 4 roluri built-in + roluri custom (fără `*`). |
| Subscription | Core (per tenant) | Un rând per modul: plan, status, trial, perioadă curentă. |
| Module manifest | Registru privat | Declarație versionată a unui modul. |
| Workflow item | Core (per tenant) | Scadență/notificare/aprobare programată de un modul. |
| Audit entry | Core (per tenant / platformă) | Fiecare decizie a gateway-ului și fiecare acțiune de operator. |
| Customer, Contact, Activity | Modul CRM | Entități comerciale ale SRL-ului. |
| Contract, Deadline | Modul Contracte | Contracte și termene, cu alerte în Workflow. |

### 6.2 Roluri built-in

| Rol | Scop | Ce poate |
| --- | --- | --- |
| `owner` | Proprietar/administrator SRL | Tot, inclusiv abonamente, export, roluri. |
| `admin` | Administrator operațional | Toate modulele, utilizatori, audit. Fără abonamente/export. |
| `accountant` | Contabil | Citire CRM/Contracte, scriere Facturare/Financiar, factura platformei, export. |
| `employee` | Angajat | Operațiuni zilnice CRM, citire contracte și termene. Fără ștergeri, fără financiar. |

### 6.3 Fluxuri comerciale (MVP)

1. **Onboarding**: operatorul (sau self-service, etapa 2) creează tenantul din CUI + denumire + proprietar. Se creează rolurile built-in.
2. **Trial**: proprietarul activează un modul în probă (14 zile). Gateway-ul permite accesul până la `trialEndsAt`.
3. **Plată**: la finalul probei, abonamentul devine `active`; se emite factura lunară doar pentru modulele active.
4. **Neplată**: `past_due` (acces menținut, avertizare) → `suspended` (acces blocat, datele rămân) → după 90 zile `cancelled` + export oferit.
5. **Extindere**: activarea unui modul nou reutilizează instant clienții/utilizatorii existenți.
6. **Ieșire**: exportul complet al datelor tenantului (JSON, apoi CSV/XLSX) este disponibil oricând proprietarului.

## 7. Principii de inginerie

- **Core generic, module specifice.** Nimic din `core/` nu știe ce este un „client” sau un „contract”.
- **Contracte înainte de cod.** Un modul nou începe cu manifestul și cu schema `business/v1`.
- **Fail closed.** Orice eroare de autorizare, abonament sau izolare oprește cererea și se scrie în audit.
- **Tenantul vine din sesiune, niciodată din payload.** Gateway-ul elimină `tenantId/actor/userId` din payload.
- **Fără wildcard în verificări.** `can(actor, "crm:*")` este întotdeauna `false`.
- **Bani în întregi (bani/RON×100).** Nicio aritmetică în virgulă mobilă pe sume.
- **Date sintetice până la validarea securității.** Nicio firmă, persoană sau CUI real în repository.

## 8. Roadmap de module

| Etapă | Module | Dependențe declarate |
| --- | --- | --- |
| MVP (etapa 1) | Core, CRM, Contracte, Dashboard administrativ | contracts → crm.customers.lookup |
| Etapa 2 | Inventar, Facturare (e-Factura/SPV), self-service onboarding, plăți online | invoicing → crm, inventory |
| Etapa 3 | Financiar (încasări/plăți, cash-flow), HR (angajați, concedii, pontaj) | finance → invoicing; hr → core |
| Etapa 4 | Marketplace public pentru module terțe (vezi `MODULE_MARKETPLACE_SPEC.md`) | — |

## 9. Glosar

- **Tenant** — un SRL cu spațiu de date propriu.
- **Capabilitate** — un grup de acțiuni expuse de un modul (`customers`, `contracts`).
- **Gateway / UNIVERSAL GATE** — singurul punct prin care rulează cod de modul.
- **Manifest** — declarația versionată a unui modul.
- **Registru** — inventarul privat al manifestelor.
- **Plan** — tarif lunar al unui modul (fix sau per utilizator).
