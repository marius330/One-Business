# REGULĂ PERMANENTĂ — BUILD → DEPLOY → USER TEST

Impusă de owner (2026-10-11). Se aplică tuturor agenților Claude și Codex, pentru toate proiectele.

1. **Ownerul este testerul funcțional final.** Agenții nu efectuează teste de acceptanță în locul lui.
2. După implementare se execută **o singură rundă** de verificări tehnice relevante, apoi aplicația se livrează pentru utilizare.
3. Fără teste exploratorii repetate, simulări extinse, benchmarkuri sau audituri redundante, dacă nu există un defect concret care le justifică.
4. Rămân obligatorii: testele automate din CI, verificările de securitate și de integritate a datelor. Gate-urile de release nu se ocolesc.
5. După un CI reușit, aceeași suită nu se repetă local fără modificări relevante.
6. Dacă deploymentul este deja autorizat, se execută. Nu se cer aprobări repetate.
7. După deploy se verifică doar: serviciul pornește, endpointurile răspund, versiunea corectă este instalată.
8. Livrarea nu se amână pentru teste suplimentare de interfață, scenarii sintetice sau rapoarte independente.
9. **Livrarea obligatorie:** URL funcțional, funcționalitățile disponibile și eventualele blocaje reale.
10. După livrare se așteaptă feedbackul ownerului pentru modificări suplimentare.

**Principiu: CODE → CI → DEPLOY → OWNERUL TESTEAZĂ → FIX.**

Toate verificările automate stau într-un singur pipeline CI; Claude și Codex nu le rulează separat și repetitiv. Unul implementează, celălalt poate verifica punctual un defect, fără audituri complete. Protecția pentru walleturi, bani și baze de date rămâne; testarea redundantă dispare. „Gata" nu înseamnă 1.300 de teste trecute, ci URL-ul livrat ownerului, care intră și îl folosește.
