# Purdy Cards

One bundle, one HACS entry, one version number — a set of custom Lovelace cards for Home Assistant. Plain web components: no build step, no dependencies.

| Card | What it is |
|------|------------|
| `climate-panel-card` | Weather strip, temperature ring with goal + hold steppers, trend graph, zone switcher, status chips, room rows. `compact: true` for a home screen. |
| `sleep-panel-card` | Infant sleep panel: composition ring with a 7-day goal marker, vitals with baseline deltas, hypnogram, recap rows. `ribbon: true` for a home screen. |
| `purdy-header-card` | Greeting, date, time, weather, occupancy. |
| `purdy-attention-card` | Rule-driven fault list. Renders nothing when every rule is clear. |
| `purdy-people-card` | Presence with battery and step counts. |
| `purdy-rooms-card` | Scrolling strip of room temperature and humidity. |
| `purdy-quick-card` | Grid of state-coloured action tiles. |
| `purdy-notifications-card` | Notification centre backed by a todo list; dismissed items stay readable. |
| `purdy-remote-card` | Android TV remote with device selector, app grid, circular d-pad. |
| `purdy-devices-card` | Collapsible device groups; faults stay visible while collapsed. |
| `purdy-music-card` | Music Assistant now-playing with transport, room switching, playlist presets. `compact: true` hides itself when the house is quiet. |
| `purdy-shell-card` | The whole phone view as one element — gradient ground, one glass column of expanding sections, fixed dock. |
| `purdy-desk-card` | The whole desktop view as one element — one non-scrolling glass sheet: status strip, stage of panels that expand sideways, dock. |

Design rationale and the constraints behind these choices live in [docs/design-notes.md](docs/design-notes.md).

## Install

HACS → three-dots → **Custom repositories** → add this repository, category **Dashboard**. Then download it. HACS registers the resource automatically:

```
/hacsfiles/purdy-cards/purdy-cards.js
```

### Migrating from the standalone cards

Both panels keep their original type strings, so no dashboard config changes are needed. Install this pack, then remove the old `climate-panel-card` and `sleep-panel-card` HACS entries **and their dashboard resources**.

That last part matters: if a standalone resource stays registered, both bundles try to define the same custom elements. The pack warns to the console and skips rather than throwing — which means the older card wins and the `compact` / `ribbon` modes silently do nothing.

## Panels

### `climate-panel-card`

```yaml
type: custom:climate-panel-card
compact: true          # weather strip, hero ring, zone row only
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
    - { option: 1st floor, label: 1st floor, temp: sensor.first_floor_temp }
    - { option: 2nd Floor, label: 2nd floor, temp: sensor.second_floor_temp }
```

