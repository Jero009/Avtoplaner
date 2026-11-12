[English](README.md) | **Slovenščina**

# Avtoplaner

Avtoplaner je osebni koledar za Android in splet. Združuje lokalne dogodke,
podatke iz Google Koledarja in šolske informacije iz eAsistenta v eni
aplikaciji, ki deluje tudi brez interneta.

Aplikacija je zgrajena z React, TypeScript, Vite, Capacitor, SQLite in PWA
gradnjo. Podatki so shranjeni lokalno; Avtoplaner nima svojega strežnika.

## Stanje

- **Lokalni koledar (v1.0):** pogledi FullCalendar, dodajanje/urejanje lokalnih
  dogodkov z zaznavanjem trkov, nadzorna plošča, teme, sl/en prevodi, SQLite
  z migracijami, izvoz/uvoz varnostnih kopij, gradnji za Android (Capacitor)
  in PWA.
- **eAsistent integracija (v1.1):** prijava + sinhronizacija urnika v lokalno
  podatkovno bazo (ure, nadomeščanja/odpovedi, domače naloge, napovedana
  preverjanja znanja), prikazano na straneh koledar, urnik in domače naloge.
  Sinhronizacija deluje samo na Androidu — brskalnik/PWA blokira CORS in pokaže
  jasno obvestilo. Ocene, Google Koledar in obvestila ob zaprti aplikaciji so
  sledeni v spodnjem seznamu stanja.
- **Napravski koledar + sinhronizacija v ozadju (v1.3):** sinhronizirani
  eAsistent podatki se lahko zapišejo v koledar Android naprave
  (CalendarProvider — deluje s Fossify/DAVx⁵, brez Google API) prek
  namenskega Capacitor vtičnika (`DeviceCalendarPlugin.java`). Idempotentno:
  SQLite preslikovalna tabela (`device_calendar_map`) posodablja dogodke na
  mestu in jih izbriše, ko vir izgine; odpovedane ure se zapišejo z ❌,
  preverjanja znanja kot `🧪 <predmet> — <tema>`, domače naloge kot
  `📝 <predmet> — domača naloga` ob uri lastne ure. Izbor skupin je upoštevan
  (neizbrane skupine nikoli ne zapustijo aplikacije). eAsistent se ob odprtju
  aplikacije samodejno sinhronizira, če je zadnja sinhronizacija starejša od
  6 h, ter dnevno v ozadju
  (@transistorsoft/capacitor-background-fetch / WorkManager, samo na mrežo,
  tihe napake). Web/PWA pokaže razlagajoče obvestilo.
- **Povezava z Google Koledarjem (v1.4):** OAuth 2.0 s PKCE brez strežnika;
  vgrajen je OAuth ID odjemalca za celotno aplikacijo, tako da se lahko
  poveže vsak uporabnik brez nastavljanja Google Cloud (nastavljivo na
  uporabnika v Nastavitvah). Sinhronizira vse Google koledarje uporabnika v
  eno "Google" skupino, prikazano ob lokalnih in eAsistent dogodkih. Samo
  Android — brskalniški PWA nima deep-link preusmeritve. Žeton za osveževanje
  je izključen iz izvoza/uvoza varnostnih kopij. Od v1.4.6 preverjeno deluje
  od začetka do konca na Androidu (v manifestu je registriran točen
  reverse-client-id scheme + obravnava izvornih JSON odgovorov).

Ocene in obvestila ob zaprti aplikaciji še niso implementirana.

Predpogoji pred razvojem in njihovo stanje so sledeni v
[`docs/pre-development.md`](docs/pre-development.md).

## Referenčni vir za implementacijo eAsistenta

Izbrani referenčni repozitorij je
[`chocoearly44/JEA`](https://github.com/chocoearly44/JEA).

Izbran je bil, ker je eAsistent API odjemalec z **licenco MIT** in poudarkom
na Java/Android, kar je najboljši priklop na primarno Android platformo
Avtoplanerja. Služi samo kot raziskovalna referenca za razumevanje prijave in
pridobivanja podatkov. Avtoplaner **ne** kopira izvorne kode JEA, je ne
pakuje in ni od nje odvisen prek Maven artefakta.

Pregledane so bile naslednje alternative:

- [`jakobkordez/easistent_client`](https://github.com/jakobkordez/easistent_client):
  licenca MIT, a specifičen za Flutter.
- [`umalavasic/eAUrnik`](https://github.com/umalavasic/eAUrnik):
  licenca MIT, a izpostavi pobiranje urnika prek ločenega Python strežnika in
  ne pokriva zahtevane Android integracije.

eAsistent integracija je implementirana neodvisno v
`src/integrations/easistent/`, z uporabo obstoječih sinhronizacijskih in
SQLite meja projekta. Ob spremembi ali nedosegljivosti neuradnega servisa
mora javiti razumljivo napako in obdržati predpomnjene podatke.

## Licenca in pripisan vir

Izvorna koda Avtoplanerja je licencirana pod licenco MIT; glej
[`LICENSE`](LICENSE).

Izbrani repozitorij JEA je ločeno licenciran pod licenco MIT. Njegovo
avtorsko pravico in dovoljenje ohranja
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Če se koda iz JEA kdaj
skopira v ta repozitorij, mora polno obvestilo ostati s kopirano kodo in
sprememba se mora zapisati tam.

"eAsistent" je blagovna znamka eŠola d.o.o. Avtoplaner je neodvisni osebni
projekt in ni povezan z eŠola d.o.o. ali od nje potrjen.
Dostop do eAsistenta mora ustrezati njegovim pogojem in veljavnim predpisom.

## Razvoj

Polne produkcijske zahteve in načrt so v
[`requirements.md`](requirements.md). Migracije podatkovne baze so v
`src/db/migrations/` in se izvajajo v številčnem vrstnem redu. Časovni žigi
so shranjeni kot UTC ISO-8601 nizi.

### Zemljevid dokumentacije

- [`requirements.md`](requirements.md) — produkcijske zahteve in načrt
  (vir resnice za obnašanje in obseg).
- [`agent.md`](agent.md) — delovni vodnik za kodirne agente.
- [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) — nastavitev
  Google Cloud / OAuth odjemalca, ki jo uporablja vgrajen ID odjemalca.
- [`docs/privacy.md`](docs/privacy.md) — pravilnik o zasebnosti (zaslon
  OAuth za privolitev).
- [`docs/pre-development.md`](docs/pre-development.md) — predpogoji pred
  razvojem in njihovo stanje.
- [`docs/spikes.md`](docs/spikes.md) — raziskovalne opombe.
- [`docs/release.md`](docs/release.md) — kako zgraditi in objaviti izdajo.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — znane težave z
  napravami in kako jih diagnosticirati.
- [`docs/PROJECT-OVERVIEW.md`](docs/PROJECT-OVERVIEW.md) — pregled projekta:
  kaj aplikacija počne, tehnološki sklad, eAsistent integracija, Google
  OAuth in cevovod za gradnjo/izdaje.

### Gradnja in testiranje

```sh
npm install
node scripts/copy-sqlite-wasm.mjs   # zahtevano pred zagonom spletne aplikacije
npm run dev                         # razvojni strežnik za splet
npm run build                       # produkcijski spletni paket v dist/
npm run lint
npx vitest run                      # enotski testi
npx cap sync android                # MORA se izvesti po vsakem npm run build
cd android && ./gradlew assembleDebug
```

Izdaje so dokumentirane v
[`docs/release.md`](docs/release.md).
