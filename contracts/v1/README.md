# Contracte business/v1

Acest director conține contractele versionate pe care modulele le respectă atunci când comunică prin Capability Gateway.
Fișierele JSON sunt schema minimă (JSON Schema draft 2020-12) a manifestului de modul și a cererii/răspunsului gateway.

- `module-manifest.schema.json` — ce declară un modul (provides / uses / permissions / plans).
- `gateway-request.schema.json` — forma unei invocări prin gateway (fără tenantId: tenantul vine din sesiune).
- `gateway-error.schema.json` — forma unei erori; codurile sunt stabile și fac parte din contract.

Regulă: o schimbare incompatibilă într-un contract înseamnă o versiune nouă (`business/v2`), nu o modificare a `v1`.
