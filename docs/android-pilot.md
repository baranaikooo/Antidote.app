# Lokálna beta Antidote

Vyber jedno mesto alebo región a pracuj s dobrovoľníkmi, ktorí s pozvaním súhlasili. Na kontrolu použi dva samostatné testovacie účty a dva fyzické Androidy, prípadne jeden Android a web. Pred testom si poznač verziu APK a dátum nasadenia webu.

| Krok                    | Čo overiť                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prihlásenie             | Oba účty prejdú cez Google a vrátia sa do Antidote. Skontroluj odmietnutie a opätovné povolenie kamery.                                                                |
| Dotazník                | Rozdeľ časť žetónov, zavri APK a otvor ho znova. Rozpracované rozdelenie sa obnoví iba v tom istom účte.                                                               |
| Dosah                   | Zvoľ menší okruh. Profil mimo neho sa nezobrazí, kým dosah výslovne nezmeníš.                                                                                          |
| Prvá otázka             | V novom rozhovore nahraj odpoveď v APK. Over svetlú aj tmavú tému a náhľad nahrávky pred odoslaním. Druhý účet dostane prístup k nahrávke až po uložení vlastnej odpovede. |
| Rozhovor                | Po oboch odpovediach odošli text, GIF a hlasovku. Over príznak neprečítanej správy a opakované odoslanie bez duplicity pri výpadku siete.                              |
| Súhlas                  | Over, že profilové videá sa sprístupnia až po súhlase oboch a že ukončený rozhovor neprijíma ďalšie správy.                                                           |
| Upozornenia v aplikácii | V nastaveniach povoľ upozornenia, nechaj Antidote otvorené a pošli správu z druhého účtu. Zopakuj počas tichých hodín. Správa zostane viditeľná v schránke.            |
| Dobrovoľná spätná väzba | Po prvej výmene oboch účtov skús odpovedať aj preskočiť otázku o pokračovaní. Druhý účet výsledok neuvidí.                                                             |

V Supabase SQL Editore sleduj agregované počty pomocou dotazu:

```sql
select * from public.conversation_pilot_metrics;
```

Podiel obojstranných výmen počítaj zo všetkých začatých rozhovorov. Podiel odpovedí „áno“ uvádzaj spolu s počtom ľudí, ktorí sa rozhodli odpovedať. Údaje z testovacích účtov oddeľ od výsledkov pilotu.

## Upozornenia na hlasové odpovede

GitHub Actions načíta konfiguráciu Firebase pre Android z tajomstva
`FIREBASE_ANDROID_CONFIG` v prostredí `android-release`. Hodnota je súbor
`google-services.json` v Base64. Lokálny build načíta súbor priamo z
`android/app/google-services.json`.

Aplikuj migrácie pre doručovanie hlasových upozornení a nasaď Edge Function
`send-voice-reply` s vypnutým overovaním JWT na bráne. Funkcia sama overuje
podpis webhooku a spracuje každý doručovací lístok najviac raz. Do nastavení funkcie pridaj `FIREBASE_SERVICE_ACCOUNT`
(JSON účtu s oprávnením odosielať cez Firebase Cloud Messaging) a
`VOICE_REPLY_WEBHOOK_SECRET` (náhodné tajomstvo). Do Supabase Vault pridaj
rovnaké tajomstvo pod názvom `voice_reply_webhook_secret` a úplnú URL funkcie
pod názvom `voice_reply_webhook_url`. Až potom sa v aplikácii zobrazí ponuka
na zapnutie upozornení.

Zavri aplikáciu po dokončení nahrávky. Po otvorení over prehratie, odoslanie
a zahodenie návrhu. Pri ďalšom pokuse odošli prvú odpoveď, povoľ upozornenia
a zamkni telefón. Keď odpovie druhý účet, over text „Máš novú odpoveď“ a
dostupnosť prehrávača aj textového chatu po návrate. Zopakuj scenár s
odhlásením prvého účtu pred druhou odpoveďou a over, že upozornenie nepríde.

V nastaveniach Android upozornení zapni iba nové správy. Na odomknutom
telefóne nechaj Antidote na pozadí a over, že upozornenie obsahuje meno
odosielateľa. Zopakuj test so zamknutým displejom a skrytým citlivým obsahom
v nastaveniach Androidu. Zobrazí sa všeobecný text „Máš novú správu“.

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

## Porovnanie hodnôt a odpovedí na situácie

Po súhlase zaraď dobrovoľníkov, ktorí majú uložené žetóny aj odpovede na tri rovnaké situácie. Skupina `situations_control` používa rozdelenie žetónov. Skupina `values_and_situations` používa rovnaké filtre a rovnaký zoznam kandidátov, potom kombinuje 70 % zhody žetónov a 30 % podobnosti odpovedí. Pri rovnakom skóre rozhoduje vzdialenosť. Kandidáti bez porovnateľných odpovedí zostávajú na pozícii z hodnotového poradia.

```sql
insert into profile_private.matching_pilot_assignments (user_id, variant)
select id, case when random() < 0.5 then 'situations_control' else 'values_and_situations' end
from public.profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid -- Nahraď ID účastníka.
  and priority_distribution is not null
  and situation_scores is not null
on conflict (user_id) do nothing;

select * from profile_private.matching_pilot_metrics
where variant in ('situations_control', 'values_and_situations') order by variant;

select * from profile_private.matching_pilot_exposure_metrics
where variant in ('situations_control', 'values_and_situations') order by variant, position;
```

Po dokončení 14-dňového obdobia porovnaj obojstranné rozhovory na 100 prvých zobrazení kandidáta, spolu s počtom zobrazení a výsledkami podľa pozície.
