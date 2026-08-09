# dev/shoot — visual render harness

Serves the built `purdy-cards.js` to a real browser at a real viewport, against
**live Home Assistant state**, and screenshots it. Two commands, no HACS
release, no dashboard edit, no phone in your hand.

```bash
node dev/shoot/server.mjs          # terminal 1
node dev/shoot/shoot.mjs           # terminal 2 — every preset -> ~/purdy-shots
```

## Why it exists

The text harness (render each page to stripped text) catches data bugs, and has
caught plenty — six in one pass on the systems pages. It cannot catch the other
half of them. These all shipped past ~950 assertions **and** past the text
render:

- `LIVIN…` / `KITC…` — six cells sharing a flex row, every label clipped
- a 24h temperature graph stretching to a third of the screen
- `--ps-dim` at 3.6:1 on the gradient, under the contrast floor
- `.ps-rv.sm` used and never defined, so a nap number spilled its ring
- a chip and the status line beside it saying the same thing twice

A truncated label is a *missing* label. None of those are visible in text, and
none are visible in a mockup either — a mockup is a drawing of what you assume
the data says. This is the step between them.

## Read-only by construction

It points at the **live house**, so it is built so a screenshot cannot change
anything:

| | |
|---|---|
| `callService` | refused in the page; never reaches the network |
| response-only services | forwarded (`music_assistant.search` / `get_queue`, `weather.get_forecasts`, …), enforced again server-side |
| REST | `GET` only, on an allowlist (`history/period/`, `calendars`, `states`) |
| `/api/…` images | `GET` only, image paths only — so avatars and album art are real |
| websocket | allowlist of read commands, so a stray `_syncLog()` cannot append to `todo.notification_center` |

Everything refused is printed. A screenshot is never quietly missing data.

Credentials come from a `.env` found by walking up from the working directory
(`HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN`) and are **never served to the page**.

## Fidelity notes

- **`<ha-icon>` is HA's.** Outside HA it is an unknown element of *zero size*, so
  without a shim every icon collapses and every row measures too narrow — worse
  than useless for judging layout. The page shims it with real MDI paths from
  `@mdi/js` (`npm i --no-save @mdi/js`), and falls back to a dotted box **at the
  correct size** so the layout stays honest when a glyph is missing.
  A dotted box means that icon name does not exist in MDI — it is blank on the
  real dashboard too.
- **The card config is pulled from Lovelace over websocket**, not from a copy in
  the repo, so the harness renders what is actually deployed.
- `connection.subscribeMessage` is stubbed, so the standalone climate card shows
  no weather forecast.
- Shots wait for the page's own `READY` title, set once its fetches settle — not
  a guessed delay, which photographs a half-loaded view.

## Presets

Phone shots are 390×844, desk is 1440×900. `--dpr 2` for retina (four times the
pixels, and four times the tokens if an agent is reading them).

```
phone  phone-joel  phone-climate  phone-crew   lights  music  alerts
sys-overview  sys-docker  sys-storage  sys-perf  sys-alerts
desk
```

Sections are opened by writing the card's own state fields rather than faking
taps, so any of them can be photographed directly:

```bash
node dev/shoot/shoot.mjs --shot x:390x844:'tag=custom:purdy-shell-card&view=phone2&open=clim'
node dev/shoot/shoot.mjs --dpr 2 desk
```

`?debug=1` on the URL overlays the notes (pinned to a corner, out of the flow,
so it cannot change the layout it is describing).

## Options

| flag | default |
|---|---|
| `--port` | `8099` |
| `--bundle` | `purdy-cards.js` beside the repo root |
| `--env` | first `.env` above cwd with `HOMEASSISTANT_URL` |
| `--out` | `~/purdy-shots` |
| `--dpr` | `1` |
| `--base` | `http://127.0.0.1:8099` |
| `CHROME_BIN` | `/Applications/Google Chrome.app/…/Google Chrome` |
