# SUBSCRIPTION AND BILLING SPEC

## 1. Principii

- Un tenant plătește lunar **doar modulele activate**. Nu există „pachet obligatoriu”.
- Un abonament = un rând per (tenant, modul). Planul, statusul și perioada se țin pe acest rând.
- Sumele sunt întregi în **bani** (RON × 100). TVA se aplică la emiterea facturii (21% standard; configurabil).
- Motorul calculează ce se datorează; încasarea este un **adaptor** (Stripe, Netopia, transfer bancar).

## 2. Stări

```
            activate(trial)                 trial expirat
  (none) ───────────────▶ trial ─────────────────────────▶ (acces blocat, reason=trial_expired)
     │                      │ plată
     │ activate             ▼
     └──────────────────▶ active ──neplată──▶ past_due ──7 zile──▶ suspended ──90 zile──▶ cancelled
                            ▲                                     │
                            └────────────── reactivate ───────────┘
```

| Status | Acces | Facturat |
| --- | --- | --- |
| `trial` | da, până la `trialEndsAt` (implicit 14 zile) | nu |
| `active` | da | da |
| `past_due` | da (banner de avertizare) | da |
| `suspended` | nu | nu |
| `cancelled` | nu | nu; datele se păstrează 90 zile, apoi export + ștergere |

Suspendarea întregului tenant (`tenant.status = suspended`) blochează toate modulele indiferent de abonamente.

## 3. Planuri

| Modul | Plan | Preț lunar (fără TVA) | Tip |
| --- | --- | --- | --- |
| CRM | `standard` | 49 RON | fix, până la 3 utilizatori incluși |
| CRM | `team` | 29 RON | per utilizator |
| Contracte | `standard` | 39 RON | fix |
| Inventar (etapa 2) | `standard` | 59 RON | fix |
| Facturare (etapa 2) | `standard` | 49 RON | fix + e-Factura |
| Financiar (etapa 3) | `standard` | 69 RON | fix |
| HR (etapa 3) | `team` | 15 RON | per angajat |

Prețurile sunt **ipoteze de lucru** până la raportul Manus (piață, concurență). Ele stau în manifestul modulului și se versionează;
schimbarea unui preț se aplică de la următoarea perioadă, cu notificare de 30 zile.

Reduceri (etapa 2): plan anual (-15%), pachet 3+ module (-10%), parteneri contabili (comision 20%).

## 4. Facturare lunară

`computeInvoice(tenantId, { period })` produce:

```json
{
  "period": "2026-10", "currency": "RON",
  "lines": [{ "moduleId": "crm", "plan": "team", "quantity": 4, "unitPriceBani": 2900, "totalBani": 11600 }],
  "subtotalBani": 11600, "vatRate": 21, "vatBani": 2436, "totalBani": 14036
}
```

Reguli:
- O linie per abonament `active` sau `past_due`; `trial/suspended/cancelled` nu apar.
- Planurile `perSeat` se înmulțesc cu `seats` (numărul de locuri plătite, nu numărul de utilizatori creați; depășirea blochează crearea de utilizatori noi).
- Prorata la activare la mijlocul lunii (etapa 2): `pret × zile_rămase / zile_lună`.
- Factura platformei se emite pe CUI-ul tenantului; se transmite în SPV (e-Factura) prin modulul Facturare al platformei însăși („dogfooding”).

## 5. Fluxul de plată (adaptor)

1. Job lunar (ziua 1, 06:00) generează facturile pentru toți tenanții.
2. Adaptorul de plată încearcă încasarea (card salvat) sau trimite factura cu termen 15 zile (transfer).
3. Neplată la termen → `past_due` + email; +7 zile → `suspended` + email; +90 zile → `cancelled`.
4. Plată confirmată → `active`, perioada se mută cu o lună.
5. Toate tranzițiile sunt auditate (`subscription.*`).

## 6. Interfața cu gateway-ul

Gateway-ul apelează `isUsable(tenantId, moduleId)` la **fiecare** cerere; răspunsul este `{ ok, reason }`. Este singura sursă de adevăr pentru acces.
Nu există cache pe client; un abonament suspendat se aplică la următoarea cerere.

## 7. Self-service (etapa 2)

Proprietarul (`core:billing:manage`) poate: activa trial, activa/anula module, schimba planul, actualiza datele de facturare, descărca facturile.
Anularea este efectivă la sfârșitul perioadei plătite.