`goal` and `zones.select` point at [Goal Temp Thermostat Control](https://github.com/mbwp1234/Goal-Temp-Thermostat-Control); any climate entity and any `select` work.

### `sleep-panel-card`

```yaml
type: custom:sleep-panel-card
ribbon: true           # header, vitals, flattened deep/light bar only
navigate: "#sleep"
sleep_state: sensor.sleep_state    # unknown | awake | light_sleep | deep_sleep
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
  - { entity: sensor.sock_heart_rate, baseline: sensor.baseline_hr }
  - { entity: sensor.sock_o2_saturation, baseline: sensor.baseline_o2 }
```

### `navigate`

Both compact modes accept `navigate`. A value starting with `#` opens a Bubble Card popup; anything else is a dashboard path. Taps on steppers, zone buttons and chips are excluded, so the link never fights the controls.

## Home-screen cards

### `purdy-header-card`

```yaml
type: custom:purdy-header-card
name: Alex
weather: weather.home
occupancy: input_select.house_occupancy
```

### `purdy-attention-card`

```yaml
type: custom:purdy-attention-card
dismiss_store: input_text.attention_dismissed   # optional
dismiss_hours: 12                               # optional snooze ceiling
log_to: todo.notification_center                # optional history
rules:
  - { entity: vacuum.litter_box, state: error, severity: critical,
      title: Litter box, detail: Error — needs reset }
  - { entity: sensor.waste_drawer, above: 85, severity: warn, title: Waste drawer }
  - { match: battery_plus_low$, state: "on", severity: info,
      title: low batteries, strip: Battery low }
```

- Each rule takes one of `state`, `state_not`, `above`, `below`. `severity` is `critical` / `warn` / `info`; the card's left edge takes the worst present.
- A rule with `match` is a **group rule**: it regex-matches entity ids and collapses every hit into one row. `strip` removes boilerplate from friendly names.
- `dismiss_store` is an `input_text` holding `key:epoch|key:epoch` (capped at 255 chars — keep keys short). A dismissal is an acknowledgement, not a mute: a row returns if the entity changes state again.
- With `log_to`, each newly raised rule is written to a todo list and dismissing marks it completed. That list is what `purdy-notifications-card` reads.

### `purdy-people-card`

```yaml
type: custom:purdy-people-card
people:
  - { entity: person.alex, battery: sensor.alex_phone_battery_level, steps: sensor.alex_phone_steps }
  - { entity: person.sam, battery: sensor.sam_phone_battery_level, steps: sensor.sam_phone_steps }
```

Battery goes amber below 20%.

### `purdy-rooms-card`

```yaml
type: custom:purdy-rooms-card
rooms:
  - { name: Outside, temp: sensor.outside_temperature,
      humidity: sensor.outside_humidity, accent: true }
  - { name: Living, temp: sensor.living_room_temperature,
      humidity: sensor.living_room_humidity }
```

`accent: true` tints a room — useful for the outdoor reading everything else is judged against.

### `purdy-quick-card`

```yaml
type: custom:purdy-quick-card
columns: 3
tiles:
  - { entity: light.living_room, name: Lights, tap_action: { action: toggle } }
  - { entity: vacuum.litter_box, name: Litter, icon: mdi:cat, alert_when: [error] }
  - entity: script.nap_mode
    name: Nap mode
    tap_action: { action: perform-action, perform_action: script.nap_mode }
```

`on` / `playing` / `cleaning` read as active by default; `on_when` overrides that list, `alert_when` turns the tile red, `value_text` overrides the second line. `tap_action` supports `toggle`, `navigate`, `perform-action`, `more-info`.

### `purdy-notifications-card`

```yaml
type: custom:purdy-notifications-card
entity: todo.notification_center
title: Notifications
max: 50
unread:                                  # optional counter chips, zero counts dropped
  - { entity: sensor.unraid_notifications_unread_alert, label: Alert, severity: critical }
  - { entity: sensor.unraid_notifications_unread_warning, label: Warning, severity: warn }
```

Items split into **Active** and **Dismissed**; dismissed rows can be restored, *Clear history* removes completed items for good.

Anything that can call `todo.add_item` can appear here. Encode metadata in the description:

```
[<key>] <severity> · <detail> · raised <iso timestamp>
```

### `purdy-music-card`

A [Music Assistant](https://music-assistant.io) surface in two modes — `compact: true` is the home-screen headline, the default is the popup body.

```yaml
type: custom:purdy-music-card
title: Music
players:                                 # explicit list, deliberately
  - { entity: media_player.kitchen_speaker_2, name: Kitchen }
  - { entity: media_player.living_room_2, name: Living Room }
presets:
  - { name: Liked Songs, uri: library://playlist/7, icon: mdi:heart }
config_entry: <your MA config entry id>  # optional: enables search
search_types: [track, playlist, album, artist]   # default
recent_hours: 48                         # default
recent_max: 8                            # default
```

- `players` is explicit because Music Assistant mirrors every source player it can reach; a domain sweep pulls in AirPlay duplicates that sit `unavailable` forever.
- Compact mode renders nothing when nothing is playing, so it needs no `conditional` wrapper. A paused queue still counts as playing.
- Room selection is automatic — playing beats paused. Tapping a room pins it; tapping the selected room again stops it.
- `presets` call `music_assistant.play_media` with `enqueue: replace`. `media_type` defaults to `playlist`. Pull real URIs with `music_assistant.get_library`.
- Recently-listened comes from HA's recorder, not Music Assistant, and is bounded by recorder retention (~10 days by default).

## Shell and desk

`purdy-shell-card` (phone) and `purdy-desk-card` (desktop) render a whole view as one element. `sections:` takes the same per-type bodies in both, so a section written for the phone pastes into the desk unchanged.

Accepted section types: `climate` · `nursery` · `music` · `calendar` · `lights` · `people` · `quick` · `rooms` · `systems` · `nowplaying` · `weather` · `health`.

### `purdy-desk-card`

```yaml
type: custom:purdy-desk-card
weather: weather.home
occupancy: input_select.house_occupancy
viewport_offset: 88          # what the HA header + view padding take off 100dvh
sections:
  - { type: climate, key: clim, zone: stage, weight: 1.15, ... }
  - { type: nursery, key: nursery, zone: stage, weight: 1.25, ... }
  - { type: music, key: music, zone: stage, ... }
  - { type: rooms, key: rooms, zone: dock }        # falls back to climate's rooms
  - { type: lights, key: lights, sheet_only: true, ... }
links:
  - { icon: mdi:lightbulb, name: Lights, sheet: lights }
  - { icon: mdi:bell-outline, name: Alerts, alert_when_faults: true, sheet: notifications }
sheets:
  lights: { title: Lights, section: lights }       # a sheet can host a section
  tv:     { title: Televisions, card: { type: custom:purdy-remote-card, ... } }
```

`zone:` is `strip`, `stage` or `dock` and defaults per type; `weight:` sets balanced column widths. Panels have three faces — `full` (balanced), `xtra` (this panel expanded), `mini` (folded headline while another is expanded).

### `weather` section

```yaml
- type: weather
  key: wx
  title: Weather
  sensor: sensor.outside_thermometer      # the MEASURED reading — the hero number
  forecast: weather.kcho                  # provider for the forecast rail
  feels_from: weather.openweathermap      # optional: apparent temperature
  gttc_outdoor: sensor.gttc_outdoor_temperature   # optional: inside/outside delta
  sun: sun.sun                            # optional: sunrise / sunset row
  days: 7                                 # closed days on the history rail
  rail: history                           # which source opens collapsed
  hourly: 12                              # hours in the expanded strip; 0 drops it
  source_label: Back deck                 # optional
  tabs: false                             # optional: pin one source, hide the toggle
  forecast_type: twice_daily              # optional: overrides detection
```

One capsule per day, spanning that day's low to its high. Daily min/max comes from long-term statistics, so `days:` is not bound by recorder retention. Missing data hatches rather than drawing a capsule at zero.

### `health` section

```yaml
- type: health
  key: body
  title: Body
  sleep_total: <sleep-total-sensor>       # hours
  sleep_deep: <deep-sensor>
  sleep_rem: <rem-sensor>
  hr_series: <overnight-hr-sensor>        # raw sample series
  hrv: <hrv-sensor>
  resting_hr: <resting-hr-sensor>
  load:                                   # counters, never bands
    steps: <steps-sensor>
    stand_goal: 12
  fitness: { ftp: <sensor>, weight: <sensor>, vo2: <sensor> }   # kg in, lb out
  ride: <last-activity-sensor>            # summary lives in its ATTRIBUTES
  hearing_limit: 80                       # dB
  bands:                                  # {} until you have your own history
    asleep:     { lo: 6.8, hi: 8.2 }
    hrv:        { lo: 26,  hi: 38 }
    resting_hr: { lo: 55,  hi: 63 }
```

Each row is a label, a number, and a track carrying your own normal band with a dot on today. A missing reading draws no rail, band or dot. `dlo` / `dhi` override a band's domain.

### `weather_fx` — precipitation across the view

A **top-level** key on `purdy-shell-card`, not a section: it paints over every section.

```yaml
weather_fx:
  entity: weather.<your_provider>   # the CONDITION source, not the temperature
  strength: 1                       # 0–1.5, clamped
  # force: rainy                    # preview a condition the sky is not doing
```

`rainy` · `hail` · `snowy-rainy` draw rain, `pouring` a heavier tile, `lightning-rainy` adds a flash, `snowy` drifts, `fog` washes. Everything else — `cloudy` included — draws nothing. `prefers-reduced-motion` stops it.

### `server:` — systems mode

Also a **top-level** key on `purdy-shell-card`: the pages are alternatives to each other, and it swaps the dock as well as the column. A page whose config block is absent gets no dock slot, so a partial `server:` degrades to fewer pages rather than empty ones.

```yaml
dock:
  - { icon: mdi:home-variant, name: Home, active: true, link: /lovelace/phone2 }
  - { icon: mdi:server, name: Systems, mode: systems }
server:
  name: MyServer
  prefix: myserver                       # entity-id fragment used for discovery
  url: http://<server-host>/Dashboard
  status: sensor.myserver_system_status
  uptime: sensor.myserver_uptime_text
  version: sensor.myserver_version
  registration: sensor.myserver_registration_state
  update_available: binary_sensor.myserver_update_available
  update_url: http://<server-host>/Tools/Update
  faults:
    - { entity: sensor.myserver_disk_disk1_usage, above: 90,
        label: Disk 1, detail: low on space, severity: critical }
  meters:
    - { label: Array, entity: sensor.myserver_array_usage }
  stats:
    - { label: CPU, entity: sensor.myserver_cpu_usage, unit: "%" }
  parity:
    problem: binary_sensor.myserver_parity_valid   # device_class problem: ON is INVALID
    last_check: sensor.myserver_last_parity_check
    next_check: sensor.myserver_next_parity_check
    running: binary_sensor.myserver_parity_check_running
    progress: sensor.myserver_parity_check_progress
    start: button.myserver_start_parity_check
  power:
    - { name: Reboot, entity: button.myserver_reboot_system }
  docker:
    cpu: sensor.myserver_docker_cpu_usage
    memory: sensor.myserver_docker_memory_usage
    running: sensor.myserver_containers_running
    containers_prefix: switch.myserver_container_
    restart_prefix: button.myserver_restart_
    vms: [switch.myserver_vm_home_assistant]
    names:
      binhex_jellyfin: { name: Jellyfin, icon: mdi:movie-play }
  storage:
    array: sensor.myserver_array_usage
    text: sensor.myserver_storage_text
    disks_prefix: sensor.myserver_disk_
    shares_prefix: sensor.myserver_share_
    pools:
      - { label: cache, entity: sensor.myserver_disk_cache_usage }
  perf:
    cpu: sensor.myserver_cpu_usage
    ram: sensor.myserver_ram_usage
    gpu_util: sensor.myserver_gpu_utilization
    fans: [number.myserver_fan_fan_1_speed]
    network:
      - { name: br0, rx: sensor.myserver_network_br0_rx, tx: sensor.myserver_network_br0_tx }
    power: { watts: sensor.myserver_power, voltage: sensor.myserver_voltage }
  notifications:
    total: sensor.myserver_notifications
    alert: sensor.myserver_notifications_unread_alert
    archive: button.myserver_archive_all_notifications
```

Containers, disks and shares are **discovered** from `hass.states` by prefix, not configured; `names:` only overrides display name and icon. A device row in a `systems` section takes `mode: systems` to become the other way in.

## Shared tokens

| Token | Default |
|-------|---------|
| `--pc-panel` | `--ha-card-background` → `--card-background-color` → `#181f26` |
| `--pc-text` / `--pc-muted` | `--primary-text-color` / `--secondary-text-color` |
| `--pc-heat` / `--pc-cool` | `#ff9557` / `#4dd0e1` |
| `--pc-good` / `--pc-warn` / `--pc-bad` | `#81c995` / `#f2c14e` / `#ef6a6a` |
| `--pc-radius` | `24px` |

Sizes, radii and surface tints come from three scales. Pick a step; do not invent one.

| Scale | Steps |
|-------|-------|
| `--pc-fs-*` | `micro` 10 · `xs` 11 · `sm` 12 · `md` 13 · `lg` 15 · `xl` 18 · `2xl` 22 · `3xl` 40 |
| `--pc-r-*` | `hair` 2 · `xs` 9 · `sm` 11 · `md` 14 · `lg` 17 · `xl` 20 · `2xl` 26 · `pill` 999 |
| `--pc-fill-*` / `--pc-edge` | `1` .055 · `2` .08 · `3` .11 · edge .10 |

Form fields are the one exception at `16px` — anything smaller makes iOS Safari zoom the page on focus and never zoom back. Per-card overrides (`--cpc-heat-override`, `--spc-deep-override`) take precedence over the shared value.

## Haptics

`purdy-shell-card` fires the companion app's `haptic` event on seven gestures.

| Gesture | Type |
|---|---|
| A 380ms press-and-hold taking — light row, graph scrub, nap row | `medium` |
| Dragging a light's brightness, quantised to 5% | `selection` |
| Scrubbing a graph, one detent per gridline | `selection` |
| A climate ± step, or a plain light tap | `light` |
| Arming a destructive control, or a `protect:` guard interposing | `warning` |
| Committing an armed destructive control | `heavy` |
| Saving a nap correction | `success` |

`haptics: false` at the top level silences all of it. Outside the companion app the cards render and work normally, silently.

## Building

`purdy-cards.js` is generated. Edit `src/`, then:

```
node build.mjs
```

Numeric filename prefixes define concatenation order — `00-core.js` first (version, shared tokens, `pcDefine`, `pcNavigate`), `90-register.js` last. HACS serves a single file; that is the only reason the bundle is one.

## Tests

```
node test/smoke.mjs
```

~1100 assertions against DOM stubs: registration, token resolution, compact and ribbon paths, split-bar maths, music search and history, section reconciliation, bind-once guards, failure states, and a duplicate-load warning instead of a throw. The shell and the desk each carry a mini-DOM, because the plain stub answers `null` to everything and would pass every patching assertion vacuously.

Run it before every release.

## License

MIT — see [LICENSE](LICENSE).
