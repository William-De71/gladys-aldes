# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Aldes: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The products (ventilation units InspirAIR,
EasyHOME, Dee Fly Cube; T.One AIR / AquaAIR heat pumps and their room
thermostats) come from the cloud behind the AldesConnect app
(`https://aldesiotsuite-aldeswebapi.azurewebsites.net`, OAuth2 password grant),
with the e-mail and the password of the account. Aldes does **not document**
this API: the routes are the ones the community projects use (see NOTICE), and
it was never tried on a real account. Transport: cloud.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run coverage                          # tests with the coverage of node --test
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the clock
                        (tick), the reading, the commands, the commanded values
                        shown until confirmed, the values the triggers must not
                        report, the timed boost, the errors (refused
                        credentials, 429), the status
src/aldes-api.js        the HTTP client: password and refresh grants, tokens in
                        memory, one renewal on a 401, requests spaced, the
                        changeMode command and the thermostat PATCH, error
                        classes; never logs a secret
src/aldes.js            the Aldes data model: products -> ventilation units,
                        T.One heat pumps, room thermostats; mode letters,
                        filter, holidays, setpoint bounds
src/device.js           one Gladys device per ventilation unit, per T.One and
                        per room thermostat, their features and states
src/constants.js        Gladys core values the SDK does not export (water
                        heater mode)
src/events.js           scene trigger detection (transitions), action keys and
                        the parsing of the action fields
src/widgets.js          ventilation and T.One dashboard widgets
src/state.js            /data/state.json: trigger snapshots (never a token)
src/config.js           configuration (e-mail, password, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  external ids `ext:<selector>:ventilation:<modem>`,
  `ext:<selector>:heat_pump:<modem>` and
  `ext:<selector>:thermostat:<modem>:<ThermostatId>` (the modem is the MAC
  address Aldes gives, URI-encoded, never a name), the feature keys (`mode`,
  `co2`, `temperature_kitchen`, `humidity_kitchen`, `temperature_bathroom_N`,
  `humidity_bathroom_N`, `filter_life`, `air_mode`, `hot_water_mode`,
  `hot_water_level`, `temperature`, `target_temperature`, `humidity`), feature
  `category` / `type` / `unit` / `step` / `min` / `max`, the select values of
  the modes (`daily`, `boost`, `guests`, `holidays`, `schedule`; `off`,
  `heat_comfort`… `cool_prog_d`; `on`, `boost`, `off`), the keys of
  `config_schema`, `actions`, the widgets and their settings, the widget button
  actions (`boost`, `daily`, `refresh`), the scene triggers (fields, options,
  variables) and scene actions (fields, options, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **The API is undocumented.** Never invent a route, a field or a command: the
  ones used are listed at the top of `src/aldes-api.js` and `src/aldes.js` and
  come from the projects in NOTICE. Every answer is parsed defensively (a
  missing field is `null`, a wrong shape is skipped); a product of another
  kind (T.Flow…) is listed by "Test the connection", never offered.
- **Two shapes of a product**: the `indicators` list (`MODE`: one letter, or
  two = the selected mode then the one running) and the `indicator` object
  (`ConVe`, `CO2`, `TmpCu` / `TmpBa1…5` in tenths of °C, `HrCu` / `HrBa1…5`;
  for a T.One `current_air_mode` A…I, `current_water_mode` L / M / N,
  `qte_eau_chaude`, `tmp_principal`, `cmist`… bounds, `thermostats`). A
  measure of 0 means "no sensor". Mode letters: ventilation V daily, Y boost,
  X guests, W holidays, Z schedule; T.One A off, B / C / D / E heating
  comfort / eco / program A / B, F / G / H / I cooling comfort / boost /
  program C / D; hot water L off, M on, N boost.
- **Holidays** are the `changeMode` command `W<start>Z<end>Z` (UTC
  `YYYYMMDDHHmmss`); `W00010101000000Z00010101000000Z` cancels them. "Holidays"
  from the mode list is a one-year holiday.
- **Category / type pairs** come from the SDK constants and the core 5.3.0:
  the modes are `text` / `select` (string options, the state goes in `text`,
  never in `state`); `water-heater` / `mode` (MANUAL = on, BOOST, OFF) and
  `remaining-hot-water` (%); `co2-sensor`, `temperature-sensor`,
  `humidity-sensor` / `decimal`; `maintenance` / `life-remaining` (100 − the
  wear Aldes gives); `thermostat` / `target-temperature` (16-31 in Discovery,
  checked against the bounds of the current heating or cooling mode, whole
  degrees).
- **`should_poll` stays false**: one `GET /users/me/products` reads every
  product on the integration's own clock (1, 2, 5 or 10 minutes). Never add a
  request per product at each reading.
- **A command never waits in `onSetValue`** (5 s ack): it is checked, shown at
  once and sent without awaiting; one reading follows 15 s later. The
  commanded values win over the cloud for 3 minutes at most. A product Aldes
  reports offline refuses commands. A 429 slows the readings down (the
  interval doubles, up to 30 minutes); refused credentials are tried again
  every 30 minutes or as soon as they change.
- **The timed boost** is a timer of the container (not persisted): it goes back
  to the mode before the boost, and is forgotten when another mode is chosen
  or seen. Never fire it after a restart.
- **The password and the tokens** live in memory only: never logged, never in
  /data, never in a scene variable nor an error message; neither is the
  e-mail. After a restart the integration logs in again.
- **Scene events**: one per transition between two readings of a product the
  user added (baseline at the first reading, kept in /data across restarts);
  "mode changed" and "holiday changed" never fire for a value the integration
  commanded within the last 10 minutes.
- **Gladys does not pass DEBUG / LOG_LEVEL to the container**: never tell a
  store user to set them; "Test the connection" is the diagnostic button.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **No copied code.** The protocol facts come from the community projects
  credited in NOTICE; no code is copied from them.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `>=5.3.0` for `keywords` and `countries` (FR, BE, LU, CH: the
  AldesConnect market); no permission. Transport: `["cloud"]`.
- **CI smoke test.** `ci.yml` counts the features of a ventilation unit (7), of
  a T.One AquaAIR (4) and of a room thermostat (2) in the Docker image: update
  it with the features.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
