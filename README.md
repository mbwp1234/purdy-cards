# Purdy Cards

One bundle, one HACS entry, one version number — a pair of custom Lovelace cards for Home Assistant.

| Card | What it is |
|------|------------|
| `climate-panel-card` | Full climate panel: weather strip, temperature ring with goal + hold steppers, trend graph, zone switcher, status chips, room rows. Plus a **`compact`** mode for a home screen. |
| `sleep-panel-card` | Full infant sleep panel: composition ring with a 7-day goal marker, vitals with baseline deltas, hypnogram, recap rows. Plus a **`ribbon`** mode for a home screen. |
| `purdy-header-card` | Greeting, date, time, weather and occupancy. |
| `purdy-attention-card` | Rule-driven fault list. Renders nothing at all when every rule is clear. |
| `purdy-people-card` | Presence with battery and step counts, side by side. |
| `purdy-rooms-card` | Scrolling strip of room temperatures and humidity. |
| `purdy-quick-card` | Grid of state-coloured action tiles. |

No build step, no dependencies — plain web components.

## Why one repo

Both cards already shared a design language: the same tokens, the same 24px radius, the same `callApi` history fetch, the same rAF-batched renders. Kept in separate repos that was copy-pasted code that drifted every time either card was touched.

Here the tokens live in one `PC_TOKENS` block that both cards derive from, so a colour changes in exactly one place. One `gh release create`, one HACS download, one resource URL on the dashboard.

## Install

HACS → three-dots → **Custom repositories** → add this repository, category **Dashboard**. Then download it. HACS registers the resource automatically:

```
/hacsfiles/purdy-cards/purdy-cards.js
```

### Migrating from the standalone cards

Both cards keep their original type strings, so **no dashboard config changes are needed**. Install this pack, then remove the old `climate-panel-card` and `sleep-panel-card` HACS entries **and their dashboard resources**.

That last part matters: if a standalone resource stays registered, both bundles try to define the same custom elements. The pack warns to the console and skips rather than throwing, which means the *older* card wins and the `compact` / `ribbon` modes silently do nothing.

## Compact and ribbon modes

The full panels are designed for a popup. Their compact variants are designed to sit on a home screen and act as a doorway into that popup — a reading and a link at once.

### `climate-panel-card` with `compact: true`

Renders the weather strip, hero ring and zone row. Skips the graph, chips and room rows.

```yaml
type: custom:climate-panel-card
compact: true
navigate: "#climate"
thermostat: climate.thermostat
goal: climate.gttc
weather: weather.home
outside:
  temp: sensor.outside_temperature
  humidity: sensor.outside_humidity
zones:
  select: select.gttc_active_zone
  options:
    - option: 1st floor
      label: 1st floor
      temp: sensor.first_floor_temp
    - option: 2nd Floor
      label: 2nd floor
      temp: sensor.second_floor_temp
```

