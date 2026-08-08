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
| `purdy-notifications-card` | Notification centre backed by a todo list — keeps dismissed items readable. |
| `purdy-remote-card` | Android TV remote with a device selector, brand app grid and circular d-pad. |
| `purdy-devices-card` | Collapsible device groups with summary lines; faults stay visible while collapsed. |
| `purdy-music-card` | Music Assistant now-playing with transport, room switching and playlist presets. Plus a **`compact`** mode that hides itself when the house is quiet. |

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

## Building

`purdy-cards.js` is generated. Edit `src/` and rebuild:

```
node build.mjs
```

Numeric filename prefixes define concatenation order — `00-core.js` first (version, shared tokens, `pcDefine`, `pcNavigate`), `90-register.js` last. HACS serves a single file; that is the only reason the bundle is one.

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

### Scales

Sizes, radii and surface tints come from three scales rather than being written inline. Pick a step; do not invent one.

| Scale | Steps |
|-------|-------|
| `--pc-fs-*` | `micro` 10 · `xs` 11 · `sm` 12 · `md` 13 · `lg` 15 · `xl` 18 · `2xl` 22 |
| `--pc-r-*` | `hair` 2 · `xs` 9 · `sm` 11 · `md` 14 · `lg` 17 · `xl` 20 · `2xl` 26 · `pill` 999 |
| `--pc-fill-*` / `--pc-edge` | `1` .055 · `2` .08 · `3` .11 · edge .10 |

Form fields are the one deliberate exception at `16px` — anything smaller makes iOS Safari zoom the page on focus and never zoom back.

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

#### Dismissing

Add a `dismiss_store` and every row gets an × (plus a *Dismiss all* when more than one is showing).

```yaml
type: custom:purdy-attention-card
dismiss_store: input_text.attention_dismissed
dismiss_hours: 12                   # optional snooze ceiling
log_to: todo.notification_center    # optional history
rules: [...]
```

`dismiss_store` is an `input_text` holding `key:epoch|key:epoch`. Each rule gets a stable `key` (set one explicitly, or it is slugged from the title), which is what a dismissal is recorded against.

**A dismissal is an acknowledgement, not a mute.** A row stays hidden only while the underlying condition is unchanged — if the entity changes state again, the fault has re-fired and the row comes back. `dismiss_hours` adds a ceiling so a long-running fault resurfaces on its own.

The compact `key:epoch` encoding matters: `input_text` caps at 255 characters, which fits roughly a dozen dismissals. Keep keys short.

With `log_to` set, each newly raised rule is written to a todo list and dismissing marks it completed — that list is what `purdy-notifications-card` reads.

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

### `purdy-notifications-card`

A notification centre. It reads a todo list, so dismissed items stay readable instead of vanishing — which is the whole point.

```yaml
type: custom:purdy-notifications-card
entity: todo.notification_center
title: Notifications
max: 50
unread:
  - entity: sensor.unraid_notifications_unread_alert
    label: Alert
    severity: critical
  - entity: sensor.unraid_notifications_unread_warning
    label: Warning
    severity: warn
  - entity: sensor.unraid_notifications_unread_info
    label: Info
```

Items are split into **Active** and **Dismissed**. Active rows can be dismissed; dismissed rows can be restored. *Clear history* removes completed items for good.

`unread` is an optional row of counter chips for an upstream system that tracks its own unread state — Unraid, for instance. Zero counts are dropped, so a quiet source shows nothing.

#### Feeding it from elsewhere

Anything that can call `todo.add_item` can appear here. Encode the metadata in the description:

```
[<key>] <severity> · <detail> · raised <iso timestamp>
```

`severity` is `critical` / `warn` / `info`; `<key>` is used to find the entry again when it is dismissed. An automation mirroring an upstream notification entity looks like:

