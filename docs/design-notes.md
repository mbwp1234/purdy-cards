# Design notes

The reasoning behind the choices in [the README](../README.md), and the constraints that produced them. Nothing here is needed to use the cards.

## Why one repo

Both panels already shared a design language: the same tokens, the same 24px radius, the same `callApi` history fetch, the same rAF-batched renders. Kept in separate repos that was copy-pasted code that drifted every time either card was touched.

Here the tokens live in one `PC_TOKENS` block that both derive from, so a colour changes in exactly one place. One `gh release create`, one HACS download, one resource URL on the dashboard.

## Compact modes are doorways

The full panels are designed for a popup. Their compact variants are designed to sit on a home screen and act as a doorway into that popup — a reading and a link at once.

## Haptics

The iOS and Android companion apps listen on `window` for an event of type `haptic`. Nothing in HA's own frontend fires it except `<ha-switch>`, so a card that wants a control to *feel* like a control has to fire it itself.

```js
const ev = new Event("haptic", { bubbles: true, cancelable: false, composed: true });
ev.detail = "selection";
window.dispatchEvent(ev);
```

Two things look wrong and are not: it is built with `new Event(...)` and `.detail` is assigned afterwards — `new CustomEvent(type, { detail })` reads better and is not heard — and the detail is a bare string, not an object.

Three rules hold the set together:

- A haptic marks an action that **committed**. Cancelling a guard restores what was really there and says nothing.
- Continuous controls quantise and tick once per step crossed, never once per pointer event — a motor cannot deliver a hundred buzzes a second and queues the ones it cannot.
- Nothing fires from the render path. The shell patches on every state arrival, so a haptic there would buzz when the *house* changed rather than when you touched something.

## Tests cover shapes, not data

`test/` covers the shapes. What it cannot cover is whether the data is the shape you assumed — so the desk card was also rendered against a dump of real states before shipping. That is how it was found that GTTC's `current_schedule_entry` is `{time_start, time_end, target_temp, cooling_temp}` rather than the `{start, heat_temp, cool_temp}` the code first guessed, and that an idle Music Assistant player keeps its `media_title` for hours. Both had passed a hand-written fixture. Both are now regression tests.

## `purdy-attention-card` — a dismissal is an acknowledgement

A row stays hidden only while the underlying condition is unchanged. If the entity changes state again the fault has re-fired and the row comes back; `dismiss_hours` adds a ceiling so a long-running fault resurfaces on its own.

The compact `key:epoch` encoding matters because `input_text` caps at 255 characters, which fits roughly a dozen dismissals.

## `purdy-music-card`

**Players are named, not swept.** Music Assistant mirrors every source player it can reach, so a domain sweep pulls in AirPlay duplicates that sit `unavailable` forever.

**A Music Assistant player also proxies whatever else its source device is doing.** A Chromecast running a streaming app reports `playing` for the whole episode. The card only treats a player as music when `app_id` is `music_assistant` or `media_content_type` is one of `music` / `playlist` / `track` / `album` / `radio` — otherwise a TV show would put a phantom row on the home screen.

**Stopping is a walk, not a call.** Cast speakers report `supported_features: 8320575`, whose low bits are `63` — pause, seek, volume, prev, next and nothing else. They do not advertise `TURN_OFF` at all, so a blind `turn_off` is a silent no-op; only a group player (`7796671`) carries the bit. The card walks `turn_off` → `media_stop` → `media_pause` and uses the first one the player actually supports.

**Artwork reads `entity_picture_local` before `entity_picture`.** Music Assistant publishes `entity_picture` as an absolute plain-HTTP URL to its own add-on port, which fails twice on a phone — an HTTPS dashboard blocks it as mixed content, and off the LAN the host is unreachable. `entity_picture_local` is HA's same-origin authenticated proxy and works in both places.

**Search keeps the caret and the half-typed query across re-renders.** Without that, a queue advancing to the next track would wipe the search box mid-word. Typing is debounced 450ms; Enter searches immediately.

**Recently-listened does not come from Music Assistant, because Music Assistant does not have it.** Its `last_played` and `play_count` columns are empty, so `order_by: last_played_desc` silently returns the library in id order — it looks like it worked and means nothing. Its built-in *Recently played tracks* smart playlist browses to zero children. HA's own recorder does have the history: every MA player logs `media_title`, `media_artist` and a playable `media_content_id` on each state change.

## `weather` — a min→max rail

One capsule per day, spanning that day's low to its high, so the *shape* of the week reads before any single number does.