`goal` and `zones.select` above point at [Goal Temp Thermostat Control](https://github.com/mbwp1234/Goal-Temp-Thermostat-Control); any climate entity and any `select` work equally well.

### `sleep-panel-card` with `ribbon: true`

Renders the header, vitals and a flattened deep/light bar. Skips the ring, hypnogram and recap rows.

```yaml
type: custom:sleep-panel-card
ribbon: true
navigate: "#sleep"
sleep_state: sensor.sleep_state
name: Baby
age: sensor.baby_age
active_when:
  entity: input_boolean.sleep_started
  state: "on"
ring:
  deep: sensor.deep_sleep_today
  light: sensor.light_sleep_today
  deep_last_night: input_number.deep_sleep_last_night
  light_last_night: input_number.light_sleep_last_night
vitals:
  - entity: sensor.sock_heart_rate
    baseline: sensor.baseline_hr
  - entity: sensor.sock_o2_saturation
    baseline: sensor.baseline_o2
```

`sleep_state` expects one of `unknown` / `awake` / `light_sleep` / `deep_sleep`.

### `navigate`

Both modes accept `navigate`. A value starting with `#` opens a Bubble Card popup; anything else is treated as a dashboard path. Taps on interactive children — steppers, zone buttons, chips — are excluded, so the link never fights the controls.

## Tests

```
node test/smoke.mjs
```

Runs the bundle against DOM stubs and asserts both elements register, the shared tokens resolve into each card's stylesheet, the compact and ribbon paths exist, the split-bar maths is right, and a duplicate load warns instead of throwing.

## Shared tokens

| Token | Default |
|-------|---------|
| `--pc-panel` | `--ha-card-background` → `--card-background-color` → `#181f26` |
| `--pc-text` / `--pc-muted` | `--primary-text-color` / `--secondary-text-color` |
| `--pc-heat` / `--pc-cool` | `#ff9557` / `#4dd0e1` |
| `--pc-good` / `--pc-warn` / `--pc-bad` | `#81c995` / `#f2c14e` / `#ef6a6a` |
| `--pc-radius` | `24px` |

Per-card overrides still work (`--cpc-heat-override`, `--spc-deep-override`, and so on) and take precedence over the shared value.

## Home-screen cards

Five small cards that make a phone dashboard readable at a glance. They share `PC_TOKENS` with the two panels, so the whole screen reads as one surface rather than a stack of unrelated widgets.

### `purdy-header-card`

```yaml
type: custom:purdy-header-card
name: Alex
weather: weather.home
occupancy: input_select.house_occupancy
```

Picks the greeting from the hour and re-renders every 30s so the clock stays honest.

### `purdy-attention-card`

The card is a rule list. It renders **nothing** when no rule matches — no empty card, no header — so it costs zero height on a healthy day.

```yaml
type: custom:purdy-attention-card
rules:
  - entity: vacuum.litter_box
    state: error
    severity: critical
    title: Litter box
    detail: Error — needs reset
  - entity: sensor.waste_drawer
    above: 85
    severity: warn
    title: Waste drawer
  - match: battery_plus_low$
    state: "on"
    severity: info
    title: low batteries
    strip: Battery low
```

Each rule takes one of `state`, `state_not`, `above` or `below`. `severity` is `critical` / `warn` / `info` and drives the dot colour; the card's left edge takes the worst severity present.

A rule with `match` instead of `entity` is a **group rule**: it regex-matches entity IDs and collapses every hit into one row ("3 low batteries — …"). `strip` removes boilerplate from each friendly name. This is how battery warnings stay one line instead of eleven.

Rows with an `entity` open more-info on tap.

### `purdy-people-card`

```yaml
type: custom:purdy-people-card
people:
  - entity: person.alex
    battery: sensor.alex_phone_battery_level
    steps: sensor.alex_phone_steps
  - entity: person.sam
    battery: sensor.sam_phone_battery_level
    steps: sensor.sam_phone_steps
```

Battery goes amber below 20%.

### `purdy-rooms-card`

```yaml
type: custom:purdy-rooms-card
rooms:
  - name: Outside
    temp: sensor.outside_temperature
    humidity: sensor.outside_humidity
    accent: true
  - name: Living
    temp: sensor.living_room_temperature
    humidity: sensor.living_room_humidity
```

`accent: true` tints a room — useful for marking the outdoor reading everything else is judged against.

### `purdy-quick-card`

```yaml
type: custom:purdy-quick-card
columns: 3
tiles:
  - entity: light.living_room
    name: Lights
    tap_action: { action: toggle }
  - entity: vacuum.litter_box
    name: Litter
    icon: mdi:cat
    alert_when: [error]
  - entity: script.nap_mode
    name: Nap mode
    icon: mdi:weather-night
    tap_action:
      action: perform-action
      perform_action: script.nap_mode
```

Tiles colour themselves from state: `on` / `playing` / `cleaning` read as active by default, `on_when` overrides that list, and `alert_when` turns the tile red. `value_text` overrides the second line. `tap_action` supports `toggle`, `navigate`, `perform-action` and `more-info`.
