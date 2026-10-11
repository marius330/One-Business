# MODULE MARKETPLACE SPEC

## 1. Scop

Marketplace-ul este catalogul de module pe care un tenant le poate activa. În MVP este intern (doar modulele din acest repository).
Specificația descrie și etapa în care module terțe pot fi publicate, pentru ca arhitectura să nu trebuiască refăcută.

## 2. Două registre

| Registru | Cine îl vede | Conținut |
| --- | --- | --- |
| **Registrul privat** (`core/registry`) | nucleul și operatorul | manifeste complete, handler-e, prețuri interne, flag-uri |
| **Catalogul public** | tenanții (după login) | nume, descriere, versiune, planuri, permisiuni, capabilități oferite, dependențe |

`UNIVERSAL_CORE.json` nu este niciunul din ele: este doar punctul de descoperire (unde este gateway-ul, ce contracte sunt suportate).

## 3. Ciclul de viață al unui modul

```
draft ──▶ review (Claude: contracte + izolare) ──▶ published ──▶ deprecated ──▶ retired
```

- **draft**: manifest + handler-e + teste într-un PR. Validare automată a manifestului (`validateManifest`).
- **review**: checklist §5. Nu se publică fără dependențe declarate complet și teste de izolare.
- **published**: vizibil în catalog, activabil. Versiunile anterioare rămân disponibile pentru tenanții care le folosesc.
- **deprecated**: nu mai poate fi activat de tenanți noi; cei existenți primesc notificare și o perioadă de migrare (90 zile).
- **retired**: handler-ele sunt eliminate; datele tenanților rămân exportabile.

## 4. Manifest — câmpuri obligatorii și opționale

Obligatorii: `id, name, version, contract, provides, plans, handlers` (vezi `UNIVERSAL_CORE_BUSINESS_CONTRACTS.md`).
Opționale (etapa 2): `category` (`sales/operations/finance/people`), `icon`, `screenshots`, `publisher` (`{ name, cui, contact }`),
`dataRetentionDays`, `webhooks` (evenimente emise), `settingsSchema` (configurare per tenant).

## 5. Checklist de publicare

- [ ] Manifest valid; `contract` suportat de instanță.
- [ ] Fiecare `ctx.call` are o intrare în `uses`; nu există alte căi de acces la date.
- [ ] Handler-ele folosesc doar `ctx`; nu importă storage, registru sau alte module direct.
- [ ] Toate acțiunile de scriere scriu `ctx.audit`.
- [ ] Proiecțiile expuse altor module (`lookup`) conțin câmpuri minime.
- [ ] Teste: izolare tenant, permisiuni, dependență inactivă, validare payload.
- [ ] Prețurile aprobate comercial; descrieri în română.
- [ ] Niciun apel de rețea extern fără adaptor aprobat (e-Factura, bănci, email) și fără consimțământ per tenant.

## 6. Module terțe (etapa 4)

- Rulează **în afara procesului** nucleului, ca servicii izolate care primesc apeluri de la gateway prin HTTP semnat (mTLS + JWT scurt, cu `tenantId` și `actor` în claims).
- Nu primesc acces la storage-ul nucleului; au propriul storage per tenant, cu obligație de export în același format.
- Revenue share: platforma reține 30% din abonament; plata către publisher lunar, pe bază de raport de activări.
- Un modul terț poate fi dezactivat global de operator în caz de incident (`kill switch`), cu notificarea tenanților.

## 7. Experiența tenantului

- Pagina „Module”: card per modul, status (`neactivat / trial / activ / suspendat`), buton „Încearcă 14 zile” sau „Activează”.
- La activare: se afișează ce module sunt necesare (dependențe) și prețul total; nu se activează automat dependențe plătite fără confirmare.
- La dezactivare: datele modulului rămân exportabile 90 zile.