**The hero number is `sensor:`, not the weather entity.** On the day this was written the forecast entity reported 79 °F while the thermometer in the yard read 93.4 °F. A provider is authoritative about the future and merely opinionated about the present, so the present comes from the thing that measured it.

**Daily min/max comes from `recorder/statistics_during_period`, not from history.** History would answer with every state change for a week and the card would reduce it to 24 numbers; statistics answers with the 24 numbers. Long-term statistics are not purged with the recorder, so `days:` could be 365 as cheaply as 7. No `units:` is sent, so the sensor's own unit is what comes back.

**Not every provider publishes a `daily` forecast.** The National Weather Service — free, keyless, and the most accurate source for a US location because the local forecast office edits the grid by hand — supports only `hourly` and `twice_daily`. Its day/night pairs *are* a high and a low, so they are folded into days. The forecast type is read off `supported_features` rather than configured, because asking a provider for a type it does not support answers with an empty list and no error: the rail would be blank forever with nothing to say why.

**Missing data is never drawn as zero.** A day the recorder has nothing for hatches rather than drawing a flat capsule at the middle of the axis, which would be a claim about the weather. A day with one end published draws a stub at the end that is known. A still-loading rail says so; one that would not load offers a retry. The day in progress gets its own capsule with a tick at the live reading, widened to include it, because statistics lag the sensor by a few minutes.

On the desktop the measured rail is the balanced face and the forecast rides the expand. Both were shown at once first, on the reasoning that width is what a stage panel buys — a screenshot at 1440 killed it: a stage column among five panels is ~290px, so the rails stacked and the forecast's day labels clipped off the bottom. Width is what *expanding* buys.

## `health` — a meter, not a ring

One repeated unit: a micro label, the number, and a track carrying your own normal band with a dot on today. It answers *is this where it usually is*, which a ring cannot — a ring shows a fraction of a goal somebody else picked.

| State | Dot | When |
|---|---|---|
| In band | green | inside your usual range |
| Out of band | amber | outside, in the direction that costs something |
| High and good | cyan | above the band where above is not a fault — HRV, REM |
| No reading | **no track at all** | the sensor is not reporting |

**A missing reading draws no rail, no band and no dot.** An empty track is a claim that the number is low, and absence is not zero. A band that does not exist yet is treated the same way, minus the caption — which is what lets the section ship *before* the capture layer that produces the bands, and still look deliberate rather than broken.

Collapsed, the section is three meters — slept, HRV, resting — plus one sentence. The chip carries today's load, because the chip's job is the half of the loop the body is not showing. It must never carry the sentence's conclusion, and never claim a roll-up like *all in band*: sleep is routinely out while the others are in, and the chip would then contradict a dot directly below it.

### What the data will not support

Written against Apple Health via Health Auto Export:

- **There may be no bedtime and no wake time.** Sleep arrives as totals in a single write carrying no times, so the section never prints a sleep window. An invented one disagreed with its own reading by two hours.
- **The overnight trace may have no time axis.** If the watch uploads the night in one burst at breakfast, every sample carries the same timestamp — order survives, spacing does not. The trace is plotted against sample **index**, captioned as not being to scale in time, and drawn with no tick labels rather than fabricated ones.
- **There is no sleep efficiency.** Where *in bed* equals *total sleep* exactly, efficiency is a constant fake 100%.
- **A ride is a summary, not a series** — distance, duration, elevation and training effect, with no per-second stream. So the ride gets counters, never a trace drawn between four numbers.

### Today's load gets counters, not meters

Until the day is over every load figure is low, and a dot near the bottom of a track reads as a deficit rather than as a morning. The load block states its numbers and claims nothing.

## `weather_fx` — precipitation motion

`cloudy` deliberately draws nothing: it is the commonest condition by a wide margin, and an effect that is on almost always stops being a signal and becomes the ground. A clear sky and a provider that is not reporting both draw nothing, and neither draws a stand-in.

Three things are load-bearing, and two were only found by shooting the real card:

- **It rides its own layer, mounted once by `_mount` and never patched**, driven by one `data-wx` attribute write. An animation inside a patched string restarts from zero on every state change — that was the v1.45.2 lamp chip, and it is why this is not drawn inside the weather section, whose rendered string changes on every sensor tick.
- **It sits in FRONT of the glass column.** The column carries `backdrop-filter: blur(26px)`, so a layer on the ground behind it is blurred into nothing — invisible on the real card while looking perfect in a mockup that has no frosted glass. `z-index: 6` puts it over the column and under the dock, the scrim and the sheets.
- **The drops fall straight down, and travel exactly one tile height.** A slanted tile cannot loop on a vertical translate: the skewed lattice lands off its own period and the pattern visibly jumps every cycle. Rain is drawn as discrete elongated `radial-gradient` drops scattered in a repeating tile — not a `repeating-linear-gradient` hatch, which has no gaps and whose angle argument sets the gradient axis, putting the stripes perpendicular to the angle asked for.

Two composited layers, no JS loop, no canvas.

## Systems mode

### The lists are discovered, not configured

Containers, disks and shares come out of `hass.states` by prefix. The hand-typed version of this had five Docker groups naming eleven containers and **three of those entity ids did not exist** — they had rendered as permanently-off toggles that did nothing. A list that is derived cannot drift from the server; a list that is typed always eventually does.

Discovery walks every entity id, so it runs on first `hass` and again on entering the mode, never per state change. Discovered ids are folded into the watched set (`_expandWatched`) so a container toggle repaints immediately; the 30s clock is the backstop for one that appears while a page is open.

A container row takes its name, image, port and link straight off the switch's own attributes.

### What the data cannot do

Three things a native client shows are not in the HA integration, and the pages say so rather than faking them:

| Expected | Available | What is drawn |
|---|---|---|
| Per-core CPU bars | One aggregate `cpu_usage`; the core count is an attribute | A 16-bar grid would be sixteen copies of one number. The aggregate, with a 24h history graph the native clients do not have. |
| Per-container CPU / RAM | Aggregate Docker CPU, memory and vdisk only | The aggregate strip at the top of the page; rows carry identity, not load. |
| Per-disk temperature | Published for some disks, not all | Shown where it exists, omitted where it does not — never a dash in a temperature column. |

A slot with no disk in it publishes a health of `DISK_NP_DSBL` and no usage. It reads as *not installed*; a 0% bar would be a claim about a healthy empty drive.

### The mode contract

- **A mode, not a Lovelace view.** A view swap re-runs the landing page's whole first-render path on return, and hash-driven pop-ups leak across views. A mode is a state flip on the element already mounted: same gradient, same sheet slot, same dock measurement.
- **Home is not a sixth tab.** It exits rather than switches, so it carries its own treatment.
- **The now-playing bar belongs to the house.** Walking into the server pages does not take the pause button away — one `_miniHtml`, both render paths.
- **Reboot and shut down take the two-tap arm**, and sit below everything worth reading.
- **The container search paints in place.** A focused field holds `_dragging`, so the patch cannot replace the input mid-word — the same rule the music search and the light drag follow.
- **`pcNum(...) ?? 0` is banned here.** A sensor that is not reporting and a sensor reporting zero are different facts; every figure goes through a helper that returns a dash.

### Six things only a render against live data caught

The pages were covered by tests and by a fixture modelled on the real entities, and all six of these still shipped.

- **Every disk publishes its temperature as an attribute on its *health* sensor.** Only one also had a dedicated temperature entity, which HA had converted to °F. Reading the entity alone gave one disk a temperature and the rest none; reading the attribute alone put °C in a card where every other temperature is °F. Both are read, and converted to one unit.
- **A parity disk is installed and reports no usage.** `DISK_NP_DSBL` is *no disk*; those two were one flag, so the working parity drive rendered as an empty slot.
- **Discovery sorts by entity id**, which is neither the name shown nor anything the eye can use: `binhex_jellyfin` sorts between `avidemux` and `crafty_4`. Running first, then by displayed name.
- **A share's entity id is slugified**; the real name is in `share_name`.
- **"84.1%" of what?** Nearly every one of these sensors carries `used_size`/`total_size` (or `ram_used`/`ram_total`), so the meter sub-line is derived. A size typed into config goes stale silently.
- **`Notice [HOSTNAME] - `** opens every notification subject, saying what the severity dot already says and pushing the actual subject off the end of the line.

### Fans are a duty cycle, and most channels have no tachometer

`number.*_fan_N_speed` is the PWM duty the controller is commanding — the state tracks `pwm_value / 255` exactly — not a measured speed. Only a header with a tach wire reports `rpm`, and the integration creates an RPM *sensor* only for those.

A channel driven at 71% that reports `rpm: 0` is not a stopped fan; it is a fan nobody can hear back from. Printing "0 RPM" there is the same lie as drawing a missing reading as zero, so the row says `no tach` instead, and the block's header counts how many channels actually report. The measured RPM is shown in full strength beside the duty wherever it exists.

