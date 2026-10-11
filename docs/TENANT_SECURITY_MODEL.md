# TENANT SECURITY MODEL

Modelul de securitate multi-tenant al BUSINESS OS. Responsabil: Claude (verificare izolare, audit implementare).

## 1. Modelul de amenințare

| Actor | Ce încearcă | Control |
| --- | --- | --- |
| Utilizator al SRL-ului A | Să citească/modifice date ale SRL-ului B (id ghicit, `tenantId` în payload) | Tenantul vine doar din sesiune; storage per tenant; `NOT_FOUND` pentru id străin |
| Angajat | Să facă acțiuni rezervate proprietarului (export, abonamente, ștergeri) | Default-deny, roluri, fără wildcard în verificări |
| Modul (cod terț sau bug) | Să apeleze alt modul neplătit sau nedeclarat; să acceseze storage global | `uses` declarat, `DEPENDENCY_NOT_ACTIVE`, `ctx` înghețat fără storage global |
| Client neplătitor | Să continue să folosească modulul | Gateway verifică abonamentul la fiecare cerere |
| Operator de platformă | Acces nelimitat la date | Cheie de platformă separată, audit de platformă, în producție: MFA + aprobare în doi |
| Infrastructură partajată cu MINTBERG | Scurgere de capabilități/date | Instanță, DB, chei, deploy separate; nicio dependență de cod către MINTBERG |

## 2. Izolarea datelor

Prototip: `IsolatedStorage.forTenant(tenantId)` întoarce un handle care nu poate ajunge la alt tenant; fiecare rând este ștampilat cu `tenantId` și re-verificat la citire (`TENANT_ISOLATION_VIOLATION` dacă nu corespunde — fail closed).

Producție (PostgreSQL):

| Nivel | Implementare | Când |
| --- | --- | --- |
| Standard | O schemă per tenant (`t_<id>`), `search_path` setat per conexiune, **plus** `tenant_id` pe fiecare tabel cu Row Level Security activat | toate SRL-urile |
| Dedicat | Bază de date separată, backup propriu, cheie de criptare proprie | tenanți enterprise / cerințe contractuale |

Reguli:
- Nicio interogare fără `tenant_id` nu trece de code review; RLS este plasa de siguranță, nu singurul control.
- Conexiunile aplicației rulează cu un rol fără `BYPASSRLS`.
- Id-urile sunt UUID-uri prefixate, neghicibile; totuși, izolarea nu se bazează pe secretul id-ului.
- Fișierele (documente, atașamente) se stochează în prefixe per tenant (`s3://…/<tenantId>/`) cu chei de criptare per tenant (SSE-KMS).

## 3. Identitate și sesiuni

- Parole: scrypt cu salt per utilizator (prototip); Argon2id în producție. Minim 10 caractere.
- Sesiuni: token aleatoriu de 256 biți, legat de `(userId, tenantId)`, expiră în 12 ore; dezactivarea utilizatorului revocă toate sesiunile.
- Login scoped pe tenant (CUI + email + parolă): același email poate exista în două SRL-uri ca două conturi distincte.
- Producție: MFA opțional per tenant, obligatoriu pentru `owner`; rate limiting pe login; blocare temporară după 10 eșecuri.
- Cheia operatorului de platformă este un canal separat (`X-Platform-Key`), niciodată un „super-user” în tabelul de utilizatori.

## 4. Autorizare

- Format `modul:capabilitate:acțiune`; verificare exactă, fără wildcard în cerere.
- Roluri built-in `owner/admin/accountant/employee`; roluri custom fără `*`.
- Gateway-ul verifică, în ordine: tenant activ → capabilitate există → abonament utilizabil → permisiune. Fiecare pas negativ este auditat.
- Apelurile cross-modul nu escaladează: actorul, tenantul și adâncimea sunt propagate și limitate.

## 5. Separarea de MINTBERG/FORGE

Verificări care trebuie să treacă la fiecare audit:

