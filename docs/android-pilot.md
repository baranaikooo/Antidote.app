# Lokálna beta Antidote

Vyber jedno mesto alebo región a pracuj s dobrovoľníkmi, ktorí s pozvaním súhlasili. Na kontrolu použi dva samostatné testovacie účty a dva fyzické Androidy, prípadne jeden Android a web. Pred testom si poznač verziu APK a dátum nasadenia webu.

| Krok                    | Čo overiť                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prihlásenie             | Oba účty prejdú cez Google a vrátia sa do Antidote. Skontroluj odmietnutie a opätovné povolenie kamery.                                                                |
| Dotazník                | Rozdeľ časť žetónov, zavri APK a otvor ho znova. Rozpracované rozdelenie sa obnoví iba v tom istom účte.                                                               |
| Dosah                   | Zvoľ menší okruh. Profil mimo neho sa nezobrazí, kým dosah výslovne nezmeníš.                                                                                          |
| Rozhovor                | Jeden účet odošle prvú správu a druhý ho uvidí v schránke. Po otvorení zmizne príznak neprečítanej správy. Vyskúšaj výpadok siete a opakované odoslanie bez duplicity. |
| Hlas a súhlas           | Nahraj hlasovku v APK. Over, že jeden súhlas nesprístupní profilové videá a že ukončený rozhovor neprijíma ďalšie správy.                                              |
| Upozornenia v aplikácii | V nastaveniach povoľ upozornenia, nechaj Antidote otvorené a pošli správu z druhého účtu. Zopakuj počas tichých hodín. Správa zostane viditeľná v schránke.            |
| Dobrovoľná spätná väzba | Po prvej výmene oboch účtov skús odpovedať aj preskočiť otázku o pokračovaní. Druhý účet výsledok neuvidí.                                                             |

V Supabase SQL Editore sleduj agregované počty pomocou dotazu:

```sql
select * from public.conversation_pilot_metrics;
```

Podiel obojstranných výmen počítaj zo všetkých začatých rozhovorov. Podiel odpovedí „áno“ uvádzaj spolu s počtom ľudí, ktorí sa rozhodli odpovedať. Údaje z testovacích účtov oddeľ od výsledkov pilotu.
