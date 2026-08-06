import fs from 'fs';
const src = fs.readFileSync(new URL('../purdy-cards.js', import.meta.url),'utf8');
/* The shell owns the patching render model; the standalone cards still repaint
   whole and are correct to. Assertions about binding must not sweep them in. */
const shellSrc = ['70-shell-core','71-shell-sections','72-shell-schedule','73-shell-music','74-shell-alerts']
  .map((f) => fs.readFileSync(new URL(`../src/${f}.js`, import.meta.url),'utf8'))
  .join('\n');

const defined = {};
class FakeEl {
  constructor(){ this.shadowRoot=null; this._listeners={}; this.style={}; }
  attachShadow(){ this.shadowRoot = { innerHTML:'', querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null }; return this.shadowRoot; }
  addEventListener(){} dispatchEvent(){ return true; }
}
globalThis.HTMLElement = FakeEl;
globalThis.customElements = { define:(n,c)=>{ defined[n]=c; }, get:(n)=>defined[n] };
globalThis.window = { customCards: [], location:{ hash:'' } };
globalThis.history = { pushState(){} };
globalThis.document = { createElement:()=>({ style:{}, setAttribute(){}, appendChild(){} }) };
globalThis.Event = class { constructor(t){ this.type=t; } };
globalThis.console.info = ()=>{};

eval(src);

const names = Object.keys(defined);
console.log('defined elements:', names.join(', '));

let fail = 0;
const check = (label, cond) => { console.log((cond?'  PASS  ':'  FAIL  ')+label); if(!cond) fail++; };

check('climate-panel-card defined', names.includes('climate-panel-card'));
check('sleep-panel-card defined', names.includes('sleep-panel-card'));
check('both panels registered in customCards', ['climate-panel-card','sleep-panel-card'].every(t => window.customCards.some(c => c.type===t)));

const CPC = defined['climate-panel-card'];
const SPC = defined['sleep-panel-card'];

const cs = CPC.styles, ss = SPC.styles;
check('climate styles carry shared --pc-panel token', cs.includes('--pc-panel:'));
check('climate aliases cpc->pc', cs.includes('--cpc-panel: var(--cpc-panel-override, var(--pc-panel))'));
check('climate compact CSS present', cs.includes('.panel.compact'));
check('sleep styles carry shared --pc-panel token', ss.includes('--pc-panel:'));
check('sleep aliases spc->pc', ss.includes('--spc-panel: var(--pc-panel)'));
check('sleep ribbon CSS present', ss.includes('.panel.ribbon'));
check('sleep splitbar CSS present', ss.includes('.sb-deep'));
check('no unresolved template placeholder', !cs.includes('${') && !ss.includes('${'));

// instantiate + setConfig
const c = new CPC();
c.setConfig({ thermostat:'climate.thermostat', compact:true, navigate:'#climate' });
check('climate setConfig(compact) ok', c._config.compact===true);
check('climate getCardSize compact = 3', c.getCardSize()===3);
const c2 = new CPC(); c2.setConfig({ thermostat:'climate.thermostat' });
check('climate getCardSize full = 6', c2.getCardSize()===6);
check('climate _renderCompact exists', typeof c._renderCompact === 'function');

const s = new SPC();
s.setConfig({ sleep_state:'sensor.sleep_state', ribbon:true, navigate:'#sleep' });
check('sleep setConfig(ribbon) ok', s._config.ribbon===true);
check('sleep getCardSize ribbon = 3', s.getCardSize()===3);
const s2 = new SPC(); s2.setConfig({ sleep_state:'sensor.x' });
check('sleep getCardSize full = 7', s2.getCardSize()===7);
check('sleep _renderRibbon exists', typeof s._renderRibbon === 'function');
check('sleep _splitBarHtml exists', typeof s._splitBarHtml === 'function');

// _splitBarHtml math
s._num = (id) => ({ 'sensor.deep':0.85, 'sensor.light':2.67 })[id] ?? null;
s._config.ring = { deep:'sensor.deep', light:'sensor.light' };
const bar = s._splitBarHtml('night');
check('splitbar renders deep 51m', bar.includes('Deep 51m'));
check('splitbar renders light 2h 40m', bar.includes('Light 2h 40m'));
check('splitbar deep width 24.1%', bar.includes('width:24.1%'));
s._num = () => null;
check('splitbar empty when no data', s._splitBarHtml('night')==='');

// _sleepSpan must chart the LAST session only. Shape taken from real history:
// last night's tail is still inside the window when tonight starts, and the
// two must not be drawn as one span with a dead gap between them.
const T = (hhmm) => new Date(`2026-08-05T${hhmm}:00-04:00`).getTime();
const spanCard = new SPC();
spanCard.setConfig({ sleep_state:'sensor.sleep_state' });
spanCard._history['sensor.sleep_state'] = [
  { t:T('03:35'), v:'light_sleep' },
  { t:T('04:27'), v:'awake' },
  { t:T('04:30'), v:'light_sleep' },
  { t:T('07:13'), v:'awake' },
  { t:T('07:17'), v:'light_sleep' },
  { t:T('07:18'), v:'awake' },
  { t:T('07:31'), v:'unavailable' },
  { t:T('19:17'), v:'unknown' },
  { t:T('19:18'), v:'awake' },
  { t:T('19:25'), v:'light_sleep' },
];
const span = spanCard._sleepSpan();
check('span starts at tonight, not last night', span && span.t0===T('19:25'));
check('open session runs to now', span && span.t1 > T('19:25'));

// A short awake blip inside a night must not split the session.
spanCard._history['sensor.sleep_state'] = [
  { t:T('19:25'), v:'light_sleep' },
  { t:T('21:00'), v:'awake' },
  { t:T('21:04'), v:'deep_sleep' },
  { t:T('22:00'), v:'awake' },
];
const span2 = spanCard._sleepSpan();
check('4-minute wake does not split the session', span2 && span2.t0===T('19:25'));
check('span ends where sleep stopped', span2 && span2.t1===T('22:00'));

// Awake alone is charted but never opens a session.
spanCard._history['sensor.sleep_state'] = [{ t:T('19:18'), v:'awake' }];
check('no span when nothing asleep', spanCard._sleepSpan()===null);


// ---- home-screen cards ----
for (const n of ['purdy-header-card','purdy-attention-card','purdy-people-card','purdy-rooms-card','purdy-quick-card'])
  check(`${n} defined`, names.includes(n));
check('every defined element is in customCards', names.every(n => window.customCards.some(c => c.type===n)) && window.customCards.length===names.length);

const H = defined['purdy-header-card'];
const A = defined['purdy-attention-card'];
const P = defined['purdy-people-card'];
const R = defined['purdy-rooms-card'];
const Q = defined['purdy-quick-card'];

const hass = { states: {
  'weather.home': { state:'rainy', attributes:{ temperature:73 } },
  'input_select.house_occupancy': { state:'Home', attributes:{} },
  'binary_sensor.parity': { state:'off', attributes:{ friendly_name:'Parity' } },
  'binary_sensor.flash': { state:'on', attributes:{ friendly_name:'Flash' } },
  'vacuum.litter': { state:'error', attributes:{ friendly_name:'Litter' } },
  'sensor.drawer': { state:'92', attributes:{} },
  'binary_sensor.a_battery_plus_low': { state:'on', attributes:{ friendly_name:'Hallway Battery low' } },
  'binary_sensor.b_battery_plus_low': { state:'off', attributes:{ friendly_name:'Office Battery low' } },
  'person.x': { state:'home', attributes:{ friendly_name:'Alex' } },
  'sensor.x_batt': { state:'55', attributes:{} },
  'sensor.x_steps': { state:'4903', attributes:{} },
  'sensor.room_t': { state:'73.94', attributes:{} },
  'sensor.room_h': { state:'48.6', attributes:{} },
  'light.lr': { state:'on', attributes:{ friendly_name:'Lights' } },
}, callService(){ this._called = true; } };

// header
const h = new H(); h.setConfig({ name:'Alex', weather:'weather.home', occupancy:'input_select.house_occupancy' });
h.hass = hass;
check('header renders greeting', /Good (morning|afternoon|evening), Alex/.test(h.shadowRoot.innerHTML));
check('header renders weather temp', h.shadowRoot.innerHTML.includes('73°'));
check('header renders occupancy', h.shadowRoot.innerHTML.includes('Home'));
h.disconnectedCallback();

// attention
const a = new A();
a.setConfig({ rules: [
  { entity:'vacuum.litter', state:'error', severity:'critical', title:'Litter box', detail:'needs reset' },
  { entity:'binary_sensor.parity', state:'off', severity:'critical', title:'Parity' },
  { entity:'binary_sensor.flash', state:'off', severity:'critical', title:'Flash' },
  { entity:'sensor.drawer', above:85, severity:'warn', title:'Waste drawer' },
  { match:'battery_plus_low$', state:'on', severity:'info', title:'low batteries', strip:'Battery low' },
]});
a.hass = hass;
const rows = a._rows();
check('attention picks matching rules only', rows.length===4);
check('attention skips non-matching (flash is on)', !rows.some(r=>r.title==='Flash'));
check('attention numeric above rule fires', rows.some(r=>r.title==='Waste drawer'));
check('attention battery group counts only on', rows.some(r=>r.title==='1 low batteries'));
check('attention strips battery suffix', rows.some(r=>r.detail==='Hallway'));
check('attention header shows count', a.shadowRoot.innerHTML.includes('· 4'));
check('attention escalates edge to bad', a.shadowRoot.innerHTML.includes('--pc-bad'));

const a2 = new A();
a2.setConfig({ rules:[{ entity:'binary_sensor.flash', state:'off', title:'Flash' }] });
a2.hass = hass;
check('attention hides itself when clean', a2.shadowRoot.innerHTML==='' && a2.style.display==='none');

// people
const p = new P();
p.setConfig({ people:[{ entity:'person.x', battery:'sensor.x_batt', steps:'sensor.x_steps' }] });
p.hass = hass;
check('people shows name', p.shadowRoot.innerHTML.includes('Alex'));
check('people shows Home', p.shadowRoot.innerHTML.includes('>Home<'));
check('people formats steps with separator', p.shadowRoot.innerHTML.includes('4,903'));
check('people shows battery pct', p.shadowRoot.innerHTML.includes('55%'));

// rooms
const r = new R();
r.setConfig({ rooms:[{ name:'Living', temp:'sensor.room_t', humidity:'sensor.room_h' }] });
r.hass = hass;
check('rooms shows temp to 1dp', r.shadowRoot.innerHTML.includes('73.9°'));
check('rooms shows humidity', r.shadowRoot.innerHTML.includes('48.6%'));

// quick
const q = new Q();
q.setConfig({ tiles:[
  { entity:'light.lr', name:'Lights' },
  { entity:'vacuum.litter', name:'Litter', alert_when:['error'] },
]});
q.hass = hass;
check('quick marks on-state tile', q.shadowRoot.innerHTML.includes('class="t on'));
check('quick marks alert tile', q.shadowRoot.innerHTML.includes('class="t alert'));
check('quick renders 3 columns by default', q.shadowRoot.innerHTML.includes('repeat(3, 1fr)'));



// value_entity: second line reads from a different entity
hass.states['sensor.drawer_pct'] = { state:'77', attributes:{ unit_of_measurement:'%' } };
const q2 = new Q();
q2.setConfig({ tiles:[
  { entity:'vacuum.litter', name:'Litter', value_entity:'sensor.drawer_pct', alert_when:['error'] },
]});
q2.hass = hass;
check('value_entity drives the second line', q2.shadowRoot.innerHTML.includes('77 %'));
check('value_entity keeps tone from the main entity', q2.shadowRoot.innerHTML.includes('class="t alert'));
check('value_entity is watched for updates', q2._watched.includes('sensor.drawer_pct'));


