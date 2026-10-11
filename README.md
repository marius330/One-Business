# One Business — BUSINESS OS

**SaaS modular pentru SRL-uri din România, construit pe UNIVERSAL CORE (Business Edition).**

Fiecare firmă (tenant) activează și plătește lunar doar modulele de care are nevoie: CRM, Contracte, Inventar, Facturare, Financiar, HR.
Modulele reutilizează aceeași infrastructură (identitate, tenanți, abonamente, permisiuni, date, audit, automatizări) prin
**Capability Gateway**, fără duplicare.

> Decizie strategică: BUSINESS OS **nu** este un proiect secundar al MINTBERG. Este o afacere SaaS independentă, construită pe aceeași
> tehnologie UNIVERSAL CORE, cu propriile date, clienți, abonamente, chei și infrastructură. Nu există acces implicit la resursele MINTBERG.

## Conținutul repository-ului

| Director | Ce conține |
| --- | --- |
| `docs/` | Livrabilele de arhitectură (Bible, contracte, securitate tenant, abonamente, marketplace, plan MVP, costuri) |
| `contracts/v1/` | Contractele versionate `business/v1` (JSON Schema) pe care le respectă modulele |
| `core/` | UNIVERSAL CORE — Business Edition: tenant, identitate, abonamente, registru, gateway, storage izolat, audit, workflow |
| `modules/` | Modulele comerciale: `crm`, `contracts` |
| `apps/api/` | API HTTP (zero dependențe) + `apps/admin/` dashboard administrativ |
| `seed/` | Date **sintetice** (nicio firmă, persoană sau CUI real) |
| `test/` | Teste automate: izolare multi-tenant, default-deny, abonamente, gateway, backup/restore, HTTP |
| `UNIVERSAL_CORE.json` | Punctul minimal de descoperire (public). Registrul complet rămâne privat, server-side |

## Rulare rapidă (prototip)

Necesită Node.js ≥ 20. Fără `npm install` — prototipul nu are dependențe externe.

```bash
npm test          # 25 de teste
npm start         # API pe http://127.0.0.1:3000, dashboard pe /admin (cheia de platformă apare în consolă)
npm run seed      # afișează tenanții sintetici
```

Autentificare sintetică: CUI `RO41234567`, `owner@alfa-demo.test`, parola `parola-demo-2026`.

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"cui":"RO41234567","email":"owner@alfa-demo.test","password":"parola-demo-2026"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s -X POST localhost:3000/api/v1/gateway -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"module":"crm","capability":"customers","action":"list"}'
```

## Cele 12 decizii obligatorii

1. BUSINESS OS este separat operațional de FORGE/MINTBERG.
2. Reutilizăm doar cod generic, contracte și componente autorizate.
3. Fiecare SRL este un tenant izolat.
4. Fiecare modul are permisiuni distincte.
5. Accesul este default-deny și verificat pe server.
6. `UNIVERSAL_CORE.json` este doar punctul minimal de descoperire, nu inventarul resurselor.
7. Registrul complet rămâne privat.
8. Modulele comunică prin Gateway și contracte versionate.
9. Fiecare firmă plătește numai modulele activate.
10. Datele unui SRL nu pot fi accesate de alt SRL.
11. Nu există acces implicit la resursele MINTBERG.
12. Exportul datelor, backupul, restaurarea și auditul sunt funcții obligatorii.

Fiecare decizie are o verificare automată sau un control descris în `docs/TENANT_SECURITY_MODEL.md` (secțiunea „Matrice decizii → controale”).

## Roluri în echipă

- **Claude** — arhitectura UNIVERSAL CORE și contractele Business Edition; verifică izolarea multi-tenant; auditează implementarea.
- **Codex** — backend, frontend, bază de date; abonamente și module; teste automate și pregătirea deploy-ului.
- **Manus** — cercetarea pieței românești, prețuri, concurență; testarea fluxurilor comerciale.

Regulă: nu se modifică infrastructura FORGE/MINTBERG și nu se face deploy fără aprobare.

## Starea livrabilelor

| # | Livrabil | Stare |
| --- | --- | --- |
| 1 | `docs/BUSINESS_SAAS_BIBLE.md` | v0.1 |
| 2 | `docs/UNIVERSAL_CORE_BUSINESS_CONTRACTS.md` + `contracts/v1/` | v0.1 |
| 3 | `docs/TENANT_SECURITY_MODEL.md` | v0.1 |
| 4 | `docs/SUBSCRIPTION_AND_BILLING_SPEC.md` | v0.1 |
| 5 | `docs/MODULE_MARKETPLACE_SPEC.md` | v0.1 |
| 6 | `docs/MVP_IMPLEMENTATION_PLAN.md` | v0.1 |
| 7 | `docs/COST_AND_TIMELINE_ESTIMATE.md` | v0.1 (estimări, de validat cu Manus) |
| 8 | Prototip funcțional cu date sintetice (`core/`, `modules/`, `apps/`, `test/`) | rulează, 25 teste |
