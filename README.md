# Familiekalender

Felles kalender for Kristoffer, Hilde, Ane og Vegard. Kjører som app på telefonen (PWA), ligger på GitHub Pages og lagrer avtalene i Supabase.

- Måned-, uke- og dagsvisning, med ukenummer
- Egen farge per person, egen farge for avtaler som gjelder hele familien
- Trykk på navnene øverst for å skjule/vise en persons avtaler
- Gjentakende avtaler (daglig, ukentlig, annenhver uke, månedlig, årlig), og sletting av én enkelt dag i en serie
- Endringer dukker opp hos de andre med en gang
- Virker uten nett (viser sist lagrede avtaler)
- Sveip til siden for å bla

Kristoffer, Hilde og Ane logger inn og kan legge inn og endre. Vegard finnes i kalenderen, men har ikke innlogging.

---

## Oppsett (ca. 20 minutter)

Rekkefølgen under gjør at du ser appen på telefonen før du kobler til databasen.

### 1. Legg appen på GitHub

1. Lag et nytt repository på github.com, f.eks. `familiekalender`. Det må være **Public** for at GitHub Pages skal være gratis. Det er bare koden som blir offentlig; avtalene ligger i Supabase bak innlogging, og ingen e-postadresser ligger i koden.
2. **Add file → Upload files**, og dra inn alt innholdet i denne mappen (`index.html`, `app.js`, `styles.css`, `config.js`, `manifest.json`, `sw.js`, mappene `icons` og `supabase`). Trykk **Commit changes**.
3. **Settings → Pages**: under *Build and deployment* velg *Deploy from a branch*, branch `main` og mappe `/ (root)`. Lagre.
4. Etter et minutt vises adressen, typisk `https://<brukernavn>.github.io/familiekalender/`.

Åpne adressen på telefonen. Uten Supabase-nøkler kjører appen i **demomodus** med eksempelavtaler, så du kan teste alt.

### 2. Opprett Supabase-prosjektet

1. Lag gratis konto på supabase.com og opprett et nytt prosjekt. Velg en region i Europa (f.eks. Stockholm eller Frankfurt). Databasepassordet trenger du ikke senere.
2. Åpne **SQL Editor → New query**. Lim inn innholdet i `supabase/oppsett.sql`.
3. **Bytt ut de tre e-postadressene nederst i filen** med de riktige, og trykk **Run**. Du skal få «Success».

### 3. Lag brukerne og steng for nye registreringer

1. **Authentication → Users → Add user → Create new user**. Fyll inn e-post og et passord, og huk av **Auto Confirm User**. Gjør dette for Kristoffer, Hilde og Ane, med samme e-postadresser som i SQL-en.
2. **Authentication → Sign In / Providers** (heter i noen versjoner *Providers* eller *Settings*): slå **av** «Allow new users to sign up». Da kan ingen andre lage seg bruker, selv om de finner nettsiden.

Appen sender aldri e-post. Innlogging skjer med e-post og passord, og man forblir innlogget på telefonen.

### 4. Koble appen til databasen

1. I Supabase: trykk **Connect** øverst (eller **Project Settings → API Keys**). Kopier **Project URL** og den offentlige nøkkelen (*anon* eller *publishable*, starter ofte med `eyJ…` eller `sb_publishable_…`).
2. I GitHub: åpne `config.js`, trykk blyanten og lim inn:
   ```js
   SUPABASE_URL: "https://xxxxxxxx.supabase.co",
   SUPABASE_KEY: "eyJ...",
   ```
3. Commit. Etter et minutt viser appen innloggingssiden i stedet for demomodus.

> Den offentlige nøkkelen er laget for å ligge i nettleseren. Det er tilgangsreglene i databasen som bestemmer hvem som får lese og skrive. Bruk **aldri** nøkkelen som heter *service_role* eller *secret* i `config.js`.

### 5. Installer på telefonene

- **iPhone:** åpne adressen i **Safari** → Del-knappen (firkant med pil) → **Legg til på Hjem-skjerm**.
- **Android:** åpne i **Chrome** → menyen (⋮) → **Installer app** / **Legg til på startskjermen**.

Logg inn én gang inne i appen fra hjemskjermen. På iPhone har hjemskjerm-appen egen innlogging, adskilt fra Safari.

---

## Daglig bruk

| Gjøre | Slik |
|---|---|
| Ny avtale | Trykk **+**, eller trykk på et tidspunkt i uke-/dagsvisning |
| Endre / slette | Trykk på avtalen |
| Hele familien | Velg alle fire, eller ingen (da blir den automatisk «hele familien») |
| Endre en serie | Endringer i en gjentakende avtale gjelder hele serien. Flytter du én dag med en time, flyttes alle |
| Slette én dag i en serie | Åpne avtalen den dagen → **Slett bare denne dagen** |
| Gå til i dag | Trykk **I dag** eller på overskriften |
| På PC | Piltaster blar, `m`/`u`/`d` bytter visning, `t` går til i dag |

---

## Vedlikehold

**Glemt passord:** Supabase → Authentication → Users → slett brukeren og lag den på nytt med nytt passord. Avtalene påvirkes ikke.

**Gi noen kun lesetilgang:** Supabase → Table Editor → `allowed_users` → sett `can_edit` til `false`.

**Gi Vegard innlogging senere:** legg til en rad i `allowed_users` (`member_id` = `vegard`) og opprett brukeren under Authentication → Users.

**Endre navn, farger eller rekkefølge:** rediger `MEMBERS` i `config.js`. `id` må ikke endres når det først finnes avtaler.

**Pause i Supabase:** gratisprosjekter settes på pause etter en tids inaktivitet. Ved daglig bruk skjer det normalt ikke. Skulle det skje: logg inn på supabase.com og trykk **Restore project**. Ingen data går tapt.

**Oppdatere appen:** endre filene i GitHub. Appen henter nye filer neste gang den åpnes med nett. Endrer du mye, øk `VERSION` i `sw.js` (f.eks. `fk-v2`) så gammel cache ryddes.

---

## Filer

| Fil | Innhold |
|---|---|
| `index.html` | Sidens oppbygning |
| `styles.css` | Utseende (lyst og mørkt tema følger telefonen) |
| `app.js` | All logikk: visninger, redigering, innlogging, synk |
| `config.js` | Supabase-nøkler, personer og farger |
| `manifest.json`, `sw.js`, `icons/` | Det som gjør nettsiden til en installerbar app |
| `supabase/oppsett.sql` | Tabeller og tilgangsregler i databasen |

Ingen byggesteg eller npm: alt er vanlige filer som GitHub Pages serverer direkte.