```yaml
triggers:
  - trigger: state
    entity_id: event.unraid_notification
    not_to: [unknown, unavailable]
    not_from: [unknown, unavailable]
actions:
  - variables:
      sev: >-
        {% set t = trigger.to_state.attributes.event_type | default('info') %}
        {{ 'critical' if t == 'alert' else ('warn' if t == 'warning' else 'info') }}
  - action: todo.add_item
    target: { entity_id: todo.notification_center }
    data:
      item: "{{ trigger.to_state.attributes.subject }}"
      description: >-
        [unraid] {{ sev }} · {{ trigger.to_state.attributes.description }}
        · raised {{ trigger.to_state.attributes.timestamp }}
```

### `purdy-music-card`

A [Music Assistant](https://music-assistant.io) surface, in two modes. `compact: true` is the home-screen headline; the default is the popup body.

```yaml
type: custom:purdy-music-card
compact: true
navigate: "#music"
players:
  - entity: media_player.kitchen_speaker_2
    name: Kitchen
  - entity: media_player.living_room_2
    name: Living Room
  - entity: media_player.bedroom_speaker
    name: Bedroom
```

```yaml
type: custom:purdy-music-card
title: Music
players: *the-same-list
presets:
  - name: Liked Songs
    uri: library://playlist/7
    icon: mdi:heart
  - name: Sleep lofi
    uri: library://playlist/17
    icon: mdi:weather-night
```

**`players` is an explicit list, deliberately.** Music Assistant mirrors every source player it can reach, so a sweep of the `media_player` domain pulls in AirPlay duplicates that sit `unavailable` forever. Name the rooms you actually use.

**Compact mode renders nothing when nothing is playing** — same self-hiding contract as `purdy-attention-card`, so it needs no `conditional` wrapper. A paused queue still counts as playing, so the card does not vanish between tracks.

**A Music Assistant player also proxies whatever else its source device is doing.** A Chromecast running Peacock reports `playing` for the whole episode. The card only treats a player as music when `app_id` is `music_assistant` or `media_content_type` is one of `music` / `playlist` / `track` / `album` / `radio` — otherwise a TV show would put a phantom row on the home screen.

Room selection is automatic: whatever is playing wins over whatever is paused. Tapping a room in the picker pins it until the card is rebuilt, which is also how you choose where a preset lands.

**Tapping the selected room again stops it.** Worth knowing why it is not always `turn_off`: the Cast speakers report `supported_features: 8320575`, whose low bits are `63` — pause, seek, volume, prev, next and nothing else. **They do not advertise `TURN_OFF` at all**, so a blind `turn_off` is a silent no-op. Only a group player (`7796671`) carries the bit. The card walks `turn_off` → `media_stop` → `media_pause` and uses the first one the player actually supports.

### Artwork

The card reads **`entity_picture_local`** before `entity_picture`, deliberately. Music Assistant publishes `entity_picture` as an absolute plain-HTTP URL to its own add-on port:

```
http://<music-assistant-host>:8095/imageproxy/64d02e...?size=512
```

That fails twice on a phone — an HTTPS dashboard blocks it as mixed content, and off the LAN the host is unreachable. `entity_picture_local` is HA's same-origin authenticated proxy and works in both places.

### Search

Set `config_entry` to your Music Assistant config entry id to get a search box. It calls `music_assistant.search` and renders tracks, playlists, albums and artists as tappable rows; a tap plays the result on the currently selected room.

```yaml
config_entry: 01ABCDEF0123456789ABCDEFGH   # yours, from the MA config entry
search_types: [track, playlist, album, artist]   # optional, this is the default
```

Typing is debounced 450ms, and Enter searches immediately. The card keeps the caret and the half-typed query across re-renders — without that, a queue advancing to the next track would wipe the search box mid-word.

### Recently listened

```yaml
recent_hours: 48   # default
recent_max: 8      # default
```

**This does not come from Music Assistant, because Music Assistant does not have it.** Its `last_played` and `play_count` columns are empty, so `order_by: last_played_desc` silently returns the library in id order — it looks like it worked and means nothing. Its built-in *Recently played tracks* smart playlist browses to zero children.

HA's own recorder does have the history: every MA player logs `media_title`, `media_artist` and a playable `media_content_id` on each state change. The card reads `history/period`, filters to music (same `app_id` / `media_content_type` test as the live card, so a TV show never files itself as a track), dedupes by URI and shows the newest first. Rows are playable.

The window is bounded by recorder retention — roughly 10 days by default, and `recent_hours` should stay well inside it.

`presets` call `music_assistant.play_media` with `enqueue: replace` against the selected room. `uri` takes anything that service accepts — `library://playlist/7`, `spotify://playlist/…`, a radio stream. `media_type` defaults to `playlist`; set it for tracks, albums or radio. Pull real URIs with:

```yaml
action: music_assistant.get_library
data:
  config_entry_id: <your entry>
  media_type: playlist
response_variable: lib
```

## `purdy-shell-card` — systems mode

A whole server behind its own bottom bar. `server:` is a **top-level** key, not a section, because the pages are alternatives to each other rather than neighbours in a scrolling column — and because it swaps the dock as well as the column.

```yaml
type: custom:purdy-shell-card
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
  faults:
    - { entity: sensor.myserver_disk_disk1_usage, above: 90,
        label: Disk 1, detail: low on space, severity: critical }
  meters:
    - { label: Array, entity: sensor.myserver_array_usage }
  stats:
    - { label: CPU, entity: sensor.myserver_cpu_usage, unit: "%" }
  parity:
    problem: binary_sensor.myserver_parity_valid    # device_class problem: ON is INVALID
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
    vdisk: sensor.myserver_docker_vdisk_usage
    conflicts: sensor.myserver_docker_port_conflicts
    running: sensor.myserver_containers_running
    containers_prefix: switch.myserver_container_
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

A page whose config block is absent gets no dock slot, so a partial `server:` degrades to fewer pages rather than to empty ones.

### The lists are discovered, not configured

Containers, disks and shares come out of `hass.states` by prefix. The hand-typed version of this had five Docker groups naming eleven containers and **three of those entity ids did not exist** — they had rendered as permanently-off toggles that did nothing. A list that is derived cannot drift from the server; a list that is typed always eventually does.

Discovery walks every entity id, so it runs on first `hass` and again on entering the mode, never per state change. Discovered ids are folded into the watched set (`_expandWatched`) so a container toggle repaints immediately; the 30s clock is the backstop for one that appears while a page is open.

A container row takes its name, image, port and link straight off the switch's own attributes — `names:` only exists to override the display name and icon.

### What the data cannot do

Three things a native Unraid client shows are not in the HA integration, and the pages say so rather than faking them:

| Expected | Available | What is drawn |
|---|---|---|
| Per-core CPU bars | One aggregate `cpu_usage`; the core count is an attribute | A 16-bar grid would be sixteen copies of one number. The aggregate, with a 24h history graph the native clients do not have. |
| Per-container CPU / RAM | Aggregate Docker CPU, memory and vdisk only | The aggregate strip at the top of the page; rows carry identity, not load. |
| Per-disk temperature | Published for some disks, not all | Shown where it exists, omitted where it does not — never a dash in a temperature column. |

A slot with **no disk in it** publishes a health of `DISK_NP_DSBL` and no usage. It reads as *not installed*; a 0% bar would be a claim about a healthy empty drive.

### The mode contract

- **A mode, not a Lovelace view.** A view swap re-runs the landing page's whole first-render path on return, and hash-driven pop-ups leak across views. A mode is a state flip on the element already mounted: same gradient, same sheet slot, same dock measurement.
- **Home is not a sixth tab.** It exits rather than switches, so it carries its own treatment.
- **The now-playing bar belongs to the house.** Walking into the server pages does not take the pause button away — one `_miniHtml`, both render paths.
- **Reboot and shut down take the two-tap arm**, and sit below everything worth reading.
- **The container search paints in place.** A focused field holds `_dragging`, so the patch cannot replace the input mid-word — the same rule the music search and the light drag follow.
- **`pcNum(...) ?? 0` is banned here too.** A sensor that is not reporting and a sensor reporting zero are different facts; every figure goes through a helper that returns a dash.

A device row in a `systems` section takes `mode: systems` to become the other way in. It drops its chevron when it does — a stub of the five pages beside the real thing is two answers to one question.
