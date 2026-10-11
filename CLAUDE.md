# One Business — ghid pentru agenți

- Produs: BUSINESS OS, SaaS modular pentru SRL-uri din România, pe UNIVERSAL CORE (Business Edition). Vezi `README.md` și `docs/BUSINESS_SAAS_BIBLE.md`.
- Reguli dure: tenantul vine din sesiune, niciodată din payload; default-deny; modulele folosesc doar `ctx`; orice apel cross-modul este declarat în `uses`; fără referințe la MINTBERG/FORGE în cod; date sintetice doar.
- Rulare: `npm test` (fără dependențe externe, Node ≥ 20), `npm start` pentru API + `/admin`.
- Contractele `business/v1` din `contracts/v1/` nu se modifică incompatibil; se creează `v2`.
- Nu se face deploy și nu se modifică infrastructura FORGE/MINTBERG fără aprobare explicită.
