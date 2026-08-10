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
| `purdy-shell-card` | **The whole phone view as one element** — gradient ground, one glass column of expanding sections, fixed dock. |
| `purdy-desk-card` | **The whole desktop view as one element** — one glass sheet that never scrolls, a status strip, a stage of panels that expand sideways, and a dock. |

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

1100 assertions against DOM stubs — registration, token resolution, the compact and ribbon paths, the split-bar maths, music search and history, section reconciliation, the bind-once guards, failure states, and a duplicate load warning instead of throwing. The shell and the desk each carry a **mini-DOM**, because the plain stub answers `null` to everything and would pass every patching assertion vacuously.

Run it before every release.

`test/` covers the shapes. What it cannot cover is whether the *data* is the shape you assumed — so the desk card was also rendered against a dump of real states before shipping, which is how it was found that GTTC's `current_schedule_entry` is `{time_start, time_end, target_temp, cooling_temp}` rather than the `{start, heat_temp, cool_temp}` the code first guessed, and that an idle Music Assistant player keeps its `media_title` for hours. Both had passed a hand-written fixture. Both are now regression tests.

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
| `--pc-fs-*` | `micro` 10 · `xs` 11 · `sm` 12 · `md` 13 · `lg` 15 · `xl` 18 · `2xl` 22 · `3xl` 40 |
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

## `weather` — a min→max rail

One capsule per day, spanning that day's low to its high, so the *shape* of the
week reads before any single number does. The rail has two sources and a toggle
between them: what the week actually did, from recorder statistics, and what it
is about to do, from the forecast provider.

```yaml
- type: weather
  key: wx
  title: Weather
  sensor: sensor.outside_thermometer          # the MEASURED reading — the hero number
  forecast: weather.kcho                      # provider for the forecast rail
  feels_from: weather.openweathermap          # optional: apparent_temperature
  gttc_outdoor: sensor.gttc_outdoor_temperature   # optional: inside/outside delta
  sun: sun.sun                                # optional: sunrise / sunset row
  days: 7                # closed days on the history rail; today is drawn as well
  rail: history          # which source opens collapsed — history | forecast
  hourly: 12             # hours in the expanded strip; 0 drops it
  source_label: Back deck   # optional: overrides the sensor's friendly name
  tabs: false             # optional: pin one source and hide the toggle
```

Three things worth knowing before pointing it at a provider:

**The hero number is `sensor:`, not the weather entity.** On the day this was
written `weather.forecast_home` reported 79 °F while the thermometer in the yard
read 93.4 °F. A provider is authoritative about the future and merely opinionated
about the present, so the present comes from the thing that measured it. The
provider supplies the forecast rail and nothing else.

**Daily min/max comes from `recorder/statistics_during_period`, not from
history.** History would answer with every state change for a week and the card
would reduce it to 24 numbers; statistics answers with the 24 numbers. Because
long-term statistics are not purged with the recorder, the rail is not bound by
the retention that limits the hypnogram — `days:` could be 365 as cheaply as 7.
No `units:` is sent, so the sensor's own unit is what comes back.

**Not every provider publishes a `daily` forecast.** The National Weather
Service — free, keyless, and the most accurate source for a US location because
the local forecast office edits the grid by hand — supports only `hourly` and
`twice_daily`. Its day/night pairs *are* a high and a low, so they are folded
into days. The forecast type is read off `supported_features` rather than
configured, because asking a provider for a type it does not support answers with
an empty list and no error: the rail would be blank forever with nothing to say
why. `forecast_type:` overrides the detection.

Missing data is never drawn as zero. A day the recorder has nothing for hatches
rather than drawing a flat capsule at the middle of the axis, which would be a
claim about the weather. A day with one end published — late in the day NWS has
no daytime period left, so today arrives as a low with no high — draws a stub at
the end that *is* known. A still-loading rail says so; one that would not load
offers a retry. And the day in progress gets its own capsule with a tick at the
live reading, widened to include it, because statistics lag the sensor by a few
minutes and the tick was the honest half of that disagreement.

On the desktop the measured rail is the balanced face and the forecast rides the
expand, beside the hourly strip. Both were shown at once first, on the reasoning
that width is what a stage panel buys — a screenshot at 1440 killed it: a stage
column among five panels is ~290px, so the rails stacked and the forecast's day
labels clipped off the bottom. Width is what *expanding* buys.

## `health` — a meter, not a ring

A body section built from one repeated unit: a micro label, the number, and a
track carrying **your own normal band** with a dot on today. It answers *is this
where it usually is*, which a ring cannot — a ring shows a fraction of a goal
somebody else picked.

Four states, and the fourth is the one that matters:

| State | Dot | When |
|---|---|---|
| In band | green | inside your usual range |
| Out of band | amber | outside, in the direction that costs something |
| High and good | cyan | above the band where above is not a fault — HRV, REM |
| No reading | **no track at all** | the sensor is not reporting |