1. `grep -ri "mintberg\|forge" core/ modules/ apps/` întoarce doar comentarii/documentație, niciun import, URL, cheie sau nume de serviciu.
2. Nicio variabilă de mediu, secret sau endpoint comun între deploy-uri.
3. Registrul de module al instanței BUSINESS OS conține doar manifeste din acest repository (sau din marketplace-ul aprobat).
4. Baze de date, bucket-uri, cozi și chei KMS cu nume și conturi distincte.

## 6. Audit

- **Audit tenant** (în spațiul tenantului): fiecare decizie gateway (`gateway.allow`/`gateway.deny` cu cod), login reușit/eșuat, schimbări de utilizatori/roluri/abonamente, evenimente de modul (`crm.customer.created`), export.
- **Audit platformă**: creare tenant, schimbări de status, înregistrare module.
- Intrările sunt append-only; în producție se scriu și într-un depozit WORM separat, păstrat 5 ani (cerință fiscală RO pentru documente — de confirmat cu contabilul).
- Proprietarul își poate vedea auditul (`core:audit:read`); operatorul vede auditul oricărui tenant **cu înregistrarea accesului**.

## 7. Export, backup, restaurare

| Funcție | Prototip | Producție |
| --- | --- | --- |
| Export | `GET /api/v1/me/export` → JSON cu toate colecțiile tenantului, inclusiv audit | + CSV/XLSX per entitate, criptat la descărcare, link cu expirare |
| Backup | snapshot per tenant (`exportTenant`) | PITR pe PostgreSQL + snapshot zilnic per schemă, păstrat 30 zile; teste de restaurare lunare |
| Restaurare | `importTenant` refuză snapshot al altui tenant | restaurare într-o schemă nouă, verificare, apoi swap; aprobare operator |
| Ștergere | `dropTenant` | la cerere, după export, cu confirmare; purjare din backup-uri după 30 zile |

## 8. Matrice decizii → controale → teste

| Decizie | Control | Test |
| --- | --- | --- |
| 3, 10 — tenant izolat | storage per tenant, tenant din sesiune | `tenant-isolation.test.js` (4 teste) |
| 4, 5 — permisiuni distincte, default-deny | `can()` exact, roluri | `permissions.test.js` |
| 6, 7 — descoperire minimă, registru privat | fișier public fără inventar; `/platform/catalog` cu cheie | `http-api.test.js` („registry is not public”) |
| 8 — gateway + contracte | `uses`, `provides`, validare manifest | `gateway-modules.test.js` |
| 9 — plată doar pe module active | `computeInvoice`, gating | `subscriptions.test.js` |
| 11 — fără acces MINTBERG | modul necunoscut → `NOT_FOUND` | `permissions.test.js` („mintberg” → NOT_FOUND) |
| 12 — export/backup/restore/audit | `exportTenant/importTenant`, `AuditService` | `tenant-isolation.test.js`, `permissions.test.js` (audit) |

## 9. Checklist de audit pentru implementarea Codex

- [ ] Nicio rută nu primește `tenantId` din client; middleware-ul îl pune din sesiune.
- [ ] Toate tabelele au `tenant_id NOT NULL` + RLS; migrațiile sunt revizuite.
- [ ] Toate handler-ele de modul primesc doar `ctx`; nu importă clientul DB direct.
- [ ] Fiecare `uses` din manifest corespunde unui `ctx.call` real și invers.
- [ ] Toate codurile de eroare sunt din lista stabilă; 500 nu expune stack.
- [ ] Testele de izolare rulează în CI pe fiecare PR și blochează merge-ul.
- [ ] Date sintetice în toate mediile până la validarea securității; seed-ul nu conține CUI-uri reale.
- [ ] Secretele vin din managerul de secrete al instanței BUSINESS OS; niciun secret în repo.
- [ ] Export complet reproduce tenantul într-o instanță curată (test de restaurare).
