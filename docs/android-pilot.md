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

## Porovnanie odporúčaní

Po súhlase pridaj účastníkov s uloženými žetónmi cez Supabase SQL Editor. Novým účastníkom sa náhodne pridelí verzia `baseline` alebo `full_priorities`. Obe používajú rovnaký výber kandidátov a vzdialenosť rozhoduje pri zhode skóre. Prvá verzia porovnáva najvyššiu prioritu. Druhá porovnáva všetkých päť hodnôt a mení poradie iba na miestach, kde sú údaje oboch ľudí dostupné. Profily bez žetónov zostávajú na pôvodných miestach. Záznamy v pôvodnej skupine `current` zostávajú v reporte, ak existujú.

```sql
insert into profile_private.matching_pilot_assignments (user_id)
select id from public.profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid -- Nahraď ID účastníka.
  and priority_distribution is not null
on conflict (user_id) do nothing;

select * from profile_private.matching_pilot_metrics order by variant;
select * from profile_private.matching_pilot_exposure_metrics order by variant, position;
```

Opakovaný zápis skupinu nezmení. Na odvolanie súhlasu odstráň zápis účastníka z `profile_private.matching_pilot_assignments`. Výsledky zahŕňajú iba dokončené 14-dňové obdobia a nové rozhovory priraďujú skupine odosielateľa prvej správy. Porovnaj počet obojstranných rozhovorov na účastníka, podiel obojstranných zo začatých rozhovorov a podiel odpovedí „áno“ z dobrovoľných odpovedí. Pri každom ukazovateli uveď menovateľ.

Report zobrazení počíta prvé zobrazenie kandidáta každému účastníkovi pri viditeľnej aspoň štvrtine karty. Celkový riadok skupiny má prázdnu pozíciu. Obojstranný rozhovor sa pripočíta, keď účastník po zobrazení pošle prvú správu a kandidát odpovie v danom 14-dňovom období. Pokrytie ukazuje podiel zobrazení, pri ktorých majú rozdelenie žetónov uložené obaja. Odvolanie súhlasu odstráni aj záznamy zobrazení daného účastníka.

## Porovnanie prínosu extraverzie

Dobrovoľníkov, ktorí súhlasia s týmto porovnaním, prideľ náhodne medzi `current` a `without_extraversion`. Obe skupiny používajú rovnaké filtre, výber kandidátov, výpočet podobnosti a vekový bonus. Druhý model počíta skóre zo 60 bodov za podobnosť a najviac 10 bodov za vek. Každý účet sa môže zúčastniť jednej skupiny pilotu.

```sql
insert into profile_private.matching_pilot_assignments (user_id, variant)
select id, case when random() < 0.5 then 'current' else 'without_extraversion' end
from public.profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid -- Nahraď ID účastníka.
  and top_priority is not null
on conflict (user_id) do nothing;

select * from profile_private.matching_pilot_metrics
where variant in ('current', 'without_extraversion') order by variant;

select * from profile_private.matching_pilot_exposure_metrics
where variant in ('current', 'without_extraversion') order by variant, position;
```

Po 14 dňoch porovnaj celkové obojstranné rozhovory na 100 zobrazení aj výsledky podľa pozície. Záujem pokračovať vyhodnoť ako podiel kladných odpovedí zo všetkých dobrovoľných odpovedí a uveď aj ich počet.