**A missing reading draws no rail, no band and no dot.** An empty track is a
claim that the number is low, and absence is not zero. A band that does not
exist yet is treated the same way, minus the caption — which is what lets the
section ship *before* the capture layer that will produce the bands, and still
look deliberate rather than broken.

```yaml
- type: health
  key: body
  title: Body
  sleep_total: <sleep-total-sensor>       # hours
  sleep_deep: <deep-sensor>
  sleep_core: <core-sensor>
  sleep_rem: <rem-sensor>
  sleep_awake: <awake-sensor>
  hr_series: <overnight-hr-sensor>        # the raw sample series
  hrv: <hrv-sensor>
  resting_hr: <resting-hr-sensor>
  respiratory: <respiratory-sensor>
  walking_hr: <walking-hr-sensor>
  load:                                   # counters, never bands — see below
    steps: <steps-sensor>
    exercise: <exercise-minutes-sensor>
    active: <active-energy-sensor>
    distance: <distance-sensor>
    flights: <flights-sensor>
    stand: <stand-hours-sensor>
    stand_goal: 12
  fitness:
    ftp: <ftp-sensor>
    wkg: <power-to-weight-sensor>
    weight: <weight-sensor>               # kg in, lb out
    vo2: <vo2-max-sensor>
  ride: <last-activity-sensor>            # summary lives in its ATTRIBUTES
  walking:
    speed: <walking-speed-sensor>
    step_len: <step-length-sensor>
    support: <double-support-sensor>
    asymmetry: <asymmetry-sensor>
  hearing: <audio-exposure-sensor>
  effort: <physical-effort-sensor>
  hearing_limit: 80                       # dB, the published exposure ceiling
  bands:                                  # {} until you have your own history
    asleep:     { lo: 6.8, hi: 8.2 }
    hrv:        { lo: 26,  hi: 38 }
    resting_hr: { lo: 55,  hi: 63 }
```

Collapsed the section is three meters — slept, HRV, resting — plus one sentence.
**The chip carries today's load**, because the chip's job is the half of the
loop the body is not showing; it must never carry the sentence's conclusion, and
it must never claim a roll-up like *all in band*, because sleep is routinely out
while the others are in and the chip would then contradict a dot directly below
it. Expanded gives the night, the overnight shape, recovery, load, fitness, the
last ride, walking mechanics and hearing.

A band with no explicit domain gets one — the band widened by its own width on
each side, so it sits in the middle third of the rail. Pass `dlo` / `dhi` to
override.

### What the data will not support

Written against Apple Health via Health Auto Export, and worth knowing before
pointing this at anything:

- **There may be no bedtime and no wake time.** Sleep arrives as totals in a
  single write carrying no times, so the section never prints a sleep window.
  An invented one disagreed with its own reading by two hours.
- **The overnight trace may have no time axis.** If the watch uploads the night
  in one burst at breakfast, every sample carries the same timestamp — order
  survives, spacing does not. The trace is therefore plotted against sample
  **index**, captioned as not being to scale in time, and drawn with no tick
  labels rather than fabricated ones.
- **There is no sleep efficiency.** Where *in bed* equals *total sleep* exactly,
  efficiency is a constant fake 100%.
- **A ride is a summary, not a series** — distance, duration, elevation and
  training effect, with no per-second stream. So the ride gets counters, and
  never a trace drawn between four numbers.

### Today's load gets counters, not meters

Until the day is over every load figure is low, and a dot near the bottom of a
track reads as a deficit rather than as a morning. The load block states its
numbers and claims nothing.

## `purdy-shell-card` — weather motion

Condition-driven precipitation across the whole view. `weather_fx` is a **top-level** key, not a section: it paints over every section rather than living in one.

```yaml
type: custom:purdy-shell-card
weather_fx:
  entity: weather.<your_provider>   # the CONDITION source, not the temperature
  strength: 1                       # 0–1.5, clamped
  # force: rainy                    # preview a condition the sky is not doing
```

`rainy` · `hail` · `snowy-rainy` draw rain, `pouring` a heavier tile, `lightning-rainy` adds a flash, `snowy` drifts, `fog` washes. **Everything else draws nothing** — including `cloudy`, deliberately: it is the commonest condition by a wide margin, and an effect that is on almost always stops being a signal and becomes the ground. A clear sky and a provider that is not reporting both draw nothing, and neither draws a stand-in.

Three things about it are load-bearing, and two of them were only found by shooting the real card:

- **It rides its own layer, mounted once by `_mount` and never patched**, driven by one `data-wx` attribute write. An animation inside a patched string restarts from zero on every state change — that was the v1.45.2 lamp chip, and it is why this is not drawn inside the weather section, whose rendered string changes on every sensor tick.
- **It sits in FRONT of the glass column.** The column carries `backdrop-filter: blur(26px)`, so a layer on the ground behind it is blurred into nothing — invisible on the real card while looking perfect in a mockup that has no frosted glass. `z-index: 6` puts it over the column and under the dock, the scrim and the sheets.
- **The drops fall straight down, and travel exactly one tile height.** A slanted tile cannot loop on a vertical translate: the skewed lattice lands off its own period and the pattern visibly jumps every cycle. Rain is drawn as discrete elongated `radial-gradient` drops scattered in a repeating tile — *not* a `repeating-linear-gradient` hatch, which has no gaps and whose angle argument sets the gradient axis, putting the stripes perpendicular to the angle asked for.

`prefers-reduced-motion` stops it. Two composited layers, no JS loop, no canvas.

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

### Six things only a render against live data caught

The pages were covered by tests and by a fixture modelled on the real entities, and all six of these still shipped. Worth remembering that the fixture is a guess about the data and the data is not.

- **Every disk publishes its temperature as an attribute on its *health* sensor**; only one also had a dedicated temperature entity, which HA had converted to °F. Reading the entity alone gave one disk a temperature and the rest none; reading the attribute alone put °C in a card where every other temperature is °F. Both are read, and converted to one unit — a column is one unit or no unit.
- **A parity disk is installed and reports no usage.** `DISK_NP_DSBL` is *no disk*; those two were one flag, so the working parity drive rendered as an empty slot.
- **Discovery sorts by entity id**, which is neither the name shown nor anything the eye can use: `binhex_jellyfin` sorts between `avidemux` and `crafty_4`, so Jellyfin came third in a list headed "Agent Zero, Avidemux". Running first, then by displayed name.
- **A share's entity id is slugified** (`appdatabackups`, `mslady_drive`); the real name is in `share_name`.
- **"84.1%" of what?** Nearly every one of these sensors carries `used_size`/`total_size` (or `ram_used`/`ram_total`), so the meter sub-line is derived. A size typed into config is one that goes stale silently.
- **`Notice [HOSTNAME] - `** opens every notification subject, saying what the severity dot already says and pushing the actual subject off the end of the line.

### Fans are a duty cycle, and most channels have no tachometer

`number.*_fan_N_speed` is the **PWM duty the controller is commanding** — the state tracks `pwm_value / 255` exactly — not a measured speed. Only a header with a tach wire reports `rpm`, and the integration creates an RPM *sensor* only for those.

A channel driven at 71% that reports `rpm: 0` is not a stopped fan; it is a fan nobody can hear back from. Printing "0 RPM" there is the same lie as drawing a missing reading as zero, so the row says **`no tach`** instead, and the block's header counts how many channels actually report (`1 of 6 reporting rpm` on the box this was written against). The measured RPM is shown in full strength beside the duty wherever it exists.

### There is no update action, so there is no update button

The integration publishes **no `update.*` entity and registers no services** — nothing to call. A button labelled "Update" would be a button that cannot update anything.

What it does publish is the *knowledge* that one is waiting: `binary_sensor.*_update_available` for the OS and a plugins-with-updates count. So the Overview identity rows become **links** when something is pending — `update_url` and `plugins_url` point at the pages that perform it — and stay plain more-info rows when nothing is.

```yaml
update_available: binary_sensor.myserver_update_available
update_url: http://<server-host>/Tools/Update
plugins_url: http://<server-host>/Plugins
```

### Per-container restart

The agent publishes a restart button per container, keyed exactly as the switch is, so `restart_prefix` is all it takes. It is offered only on a **running** container — restarting a stopped one is just starting it, which the toggle already does.

```yaml
docker:
  containers_prefix: switch.myserver_container_
  restart_prefix: button.myserver_restart_
```

## `purdy-desk-card` — the desktop view

The desktop counterpart to `purdy-shell-card`, and a **second element rather than a `wide:` flag on the first**, because the two views disagree about the thing the shell is built around. The shell is one column you scroll, where detail is bought by pushing everything below you further down. The desk is one sheet that never scrolls, where **detail is bought with width**: a panel expands sideways and its neighbours fold to a headline. A flag cannot straddle that — every layout rule and every "what does collapsed mean" inverts.

What it is *not* is a port. The phone's rule was *every pop-up leaves its headline on the home screen*. The desk inverts it: **inline what you look at, sheet what you fiddle with.** Climate, Joel, music and the calendar are on the glass. The TV remote, the notification log, the vacuum map and the light rows stay behind sheets, because a d-pad is a task and a log is read on demand.

### Three tiers on one sheet