### There is no update action, so there is no update button

The integration publishes no `update.*` entity and registers no services — nothing to call. A button labelled "Update" would be a button that cannot update anything. What it does publish is the *knowledge* that one is waiting, so the Overview identity rows become links when something is pending and stay plain more-info rows when nothing is.

### Per-container restart

The agent publishes a restart button per container, keyed exactly as the switch is, so `restart_prefix` is all it takes. It is offered only on a running container — restarting a stopped one is just starting it, which the toggle already does.

## `purdy-desk-card` — the desktop view

A **second element rather than a `wide:` flag on the first**, because the two views disagree about the thing the shell is built around. The shell is one column you scroll, where detail is bought by pushing everything below you further down. The desk is one sheet that never scrolls, where detail is bought with width: a panel expands sideways and its neighbours fold to a headline. A flag cannot straddle that — every layout rule and every "what does collapsed mean" inverts.

It is not a port. The phone's rule was *every pop-up leaves its headline on the home screen*. The desk inverts it: **inline what you look at, sheet what you fiddle with.** Climate, the nursery, music and the calendar are on the glass. The TV remote, the notification log, the vacuum map and the light rows stay behind sheets, because a d-pad is a task and a log is read on demand.

```
┌──────────────────────────────────────────────────────────────┐
│ greeting · clock · weather · HVAC · people      [ All clear ] │  strip
├──────────────────────────────────────────────────────────────┤
│  Climate  │  Nursery  │   Music   │        Ahead             │  stage
│           │           │           │                          │
├──────────────────────────────────────────────────────────────┤
│  rooms    │ quick tiles │ systems  │  Lights  TV  Alerts     │  dock
└──────────────────────────────────────────────────────────────┘
```

Every card's own background and radius comes off. The whole thing is a single translucent pane over one gradient, subdivided by 1px hairlines — nothing reads as a stacked row because nothing has its own edge.

`mini` is why this is folding and not hiding. Opening climate must not make the nursery disappear — it makes it a number you can still read. All three faces are `display` swaps. **Exactly one property on the whole screen transitions**: the stage's `grid-template-columns`, on a node the renderer never replaces. An entry/exit animation on a patched node re-runs from zero on every state change.

A section type must be added to `PD_SECTIONS` **and** to the renderer dispatch — a test asserts the two halves name the same set, because missing the list is not a broken section, it is the whole card replaced by "Configuration error".

### It borrows from the shell rather than copying it

`PD_BORROW` names ~35 methods taken live off `PurdyShellCard.prototype` — the recorder fetches, the fault engine and its dismissal store, the nursery derivation, the music target resolution, the optimistic setpoint, the bind-once guards, and the ring and sparkline geometry. They are about data, not markup, so they do not care which view is asking, and a fix lands in both. The borrow warns loudly if a name stops resolving, and a test asserts nothing was silently lost.

The markup-emitting cousins are deliberately **not** borrowed: `_secClimate` and `_resultsHtml` describe a phone column. The desk writes its own, and declares the shell's `--ps-*` palette **names** so the two rings can be one function.

### Sheets

A sheet hosts either a foreign card (`card:`) or one of our own sections (`section:`). A hosted card gets `bare: true` and a blanked `title` by default — the sheet chrome already names itself beside the close button, and left set it printed the name twice. `dim:` is for a hosted card that hardcodes a light surface and never reads HA's card variables; it is opt-in per sheet.

### The rules that shaped it

- **A zero and a missing reading must never look the same.** A thermostat that has dropped off draws an empty ring, not a ring at zero. A night that has not happened reads `—`, never `0m`.
- **It patches, it does not repaint.** No handler closes over `hass` or `config`; binding is claimed per element per selector; the rendered string is the cache key.
- **A control something physical is following throttles, it does not debounce.** A debounce only fires after the drag stops — the number moves and the room does not.
- **A drag cannot go through `_render()`.** Re-rendering mid-gesture detaches the row under the pointer, and every later move is silently discarded.
- **A setpoint moves on the tap, not on the round trip** — and the *next* tap reads the optimistic value, or a burst of taps computes the same number three times.

### Folding down

One definition, three widths. Above 1180px it is the fixed three-tier sheet. Below that the strip wraps and the stage becomes two columns, then one, and the sheet stops being viewport-height. It never tries to become the phone view — that already exists.