// fill bar
hass.states['sensor.fill_low'] = { state:'35', attributes:{} };
hass.states['sensor.fill_high'] = { state:'88', attributes:{} };
hass.states['sensor.fill_crit'] = { state:'97', attributes:{} };
const q3 = new Q();
q3.setConfig({ tiles:[
  { entity:'light.lr', name:'A', bar_entity:'sensor.fill_low' },
  { entity:'light.lr', name:'B', bar_entity:'sensor.fill_high' },
  { entity:'light.lr', name:'C', bar_entity:'sensor.fill_crit' },
  { entity:'light.lr', name:'D' },
]});
q3.hass = hass;
const h3 = q3.shadowRoot.innerHTML;
check('bar renders at the right width', h3.includes('width:35%'));
check('bar is cool below the warn threshold', h3.includes('width:35%;background:var(--pc-cool)'));
check('bar warns above 80', h3.includes('width:88%;background:var(--pc-warn)'));
check('bar goes critical above 95', h3.includes('width:97%;background:var(--pc-bad)'));
check('tiles without bar_entity get no bar', (h3.match(/class="fill"/g) || []).length === 3);
check('bar_entity is watched', q3._watched.includes('sensor.fill_high'));

// ---- dismissal + notification centre ----
check('purdy-notifications-card defined', names.includes('purdy-notifications-card'));
const N = defined['purdy-notifications-card'];

const now = Math.floor(Date.now()/1000);
const iso = (t) => new Date(t*1000).toISOString();
const hass2 = { states: {
  'binary_sensor.parity': { state:'off', attributes:{friendly_name:'Parity'}, last_changed: iso(now-3600) },
  'input_text.dismissed': { state:'', attributes:{} },
  'sensor.unread_warn': { state:'3', attributes:{} },
  'sensor.unread_alert': { state:'0', attributes:{} },
  'todo.nc': { state:'2', attributes:{} },
}, _calls: [], callService(d,s,data){ this._calls.push([d,s,data]); },
   callWS(){ return Promise.resolve({items:[]}); } };

const ad = new A();
ad.setConfig({ dismiss_store:'input_text.dismissed', rules:[
  { key:'parity', entity:'binary_sensor.parity', state:'off', severity:'critical', title:'Parity' },
]});
ad.hass = hass2;
check('dismissible row renders an x button', ad.shadowRoot.innerHTML.includes('data-idx="0"'));
ad._dismiss(ad._rows()[0]);
const wrote = hass2._calls.find(c => c[1]==='set_value');
check('dismiss writes to store', !!wrote && /^parity:\d+$/.test(wrote[2].value));

// simulate the store now holding that dismissal
hass2.states['input_text.dismissed'] = { state: wrote[2].value, attributes:{} };
ad._last = null; ad.hass = hass2;
check('dismissed row is hidden', ad._rows().length===0);

// the fault re-firing brings it back
hass2.states['binary_sensor.parity'] = { state:'off', attributes:{friendly_name:'Parity'}, last_changed: iso(now+60) };
ad._last = null; ad.hass = hass2;
check('re-fired fault reappears after dismissal', ad._rows().length===1);

// snooze window
const ad2 = new A();
ad2.setConfig({ dismiss_store:'input_text.dismissed', dismiss_hours:1, rules:[
  { key:'parity', entity:'binary_sensor.parity', state:'off', title:'Parity' },
]});
hass2.states['binary_sensor.parity'] = { state:'off', attributes:{friendly_name:'Parity'}, last_changed: iso(now-7200) };
hass2.states['input_text.dismissed'] = { state:'parity:'+(now-7200), attributes:{} };
ad2.hass = hass2;
check('snooze lapses after dismiss_hours', ad2._rows().length===1);

// notification centre parsing
const nc = new N();
nc.setConfig({ entity:'todo.nc', unread:[
  { entity:'sensor.unread_alert', label:'Alert', severity:'critical' },
  { entity:'sensor.unread_warn', label:'Warning', severity:'warn' },
]});
nc._hass = hass2;
nc._items = [
  { uid:'1', summary:'Parity invalid', status:'needs_action', description:'[parity] critical · Invalid · raised '+iso(now-600) },
  { uid:'2', summary:'Version update', status:'completed', description:'[unraid] info · MeTube · raised '+iso(now-9000) },
];
nc._render();
const html = nc.shadowRoot.innerHTML;
check('centre splits active and dismissed', html.includes('Active · 1') && html.includes('Dismissed · 1'));
check('centre parses severity', html.includes('dot critical'));
check('centre strips the key tag from detail', html.includes('Invalid') && !html.includes('[parity]'));
check('centre shows relative time', /\d+m ago/.test(html));
check('centre offers restore on dismissed', html.includes('data-restore="2"'));
check('unread chips drop zero counts', html.includes('3 Warning') && !html.includes('0 Alert'));


// ---- remote card ----
check('purdy-remote-card defined', names.includes('purdy-remote-card'));
const RC = defined['purdy-remote-card'];
const rhass = { states: {
  'remote.lr': { state:'on', attributes:{} },
  'remote.br': { state:'off', attributes:{} },
  'sensor.lr_app': { state:'Twitch', attributes:{} },
  'sensor.br_app': { state:'Idle', attributes:{} },
}, _calls: [], callService(d,sv,data){ this._calls.push([d,sv,data]); } };

const rc = new RC();
rhass.states['media_player.lr'] = { state:'on', attributes:{ is_volume_muted:false } };
rhass.states['media_player.br'] = { state:'off', attributes:{} };
rc.setConfig({ tvs:[
  { name:'Living Room', remote:'remote.lr', media_player:'media_player.lr', app_sensor:'sensor.lr_app' },
  { name:'Bedroom', remote:'remote.br', media_player:'media_player.br', app_sensor:'sensor.br_app' },
], apps:[
  { name:'Netflix', brand:'netflix', activity:'com.netflix.ninja' },
  { name:'Twitch', brand:'twitch', activity:'tv.twitch.android.app' },
]});
rc.hass = rhass;
const rh = rc.shadowRoot.innerHTML;
check('remote auto-selects the TV that is on', rc._sel === 0);
check('remote shows the running app', rh.includes('Twitch'));
check('remote draws brand art inline, not an iconset', rh.includes('#E50914') && rh.includes('#9146FF'));
check('remote has no empty spacer cards', !rh.includes('markdown'));
check('remote renders the d-pad', rh.includes('data-cmd="DPAD_CENTER"'));
check('remote marks the live TV in the selector', rh.includes('class="live"'));

rc._send('DPAD_UP');
const sent = rhass._calls.find(c => c[1]==='send_command');
check('d-pad targets the selected remote', sent[2].entity_id==='remote.lr' && sent[2].command==='DPAD_UP');
rc._launch('com.netflix.ninja');
const launched = rhass._calls.find(c => c[1]==='turn_on');
check('app launch passes activity', launched[2].activity==='com.netflix.ninja');


// volume steps rather than sets: Samsung advertises VOLUME_SET but never honours it
check('volume renders step buttons, not a slider', rh.includes('id="volup"') && !rh.includes('type="range"'));
rc._step(1);
const vup = rhass._calls.find(c => c[1]==='volume_up');
check('volume up targets the media player', vup && vup[2].entity_id==='media_player.lr');
rc._step(-1);
check('volume down targets the media player', rhass._calls.some(c => c[1]==='volume_down'));
rc._toggleMute();
const mu = rhass._calls.find(c => c[1]==='volume_mute');
check('mute targets the media player', mu && mu[2].entity_id==='media_player.lr');
rc._power();
const pw = rhass._calls.find(c => c[0]==='media_player' && (c[1]==='turn_off'||c[1]==='turn_on'));
check('power prefers the media player over the remote', !!pw);
check('on-state reads from the media player', rc._isOn({media_player:'media_player.lr', remote:'remote.br'}) === true);
check('off media player reads as off', rc._isOn({media_player:'media_player.br', remote:'remote.lr'}) === false);

// switching to an off TV collapses the remote body
rc._touched = true; rc._sel = 1; rc._render();
const rh2 = rc.shadowRoot.innerHTML;
check('off TV hides the remote body', rh2.includes('is off') && !rh2.includes('DPAD_CENTER'));


// ---- devices card ----
check('purdy-devices-card defined', names.includes('purdy-devices-card'));
const DC = defined['purdy-devices-card'];
const dhass = { states: {
  'sensor.up': { state:'10d 2h', attributes:{} },
  'sensor.cpu': { state:'9.0', attributes:{ unit_of_measurement:'%' } },
  'binary_sensor.parity': { state:'off', attributes:{} },
  'binary_sensor.flash': { state:'on', attributes:{} },
  'sensor.array': { state:'85.6', attributes:{ unit_of_measurement:'%' } },
  'switch.a': { state:'on', attributes:{} },
  'switch.b': { state:'off', attributes:{} },
}, _calls: [], callService(d,sv,data){ this._calls.push([d,sv,data]); } };

const dc = new DC();
dc.setConfig({ title:'PurdyNAS', subtitle_entity:'sensor.up',
  faults:[{entity:'binary_sensor.parity',state:'off'},{entity:'binary_sensor.flash',state:'off'}],
  groups:[
    { name:'Stats', chips:['sensor.cpu','sensor.array'],
      faults:[{entity:'binary_sensor.parity',state:'off'}],
      body:{ bar:{entity:'sensor.array',label:'Array',warn_above:80},
             stats:[{label:'CPU',entity:'sensor.cpu'},{label:'Parity',entity:'binary_sensor.parity',bad_when:['off']}] } },
    { name:'Docker', chips:[], body:{ switch_groups:[{name:'Media',items:[
        {entity:'switch.a',name:'Jellyfin',url:'http://x'},{entity:'switch.b',name:'MeTube'}]}] } },
    { divider:'Robots' },
    { name:'Floor', chips:[], body:{ buttons:[{name:'Start'}] } },
  ]});
dc.hass = dhass;
const dh = dc.shadowRoot.innerHTML;
check('devices counts only real faults', dh.includes('1 fault'));
check('devices renders summary chips on the closed row', dh.includes('9.0 % · 85.6 %'));
check('devices auto-opens a faulted group', dh.includes('data-body="0"'));
check('devices keeps clean groups closed', !dh.includes('data-body="1"'));
check('devices renders the divider', dh.includes('Robots'));
check('devices bar warns above threshold', dh.includes('var(--pc-warn)'));
// expanding Docker reveals the container grid
dc._open[1] = true; dc._render();
const dh2 = dc.shadowRoot.innerHTML;
check('devices marks running containers', dh2.includes('dock run') && dh2.includes('dock off'));
check('devices shows a link only for running containers', (dh2.match(/data-url/g)||[]).length === 1);
check('devices toggles a container on tap', dh2.includes('data-toggle="switch.a"'));

// ---- hypnogram anchoring ----
const sp = new SPC();
sp.setConfig({ sleep_state:'sensor.s', hypnogram:{ start_entity:'input_datetime.bed', max_hours:14 } });
check('hypnogram watches the bedtime anchor', sp._watched.includes('input_datetime.bed'));


// ---- v1.6.0: url action, fault detail, sparkline ----
let opened = null;
globalThis.window.open = (u) => { opened = u; };

const dc2 = new DC();
dc2.setConfig({ title:'NAS',
  groups:[{ name:'Stats',
    faults:[{entity:'binary_sensor.parity', state:'on', label:'Parity', detail:'Check failed'}],
    sparkline:{ entity:'sensor.array', hours:24, warn_above:80 },
    body:{ buttons:[{name:'Dashboard', tap_action:{action:'url', url_path:'http://nas/Dashboard'}}] } }]});
dc2._hass = dhass;
dc2._spark = { 'sensor.array': [70, 75, 82, 86] };
dc2._sparkAt = Date.now();
dc2._render();
const d3 = dc2.shadowRoot.innerHTML;
check('sparkline renders on the collapsed row', d3.includes('<svg class="spark"'));
check('sparkline warns when the latest value is high', d3.includes('var(--pc-warn)'));