```
┌──────────────────────────────────────────────────────────────────────┐
│ greeting · clock · weather · HVAC · people          [ All clear ]    │  strip
├──────────────────────────────────────────────────────────────────────┤
│  Climate  │      Joel      │    Music    │        Ahead              │  stage
│           │                │             │                           │
├──────────────────────────────────────────────────────────────────────┤
│ rooms          │ quick tiles        │ systems     │ Lights TV Alerts │  dock
└──────────────────────────────────────────────────────────────────────┘
```

Every card's own background and radius comes off. The whole thing is a single translucent pane over one gradient, subdivided by 1px hairlines — nothing reads as a stacked row because nothing has its own edge.

### The same config language as the shell

`sections:` takes the **same per-type bodies** `purdy-shell-card` does, so a section written for the phone pastes in unchanged. The only addition is `zone:` — `strip`, `stage` or `dock` — which defaults sensibly per type, plus `weight:` for the balanced column widths.

```yaml
type: custom:purdy-desk-card
weather: weather.home
occupancy: input_select.house_occupancy
viewport_offset: 88          # what the HA header + view padding take off 100dvh
sections:
  - { type: climate, key: clim, zone: stage, weight: 1.15, ... }
  - { type: nursery, key: joel, zone: stage, weight: 1.25, ... }
  - { type: music,   key: music, zone: stage, ... }
  - { type: calendar, key: ahead, zone: stage, weight: 0.85, ... }
  - { type: people,  key: people, zone: strip, ... }
  - { type: rooms,   key: rooms, zone: dock }      # falls back to climate's rooms
  - { type: quick,   key: quick, zone: dock, ... }
  - { type: systems, key: sys,   zone: dock, ... }
  - { type: lights,  key: lights, sheet_only: true, ... }
links:
  - { icon: mdi:lightbulb, name: Lights, sheet: lights }
  - { icon: mdi:bell-outline, name: Alerts, alert_when_faults: true, sheet: notifications }
sheets:
  lights: { title: Lights, section: lights }       # a sheet can host a SECTION
  tv:     { title: Televisions, card: { type: custom:purdy-remote-card, ... } }
```

Accepted types: `climate` · `nursery` · `music` · `calendar` · `lights` · `people` · `quick` · `rooms` · `systems` · `nowplaying` · `weather`. A type must be added to `PD_SECTIONS` **and** to the renderer dispatch — a test asserts the two halves name the same set, because missing the list is not a broken section, it is the whole card replaced by "Configuration error".

### Three faces per panel

| Face | When |
|------|------|
| `full` | the balanced state — nothing is expanded |
| `xtra` | revealed under `full` when **this** panel is the expanded one |
| `mini` | the folded headline, when a **different** panel is expanded |

`mini` is why this is folding and not hiding. Opening climate must not make Joel disappear — it makes him a number you can still read.

All three are `display` swaps. **Exactly one property on the whole screen transitions**: the stage's `grid-template-columns`, on a node the renderer never replaces. An entry/exit animation on a patched node re-runs from zero on every state change.

### It borrows from the shell rather than copying it

`PD_BORROW` names ~35 methods taken live off `PurdyShellCard.prototype` — the recorder fetches, the fault engine and its dismissal store, the nursery derivation, the music target resolution, the optimistic setpoint, the bind-once guards, and the ring and sparkline geometry. They are about data, not markup, so they do not care which view is asking, and a fix lands in both. The borrow warns loudly if a name stops resolving, and a test asserts nothing was silently lost.

The markup-emitting cousins are deliberately **not** borrowed: `_secClimate` and `_resultsHtml` describe a phone column. The desk writes its own, and declares the shell's `--ps-*` palette **names** so that the two rings can be one function.

### Sheets

A sheet hosts either a foreign card (`card:`) or one of our own sections (`section:`). A hosted card gets `bare: true` and a blanked `title` by default — the sheet chrome already names itself beside the close button, and left set it printed the name twice. `dim:` is for a hosted card that hardcodes a light surface and never reads HA's card variables; it is opt-in per sheet.

### The rules that shaped it

- **A zero and a missing reading must never look the same.** A thermostat that has dropped off draws an empty ring, not a ring at zero. A night that has not happened reads `—`, never `0m`. The graph says whether the recorder failed or simply has nothing yet.
- **It patches, it does not repaint.** No handler closes over `hass` or `config`; binding is claimed per element per selector; the rendered string is the cache key.
- **A control something physical is following throttles, it does not debounce.** A debounce only fires after the drag stops — the number moves and the room does not.
- **A drag cannot go through `_render()`.** Re-rendering mid-gesture detaches the row under the pointer, and every later move is silently discarded.
- **A setpoint moves on the tap, not on the round trip** — and the *next* tap reads the optimistic value, or a burst of taps computes the same number three times.

### Folding down

One definition, three widths. Above 1180px it is the fixed three-tier sheet. Below that the strip wraps and the stage becomes two columns, then one, and the sheet stops being viewport-height. It never tries to become the phone view — that already exists.
