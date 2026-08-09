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

## Token economics — why this is the cheap loop

Measured on this install, not estimated from memory:

| | size | in an agent's context |
|---|---|---|
| live states the harness reads **per shot** | 670 KB | **0** — it never passes through the agent |
| the same dump pulled via `ha_eval_template` | 670 KB | **~168k tokens** |
| `ha_config_get_dashboard`, one view (`view_path=`) | 20 KB | ~5k tokens |
| the same call without `view_path` (whole dashboard) | 122 KB | ~30k tokens |
| `shoot.mjs` pass/fail output, 2 shots | 298 B | **~75 tokens** |
| one phone screenshot (390×844) | — | ~440 tokens |
| one desk screenshot (1440×900) | — | ~1.7k tokens |

Three consequences worth internalising:

1. **The verification signal is text, and it is nearly free.** `ok / BAD`, the
   viewport, the content height and the notes cost ~40 tokens a shot. A render
   that threw, a fetch that failed, a refused service, a missing icon, a view
   that grew 400px — all of that arrives in text. **Look at the image only when
   the question is genuinely visual.** Most iterations don't need to.
2. **Never route state through the agent.** The harness fetches 670 KB straight
   from HA into the browser. Dumping the same thing through MCP to build a
   fixture costs ~168k tokens *and* produces a worse artefact, because a fixture
   is a guess that goes stale silently.
3. **Image cost is dimensions, not file size.** The desk PNG is 262 KB on disk
   and ~1.7k tokens; the phone PNG is 76 KB and ~440. Shoot at `--dpr 1` while
   iterating — `--dpr 2` is four times the pixels for no extra information about
   layout. Save retina for something a human will look at closely.

### The cheap loop

```
1. mockup            settle layout arguments as an artifact — human review is free
2. build + smoke     local, no HA, no network
3. shoot             read the TEXT; open an image only for a visual question
4. deploy ONCE       release → HACS → apply config, at the end, with the nits batched
```

Rules that keep it cheap:

- **Shoot only what changed** (`shoot.mjs phone-joel`), not all 13.
- **Always pass `view_path=`** to `ha_config_get_dashboard` — 6× cheaper than the
  whole dashboard, and the `config_hash` still covers the full config so a
  `python_transform` still validates.
- **`ha_eval_template` for a derived answer** ("average of these six sensors")
  instead of fetching six states and doing the arithmetic in context.
- **Don't re-read a screenshot to confirm a fix you can reason about.** Re-shoot
  and read the one-line result.
- **Don't use HA as the design surface.** Tweaking a padding, releasing,
  downloading and asking someone to look is the most expensive possible way to
  answer a question a mockup answers for free.

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
