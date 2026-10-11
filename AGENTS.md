# One Business — ghid pentru agenți

- **Regula permanentă BUILD → DEPLOY → USER TEST (owner, 2026-10-11)**: vezi `docs/RULE_BUILD_DEPLOY_USER_TEST.md`. O singură rundă de verificări tehnice după implementare, CI deține suita completă, livrarea înseamnă URL funcțional + funcționalități + blocaje reale; ownerul testează funcțional și decide corecțiile. Fără audituri, simulări sau rapoarte repetate fără un defect concret.

- Produs: BUSINESS OS, SaaS modular pentru SRL-uri din România, pe UNIVERSAL CORE (Business Edition). Vezi `README.md` și `docs/BUSINESS_SAAS_BIBLE.md`.
- Reguli dure: tenantul vine din sesiune, niciodată din payload; default-deny; modulele folosesc doar `ctx`; orice apel cross-modul este declarat în `uses`; fără referințe la MINTBERG/FORGE în cod; date sintetice doar.
- Rulare: `npm test` (fără dependențe externe, Node ≥ 20), `npm start` pentru API + `/admin`.
- Contractele `business/v1` din `contracts/v1/` nu se modifică incompatibil; se creează `v2`.
- Nu se face deploy și nu se modifică infrastructura FORGE/MINTBERG fără aprobare explicită.
