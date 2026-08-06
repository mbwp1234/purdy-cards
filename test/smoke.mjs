import fs from 'fs';
const src = fs.readFileSync(new URL('../purdy-cards.js', import.meta.url),'utf8');

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