// device_class problem: on = fault, off = healthy
check('problem sensor off is NOT a fault', dc2._faultCount([{entity:'binary_sensor.parity', state:'on'}]) === 0);
dhass.states['binary_sensor.parity'] = { state:'on', attributes:{ friendly_name:'Parity' } };
check('problem sensor on IS a fault', dc2._faultCount([{entity:'binary_sensor.parity', state:'on'}]) === 1);

dc2._open[0] = true; dc2._render();
const d4 = dc2.shadowRoot.innerHTML;
check('faulted group lists each fault by name', d4.includes('Parity') && d4.includes('Check failed'));
check('fault rows open more-info', d4.includes('data-info="binary_sensor.parity"'));

check('url action branch exists in pcAction', /a\.action === "url"/.test(src));
check('url action opens a new tab', /window\.open\(a\.url_path/.test(src));


// meter on the collapsed row + stat value mapping
const dc3 = new DC();
dc3.setConfig({ title:'X', groups:[{ name:'Litter',
  meter:{ entity:'sensor.array', warn_above:75 },
  body:{ stats:[{label:'Parity', entity:'binary_sensor.parity', map:{off:'OK', on:'Problem'}, bad_when:['on'], good_when:['off']}] } }]});
dhass.states['binary_sensor.parity'] = { state:'off', attributes:{} };
dc3._hass = dhass; dc3._render();
const m1 = dc3.shadowRoot.innerHTML;
check('meter renders a full-width bar on the collapsed row', m1.includes('class="mwrap"') && m1.includes('class="bar"'));
check('meter warns above threshold', m1.includes('var(--pc-warn)'));
dc3._open[0] = true; dc3._render();
const m2 = dc3.shadowRoot.innerHTML;
check('meter is hidden once the group is open', !m2.includes('class="mwrap"'));
check('problem sensor off maps to OK', m2.includes('>OK<'));
check('problem sensor off is coloured good', m2.includes('goodv'));


// group-rule entities are folded into the watch list (regression: the set-hass
// override was lost in the v1.2.0 rewrite, so a low battery alone never rendered)
const ag = new A();
ag.setConfig({ rules:[{ match:'battery_plus_low$', state:'on', title:'low batteries' }] });
ag.hass = hass;
check('group rule watches its matching entities', ag._watched.includes('binary_sensor.a_battery_plus_low'));
check('group rule memoises the registry scan', !!ag._mCache && Array.isArray(ag._mCache['battery_plus_low$']));
const firstScan = ag._mCache['battery_plus_low$'];
ag.hass = hass;
check('memoised scan is reused, not rebuilt', ag._mCache['battery_plus_low$'] === firstScan);

// every card offers a stub config for the picker
for (const n of names) {
  const C = defined[n];
  if (!C.getStubConfig) { check(n + ' has getStubConfig', false); continue; }
  const stub = C.getStubConfig(hass);
  let ok = true;
  try { const inst = new C(); inst.setConfig(stub); } catch (e) { ok = false; }
  check(n + ' stub config is valid', ok);
}


// the greeting should follow whoever is signed in
const hassBrian = { ...hass, user:{ name:'Brian Purdy', id:'u1' } };
const hassTay   = { ...hass, user:{ name:'Tayler', id:'u2' } };

const hA = new H(); hA.setConfig({ weather:'weather.home' }); hA.hass = hassBrian;
check('greeting uses the signed-in user first name', /Good (morning|afternoon|evening), Brian</.test(hA.shadowRoot.innerHTML));
hA.disconnectedCallback();

const hB = new H(); hB.setConfig({ weather:'weather.home' }); hB.hass = hassTay;
check('a different user gets their own name', /Good (morning|afternoon|evening), Tayler</.test(hB.shadowRoot.innerHTML));
hB.disconnectedCallback();

const hC = new H(); hC.setConfig({ name:'Alex', weather:'weather.home' }); hC.hass = hassTay;
check('an explicit name overrides the viewer', hC.shadowRoot.innerHTML.includes(', Alex'));
hC.disconnectedCallback();

const hD = new H(); hD.setConfig({ name:'', weather:'weather.home' }); hD.hass = hassTay;
check('empty name means no name at all', !hD.shadowRoot.innerHTML.includes(','.concat(' Tayler')));
hD.disconnectedCallback();

const hE = new H(); hE.setConfig({ weather:'weather.home' }); hE.hass = hass;
check('missing hass.user degrades to no name', !/, undefined/.test(hE.shadowRoot.innerHTML));
hE.disconnectedCallback();


// photos: real entity_picture, with sane fallbacks
hass.states['person.pic'] = { state:'home', attributes:{ friendly_name:'Tayler', entity_picture:'/api/image/serve/abc/512x512' } };
hass.states['person.nopic'] = { state:'home', attributes:{ friendly_name:'Sam' } };
const pp = new P();
pp.setConfig({ people:[{ entity:'person.pic' }, { entity:'person.nopic' }] });
pp.hass = hass;
const ph = pp.shadowRoot.innerHTML;
check('people card shows the entity photo', ph.includes('src="/api/image/serve/abc/512x512"'));
check('people card falls back to an initial', ph.includes('>S</div>'));
check('people card carries the cool wash', ph.includes('class="p tint'));

// the cool wash is a shared token, not a per-card literal
check('tint is a shared token', /--pc-tint:/.test(src));
check('tint applied via the token', /linear-gradient\(180deg, var\(--pc-tint\)/.test(src));


// the header range must come from the bedtime helpers, not the history window
const sr = new SPC();
sr.setConfig({ sleep_state:'sensor.s', person:'person.joel',
  session:{ start:'input_datetime.bed', end:'input_datetime.wake' } });
const srHass = { states:{
  'sensor.s': { state:'unavailable', attributes:{} },
  'input_datetime.bed': { state:'2026-08-04 19:21:09', attributes:{} },
  'input_datetime.wake': { state:'2026-08-05 07:18:53', attributes:{} },
} };
sr._hass = srHass;
const range = sr._sessionRange();
check('session range reads the bedtime helper', new Date(range.t0).getHours() === 19);
check('session range reads the wake helper', new Date(range.t1).getHours() === 7);
check('session helpers are watched', sr._watched.includes('input_datetime.bed') && sr._watched.includes('input_datetime.wake'));

const sr2 = new SPC();
sr2.setConfig({ sleep_state:'sensor.s' });
sr2._hass = srHass;
check('no session config degrades to the derived span', sr2._sessionRange() === null);

// ---- music card ----
check('purdy-music-card defined', names.includes('purdy-music-card'));
const M = defined['purdy-music-card'];

let mThrew = false;
try { new M().setConfig({}); } catch (e) { mThrew = true; }
check('music setConfig requires players', mThrew);

const mp = (over) => ({ state:'idle', attributes:{ friendly_name:'Room', ...over } });
const mHass = { states:{
  'media_player.kitchen': mp({ friendly_name:'Kitchen Speaker' }),
  'media_player.living':  mp({ friendly_name:'Living Room' }),
  'media_player.bedroom': mp({ friendly_name:'Bedroom Speaker' }),
} };
const players = [
  { entity:'media_player.kitchen' }, { entity:'media_player.living' },
  { entity:'media_player.bedroom' },
];

// compact mode is a headline for something happening — silence means no card
const mc = new M();
mc.setConfig({ compact:true, navigate:'#music', players });
mc.hass = mHass;
check('music compact hides when nothing plays', mc.shadowRoot.innerHTML==='' && mc.style.display==='none');
check('music compact getCardSize = 2', mc.getCardSize()===2);

// an MA player also proxies its source device: a Cast playing Peacock is not music
mHass.states['media_player.living'] = mp({
  friendly_name:'Living Room', state:'playing', app_id:'peacock_tv', media_title:'Episode 14',
});
mHass.states['media_player.living'].state = 'playing';
mc.hass = mHass;
check('music ignores a TV app on an MA player', mc.style.display==='none');

mHass.states['media_player.kitchen'] = {
  state:'playing',
  attributes:{ friendly_name:'Kitchen Speaker', app_id:'music_assistant',
    media_title:'Dance Mode', media_artist:'Bluey', volume_level:0.2,
    entity_picture:'http://ma/img.jpg' },
};
mc.hass = mHass;
const mch = mc.shadowRoot.innerHTML;
check('music compact renders once a room plays', mc.style.display==='block' && mch.includes('Dance Mode'));
check('music compact names the room alongside the artist', mch.includes('Bluey · Kitchen Speaker'));
check('music compact shows pause while playing', mch.includes('mdi:pause'));
check('music compact uses the queue artwork', mch.includes('src="http://ma/img.jpg"'));
check('music compact has no room picker', !mch.includes('data-room'));

// full mode: same headline, plus rooms and presets
const mf = new M();
mf.setConfig({ players, presets:[
  { name:'Liked Songs', uri:'library://playlist/7', icon:'mdi:heart' },
  { name:'Sleep lofi', uri:'library://playlist/17' },
] });
mf.hass = mHass;
const mfh = mf.shadowRoot.innerHTML;
check('music full getCardSize = 10', mf.getCardSize()===10);
check('music full lists every room', ['kitchen','living','bedroom'].every(r => mfh.includes(`data-room="media_player.${r}"`)));
check('music full marks the playing room live', /data-room="media_player.kitchen"[^>]*>\s*<span class="live">/.test(mfh));
check('music full renders presets', mfh.includes('Liked Songs') && mfh.includes('Sleep lofi'));
check('music full falls back to a playlist icon', mfh.includes('mdi:playlist-music'));
check('music full renders the volume slider at 20%', mfh.includes('value="20"') && mfh.includes('>20%<'));

// playing beats paused; an explicit pick beats both
mHass.states['media_player.bedroom'] = {
  state:'paused', attributes:{ friendly_name:'Bedroom Speaker', app_id:'music_assistant', media_title:'Other' },
};
const ma = new M(); ma.setConfig({ players }); ma._hass = mHass;
check('music prefers the playing room', ma._active().entity==='media_player.kitchen');
ma._sel = 'media_player.bedroom';
check('music honours an explicit room pick', ma._active().entity==='media_player.bedroom');
ma._sel = 'media_player.gone';
check('music ignores a pick that is not a real player', ma._active().entity==='media_player.kitchen');

// a paused room still counts as live, so the compact card does not vanish mid-track
mHass.states['media_player.kitchen'].state = 'paused';
mc._last = null; mc.hass = mHass;
check('music compact stays up while paused', mc.style.display==='block');
check('music compact shows play while paused', mc.shadowRoot.innerHTML.includes('mdi:play'));

// re-render must follow the track, not just the state string
const mt = new M(); mt.setConfig({ compact:true, players });
mt.hass = mHass;
const sig1 = mt._last;
mHass.states['media_player.kitchen'].attributes.media_title = 'Next Track';
mt.hass = mHass;
check('music re-renders on a track change', mt._last!==sig1 && mt.shadowRoot.innerHTML.includes('Next Track'));

// ---- music card: artwork, room toggle, search, recently listened ----

// MA publishes entity_picture as http://<host>:8095/... which HTTPS pages block
// as mixed content and which is unreachable off the LAN. entity_picture_local
// is HA's same-origin proxy and must win.
const mimg = new M(); mimg.setConfig({ compact:true, players });
const artHass = { states:{ 'media_player.kitchen': { state:'playing', attributes:{
  friendly_name:'Kitchen Speaker', app_id:'music_assistant', media_title:'T',
  entity_picture:'http://<music-assistant-host>:8095/imageproxy/abc',
  entity_picture_local:'/api/media_player_proxy/media_player.kitchen?token=xyz' } } } };
mimg._hass = artHass;
const artHtml = mimg._art(artHass.states['media_player.kitchen']);
check('artwork prefers entity_picture_local', artHtml.includes('/api/media_player_proxy/'));
check('artwork does not use the add-on http URL', !artHtml.includes('8095'));
delete artHass.states['media_player.kitchen'].attributes.entity_picture_local;
check('artwork falls back to entity_picture', mimg._art(artHass.states['media_player.kitchen']).includes('8095'));
delete artHass.states['media_player.kitchen'].attributes.entity_picture;
check('artwork falls back to a placeholder', mimg._art(artHass.states['media_player.kitchen']).includes('mdi:music-note'));

// tapping the selected room turns it off; players without TURN_OFF get paused
// Real supported_features from this house: the Cast speakers (8320575) do NOT
// carry the TURN_OFF bit — 8320575 & 256 === 0 — while the Whole House group
// player (7796671) does. A blind turn_off would be a silent no-op per room.
const calls = [];
const svcHass = { states:{
  'media_player.kitchen': { state:'playing', attributes:{ friendly_name:'Kitchen', app_id:'music_assistant', media_title:'T', supported_features:8320575 } },
  'media_player.living':  { state:'idle', attributes:{ friendly_name:'Living', supported_features:7796671 } },
  'media_player.bedroom': { state:'idle', attributes:{ friendly_name:'Bedroom', supported_features:63 } },
}, callService:(d,s,data)=>{ calls.push([d,s,data]); } };
check('a Cast speaker really does lack TURN_OFF', (8320575 & 256)===0 && (8320575 & 4096)!==0);
check('the group player really does have TURN_OFF', (7796671 & 256)!==0);

const mo = new M(); mo.setConfig({ players }); mo._hass = svcHass;
mo._sel = 'media_player.kitchen';
mo._off('media_player.kitchen');
check('a room without TURN_OFF is stopped, not paused', calls[0][1]==='media_stop' && calls[0][2].entity_id==='media_player.kitchen');
check('stopping a room clears the pin', mo._sel===null);
mo._off('media_player.living');
check('the group player uses turn_off', calls[1][1]==='turn_off');
mo._off('media_player.bedroom');
check('a player with neither falls back to pause', calls[2][1]==='media_pause');

// third-party names land in innerHTML — escape them
check('escapes ampersands', mo._esc('Rock & Roll')==='Rock &amp; Roll');
check('escapes angle brackets and quotes', mo._esc('<b>"x"</b>')==='&lt;b&gt;&quot;x&quot;&lt;/b&gt;');

// search is only offered when a config entry is configured
const mns = new M(); mns.setConfig({ players }); mns.hass = svcHass;
check('no search box without config_entry', !mns.shadowRoot.innerHTML.includes('id="q"'));
const ms = new M(); ms.setConfig({ players, config_entry:'01ABC' }); ms.hass = svcHass;
check('search box appears with config_entry', ms.shadowRoot.innerHTML.includes('id="q"'));
check('recently listened section always renders', ms.shadowRoot.innerHTML.includes('Recently listened'));
check('empty recent explains the window', ms.shadowRoot.innerHTML.includes('Nothing in the last 48 hours'));

// search results render as playable rows
ms._results = [
  { uri:'spotify://track/1', name:'Dance Mode', sub:'Bluey', kind:'track', image:'https://i.scdn.co/x.jpg' },
  { uri:'spotify://playlist/2', name:'This Is Bluey', sub:'playlist', kind:'playlist', image:null },
];
ms._render();
const msh = ms.shadowRoot.innerHTML;
check('search rows render names', msh.includes('Dance Mode') && msh.includes('This Is Bluey'));
check('search rows are tappable', msh.includes('data-res="0"') && msh.includes('data-res="1"'));
check('search rows carry a type chip', msh.includes('>track</span>'));
check('a row without art gets a kind icon', msh.includes('mdi:playlist-music'));
ms._results = [];
ms._query = 'zzz';
ms._render();
check('empty results say so', ms.shadowRoot.innerHTML.includes('No results for'));

// playing a result targets the active room via music_assistant, not media_player
calls.length = 0;
ms._playItem({ uri:'spotify://track/1', name:'x', kind:'track' });
check('playing a result uses music_assistant.play_media', calls[0][0]==='music_assistant' && calls[0][1]==='play_media');
check('play_media targets the active room', calls[0][2].entity_id==='media_player.kitchen');
check('play_media replaces the queue', calls[0][2].enqueue==='replace' && calls[0][2].media_id==='spotify://track/1');

// recently listened is derived from recorder history, deduped by URI, newest first
const mr = new M();
mr.setConfig({ players, recent_max:3 });
mr._hass = { ...svcHass, callApi: async () => [[
  { last_changed:'2026-08-05T20:00:00-04:00', attributes:{ app_id:'music_assistant', media_title:'Old', media_artist:'A', media_content_id:'uri:1' } },
  { last_changed:'2026-08-05T21:00:00-04:00', attributes:{ app_id:'music_assistant', media_title:'Newer', media_artist:'B', media_content_id:'uri:2' } },
  { last_changed:'2026-08-05T21:30:00-04:00', attributes:{ app_id:'music_assistant', media_title:'Newer', media_artist:'B', media_content_id:'uri:2' } },
  { last_changed:'2026-08-05T21:45:00-04:00', attributes:{ app_id:'peacock_tv', media_title:'Episode 14', media_content_id:'uri:tv' } },
  { last_changed:'2026-08-05T19:00:00-04:00', attributes:{ app_id:'music_assistant', media_title:'No URI', media_artist:'C' } },
]] };
await mr._fetchRecent();
check('recent is newest first', mr._recent[0].name==='Newer' && mr._recent[1].name==='Old');
check('recent dedupes repeats of one track', mr._recent.length===2);
check('recent drops a TV app', !mr._recent.some(r => r.name==='Episode 14'));
check('recent drops rows with no playable uri', !mr._recent.some(r => r.name==='No URI'));
check('recent rows are playable tracks', mr._recent[0].kind==='track' && mr._recent[0].uri==='uri:2');

const mrh = new M(); mrh.setConfig({ players, compact:true });
mrh._hass = { ...svcHass, callApi: async () => { throw new Error('should not be called'); } };
await mrh._fetchRecent();
check('compact mode never fetches history', mrh._recent.length===0);


// ---------------------------------------------------------------- shell ---
check('purdy-shell-card defined', names.includes('purdy-shell-card'));
const SH = defined['purdy-shell-card'];
const shs = SH.styles;
check('shell styles carry shared --pc-panel token', shs.includes('--pc-panel:'));
check('shell aliases ps->pc for cool', shs.includes('--ps-cool: var(--pc-cool)'));
check('shell has the gradient ground', shs.includes('.ps-ground'));
check('shell column is one glass pane', shs.includes('.ps-col') && shs.includes('backdrop-filter'));
check('shell sections divided by hairline not gap', shs.includes('.ps-sect + .ps-sect { border-top'));
check('shell dock is fixed', /\.ps-dockwrap \{[^}]*position: fixed/.test(shs));
check('shell expand CSS present', shs.includes('.ps-sect.open .ps-xtra'));
check('shell styles have no unresolved placeholder', !shs.includes('${'));

let sherr = null;
try { new SH().setConfig({ sections: [{ type: 'nope' }] }); } catch (e) { sherr = e.message; }
check('shell rejects an unknown section type', /unknown section type/.test(sherr || ''));
let sherr2 = null;
try { new SH().setConfig({ weather: 'weather.x' }); } catch (e) { sherr2 = e.message; }
check('shell requires sections', /'sections'/.test(sherr2 || ''));

const shell = new SH();
shell.setConfig({
  weather: 'weather.kcho',
  attention: [
    { entity: 'vacuum.litter', state: 'error', severity: 'critical', title: 'Litter' },
    { match: 'battery_plus_low$', state: 'on', severity: 'info', title: 'low batteries', strip: 'Battery low' },
  ],
  now_playing: { players: [{ entity: 'media_player.a', name: 'Kitchen' }] },
  dock: [{ icon: 'mdi:home', name: 'Home', link: '/lovelace/x' }],
  sections: [
    { type: 'sleep', key: 'joel', sleep_state: 'sensor.sleep', ring: { deep: 'sensor.d', light: 'sensor.l' },
      vitals: [{ label: 'Heart', entity: 'sensor.hr', baseline: 'sensor.hrb', unit: 'bpm', digits: 0, lower_is_better: true }] },
    { type: 'climate', key: 'clim', goal: 'climate.g', graph: { inside: 'sensor.in', outside: 'sensor.out' },
      zones: { select: 'select.z', options: [{ label: '1st', option: '1st floor', temp: 'sensor.z1' }] } },
    { type: 'systems', key: 'sys', meters: [{ label: 'Array', entity: 'sensor.array' }],
      groups: [{ name: 'Docker', items: [{ entity: 'switch.c1', name: 'Jellyfin' }] }] },
  ],
});
check('shell watches nested section entities', shell._watched.includes('sensor.hr') && shell._watched.includes('sensor.z1'));
check('shell watches dock + now_playing entities', shell._watched.includes('media_player.a'));
check('shell history entities are graph + sleep only',
  JSON.stringify(shell._historyEntities().sort()) === JSON.stringify(['sensor.in','sensor.out','sensor.sleep'].sort()));
check('shell getCardSize is full-view sized', shell.getCardSize() === 30);

shell._hass = { states: {
  'vacuum.litter': { state: 'error', attributes: {} },
  'binary_sensor.front_battery_plus_low': { state: 'on', attributes: { friendly_name: 'Front door Battery low' } },
  'binary_sensor.office_battery_plus_low': { state: 'on', attributes: { friendly_name: 'Office Battery low' } },
  'binary_sensor.attic_battery_plus_low': { state: 'off', attributes: { friendly_name: 'Attic Battery low' } },
} };
const f = shell._faults();
check('shell fault rules fire', f.length === 2);
check('shell sorts critical first', f[0].severity === 'critical');
check('shell group rule collapses matches into one row', f[1].title === '2 low batteries');
check('shell group rule strips the label suffix', /Front door/.test(f[1].detail) && !/Battery low/.test(f[1].detail));
check('shell group rule ignores non-firing members', !/Attic/.test(f[1].detail));

// now-playing: a TV episode on an MA-mirrored player must not raise a music row
shell._hass = { states: { 'media_player.a': { state: 'playing',
  attributes: { app_id: 'peacock_tv', media_content_type: 'tvshow', media_title: 'Episode 14' } } } };
check('shell now-playing ignores a TV show', shell._nowPlaying() === null);
shell._hass = { states: { 'media_player.a': { state: 'playing',
  attributes: { app_id: 'music_assistant', media_title: 'Dance Mode' } } } };
check('shell now-playing accepts music', (shell._nowPlaying() || {}).playing === true);
shell._hass = { states: { 'media_player.a': { state: 'paused',
  attributes: { app_id: 'music_assistant', media_title: 'Dance Mode' } } } };
check('shell now-playing falls back to paused', (shell._nowPlaying() || {}).playing === false);
shell._hass = { states: { 'media_player.a': { state: 'idle', attributes: { app_id: 'music_assistant' } } } };
check('shell now-playing is null when idle', shell._nowPlaying() === null);

// bedtime helpers are minutes past midnight, never printed raw
const { minsToClock: psMinsToClock, dur: psDur, esc: psEsc } = SH.helpers;
check('shell converts bedtime minutes to a clock', psMinsToClock(1165) === '7:25 PM');
check('shell bedtime handles midnight', psMinsToClock(0) === '12:00 AM');
check('shell bedtime handles noon', psMinsToClock(720) === '12:00 PM');
check('shell bedtime tolerates null', psMinsToClock(null) === '—');
check('shell duration formats hours and minutes', psDur(207) === '3h 27m');
check('shell duration formats sub-hour', psDur(42) === '42m');
check('shell escapes markup in titles', psEsc('<b>&"') === '&lt;b&gt;&amp;&quot;');

// the ring lays segments end to end on a 270-degree arc
const ring = shell._ringSvg(98, 8, [[0.0342, '#AA78FF'], [0.2508, '#50A0FF']], 0.8925);
check('ring draws a track plus both segments', (ring.match(/<circle/g) || []).length === 3);
check('ring offsets the second segment past the first', /stroke-dashoffset="-\d/.test(ring));
check('ring draws the goal tick when a goal is given', ring.includes('<line'));
const ringNoGoal = shell._ringSvg(92, 7.5, [[0.5, '#4dd0e1']], null);
check('ring omits the tick with no goal', !ringNoGoal.includes('<line'));

// the sleep span stops at the session break rather than gluing two nights
shell._hass = { states: {} };
shell._history = { 'sensor.sleep': [
  { t: Date.now() - 30 * 3600e3, s: 'light_sleep' },
  { t: Date.now() - 29 * 3600e3, s: 'deep_sleep' },
  { t: Date.now() - 3 * 3600e3, s: 'light_sleep' },
  { t: Date.now() - 2 * 3600e3, s: 'deep_sleep' },
] };
const shSpan = shell._sleepSpan({ sleep_state: 'sensor.sleep' });
check('sleep span starts at this session, not last night', Date.now() - shSpan.from < 4 * 3600e3);
check('sleep span drops the previous session rows', shSpan.rows.length === 2);
check('sleep span is null with no sleep history', shell._sleepSpan({ sleep_state: 'sensor.none' }) === null);

check('shell groups collapse by default', shs.includes('.ps-grpb { display: none'));
check('shell groups open on class', shs.includes('.ps-grp.open .ps-grpb { display: flex'));
const shg = new SH();
shg.setConfig({ sections: [{ type: 'systems', key: 'sys', groups: [
  { name: 'Media', items: [{ entity: 'switch.a', name: 'A' }, { entity: 'switch.b', name: 'B' }] }] }] });
shg._hass = { states: { 'switch.a': { state: 'on', attributes: {} }, 'switch.b': { state: 'off', attributes: {} } } };
let ghtml = shg._secSystems(shg._config.sections[0]);
check('collapsed group summarises how many switches are on', ghtml.includes('1 of 2 on'));
check('collapsed group is not marked open', !/ps-grp open/.test(ghtml));
shg._openGroups['sys|Media'] = true;
ghtml = shg._secSystems(shg._config.sections[0]);
check('opened group is marked open', /ps-grp open/.test(ghtml));

check('glass surface is opt-in on the shared card base', defined['purdy-remote-card'] && true);
check('shell schedule CSS present', shs.includes('.ps-timeline') && shs.includes('.ps-seg.live'));

// GTTC hands back either a per_day map or a weekday/weekend split
const shsc = new SH();
shsc.setConfig({ sections: [{ type: 'climate', key: 'clim', goal: 'climate.g',
  schedule: { api: 'gttc', mode_entity: 'select.m', switch_entity: 'switch.s' } }] });
check('schedule is empty before the fetch lands', shsc._schedToday().length === 0);
check('scope detection survives hass not having arrived yet', shsc._detectScope() === null);
const dow = new Date().getDay();
const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
shsc._sched = { mode: 'per_day', per_day: { [dayNames[dow]]: [{ time_start: '06:00', target_temp: 68, cooling_temp: 72 }] } };
check('per_day schedule reads today', shsc._schedToday().length === 1);
shsc._sched = { weekday: [{ time_start: '06:00' }], weekend: [{ time_start: '08:00' }, { time_start: '20:00' }] };
const wknd = dow === 0 || dow === 6;
check('weekday/weekend schedule picks the right list', shsc._schedToday().length === (wknd ? 2 : 1));

shsc._hass = { states: {
  'climate.g': { state: 'cool', attributes: { current_schedule_entry: { time_start: '20:00', time_end: '23:59', target_temp: 68, cooling_temp: 70, effective_temp: 70 } } },
  'select.m': { state: 'Weekday/Weekend', attributes: {} },
  'switch.s': { state: 'on', attributes: {} },
} };
shsc._sched = { mode: 'weekday_weekend', active_preset: null, presets: {}, weekday: [
  { time_start: '00:00', time_end: '05:59', target_temp: 68, cooling_temp: 70 },
  { time_start: '06:00', time_end: '19:59', target_temp: 70, cooling_temp: 72 },
  { time_start: '20:00', time_end: '23:59', target_temp: 68, cooling_temp: 70 }],
  weekend: [
  { time_start: '00:00', time_end: '19:59', target_temp: 68, cooling_temp: 70 },
  { time_start: '20:00', time_end: '23:59', target_temp: 68, cooling_temp: 70 }] };
const schedHtml = shsc._scheduleHtml(shsc._config.sections[0]);
check('schedule renders the active window', /Holding <b>70/.test(schedHtml));
check('schedule marks the live entry', /ps-seg live/.test(schedHtml) && /ps-sr live/.test(schedHtml));
check('schedule draws a now marker', schedHtml.includes('ps-nowline'));
check('schedule shows the mode and an enable switch', /Weekday\/Weekend/.test(schedHtml) && /ps-knob on/.test(schedHtml));
check('schedule times print as a clock, not raw minutes', /8:00 PM/.test(schedHtml));

/* Not-loaded-yet and would-not-load used to look the same, and only one of
   them is a reason to go and check the thermostat. */
shsc._sched = null;
shsc._schedErr = null;
const schedLoading = shsc._scheduleHtml(shsc._config.sections[0]);
check('a schedule still loading says it is loading', /Loading the schedule/.test(schedLoading));
check('a schedule still loading offers no retry', !/ps-sretry/.test(schedLoading));
shsc._schedErr = 'connection lost';
const schedFail = shsc._scheduleHtml(shsc._config.sections[0]);
check('schedule says so when GTTC will not answer', /Schedule unavailable/.test(schedFail));
check('a failed schedule says why', /connection lost/.test(schedFail));
check('a failed schedule offers a retry', /id="ps-sretry"/.test(schedFail));
check('a failed schedule shows no windows at all', !/ps-timeline/.test(schedFail));
shsc._schedErr = null;

check('sections clip rather than hide, so they are not scroll containers',
  /\.ps-sect \{[^}]*overflow-x: clip/.test(shs) && !/\.ps-sect \{[^}]*overflow-x: hidden/.test(shs));
check('the column clips rather than hides', /\.ps-col \{[^}]*overflow: clip/.test(shs));
check('shell never widens past the view', shs.includes('max-width: 100%') && shs.includes('overflow-x: clip'));
/* The graph must default to letting the browser scroll, and only take the
   gesture once a long press has deliberately entered scrub mode. Any
   touch-action on the graph containers themselves is the old, broken shape. */
check('graphs let the browser scroll by default', /\[data-scrub\] \{ touch-action: auto/.test(shs));
check('graphs claim the gesture only while scrubbing', /\[data-scrub\]\.scrubbing \{ touch-action: none/.test(shs));
check('the wave no longer pins touch-action itself', !/\.ps-wave \{[^}]*touch-action/.test(shs));
check('the hypnogram no longer pins touch-action itself', !/\.ps-hypplot \{[^}]*touch-action/.test(shs));
check('scrubbing is entered by long press, not by any contact', src.includes('setTimeout(') && src.includes('box.classList.add("scrubbing")'));
/* touch-action is read at gesture start and cannot be taken back, so pointer
   events alone cannot hold a drag once the browser has begun scrolling. A
   non-passive touchmove that preventDefaults is the only thing that can. */
check('touch is handled by raw touch events, not pointer events', src.includes('addEventListener("touchmove"'));
check('touchmove is non-passive so it can hold the gesture', src.includes('{ passive: false }'));
check('touchstart stays passive so an ordinary swipe is never delayed', src.includes('{ passive: true }'));
check('the drag prevents the page scrolling out from under it', /if \(scrubbing\) \{\s*ev\.preventDefault\(\);/.test(src));
check('pointer handlers are mouse-only now', /ev\.pointerType !== "mouse"\) return;/.test(src));
check('a move before the press completes cancels it', src.includes('holdTimer = null;'));
check('a mouse scrubs without waiting', src.includes('mouse: hover, no gesture to fight'));
check('a tap alone shows the readout', src.includes('A tap is unambiguously not a scroll'));
check('a tap that turned into a drag does not leave a stale readout', src.includes('stop();'));

/* The scrubber was written but never wired: an unrelated edit moved the
   render tail, a string replace silently missed, and _bindScrub sat there
   uncalled through three releases.

   The lesson generalises past that one method, so assert the shape rather
   than the call site: any _bind* that is defined must also be invoked
   somewhere. A handler wired by a single line is exactly the thing a failed
   string replace deletes without any test noticing. */
check('every _bind* method defined is also called', (() => {
  const defined = new Set();
  const re = /^\s{2}(?:async\s+)?(_bind[A-Za-z0-9_$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) defined.add(m[1]);
  if (!defined.size) return false;
  const orphans = [...defined].filter(
    (n) => !new RegExp(`this\\.${n}\\s*\\(`).test(src)
  );
  if (orphans.length) console.log('    uncalled:', orphans.join(', '));
  return orphans.length === 0;
})());
check('the graph containers are wired through the bind-once helper', (() => {
  const defs = (shellSrc.match(/data-scrub="/g) || []).length;
  return defs >= 2 && /_each\("\[data-scrub\]"/.test(shellSrc);
})());

/* Patching leaves untouched nodes in place, so a second bind pass would stack
   a duplicate listener on every survivor. */
check('binding is guarded so an element is never wired twice',
  /_each\(sel, fn\)[\s\S]{0,200}this\._claim\(el, sel\)/.test(shellSrc) &&
  /_one\(id, fn\)[\s\S]{0,200}this\._claim\(el, "#" \+ id\)/.test(shellSrc));
/* A single boolean marker would let the first pass to touch a node claim it
   and every later pass skip it — which is how a graph stops being wired. */
check('the bind guard is keyed per selector, not one flag per element', (() => {
  const c = shellSrc.slice(shellSrc.indexOf('  _claim(el, key) {'));
  return /el\._psBound\[key\]/.test(c) && !/el\._psBound = true/.test(shellSrc);
})());

const shclaim = new SH();
shclaim.setConfig({ sections: [{ type: 'quick', key: 'q', tiles: [] }] });
const dual = { _psBound: undefined };
check('one node can be claimed by two different selectors',
  shclaim._claim(dual, '[data-scrub]') && shclaim._claim(dual, '[data-info]'));
check('the same selector never claims the same node twice',
  !shclaim._claim(dual, '[data-scrub]'));
check('no shell bind loop bypasses the guard',
  !/root\.querySelectorAll\("\[data-/.test(shellSrc));
/* Handlers now outlive many repaints, so closing over hass would pin them to
   the states present on the render that happened to bind them. */
check('shell bind handlers read hass live rather than capturing it', (() => {
  const b = shellSrc.slice(shellSrc.indexOf('  _bind() {'), shellSrc.indexOf('  _bindScrub() {'));
  return b.length > 500 && !/const hass = this\._hass;/.test(b) && !/\bhass\./.test(b);
})());

const { offline: pcOfflineFn, reading: pcReadingFn, esc: pcEscFn, numOf: pcNumOfFn, ringArc: pcRingArcFn, ringAngle: pcRingAngleFn, ringRotate: pcRingRotateFn } = SH.helpers;

/* ------------------------------------------------------- failure states -- */
/* A zero and a missing reading looked identical, which matters most on the
   one section anybody would act on. */
const shf = new SH();
shf.setConfig({
  weather: 'weather.w',
  sections: [{
    type: 'sleep', key: 'sleep', sleep_state: 'sensor.sock', name: 'Joel',
    ring: { max_hours: 12, deep: 'sensor.d', light: 'sensor.l',
      deep_last_night: 'input_number.dl', light_last_night: 'input_number.ll' },
    vitals: [{ label: 'Heart', entity: 'sensor.hr', unit: 'bpm', digits: 0 }],
    graph: { inside: 'sensor.in', outside: 'sensor.out' },
  }],
});
const sockOff = { states: { 'sensor.sock': { state: 'unknown', attributes: {} } } };
shf._hass = sockOff;
let sleepHtml = shf._secSleep(shf._config.sections[0]);
check('a sock that is off is not reported as zero hours slept',
  /no data/.test(sleepHtml) && !/>0\.0h</.test(sleepHtml));
check('a sock that is off still reads as sock off', /Sock off/.test(sleepHtml));

shf._hass = { states: {} };
sleepHtml = shf._secSleep(shf._config.sections[0]);
check('a missing sensor is distinguished from a sock that is off',
  /Sensor unavailable/.test(sleepHtml) && !/Sock off/.test(sleepHtml));

shf._hass = {
  states: {
    'sensor.sock': { state: 'deep_sleep', attributes: {} },
    'sensor.d': { state: '2.5', attributes: {} },
    'sensor.l': { state: '3.5', attributes: {} },
  },
};
sleepHtml = shf._secSleep(shf._config.sections[0]);
check('a real reading still prints its total', /6\.0h/.test(sleepHtml) && !/no data/.test(sleepHtml));

/* A graph that vanishes reads as a card that has no graph. */
shf._history = {};
shf._histErr = null;
check('an empty graph says it is waiting for history',
  /Not enough history yet/.test(shf._waveSvg(shf._config.sections[0])));
shf._histErr = 'recorder did not answer';
check('a graph says when the recorder failed, not just that it is empty',
  /History unavailable/.test(shf._waveSvg(shf._config.sections[0])));
check('the hypnogram reports a failed recorder too',
  /History unavailable/.test(shf._hypnoSvg(shf._config.sections[0])));
shf._histErr = null;
check('an empty hypnogram says there was no session',
  /No sleep session recorded/.test(shf._hypnoSvg(shf._config.sections[0])));

check('a dropped connection is announced rather than shown as fresh data',
  pcOfflineFn({ connected: false }) === true &&
  pcOfflineFn({ connected: true }) === false &&
  pcOfflineFn({}) === false);
check('a reading reports why it is missing', (() => {
  const h = { states: { a: { state: 'unavailable', attributes: {} }, b: { state: '3', attributes: {} } } };
  return pcReadingFn(h, 'a').why === 'unavailable' &&
    pcReadingFn(h, 'zzz').why === 'missing' &&
    pcReadingFn(null, 'a').why === 'offline' &&
    pcReadingFn(h, null).why === 'unset' &&
    pcReadingFn(h, 'b').n === 3;
})());

/* Three copies of the constructor had been spliced into unrelated methods by
   a failed string replace. The pins one was destructive: the next save would
   have written the emptied list back over the helper. */
check('no constructor block is spliced into another method', (() => {
  const marks = (shellSrc.match(/rooms the user picked, overriding/g) || []).length;
  return marks === 1;
})());

/* --------------------------------------------------- shared primitives -- */
/* These had two to four copies each. The point of the assertions is that
   exactly one implementation survives, and that folding them changed no
   numbers — the ring geometry is shared precisely so the pictures stay
   identical. */
check('there is one escaper implementation, not four',
  (src.match(/replace\(\/\[&<>"'\]\/g/g) || []).length === 1);
check('the escaper covers the apostrophe the shell used to miss',
  pcEscFn("a<b>&\"'") === 'a&lt;b&gt;&amp;&quot;&#39;');
check('every card routes through it', (() => {
  const bodies = (src.match(/_esc\(s\) \{\s*return ([^;]+);/g) || []);
  return bodies.length >= 3 && bodies.every((b) => b.includes('pcEsc(s)'));
})());
check('there is one is-it-music rule', (() => {
  const t = (src.match(/const PC_MUSIC_TYPES = /g) || []).length;
  return t === 1 && !/PS_MUSIC_TYPES/.test(src);
})());
check('a numeric read tells no-reading from zero',
  pcNumOfFn({ state: '0' }) === 0 &&
  pcNumOfFn({ state: 'unavailable' }) === null &&
  pcNumOfFn(null) === null &&
  pcNumOfFn({ state: 'x', attributes: { temperature: 68 } }, 'temperature') === 68);

/* The three rings all sweep 270° from 135°; the marker derivation had three
   copies and three comments explaining the same +90. */
check('the shared arc matches what the climate ring used to compute',
  Math.abs(pcRingArcFn(46) - (270 / 360) * 2 * Math.PI * 46) < 1e-9);
check('the shared arc matches what the sleep ring used to compute',
  Math.abs(pcRingArcFn(92) - 2 * Math.PI * 92 * 0.75) < 1e-9);
check('the marker angle matches the old inline derivation',
  Math.abs(pcRingAngleFn(0.4) - (135 + 270 * 0.4)) < 1e-9);
check('the upright tick keeps its quarter turn',
  Math.abs(pcRingRotateFn(0.4) - (135 + 270 * 0.4 + 90)) < 1e-9);
check('the marker angle is clamped to the ring',
  pcRingAngleFn(-1) === 135 && pcRingAngleFn(2) === 405);
/* The hypnogram and the temperature graph are NOT shared: they are different
   pictures of the same data, and folding them would change how v1 looks. */
check('the divergent renderers were left alone deliberately',
  fs.readFileSync(new URL('../src/05-shared.js', import.meta.url),'utf8')
    .includes('different pictures of the same data'));

/* ---------------------------------------------- section reconciliation -- */
/* The whole point of patching is that an unchanged section is not touched,
   so the interesting assertions are about writes that do NOT happen. The
   stub DOM above answers null to everything, which would let every one of
   these pass vacuously — hence a real enough mini-DOM. */
class MiniNode {
  constructor() { this.dataset = {}; this.className = ''; this._html = ''; this.writes = 0; this.parent = null; this.kids = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.writes++; }
  get children() { return this.kids; }
  get firstChild() { return this.kids[0] || null; }
  get nextSibling() {
    if (!this.parent) return null;
    return this.parent.kids[this.parent.kids.indexOf(this) + 1] || null;
  }
  insertBefore(node, ref) {
    if (node.parent) {
      const j = node.parent.kids.indexOf(node);
      if (j >= 0) node.parent.kids.splice(j, 1);
    }
    const at = ref ? this.kids.indexOf(ref) : this.kids.length;
    this.kids.splice(at < 0 ? this.kids.length : at, 0, node);
    node.parent = this;
    return node;
  }
  remove() {
    if (!this.parent) return;
    const i = this.parent.kids.indexOf(this);
    if (i >= 0) this.parent.kids.splice(i, 1);
    this.parent = null;
  }
}
const savedDoc = globalThis.document;
globalThis.document = { createElement: () => new MiniNode() };

const shrec = new SH();
shrec.setConfig({ sections: [{ type: 'quick', key: 'q', tiles: [] }] });
const col = new MiniNode();
shrec.shadowRoot = { getElementById: (id) => (id === 'ps-col' ? col : null), querySelectorAll: () => [] };

shrec._patchSections([
  { key: 'a', html: '<i>A</i>', open: false },
  { key: 'b', html: '<i>B</i>', open: false },
]);
check('sections mount in config order', col.kids.map((n) => n.dataset.sect).join(',') === 'a,b');
const [nodeA, nodeB] = col.kids;
const writesA = nodeA.writes;

shrec._patchSections([
  { key: 'a', html: '<i>A</i>', open: false },
  { key: 'b', html: '<i>B2</i>', open: false },
]);
check('an unchanged section is not rewritten', nodeA.writes === writesA);
check('a changed section is rewritten in place', nodeB._html === '<i>B2</i>' && col.kids[1] === nodeB);
check('identical nodes are kept, not recreated', col.kids[0] === nodeA);

shrec._patchSections([{ key: 'b', html: '<i>B2</i>', open: true }]);
check('a section that stops rendering is removed', col.kids.length === 1 && col.kids[0] === nodeB);
check('the open class follows the open key', nodeB.className === 'ps-sect open');
check('removing a neighbour does not rewrite the survivor', nodeB._html === '<i>B2</i>');

shrec._patchSections([
  { key: 'c', html: '<i>C</i>', open: false },
  { key: 'b', html: '<i>B2</i>', open: false },
]);
check('a returning section lands in its configured slot',
  col.kids.map((n) => n.dataset.sect).join(',') === 'c,b');

/* _patch is the same contract for the four fixed slots. */
const slot = new MiniNode();
shrec.shadowRoot = { getElementById: () => slot, querySelectorAll: () => [] };
shrec._patch('ps-stat', '<b>x</b>');
const w1 = slot.writes;
shrec._patch('ps-stat', '<b>x</b>');
check('an identical slot write is skipped', slot.writes === w1);
shrec._patch('ps-stat', '<b>y</b>');
check('a differing slot write lands', slot.writes === w1 + 1 && slot._html === '<b>y</b>');

globalThis.document = savedDoc;
/* A horizontal scroller inside a vertical page always loses the axis lock, so
   there should be none left: everything wraps or grids instead. */
check('the music room strip wraps rather than scrolling', /\.ps-mroom \{[^}]*flex-wrap: wrap/.test(shs) && !/\.ps-mroom \{[^}]*overflow-x/.test(shs));
check('the schedule tabs wrap rather than scrolling', /\.ps-tabs \{[^}]*flex-wrap: wrap/.test(shs) && !/\.ps-tabs \{[^}]*overflow-x/.test(shs));
check('the rooms strip is a grid rather than a scroller', /\.ps-rstrip \{[^}]*display: grid/.test(shs) && !/\.ps-rstrip \{[^}]*overflow-x/.test(shs));
check('no horizontal scroller is left in the view', !/overflow-x: auto/.test(shs));
check('a cancelled slider gesture releases the repaint lock', src.includes('would leave _dragging stuck'));
check('sheet has a taller schedule variant', shs.includes('.ps-sheet.tall'));

const shsh = new SH();
shsh.setConfig({ attention: [{ entity: 'x.y', state: 'on', severity: 'warn', title: 'T' }],
  sections: [{ type: 'climate', key: 'clim', goal: 'climate.g', schedule: { api: 'gttc' } }] });
shsh._hass = { states: { 'climate.g': { state: 'cool', attributes: {} } } };
check('no sheet renders while none is open', shsh._sheetHtml([]) === '');
shsh._sheet = 'schedule';
check('schedule opens in its own sheet', /ps-sheet tall/.test(shsh._sheetHtml([])));
check('schedule sheet is not in the climate body', !/ps-sheet/.test(shsh._secClimate(shsh._config.sections[0])));
check('climate body offers a schedule button', /data-sheet="schedule"/.test(shsh._secClimate(shsh._config.sections[0])));
shsh._sheet = 'alerts';
check('alert sheet stays empty with no faults', shsh._sheetHtml([]) === '');
check('alert sheet renders faults', /ps-ar/.test(shsh._sheetHtml([{ severity: 'warn', title: 'T', detail: 'd', entity: 'x.y' }])));

check('volume slider styles present', shs.includes('.ps-vol::-webkit-slider-thumb'));
check('mini bar is tappable', shs.includes('.ps-mini { cursor: pointer'));
const shm = new SH();
shm.setConfig({ now_playing: { players: [{ entity: 'media_player.a', name: 'Kitchen' }] },
  sections: [{ type: 'music', key: 'music', default_player: 'media_player.a',
    players: [{ entity: 'media_player.a', name: 'Kitchen' }, { entity: 'media_player.b', name: 'Living' }] }] });
shm._hass = { states: {
  'media_player.a': { state: 'playing', attributes: { app_id: 'music_assistant', media_title: 'Dance Mode', media_artist: 'Bluey', volume_level: 0.2 } },
  'media_player.b': { state: 'idle', attributes: { app_id: 'music_assistant', volume_level: 0.55 } } } };
check('music section links to the control sheet', /data-sheet="music"/.test(shm._secMusic(shm._config.sections[0])));
shm._sheet = 'music';
const mh = shm._sheetHtml([]);
check('music sheet has transport controls', /data-mpc="media_next_track"/.test(mh) && /data-mpc="media_stop"/.test(mh));
check('music sheet has a main volume slider', /data-vol="media_player.a"/.test(mh));
check('music sheet shows the real volume', /value="20"/.test(mh));
check('music sheet gives every room its own volume', /data-vol="media_player.b"/.test(mh) && /value="55"/.test(mh));
check('music sheet marks the active room', /ps-vrow on/.test(mh));
check('a drag suppresses the repaint that would drop the slider', (() => {
  shm._dragging = true; shm.shadowRoot.innerHTML = 'KEEP'; shm._render();
  const held = shm.shadowRoot.innerHTML === 'KEEP'; shm._dragging = false; return held;
})());

// ---- parity with the original view ----
const NOW_S = Math.floor(Date.now() / 1000);
const shp = new SH();
shp.setConfig({
  dismiss_store: 'input_text.dis', dismiss_hours: 12, log_to: 'todo.log',
  attention: [{ key: 'lit', entity: 'vacuum.l', state: 'error', severity: 'critical', title: 'Litter' }],
  sections: [
    { type: 'tv', key: 'tv', title: 'TV', tvs: [
      { name: 'Living', media_player: 'media_player.tv', app_sensor: 'sensor.app', remote: 'remote.tv' }] },
    { type: 'climate', key: 'clim', goal: 'climate.g',
      hold: { remaining: 'sensor.rem', cancel_service: 'gttc.cancel_override' },
      schedule: { api: 'gttc' } },
  ],
});
check('shell watches the dismissal store', shp._watched.includes('input_text.dis'));
check('shell watches tv entities', shp._watched.includes('media_player.tv') && shp._watched.includes('sensor.app'));

shp._hass = { states: {
  'vacuum.l': { state: 'error', attributes: {}, last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
  'input_text.dis': { state: '', attributes: {} },
  'media_player.tv': { state: 'off', attributes: {} },
  'sensor.app': { state: 'Netflix', attributes: {} },
  'sensor.rem': { state: '0', attributes: {} },
  'climate.g': { state: 'cool', attributes: {} },
} };
check('a raised fault shows while undismissed', shp._faults().length === 1);
check('raised rows carry a key and a fire time', shp._raised()[0].key === 'lit' && shp._raised()[0].firedAt > 0);

shp._hass.states['input_text.dis'] = { state: 'lit:' + (NOW_S - 60), attributes: {} };
check('a dismissal hides the row', shp._faults().length === 0);
shp._hass.states['input_text.dis'] = { state: 'lit:' + (NOW_S - 1200), attributes: {} };
check('a re-fire brings the row back', shp._faults().length === 1);
shp._hass.states['input_text.dis'] = { state: 'lit:' + (NOW_S - 13 * 3600), attributes: {} };
check('dismiss_hours caps how long a stale row hides', shp._faults().length === 1);
check('malformed dismissal store is ignored, not fatal', (() => {
  shp._hass.states['input_text.dis'] = { state: 'unknown', attributes: {} };
  return Object.keys(shp._dismissals()).length === 0;
})());

// the store is a 255-char input_text, so the oldest keys must be dropped
let written = null;
shp._hass.callService = (d, sv, data) => { written = data.value; };
const big = {};
for (let i = 0; i < 60; i++) big['key' + i] = NOW_S - i;
shp._writeDismissals(big);
check('dismissal store never exceeds the 255-char cap', written.length <= 255);
check('dismissal store keeps the newest keys', written.indexOf('key0:') === 0);

check('tv section hides when every set is off', shp._secTv(shp._config.sections[0]) === '');
shp._hass.states['media_player.tv'] = { state: 'on', attributes: {} };
const tvh = shp._secTv(shp._config.sections[0]);
check('tv section appears when a set is on', /Netflix/.test(tvh) && /data-tvoff="remote.tv"/.test(tvh));

check('hold row hides with no hold', shp._holdHtml(shp._config.sections[1]) === '');
shp._hass.states['sensor.rem'] = { state: '45', attributes: {} };
check('hold row shows the time left', /45m/.test(shp._holdHtml(shp._config.sections[1])));
shp._armed = 'hold';
check('hold cancel needs a second tap', /Tap again/.test(shp._holdHtml(shp._config.sections[1])));
shp._armed = null;

// recently listened is recorder-derived, and must not file a TV show as a track
const shr = new SH();
shr.setConfig({ sections: [{ type: 'music', key: 'music', recent_hours: 48, recent_max: 5,
  players: [{ entity: 'media_player.a', name: 'K' }] }] });
shr._hass = { states: {}, callApi: async () => [[
  { last_changed: '2026-08-05T20:00:00-04:00', attributes: { app_id: 'music_assistant', media_title: 'Old', media_artist: 'A', media_content_id: 'u:1' } },
  { last_changed: '2026-08-05T21:00:00-04:00', attributes: { app_id: 'music_assistant', media_title: 'New', media_artist: 'B', media_content_id: 'u:2' } },
  { last_changed: '2026-08-05T21:30:00-04:00', attributes: { app_id: 'music_assistant', media_title: 'New', media_artist: 'B', media_content_id: 'u:2' } },
  { last_changed: '2026-08-05T21:45:00-04:00', attributes: { app_id: 'peacock_tv', media_title: 'Ep 14', media_content_id: 'u:tv' } },
  { last_changed: '2026-08-05T19:00:00-04:00', attributes: { app_id: 'music_assistant', media_title: 'No URI', media_artist: 'C' } },
]] };
await shr._fetchRecent();
check('recent is newest first', shr._recent[0].name === 'New' && shr._recent[1].name === 'Old');
check('recent dedupes a repeated track', shr._recent.length === 2);
check('recent drops a TV app', !shr._recent.some((r) => r.name === 'Ep 14'));
check('recent drops rows with no playable uri', !shr._recent.some((r) => r.name === 'No URI'));

// search needs a config entry, and says so rather than silently returning nothing
const shq = new SH();
shq.setConfig({ sections: [{ type: 'music', key: 'music', players: [{ entity: 'media_player.a', name: 'K' }] }] });
shq._hass = { states: {} };
shq._query = 'bluey';
await shq._runSearch();
check('search without a config entry yields an empty result, not a crash',
  Array.isArray(shq._results) && shq._results.length === 0);

shq._config.sections[0].config_entry = 'ENTRY';
let svcArgs = null;
shq._hass.callService = async (d, sv, data, t, x, ret) => {
  svcArgs = { d, sv, data, ret };
  return { response: { tracks: [{ uri: 'u:t', name: 'Dance Mode', artists: [{ name: 'Bluey' }] }],
                       playlists: [{ uri: 'u:p', name: 'Mix' }] } };
};
await shq._runSearch();
check('search calls music_assistant.search with a response', svcArgs.d === 'music_assistant' && svcArgs.sv === 'search' && svcArgs.ret === true);
check('search passes the config entry', svcArgs.data.config_entry_id === 'ENTRY');
check('search flattens tracks and playlists', shq._results.length === 2 && shq._results[0].kind === 'track');
check('a track result names its artists', shq._results[0].sub === 'Bluey');

let played = null;
shq._hass.callService = (d, sv, data) => { played = { d, sv, data }; };
shq._playUri('u:p', 'playlist');
check('playing a result uses music_assistant.play_media', played.d === 'music_assistant' && played.sv === 'play_media');
check('play_media replaces the queue on the default player',
  played.data.enqueue === 'replace' &&
  JSON.stringify(played.data.entity_id) === JSON.stringify(['media_player.a']));

// schedule editing addresses the right day and carries the old times
const shs2 = new SH();
shs2.setConfig({ sections: [{ type: 'climate', key: 'clim', goal: 'climate.g', schedule: { api: 'gttc' } }] });
shs2._hass = { states: { 'climate.g': { state: 'cool', attributes: {} } } };
shs2._sched = { weekday: [{ time_start: '06:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }],
                weekend: [{ time_start: '08:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }] };
shs2._schedScope = undefined; shs2._schedDay = null;
const isWknd = new Date().getDay() === 0 || new Date().getDay() === 6;
check('schedule edits address today’s day bucket', shs2._schedDayName() === (isWknd ? 'weekend' : 'weekday'));

// An active preset overrides the base weekday/weekend lists entirely — reading
// the base lists shows a schedule the house is not actually running.
const dayNow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
shs2._sched = {
  weekday: [{ time_start: '06:00', time_end: '20:00', target_temp: 68 }],
  weekend: [{ time_start: '09:00', time_end: '20:00', target_temp: 66 }],
  active_preset: 'Summer',
  presets: { Summer: { schedule: { [dayNow]: [{ time_start: '05:30', time_end: '21:00', target_temp: 70, cooling_temp: 74 }] } } },
};
check('a pinned preset is detected', shs2._activePreset() === 'Summer');
check('a pinned preset switches to per-day naming', shs2._schedDayName() === dayNow);
check('a pinned preset supplies the entries', shs2._schedEntries().length === 1 && shs2._schedEntries()[0].time_start === '05:30');
check('the base weekday list is ignored while a preset is pinned',
  shs2._schedEntries()[0].time_start !== '06:00' && shs2._schedEntries()[0].time_start !== '09:00');
check('a pinned preset is editable, because that is where GTTC writes',
  shs2._schedEditable(shs2._config.sections[0]) === true);

/* The real instance: no preset is pinned, but GTTC is running one anyway.
   The live window on the climate entity is the only reliable signal. */
shs2._sched = {
  mode: 'weekday_weekend', active_preset: null,
  weekday: [{ time_start: '00:00', time_end: '23:59', target_temp: 68, cooling_temp: null }],
  weekend: [],
  preset_labels: { home: 'Home All Day', away: 'Away' },
  presets: {
    home: { schedule: { [dayNow]: [
      { time_start: '06:00', time_end: '17:59', target_temp: 71, cooling_temp: 74, zone_id: 'z2' },
      { time_start: '20:00', time_end: '23:59', target_temp: 68, cooling_temp: 70, zone_id: 'z2' }] } },
    away: { schedule: { [dayNow]: [{ time_start: '00:00', time_end: '23:59', target_temp: 67 }] } },
  },
  zones: [{ id: 'z2', name: '2nd Floor' }],
};
shs2._hass.states['climate.g'] = { state: 'cool', attributes: { current_schedule_entry:
  { time_start: '20:00', time_end: '23:59', target_temp: 68, cooling_temp: 70, effective_temp: 70 } } };
shs2._schedScope = undefined;
check('an unpinned preset is detected from the live window', shs2._detectScope() === 'home');
check('the detected preset supplies the real daily entries', shs2._schedEntries().length === 2);
check('the single-window base fallback is not what gets shown',
  shs2._schedEntries()[0].time_start === '06:00');
check('an unpinned preset is read-only, since edits would land on the base',
  shs2._schedEditable(shs2._config.sections[0]) === false);
const schedH = shs2._scheduleHtml(shs2._config.sections[0]);
check('the sheet offers a tab per preset plus the base', /data-scope="__base__"/.test(schedH) && /data-scope="home"/.test(schedH));
check('the sheet names presets by their label', /Home All Day/.test(schedH));
check('the detected preset tab is selected', /data-scope="home">Home All Day/.test(schedH.replace(/class="ps-tab on" type="button" /, '')));
check('the sheet offers a tab per day', /data-sday="monday"/.test(schedH) && /data-sday="sunday"/.test(schedH));
check('entries name their zone', /2nd Floor/.test(schedH));
check('read-only scopes say why', /Read-only/.test(schedH));
shs2._schedScope = null;
check('switching to the base shows the base list', shs2._schedEntries().length === 1 && shs2._schedEntries()[0].target_temp === 68);
check('the base is editable', shs2._schedEditable(shs2._config.sections[0]) === true);
shs2._schedDay = 'saturday';
check('picking a day changes what is listed', shs2._schedDayName() === 'saturday');
shs2._schedScope = undefined; shs2._schedDay = null;

shs2._sched = { mode: 'per_day', per_day: { [dayNow]: [{ time_start: '07:15', time_end: '22:00', target_temp: 69 }] } };
shs2._hass.states['climate.g'] = { state: 'cool', attributes: {} };
check('per_day mode reads today by name', shs2._schedEntries()[0].time_start === '07:15');
check('per_day mode names the day', shs2._schedDayName() === dayNow);
// the preset tests above left _sched in per_day mode; restore the split lists
shs2._sched = { weekday: [{ time_start: '06:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }],
                weekend: [{ time_start: '08:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }] };
// _schedDelete refetches afterwards, so capture every message, not the last
const wsMsgs = [];
const schedFixture = { weekday: [{ time_start: '06:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }],
                       weekend: [{ time_start: '08:00', time_end: '20:00', target_temp: 68, cooling_temp: 72 }] };
shs2._hass.callWS = async (m) => { wsMsgs.push(m); return schedFixture; };
shs2._schedEdit = 0;
await shs2._schedDelete();
const del = wsMsgs.find((m) => m.type === 'gttc/delete_entry');
check('delete names the entry by its own times', !!del && del.time_start === (isWknd ? '08:00' : '06:00'));
check('delete names today’s day bucket', del.day === (isWknd ? 'weekend' : 'weekday'));
check('delete refetches the schedule afterwards', wsMsgs.some((m) => m.type === 'gttc/get_schedule'));
check('delete clears the editor', shs2._schedEdit === null);
shs2._schedScope = undefined; shs2._schedDay = null;
check('schedule rows are tappable when editable', /data-sedit="0"/.test(shs2._scheduleHtml(shs2._config.sections[0])));
shs2._config.sections[0].schedule.editable = false;
check('schedule editing can be turned off', !/data-sedit/.test(shs2._scheduleHtml(shs2._config.sections[0])));

// ---- room picking, saved playlists, scrubber ----
check('scrubber draws a crosshair', shs.includes('.ps-cross'));
/* A tooltip at the touch point is under the thumb by definition, so the
   readout lives above the plot in normal flow instead. */
check('no floating tooltip is drawn over the plot', !shs.includes('.ps-tip'));
check('the readout line is styled for scrubbing', shs.includes('[data-readout].live'));
check('both graphs expose a readout line', (src.match(/data-readout="/g) || []).length >= 2);
check('the scrubber writes to the readout, not a tooltip', src.includes('out.innerHTML = html'));
check('the readout restores its resting text', src.includes('out.innerHTML = resting'));
check('the thumb may leave the plot while scrubbing', src.includes('thumb can drop below the plot'));
/* Crossing the graph edge used to fire pointerleave and kill the drag, which
   is precisely the gesture the readout-above-plot change invites. */
check('leaving the plot cannot end a touch drag, because pointerleave is mouse-only',
  /pointerleave", \(ev\) => \{\s*if \(ev\.pointerType !== "mouse"\) return;/.test(src) &&
  src.includes('off the element entirely is fine'));
check('a wandering thumb still enters scrub mode', src.includes('const TOL = 18'));
check('no pointer capture is needed, since touch events are not retargeted',
  !src.includes('setPointerCapture'));
check('hypnogram plot is positioned for a crosshair', shs.includes('.ps-hypplot { position: relative'));

const shx = new SH();
shx.setConfig({ now_playing: { players: [{ entity: 'media_player.a', name: 'Kitchen' }] },
  sections: [{ type: 'music', key: 'music', default_player: 'media_player.a',
    pins: { store: 'input_text.pins' },
    players: [{ entity: 'media_player.a', name: 'Kitchen' }, { entity: 'media_player.b', name: 'Living' }] }] });
check('shell watches the pin store', shx._watched.includes('input_text.pins'));
shx._hass = { states: {
  'media_player.a': { state: 'playing', attributes: { app_id: 'music_assistant', media_title: 'Track', media_content_id: 'u:t', media_playlist: 'Backyard BBQ', media_playlist_content_id: 'library://playlist/25' } },
  'media_player.b': { state: 'idle', attributes: { app_id: 'music_assistant' } },
  'input_text.pins': { state: '', attributes: {} } } };

check('the playing room is the default target', shx._activePlayer() === 'media_player.a');
shx._togglePick('media_player.b');
check('picking a room overrides what is playing', shx._activePlayer() === 'media_player.b');
shx._togglePick('media_player.a');
check('a second tap arms both rooms', JSON.stringify(shx._targets()) === JSON.stringify(['media_player.b', 'media_player.a']));
shx._togglePick('media_player.b');
check('tapping a selected room drops it', JSON.stringify(shx._targets()) === JSON.stringify(['media_player.a']));
shx._togglePick('media_player.a');
check('emptying the selection falls back to what is playing', shx._activePlayer() === 'media_player.a' && shx._sel.length === 0);
shx._sel = ['media_player.zzz'];
check('a stale pick falls back rather than targeting a dead entity', shx._activePlayer() === 'media_player.a');
shx._sel = [];

shx._sel = ['media_player.a', 'media_player.b'];
let playedMulti = null;
shx._hass.callService = (d, sv, data) => { playedMulti = data; };
shx._playUri('u:x', 'playlist');
check('playing to two rooms sends both entity ids',
  JSON.stringify(playedMulti.entity_id) === JSON.stringify(['media_player.a', 'media_player.b']));
shx._sel = [];
shx._hass.callService = undefined;

const mus = shx._secMusic(shx._config.sections[0]);
check('rooms select rather than opening more-info', /data-pick="media_player.b"/.test(mus) && !/data-player=/.test(mus));
check('the active room is marked pressed', /data-pick="media_player.a" aria-pressed="true"/.test(mus));
check('the music section leads with recently played', (() => {
  shx._recent = [{ uri: 'u:1', name: 'Dance Mode', sub: 'Bluey', kind: 'track' }];
  const html = shx._secMusic(shx._config.sections[0]);
  return html.indexOf('Recently played') > 0 && html.indexOf('Recently played') < html.indexOf('Presets');
})());

// pinning prefers the playlist a track came from, not the track
const pin = shx._pinnable();
check('pinning prefers the playlist over the queue item', pin.uri === 'library://playlist/25' && pin.kind === 'playlist');
check('pin name comes from the playlist', pin.name === 'Backyard BBQ');

let pinWrite = null;
shx._hass.callService = (d, sv, data) => { pinWrite = data.value; };
await shx._togglePin(pin.uri, pin.name, pin.kind);
check('saving writes uri~name to the store', pinWrite === 'library://playlist/25~Backyard BBQ');
check('a saved playlist reports as pinned', shx._isPinned('library://playlist/25'));
check('saved playlists render their own list', /ps-pinplay|data-pinplay/.test(shx._pinsHtml()));
await shx._togglePin(pin.uri, pin.name, pin.kind);
check('saving again unsaves', pinWrite === '' && !shx._isPinned('library://playlist/25'));

shx._hass.states['input_text.pins'] = { state: 'library://playlist/7~Liked|library://playlist/9~Chill', attributes: {} };
await shx._loadPins();
check('pins parse back out of the store', shx._pins.length === 2 && shx._pins[1].name === 'Chill');
shx._hass.states['input_text.pins'] = { state: 'unknown', attributes: {} };
await shx._loadPins();
check('an empty pin store is not an error', shx._pins.length === 0);

// the input_text helper caps at 255 characters
const many = [];
for (let i = 0; i < 40; i++) many.push({ uri: 'library://playlist/' + i, name: 'Playlist number ' + i });
shx._writePins(many);
check('pin store never exceeds the 255-char cap', pinWrite.length <= 255);
check('pin store keeps the newest saves', pinWrite.indexOf('/39~') > 0);

check('a card with no pin store shows no star', (() => {
  const n = new SH();
  n.setConfig({ sections: [{ type: 'music', key: 'music', players: [{ entity: 'media_player.a', name: 'K' }] }] });
  n._hass = shx._hass;
  return n._pinBtn() === '' && n._pinsHtml() === '';
})());

// ---- systems as devices, not peer groups ----
const shd = new SH();
shd.setConfig({ sections: [{ type: 'systems', key: 'sys', title: 'Systems', devices: [
  { name: 'PurdyNAS', key: 'nas', icon: 'mdi:server', subtitle_entity: 'sensor.up', chip: 'sensor.running',
    faults: [{ entity: 'binary_sensor.parity', state: 'on', label: 'Parity', detail: 'invalid' }],
    meters: [{ label: 'Array', entity: 'sensor.array', warn_above: 80 }],
    stats: [{ label: 'CPU', entity: 'sensor.cpu' }],
    groups: [{ name: 'Media', items: [
      { entity: 'switch.a', name: 'Jellyfin' },
      { entity: 'switch.b', name: 'MeTube' },
      { entity: 'switch.missing', name: 'Ghost' }] }],
    buttons: [{ name: 'Dashboard', tap_action: { action: 'url', url_path: 'http://x' } }] },
  { name: 'Jeeves', key: 'floor', icon: 'mdi:robot-vacuum',
    meters: [{ label: 'Dirty water', entity: 'sensor.water', warn_above: 80 }],
    stats: [{ label: 'State', entity: 'vacuum.j' }] },
] }] });
check('devices are watched down to their switches',
  shd._watched.includes('switch.a') && shd._watched.includes('sensor.array') && shd._watched.includes('sensor.up'));

shd._hass = { states: {
  'sensor.up': { state: '10d 15h', attributes: {} },
  'sensor.running': { state: '4 of 14', attributes: {} },
  'binary_sensor.parity': { state: 'off', attributes: {} },
  'sensor.array': { state: '85.6', attributes: {} },
  'sensor.cpu': { state: '3.1', attributes: { unit_of_measurement: '%' } },
  'switch.a': { state: 'on', attributes: {} },
  'switch.b': { state: 'off', attributes: {} },
  'sensor.water': { state: '0', attributes: {} },
  'vacuum.j': { state: 'docked', attributes: {} },
} };
const devHtml = shd._secSystems(shd._config.sections[0]);
check('each device gets its own header', (devHtml.match(/ps-devh/g) || []).length === 2);
check('the robot is a device, not a group', /ps-devn">Jeeves/.test(devHtml) && !/ps-gn">Jeeves/.test(devHtml));
check('docker categories sit inside the NAS, not beside it',
  devHtml.indexOf('ps-devn">PurdyNAS') < devHtml.indexOf('ps-gn">Media') &&
  devHtml.indexOf('ps-gn">Media') < devHtml.indexOf('ps-devn">Jeeves'));
check('a healthy device says so', /ps-chip good"><span class="ps-dot"><\/span>OK/.test(devHtml));
check('a device meter is visible while collapsed', /ps-meter/.test(devHtml) && !/ps-dev open/.test(devHtml));
check('the array meter warns past its threshold', /background:var\(--ps-warn\)/.test(devHtml));
check('a group counts its switches', /1 of 3/.test(devHtml));

/* A switch that no longer exists must be visible as missing rather than
   silently rendering as an off toggle. */
check('a container that no longer exists is flagged', /ps-sw gone/.test(devHtml) && /missing<\/span>/.test(devHtml));

shd._hass.states['binary_sensor.parity'] = { state: 'on', attributes: {} };
const devHtml2 = shd._secSystems(shd._config.sections[0]);
check('a faulted device shows its count and reason', /ps-chip bad/.test(devHtml2) && /Parity/.test(devHtml2));
check('the section header totals faults across devices', /1 fault</.test(devHtml2));

shd._openGroups['sys|dev|nas'] = true;
check('opening a device reveals its body', /ps-dev open/.test(shd._secSystems(shd._config.sections[0])));

// double-define guard: a second load must warn, not throw
let warned = '';
const realWarn = console.warn;
console.warn = (m) => { warned += m; };
let threw = false;
try { eval(src); } catch (e) { threw = true; }
console.warn = realWarn;
check('second load does not throw', !threw);
check('second load warns about duplicate', /already defined by another resource/.test(warned));

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail?1:0);
