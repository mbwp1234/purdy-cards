# Purdy Cards

One bundle, one HACS entry, one version number — the custom Lovelace cards for this house.

| Card | What it is |
|------|------------|
| `climate-panel-card` | Full climate panel: weather strip, temperature ring with goal + hold steppers, trend graph, zone switcher, status chips, room rows. Plus a **`compact`** mode for the home screen. |
| `sleep-panel-card` | Full infant sleep panel: composition ring with a 7-day goal marker, vitals with baseline deltas, hypnogram, recap rows. Plus a **`ribbon`** mode for the home screen. |

No build step, no dependencies — plain web components.

## Why one repo

Both cards already shared a design language: the same tokens, the same 24px radius, the same `callApi` history fetch, the same rAF-batched renders. Kept in separate repos that was copy-pasted code that drifted every time either card was touched.

Here the tokens live in one `PC_TOKENS` block that both cards derive from, so a colour changes in exactly one place. One `gh release create`, one HACS download, one resource URL on the dashboard.

## Install

HACS → three-dots → **Custom repositories** → add `mbwp1234/purdy-cards`, category **Dashboard**. Then download it. HACS registers the resource automatically:

```
/hacsfiles/purdy-cards/purdy-cards.js
```

### Migrating from the standalone cards

Both cards keep their original type strings, so **no dashboard config changes are needed**. Install this pack, then remove the old `climate-panel-card` and `sleep-panel-card` HACS entries. The old repos stay published so existing installs keep working.

## Compact and ribbon modes

The full panels are designed for a popup. Their compact variants are designed to sit on a home screen and act as a doorway into that popup — a reading and a link at once.

### `climate-panel-card` with `compact: true`

Renders the weather strip, hero ring and zone row. Skips the graph, chips and room rows.

```yaml
type: custom:climate-panel-card
compact: true
navigate: "#Climate"
thermostat: climate.t6_pro_z_wave_programmable_thermostat_with_smartstart
goal: climate.gttc
weather: weather.kcho
outside:
  temp: sensor.outside_thermometer_humidity_temperature
  humidity: sensor.outside_thermometer_humidity_humidity
zones:
  select: select.gttc_active_zone
  options:
    - option: 1st Floor
      label: 1st floor
      temp: sensor.gttc_1st_floor_temp
    - option: 2nd Floor
      label: 2nd floor
      temp: sensor.gttc_2nd_floor_temp
```

### `sleep-panel-card` with `ribbon: true`

Renders the header, vitals and a flattened deep/light bar. Skips the ring, hypnogram and recap rows.

```yaml
type: custom:sleep-panel-card
ribbon: true
navigate: "#joel"
sleep_state: sensor.owlet_sock_sleep_state
name: Joel
age: sensor.joel_s_age
active_when:
  entity: input_boolean.joel_sleep_started
  state: "on"
ring:
  deep: sensor.joel_deep_sleep_today
  light: sensor.joel_light_sleep_today
  deep_last_night: input_number.joel_deep_sleep_last_night
  light_last_night: input_number.joel_light_sleep_last_night
vitals:
  - entity: sensor.owlet_sock_heart_rate
    baseline: sensor.joel_7d_baseline_hr
  - entity: sensor.owlet_sock_o2_saturation
    baseline: sensor.joel_7d_baseline_o2
```

### `navigate`

Both modes accept `navigate`. A value starting with `#` opens a Bubble Card popup; anything else is treated as a dashboard path. Taps on interactive children — steppers, zone buttons, chips — are excluded, so the link never fights the controls.

## Tests

```
node test/smoke.mjs
```

Runs the bundle against DOM stubs and asserts both elements register, the shared tokens resolve into each card's stylesheet, the compact and ribbon paths exist, and the split-bar maths is right.

## Shared tokens

| Token | Default |
|-------|---------|
| `--pc-panel` | `--ha-card-background` → `--card-background-color` → `#181f26` |
| `--pc-text` / `--pc-muted` | `--primary-text-color` / `--secondary-text-color` |
| `--pc-heat` / `--pc-cool` | `#ff9557` / `#4dd0e1` |
| `--pc-good` / `--pc-warn` / `--pc-bad` | `#81c995` / `#f2c14e` / `#ef6a6a` |
| `--pc-radius` | `24px` |

Per-card overrides still work (`--cpc-heat-override`, `--spc-deep-override`, and so on) and take precedence over the shared value.
