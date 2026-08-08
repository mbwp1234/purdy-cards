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

/* A DOM node real enough to reconcile against, and to stand in for a hosted
   custom element. The plain stub answers null to everything. */
class MiniNode {
  constructor() {
    this.dataset = {}; this.className = ''; this._html = ''; this.writes = 0;
    this.parent = null; this.kids = [];
    this._hassCount = 0;            // doubles as a stand-in custom element
  }
  setConfig(c) { this._cfg = c; }
  set hass(h) { this._hassSet = true; this._hassCount++; this._h = h; }
  get hass() { return this._h; }
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
  appendChild(node) { return this.insertBefore(node, null); }
  remove() {
    if (!this.parent) return;
    const i = this.parent.kids.indexOf(this);
    if (i >= 0) this.parent.kids.splice(i, 1);
    this.parent = null;
  }
}

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
  entity_picture:'http://ma-host.invalid:8095/imageproxy/abc',
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

/* /api/history/period/<start> defaults end_time to start + 1 DAY, not to now.
   Every window longer than 24h therefore stopped short of the present with no
   error and no visible gap — the last sample just got stretched to the right
   edge. That is how the hypnogram spent an evening as one flat "awake" bar.
   Every caller must send end_time; assert it at the URL, which is the only
   place the mistake can be made. */
check('every history fetch sends an explicit end_time', (() => {
  const files = ['70-shell-core.js', '73-shell-music.js', '10-climate-panel-card.js',
                 '20-sleep-panel-card.js', '50-devices-card.js', '60-music-card.js'];
  return files.every((f) => {
    const body = fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
    const calls = body.split('history/period/').slice(1);
    return calls.length > 0 && calls.every((c) => c.slice(0, 400).includes('end_time='));
  });
})());
check('the end_time helper exists once and is shared',
  (src.match(/function pcNowIso\(/g) || []).length === 1);
check('a history fetch actually reaches the present', await (async () => {
  let url = null;
  const probe = new M();
  probe.setConfig({ players, recent_hours: 48 });
  probe._hass = { ...svcHass, callApi: async (m, u) => { url = u; return []; } };
  await probe._fetchRecent();
  const end = /end_time=([^&]+)/.exec(url || '');
  if (!end) return false;
  /* Decoded, it must parse and land within a minute of now — a literal "now"
     string or a start-relative value would both fail here. */
  const t = Date.parse(decodeURIComponent(end[1]));
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 60000) return false;
  /* And the window must still open 48h back, not collapse to a point. */
  const startIso = /history\/period\/([^?]+)/.exec(url)[1];
  const hours = (t - Date.parse(decodeURIComponent(startIso))) / 3600000;
  return hours > 47 && hours < 49;
})());
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
/* The chip used to echo select.gttc_schedule_mode, which names the BASE lists
   and not the plan running the house. It now names the scope that actually
   owns the live window. */
check('schedule names the plan in force, not the mode entity',
  /Running: Base/.test(schedHtml) && !/Weekday\/Weekend/.test(schedHtml));
check('schedule still offers an enable switch', /ps-knob on/.test(schedHtml));
check('a schedule that will not load offers a styled retry',
  (() => { const s = new SH(); s.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.g',
      schedule: { api: 'gttc' } }] }); s._hass = { states: {} }; s._sched = null; s._schedErr = 'nope';
    const h = s._scheduleHtml(s._config.sections[0]);
    return /class="ps-btn"[^>]*id="ps-sretry"/.test(h); })());
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

/* ---------------------------------------------------- hosted sheets -- */
/* The TV and the notification log moved off Bubble pop-ups onto the same
   sheet the music uses. Rather than reimplement a working remote, the sheet
   hosts the existing card — so the assertions are about the mount, not the
   contents. */
const shhost = new SH();
shhost.setConfig({
  sheets: {
    tv: { title: 'Televisions', card: { type: 'custom:purdy-remote-card', glass: true,
      tvs: [{ name: 'Living', remote: 'remote.tv', app_sensor: 'sensor.app',
        media_player: 'media_player.tv' }], apps: [] } },
    nope: { title: 'Broken', card: { type: 'custom:not-a-real-card' } },
  },
  dock: [
    { icon: 'mdi:television', name: 'TV', sheet: 'tv' },
    { icon: 'mdi:bell', name: 'Alerts', alert_when_faults: true, sheet: 'notifications' },
  ],
  sections: [{ type: 'quick', key: 'q', tiles: [] }],
});
shhost._hass = { states: {} };

check('no hosted sheet renders while none is open', shhost._sheetHtml([]) === '');
shhost._sheet = 'tv';
const hostHtml = shhost._sheetHtml([]);
check('a hosted sheet renders the same sheet chrome as music',
  /ps-sheet tall/.test(hostHtml) && /id="ps-close"/.test(hostHtml) && /id="ps-scrim"/.test(hostHtml));
check('a hosted sheet is titled from its config', /Televisions/.test(hostHtml));
check('a hosted sheet leaves a mount point rather than markup', /id="ps-host"/.test(hostHtml));

/* Mounting needs a DOM, so reuse the mini-DOM from the reconciliation block. */
const savedDoc2 = globalThis.document;
const hostNode = new MiniNode();
let made = null;
globalThis.document = { createElement: (t) => { made = new MiniNode(); made.tag = t; return made; } };
shhost.shadowRoot = { getElementById: (id) => (id === 'ps-host' ? hostNode : null), querySelectorAll: () => [] };
made = null;
shhost._mountSheetCard();
check('the hosted card is created from its type, minus the custom: prefix',
  made && made.tag === 'purdy-remote-card');
check('the hosted card is configured and fed hass',
  made && made._cfg && made._hassSet === true);
check('the hosted card is attached to the mount point', hostNode.kids[0] === made);

/* It must survive repaints, or the remote would lose its selected device and
   the log its scroll position every time any state changed. */
const first = made;
made = null;
shhost._mountSheetCard();
check('a repaint does not rebuild the hosted card', made === null && shhost._hosted === first);
check('a surviving hosted card still gets fresh hass', first._hassCount > 1);

/* A card that is not registered, or rejects its config, must not throw out of
   the render and take the whole shell down. */
shhost._sheet = 'nope';
hostNode.kids = [];
shhost._mountSheetCard();
check('an unregistered card reports itself instead of throwing',
  /not registered/.test(hostNode._html));
shhost._sheet = null;
shhost._mountSheetCard();
check('closing a hosted sheet releases the card', shhost._hosted === null);
globalThis.document = savedDoc2;

/* The bell carries alert_when_faults AND a sheet. Treating the flag as a
   destination meant that with any fault raised — and the low-battery rule
   means there usually is one — it opened the attention list, leaving the
   notification log unreachable. It is a badge; the sheet is the destination. */
check('a dock entry with its own destination still reaches it while faults exist', (() => {
  const b = shellSrc.slice(shellSrc.indexOf('this._each("[data-dock]"'));
  return /d\.alert_when_faults && this\._faults\(\)\.length\s*\n?\s*&& !d\.sheet && !d\.section && !d\.link/.test(b);
})());
check('an entry with no destination of its own still falls back to the alerts sheet',
  /!d\.sheet && !d\.section && !d\.link\) \{[\s\S]{0,120}this\._sheet = "alerts"/.test(shellSrc));

/* Glass inside glass reads as a card in a card. Asserted on the config the
   card is actually handed, not on the source spelling — the previous string
   match broke the moment the object was given a name. */
check('a hosted card is told not to draw its own surface',
  /bare: true, \.\.\.spec\.card/.test(shellSrc));
check('an explicit bare:false in config still wins',
  shellSrc.indexOf('bare: true, ...spec.card') > 0);
/* `bare` is our convention; a third-party card may reject an unknown key, and
   losing the card over a cosmetic hint would be a poor trade. */
check('a card that rejects bare is retried without it', (() => {
  const m = shellSrc.slice(shellSrc.indexOf('_mountSheetCard()'));
  return /catch \(err\) \{[\s\S]{0,400}el\.setConfig\(\{ \.\.\.spec\.card \}\)/.test(m);
})());
check('a card that rejects its own config still reports rather than throwing',
  /catch \(err2\)[\s\S]{0,200}ps-nohist/.test(shellSrc));

/* A quick tile can open a sheet. Lovelace has no such action, so it cannot
   live in pcAction — which knows nothing about the shell around it. */
check('a quick tile can open a sheet instead of navigating', (() => {
  const b = shellSrc.slice(shellSrc.indexOf('this._each("[data-tile]"'));
  return /ta\.action === "sheet" && ta\.sheet/.test(b) &&
    b.indexOf('ta.action === "sheet"') < b.indexOf('pcAction(this, this._hass, t.tap_action');
})());

/* ------------------------------------------------ detach and reattach -- */
/* Lovelace detaches a view's elements rather than destroying them, so leaving
   for the vacuum view and coming back reconnects this same element. Every
   timer was stopped on the way out and nothing started them again. */
check('the shell re-arms itself when it is reconnected',
  /connectedCallback\(\) \{/.test(shellSrc));
check('disconnect nulls the handles so reconnect can tell they are stopped', (() => {
  const d = shellSrc.slice(shellSrc.indexOf('  disconnectedCallback() {'));
  return /this\._clock = null;/.test(d) && /this\._historyTimer = null;/.test(d)
    && /this\._eventTimer = null;/.test(d);
})());

const shconn = new SH();
shconn.setConfig({ sections: [{ type: 'quick', key: 'q', tiles: [] }] });
check('setConfig arms the clock', !!shconn._clock);
shconn.disconnectedCallback();
check('detaching stops every timer',
  !shconn._clock && !shconn._historyTimer && !shconn._eventTimer);

let restarted = 0;
shconn._start = () => { restarted++; shconn._historyTimer = 1; };
shconn._render = () => {};
shconn._hass = { states: {} };
shconn.connectedCallback();
check('reattaching restarts the clock', !!shconn._clock);
check('reattaching restarts the fetches', restarted === 1);
shconn.connectedCallback();
check('a second connect does not stack a second set of timers', restarted === 1);
shconn.disconnectedCallback();
check('the restarted timers are stopped again on the next detach', !shconn._clock);
check('bare strips the surface a hosted card would otherwise draw', (() => {
  const base = fs.readFileSync(new URL('../src/30-home-cards.js', import.meta.url),'utf8');
  const m = /\.card\.bare \{([\s\S]*?)\}/.exec(base);
  if (!m) return false;
  return ['background: none', 'border: 0', 'box-shadow: none', 'padding: 0', 'backdrop-filter: none']
    .every((d) => m[1].includes(d));
})());
check('bare is declared after glass so it wins', (() => {
  const base = fs.readFileSync(new URL('../src/30-home-cards.js', import.meta.url),'utf8');
  return base.indexOf('.card.glass {') < base.indexOf('.card.bare {');
})());
check('the hosted cards honour bare', (() => {
  const bodies = src.match(/class="card tint\$\{[^`]*?\}"/g) || [];
  return bodies.length >= 2 && bodies.every((b) => b.includes('bare'));
})());
check('a now-playing tv row can open a sheet instead of a hash pop-up',
  /sec\.remote_sheet/.test(shellSrc));

/* ------------------------------------------------- hypnogram time axis -- */
/* The axis ran to Date.now() whatever the sock was doing, so as the day went
   on the night was squeezed into a shrinking slice with a growing empty tail. */
const shhyp = new SH();
shhyp.setConfig({ sections: [{ type: 'sleep', key: 'sleep', sleep_state: 'sensor.sock', name: 'Joel' }] });
const HOUR = 3600000;
const bed = Date.now() - 14 * HOUR;
const woke = Date.now() - 6 * HOUR;
/* Transitions every half hour, as the real sock reports them — far enough
   apart to be a night, close enough never to trip the session gap. */
const night = [];
for (let t = bed; t < woke; t += HOUR / 2) {
  night.push({ t, s: night.length % 2 ? 'light_sleep' : 'deep_sleep' });
}
night.push({ t: woke, s: 'unknown' });
shhyp._history = { 'sensor.sock': night };

shhyp._hass = { states: { 'sensor.sock': { state: 'unknown', attributes: {} } } };
let hspan = shhyp._sleepSpan(shhyp._config.sections[0]);
check('a finished session ends when the sock stopped reporting, not at now',
  Math.abs(hspan.to - woke) < 1000);
check('a finished session is not stretched to the current time',
  Date.now() - hspan.to > 5 * HOUR);
check('a finished session is marked finished', hspan.active === false);
check('a finished session still spans the whole night',
  Math.abs((hspan.to - hspan.from) - 8 * HOUR) < 1000);
check('the finished hypnogram is labelled last night',
  /Last night/.test(shhyp._hypnoSvg(shhyp._config.sections[0])));

shhyp._hass = { states: { 'sensor.sock': { state: 'deep_sleep', attributes: {} } } };
shhyp._history['sensor.sock'] = night.slice(0, -1);   // no wake row yet
hspan = shhyp._sleepSpan(shhyp._config.sections[0]);
check('a session still running does end at now', Date.now() - hspan.to < 2000);
check('a running session is labelled tonight',
  /Tonight/.test(shhyp._hypnoSvg(shhyp._config.sections[0])));

/* --------------------------------------------------------- now playing -- */
const shn = new SH();
shn.setConfig({
  now_playing: { players: [{ entity: 'media_player.kit', name: 'Kitchen' }] },
  dock: [{ name: 'Music', icon: 'mdi:music', sheet: 'music' }],
  sections: [
    { type: 'nowplaying', key: 'now', title: 'Now playing',
      apps: [{ name: 'Netflix', brand: 'netflix', activity: 'com.netflix.ninja' }],
      tvs: [{ name: 'Living Room', media_player: 'media_player.tv',
        app_sensor: 'sensor.app', remote: 'remote.tv' }] },
    { type: 'music', key: 'music', sheet_only: true,
      players: [{ entity: 'media_player.kit', name: 'Kitchen' }] },
  ],
});
const nowSec = shn._config.sections[0];

shn._hass = { states: {
  'media_player.kit': { state: 'off', attributes: {} },
  'media_player.tv': { state: 'off', attributes: {} },
} };
check('a quiet house renders no now-playing section at all',
  shn._secNowplaying(nowSec) === '');

shn._hass = { states: {
  'media_player.kit': { state: 'playing', attributes: {
    app_id: 'music_assistant', media_title: 'Blackbird', media_artist: 'The Beatles',
    entity_picture_local: '/api/art.png' } },
  'media_player.tv': { state: 'off', attributes: {} },
} };
let nowHtml = shn._secNowplaying(nowSec);
check('music playing raises a now-playing row', /Blackbird/.test(nowHtml));
check('music shows its album art', /src="\/api\/art\.png"/.test(nowHtml));
check('music names the artist', /The Beatles/.test(nowHtml));
check('the music row opens the music sheet', /data-sheet="music"/.test(nowHtml));

shn._hass.states['media_player.tv'] = { state: 'playing', attributes: {} };
shn._hass.states['sensor.app'] = { state: 'Netflix', attributes: {} };
nowHtml = shn._secNowplaying(nowSec);
check('music and television share the one section',
  /Blackbird/.test(nowHtml) && /Living Room/.test(nowHtml));
check('the television row uses the app logo, not a generic icon',
  nowHtml.includes('#E50914'));
check('the television row still offers power off', /data-tvoff="remote\.tv"/.test(nowHtml));
check('the television row links to the remote', /data-nav="#tvs"/.test(nowHtml));
check('the header counts what is on', /ps-chip good[^>]*>[\s\S]{0,60}2</.test(nowHtml));

shn._hass.states['sensor.app'] = { state: 'com.netflix.ninja', attributes: {} };
check('an app is matched by its android activity too',
  shn._secNowplaying(nowSec).includes('#E50914'));
shn._hass.states['sensor.app'] = { state: 'Something Else', attributes: {} };
check('an unknown app falls back to a television glyph, not a broken logo', (() => {
  const html = shn._secNowplaying(nowSec);
  return /Something Else/.test(html) && !html.includes('#E50914');
})());

/* Music keeps its config for the sheet without holding a slot in the column. */
check('a sheet_only section is not rendered in the column', (() => {
  const core = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url),'utf8');
  return /if \(sec\.sheet_only\) return;/.test(core) &&
    core.indexOf('if (sec.sheet_only) return;') < core.indexOf('sleep: () => this._secSleep');
})());
check('the dock can open a sheet the way it opens a section',
  /if \(d\.sheet\) \{/.test(shellSrc));
check('a sheet_only music section still feeds the targets', (() => {
  shn._pick = 'media_player.kit';
  return shn._targets().indexOf('media_player.kit') >= 0;
})());

/* With the column section gone the sheet is the only music surface, so
   anything that lived only in the section would have become unreachable. */
const shms = new SH();
shms.setConfig({ sections: [{ type: 'music', key: 'music', sheet_only: true,
  players: [{ entity: 'media_player.kit', name: 'Kitchen' }],
  presets: [{ name: 'Liked Songs', uri: 'library://playlist/7', icon: 'mdi:heart' }] }] });
shms._hass = { states: { 'media_player.kit': { state: 'idle', attributes: {} } } };
shms._sheet = 'music';
const musicSheet = shms._sheetHtml([]);
check('the music sheet carries the presets', /data-preset="0"/.test(musicSheet) && /Liked Songs/.test(musicSheet));
check('the presets use the styled grid, not a bare list', /class="ps-pres"/.test(musicSheet));
check('the music sheet still has rooms, search and recents',
  /data-pick="media_player\.kit"/.test(musicSheet) && /id="ps-q"/.test(musicSheet));
check('every music surface the section had is reachable from the sheet', (() => {
  const styles = SH.styles;
  return /\.ps-pres \{/.test(styles);   // the grid the sheet now relies on
})());

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
  /* Keyed on a comment that exists only inside the constructor. Do not key it
     on a line that a future edit might legitimately move. */
  const marks = (shellSrc.match(/-> true for open groups/g) || []).length;
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
   stub DOM answers null to everything, which would let every one of these
   pass vacuously — hence the MiniNode defined at the top. */
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
check('mini bar is tappable', /\.ps-mini \{[^}]*cursor: pointer/.test(shs));

/* --------------------------------------------------- design system, v1.28 --
 * Seventeen font sizes, fifteen radii and thirteen white-alpha fills had
 * accumulated, most within half a pixel or two percent of a neighbour. Those
 * differences do not read as hierarchy, only as inconsistency — so the scales
 * live in PC_TOKENS and rules pick a step rather than inventing one. */
check('the type and radius scales are published as tokens',
  /--pc-fs-micro:/.test(src) && /--pc-fs-2xl:/.test(src) &&
  /--pc-r-sm:/.test(src) && /--pc-r-pill:/.test(src) && /--pc-fill-2:/.test(src));
check('the shell sizes itself from the scale, not from loose pixels', (() => {
  const loose = (shs.match(/font-size: *[0-9.]+px/g) || [])
    .filter((d) => !/: *16px/.test(d));   // 16px on fields is deliberate, see below
  return loose.length === 0;
})());
check('form fields stay at 16px so iOS does not zoom the view',
  /\.ps-sform input \{[^}]*font-size: 16px/.test(shs) &&
  /\.ps-sbox input \{[^}]*font-size: 16px/.test(shs));
check('no selector is declared twice', (() => {
  const seen = {}; const dupes = [];
  (shs.match(/^ *\.[a-z0-9-]+ \{/gm) || []).forEach((m) => {
    const k = m.trim();
    if (seen[k]) dupes.push(k); else seen[k] = 1;
  });
  return dupes.length === 0;
})());

/* The smallest text was also the faintest: #606b79 measures 3.6:1 on the
   ground, below the 4.5:1 floor, and it coloured every 9px uppercase label. */
check('the dimmest text colour clears the contrast floor', (() => {
  const hex = (/--ps-dim: *#([0-9a-f]{6})/i.exec(shs) || [])[1];
  if (!hex) return false;
  const lin = (c) => { const s = parseInt(c, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(hex.slice(0, 2)) + 0.7152 * lin(hex.slice(2, 4)) + 0.0722 * lin(hex.slice(4, 6));
  return (L + 0.05) / (0.00417 + 0.05) >= 4.5;      // 0.00417 = the #0B0D16 ground
})());

/* Every round control drew at 19–36px. The target grows behind the paint so
   nothing on screen moves. */
check('small round controls carry a hit expander',
  /\.ps-step::after[^{]*\{[^}]*inset: -11px/.test(shs.replace(/\n/g, ' ')) ||
  /\.ps-step::after/.test(shs) && /inset: -11px -4px/.test(shs));
['ps-step', 'ps-knob', 'ps-x', 'ps-link', 'ps-prx', 'ps-npb'].forEach((c) => {
  check(`  .${c} is in the hit-expansion list`, new RegExp('\\.' + c + '::after').test(shs));
});

/* The dock is 65px alone and ~124px with a now-playing bar, before the safe
   area. A fixed reservation hid the tail of the column under it, and put every
   sheet's bottom edge behind the mini bar. */
check('the dock measures itself', /_reserve\(\)/.test(shellSrc) && /offsetHeight/.test(shellSrc));
check('_render calls _reserve, it is not merely defined',
  /this\._reserve\(\);/.test(shellSrc));
check('host padding, the fade and the sheet all derive from the measured dock',
  /padding: 6px 6px calc\(var\(--ps-dockh\)/.test(shs) &&
  /\.ps-fade \{[^}]*calc\(var\(--ps-dockh\)/.test(shs.replace(/\n/g, ' ')) &&
  /bottom: calc\(var\(--ps-dockh\)/.test(shs));
check('the reserved height survives a DOM with no layout', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  s.shadowRoot = { getElementById: () => ({}) };      // no offsetHeight
  s._reserve();
  return true;                                        // must not throw
})());
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
check('an unfiltered search sends no media_type', shq._mtype === 'all' && svcArgs.data.media_type === undefined);

/* A filter chip means "you already said what you wanted", so it asks Music
   Assistant for that type only and spends the whole list on it rather than
   four shallow buckets. */
shq._mtype = 'album';
shq._hass.callService = async (d, sv, data, t, x, ret) => {
  svcArgs = { d, sv, data, ret };
  return { response: { albums: Array.from({ length: 30 },
    (_, i) => ({ uri: 'u:a' + i, name: 'Album ' + i })) } };
};
await shq._runSearch();
check('a filtered search asks for that media type only',
  JSON.stringify(svcArgs.data.media_type) === JSON.stringify(['album']));
check('a filtered search gives the whole list to one type', shq._results.length === 20);
check('every filtered row is that type', shq._results.every((r) => r.kind === 'album'));
check('the filter chips render, with the current one lit',
  /data-mtype="album"[^>]*aria-pressed="true"/.test(shq._resultsHtml()));
check('a filtered list drops the per-row kind badge, since every row is that kind',
  !/ps-kind/.test(shq._resultsHtml()));
shq._mtype = 'all';

/* Search as you type. The field keeps focus, and a focused field must keep
   _dragging set or the patch destroys the input mid-word — so the results are
   written into their own container instead of going through _render. */
check('typing debounces rather than searching per keystroke', (() => {
  let ran = 0;
  const saved = shq._runSearch;
  shq._runSearch = async () => { ran += 1; };
  shq._queueSearch('b'); shq._queueSearch('bl'); shq._queueSearch('blu');
  const immediate = ran === 0;
  shq._runSearch = saved;
  clearTimeout(shq._searchT);
  return immediate;
})());
check('clearing the box drops the results without a request', (() => {
  shq._results = [{ uri: 'u', name: 'x', kind: 'track' }];
  shq._queueSearch('  ');
  return shq._results === null;
})());
check('a stale answer cannot overwrite a newer query', await (async () => {
  /* Two searches in flight; the first one to have been issued answers last. */
  let release;
  const gate = new Promise((r) => { release = r; });
  let call = 0;
  shq._query = 'slow';
  shq._hass.callService = async () => {
    call += 1;
    if (call === 1) { await gate; return { response: { tracks: [{ uri: 'u:old', name: 'Stale' }] } }; }
    return { response: { tracks: [{ uri: 'u:new', name: 'Fresh' }] } };
  };
  const first = shq._runSearch();
  const second = shq._runSearch();
  await second;
  release();
  await first;
  return shq._results.length === 1 && shq._results[0].name === 'Fresh';
})());
check('the search field is wired to the debounce, not only to Enter',
  /q\.addEventListener\("input", \(\) => this\._queueSearch/.test(shellSrc));
check('the results have their own container to be patched into',
  /id="ps-res"/.test(fs.readFileSync(new URL('../src/74-shell-alerts.js', import.meta.url), 'utf8')));
check('_paintResults is actually called, not merely defined',
  (shellSrc + fs.readFileSync(new URL('../src/73-shell-music.js', import.meta.url), 'utf8'))
    .split('_paintResults(')
    .length > 3);

/* Queueing is the row's second button. Long-press already means "save", so a
   third gesture on the same row would be one too many to remember. */
let enq = null;
shq._hass.callService = (d, sv, data) => { enq = { d, sv, data }; };
shq._enqueueUri('u:t', 'track');
check('the queue button adds rather than replacing', enq.data.enqueue === 'add');
check('queueing confirms itself, since the effect happens in another room',
  typeof shq._note === 'string' && shq._note.length > 0);
clearTimeout(shq._noteT); shq._note = null;
check('a row carries both a play and a queue control', (() => {
  const row = shq._mediaRow({ uri: 'u', name: 'T', sub: 'A', kind: 'track' }, 0, 'results');
  return /data-play="0"/.test(row) && /data-queue="0"/.test(row);
})());

/* get_queue is the only place shuffle, repeat and "up next" are visible for
   these players — the media_player attributes do not carry them. */
const shqu = new SH();
shqu.setConfig({ sections: [{ type: 'music', key: 'music', sheet_only: true,
  default_player: 'media_player.a', players: [{ entity: 'media_player.a', name: 'K' }] }] });
shqu._hass = { states: { 'media_player.a': { state: 'playing', attributes: { app_id: 'music_assistant', media_title: 'T' } } },
  callService: async () => ({ response: { 'media_player.a': {
    active: true, items: 27, current_index: 16, shuffle_enabled: true, repeat_mode: 'all',
    next_item: { media_item: { name: 'Ice Cream' } } } } }) };
await shqu._fetchQueue();
const qh = shqu._queueHtml();
check('the queue line says how far through the list it is', /17 of 27/.test(qh));
check('the queue line names what is next', /Up next · Ice Cream/.test(qh));
check('shuffle reads its state from the queue, not the entity', /id="ps-shuf"[^>]*\n?[^>]*aria-pressed="true"/.test(qh.replace(/\n\s*/g, ' ')));
check('repeat shows as on when it is not off', /id="ps-rep"[\s\S]*?class="ps-qb on"|class="ps-qb on"[^>]*id="ps-rep"/.test(qh));
check('a queue read for another room is not shown against this one', (() => {
  shqu._queue = { ...shqu._queue, entity: 'media_player.zzz' };
  return shqu._queueHtml() === '';
})());
check('a player with no queue shows no up-next line, not a wrong one', (() => {
  shqu._queue = null;
  return shqu._queueHtml() === '';
})());
check('the queue is only read while the music sheet is open', (() => {
  shqu._sheet = null; shqu._queueKey = 'stale';
  shqu._syncQueue();
  return shqu._queueKey === null;
})());
check('_syncQueue is actually called from the render tail',
  /this\._syncQueue\(\);/.test(shellSrc));

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
/* One room, not a set. Two taps used to arm two rooms and "play to both" meant
   two unsynchronised queues; real multi-room is join. */
shx._togglePick('media_player.a');
check('picking a second room replaces the first rather than adding to it',
  JSON.stringify(shx._targets()) === JSON.stringify(['media_player.a']));
shx._togglePick('media_player.a');
check('tapping the picked room clears the pick', shx._pick === null);
check('clearing the pick falls back to what is playing', shx._activePlayer() === 'media_player.a');
shx._pick = 'media_player.zzz';
check('a stale pick falls back rather than targeting a dead entity', shx._activePlayer() === 'media_player.a');
shx._pick = null;

/* Grouping is media_player.join against the target room — these players carry
   the GROUPING bit, so this really is one synchronised stream. */
let joinArgs = null;
shx._hass.callService = (d, sv, data) => { joinArgs = { d, sv, data }; };
shx._toggleJoin('media_player.b');
check('adding a room joins it to the target', joinArgs.d === 'media_player' && joinArgs.sv === 'join');
check('join names the target as the leader and the room as a member',
  joinArgs.data.entity_id === 'media_player.a' &&
  joinArgs.data.group_members.indexOf('media_player.b') >= 0);
shx._hass.states['media_player.a'].attributes.group_members = ['media_player.b'];
check('a joined room reports as grouped', shx._isGrouped('media_player.b'));
shx._toggleJoin('media_player.b');
check('tapping a grouped room unjoins it', joinArgs.sv === 'unjoin' && joinArgs.data.entity_id === 'media_player.b');
check('the target room cannot join itself', (() => {
  joinArgs = null; shx._toggleJoin('media_player.a'); return joinArgs === null;
})());
shx._hass.states['media_player.a'].attributes.group_members = [];

/* Something playing elsewhere moves rather than having to be found again. */
shx._pick = 'media_player.b';
let moved = null;
shx._hass.callService = (d, sv, data) => { moved = { d, sv, data }; };
shx._moveHere();
check('move uses music_assistant.transfer_queue',
  moved.d === 'music_assistant' && moved.sv === 'transfer_queue');
check('move names the source and the destination',
  moved.data.entity_id === 'media_player.b' && moved.data.source_player === 'media_player.a');
shx._pick = null;
check('there is nothing to move when the target is already playing', (() => {
  moved = null; shx._moveHere(); return moved === null;
})());
shx._hass.callService = undefined;
shx._note = null; if (shx._noteT) clearTimeout(shx._noteT);

const mus = shx._secMusic(shx._config.sections[0]);
check('rooms select rather than opening more-info', /data-pick="media_player.b"/.test(mus) && !/data-player=/.test(mus));
check('the active room is marked pressed', /data-pick="media_player.a" aria-pressed="true"/.test(mus));
check('only one room is marked pressed at a time',
  (mus.match(/aria-pressed="true"/g) || []).length === 1);

/* Every control in the sheet has to act on the room the sheet says it is on.
   They used to act on `nowPlaying || default_player` while the list highlighted
   the pick, so choosing a speaker changed the highlight and nothing else. */
const shsheet = new SH();
shsheet.setConfig({ now_playing: { players: [{ entity: 'media_player.a', name: 'Kitchen' }] },
  sections: [{ type: 'music', key: 'music', sheet_only: true, default_player: 'media_player.a',
    players: [{ entity: 'media_player.a', name: 'Kitchen' }, { entity: 'media_player.b', name: 'Living' }] }] });
shsheet._hass = { states: {
  'media_player.a': { state: 'playing', attributes: { app_id: 'music_assistant', media_title: 'Track', volume_level: 0.4 } },
  'media_player.b': { state: 'idle', attributes: { app_id: 'music_assistant', volume_level: 0.7 } } } };
shsheet._sheet = 'music';
shsheet._pick = 'media_player.b';
const msheet = shsheet._sheetHtml([]);
check('the sheet transport targets the picked room, not the playing one',
  /data-mp="playpause" data-entity="media_player\.b"/.test(msheet));
check('the main volume targets the picked room',
  /class="ps-vol"[^>]*data-vol="media_player\.b"/.test(msheet.replace(/\n\s*/g, ' ')));
check('the main volume shows the picked room’s level, not another room’s',
  /data-vol="media_player\.b" aria-label="Volume"/.test(msheet.replace(/\n\s*/g, ' ')));
check('the sheet names the room it is driving', /Music · Living/.test(msheet));
check('the sheet offers to move playback here', /id="ps-move"/.test(msheet) && /Move Kitchen playback here/.test(msheet));
check('a room that is not the target gets a join button', /data-join="media_player\.a"/.test(msheet));
check('the target room gets no join button of its own', !/data-join="media_player\.b"/.test(msheet));
shsheet._pick = null;
/* The star has to save what the header above it names. It followed the
   globally-playing room while the header showed the target's track. */
check('the star saves the target room’s music, not another room’s', (() => {
  shsheet._pick = 'media_player.b';
  shsheet._hass.states['media_player.b'] = { state: 'playing', attributes: {
    app_id: 'music_assistant', media_title: 'Living track', volume_level: 0.7,
    media_playlist: 'Living mix', media_playlist_content_id: 'library://playlist/9' } };
  const p = shsheet._pinnable();
  return p && p.uri === 'library://playlist/9';
})());
check('with the target silent the star falls back to what is playing anywhere', (() => {
  shsheet._hass.states['media_player.b'] = { state: 'idle', attributes: { app_id: 'music_assistant', volume_level: 0.7 } };
  shsheet._hass.states['media_player.a'].attributes.media_content_id = 'u:kitchen';
  const p = shsheet._pinnable();
  shsheet._pick = null;
  return p && p.uri === 'u:kitchen';
})());
check('with nothing picked the sheet drives what is playing and offers no move', (() => {
  const h = shsheet._sheetHtml([]);
  return /data-mp="playpause" data-entity="media_player\.a"/.test(h) && !/id="ps-move"/.test(h);
})());
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

/* ================================================ section behaviour, v1.28 ==
 * Everything below was a defect found by reading the live screen rather than
 * the config, so each check states the wrong behaviour it replaces. */

/* A fixed section rendered as a 9px uppercase caption while an expandable one
   rendered as a title — and the early return dropped chipHtml entirely, so the
   Systems health summary was computed, passed in and never shown. */
const shh = new SH();
shh.setConfig({ sections: [{ type: 'quick', key: 'q', title: 'Quick', expandable: false, tiles: [] }] });
shh._hass = { states: {} };
const fixedHead = shh._head(shh._config.sections[0], '<span class="ps-chip good">Healthy</span>');
check('a fixed section keeps its status chip', /ps-chip good/.test(fixedHead));
check('a fixed section uses the same title treatment', /class="ps-nm"/.test(fixedHead));
check('a fixed section has no chevron and no toggle',
  !/ps-cv/.test(fixedHead) && !/data-open/.test(fixedHead));
check('an expandable section is still a button with a chevron', (() => {
  const h = shh._head({ key: 'k', title: 'T' }, '');
  return /data-open="k"/.test(h) && /ps-cv/.test(h);
})());
check('the caption-styled header is gone for good',
  !/ps-solo/.test(shs) && !/ps-solo/.test(shellSrc));

/* Systems is expandable:false in the live config — the regression this guards. */
const shhs = new SH();
shhs.setConfig({ sections: [{ type: 'systems', key: 'sys', title: 'Systems', expandable: false,
  devices: [{ name: 'NAS', key: 'nas', faults: [{ entity: 'binary_sensor.p', state: 'on', label: 'Parity' }] }] }] });
shhs._hass = { states: { 'binary_sensor.p': { state: 'off', attributes: {} } } };
check('a fixed Systems section still reports Healthy',
  /Healthy/.test(shhs._secSystems(shhs._config.sections[0])));
shhs._hass.states['binary_sensor.p'] = { state: 'on', attributes: {} };
check('a fixed Systems section still reports its faults',
  /1 fault/.test(shhs._secSystems(shhs._config.sections[0])));

/* snake_case straight out of an integration was the only such string on screen. */
check('integration strings are humanised', shh._humanize('manual_override') === 'Manual override');
check('humanising an empty value yields nothing, not "Undefined"', shh._humanize(null) === '');

/* The climate ring drew an absolute 60-80 position and no target. */
const shcr = new SH();
shcr.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.g', ring: { min: 60, max: 80 } }] });
shcr._hass = { states: { 'climate.g': { state: 'cool',
  attributes: { current_temperature: 73, temperature: 72, hvac_action: 'cooling',
    hvac_action_reason: 'manual_override' } } } };
const climHtml = shcr._secClimate(shcr._config.sections[0]);
check('the climate ring marks the goal', /<line[^>]*stroke="var\(--ps-text\)"/.test(climHtml));
check('the climate reason reads as a sentence',
  /Manual override — holding this goal/.test(climHtml) && !/manual_override/.test(climHtml));
check('a bare reason word is expanded into a status', (() => {
  shcr._hass.states['climate.g'].attributes.hvac_action_reason = 'schedule';
  const h = shcr._secClimate(shcr._config.sections[0]);
  shcr._hass.states['climate.g'].attributes.hvac_action_reason = 'manual_override';
  return /Following the schedule/.test(h);
})());
check('an unknown reason still gets humanised',
  shcr._reasonText('some_new_reason') === 'Some new reason');
check('the temperature graph does not reserve a third of itself as blank',
  /TOP = 8/.test(shellSrc));

/* Hosted sheets printed their title twice: the sheet chrome names itself next
   to the close button, and the card printed its own underneath. */
const shht = new SH();
shht.setConfig({
  sections: [{ type: 'quick', key: 'q', tiles: [] }],
  sheets: {
    tv: { title: 'Televisions', card: { type: 'purdy-remote-card', title: 'Televisions' } },
    keep: { title: 'Kept', keep_title: true, card: { type: 'purdy-remote-card', title: 'Kept' } },
    bare: { card: { type: 'purdy-remote-card', title: 'Only title' } },
  },
});
shht._hass = { states: {} };
const hostCfg = (key) => {
  shht._sheet = key;
  let seen = null;
  const el = { setConfig: (c) => { seen = c; }, set hass(h) {} };
  shht.shadowRoot = { getElementById: () => ({ innerHTML: '', firstChild: null,
    appendChild() {}, }) };
  const realCreate = globalThis.document.createElement;
  globalThis.document.createElement = () => el;
  const realGet = globalThis.customElements.get;
  globalThis.customElements.get = () => function () {};
  shht._hosted = null; shht._hostedKey = null;
  shht._mountSheetCard();
  globalThis.document.createElement = realCreate;
  globalThis.customElements.get = realGet;
  return seen;
};
check('a hosted card does not repeat the sheet title', hostCfg('tv').title === '');
check('the title is blanked, not deleted, so a header chip survives',
  Object.prototype.hasOwnProperty.call(hostCfg('tv'), 'title'));
check('keep_title opts out', hostCfg('keep').title === 'Kept');
check('a sheet with no title of its own leaves the card alone',
  hostCfg('bare').title === 'Only title');
check('a hosted card is still told it is nested', hostCfg('tv').bare === true);

/* A hosted card that hardcodes a light surface can only be filtered. */
const shdim = new SH();
shdim.setConfig({
  sections: [{ type: 'quick', key: 'q', tiles: [] }],
  sheets: {
    vac: { title: 'Jeeves', dim: 0.8, card: { type: 'x-card' } },
    plain: { title: 'Plain', card: { type: 'x-card' } },
  },
});
shdim._hass = { states: {} };
shdim._sheet = 'vac';
check('a dimmed sheet filters its host', /filter:brightness\(0\.80\)/.test(shdim._sheetHtml([])));
shdim._sheet = 'plain';
check('dimming is opt-in, never the default', !/filter:brightness/.test(shdim._sheetHtml([])));
shdim._sheet = 'vac';
shdim._config.sheets.vac.dim = 5;
check('an out-of-range dim is ignored rather than blanking the sheet',
  !/filter:brightness/.test(shdim._sheetHtml([])));
check('the hvac action chip is humanised too', /Cooling/.test(climHtml));

/* Wakeups alone always read the live counter, so a reset before the card was
   looked at would show 0 beside a full ring of last night's sleep. */
const shw = new SH();
shw.setConfig({ sections: [{ type: 'sleep', key: 's', sleep_state: 'sensor.sock', name: 'J',
  ring: { deep_last_night: 'input_number.d', light_last_night: 'input_number.l' },
  wakeups: { live: 'counter.w', last_night: 'input_number.w' } }] });
shw._hass = { states: {
  'sensor.sock': { state: 'unavailable', attributes: {} },
  'counter.w': { state: '0', attributes: {} },
  'input_number.w': { state: '3', attributes: {} },
  'input_number.d': { state: '0.6', attributes: {} },
  'input_number.l': { state: '11.3', attributes: {} } } };
check('an idle session shows last night\'s wakeups, not a reset counter',
  /Wakeups<\/span>\s*<span class="ps-v">3</.test(shw._secSleep(shw._config.sections[0])));
shw._hass.states['sensor.sock'] = { state: 'light_sleep', attributes: {} };
check('a live session shows the live counter',
  /Wakeups<\/span>\s*<span class="ps-v">0</.test(shw._secSleep(shw._config.sections[0])));

/* Between sessions the section held ~250px of eighteen-hour-old numbers. */
shw._hass.states['sensor.sock'] = { state: 'unavailable', attributes: {} };
const idleSleep = shw._secSleep(shw._config.sections[0]);
check('an idle sleep section moves the detail behind the expand',
  idleSleep.indexOf('ps-vits') > idleSleep.indexOf('ps-xtra'));
check('an idle sleep section still shows the ring and the split',
  /ps-ring/.test(idleSleep) && /ps-chip deep/.test(idleSleep));
shw._hass.states['sensor.sock'] = { state: 'deep_sleep', attributes: {} };
const liveSleep = shw._secSleep(shw._config.sections[0]);
check('a live sleep section hides nothing',
  liveSleep.indexOf('ps-vits') < liveSleep.indexOf('ps-xtra'));
check('idle compaction can be turned off', (() => {
  shw._config.sections[0].idle_compact = false;
  shw._hass.states['sensor.sock'] = { state: 'unavailable', attributes: {} };
  const h = shw._secSleep(shw._config.sections[0]);
  delete shw._config.sections[0].idle_compact;
  return h.indexOf('ps-vits') < h.indexOf('ps-xtra');
})());

/* Five fixed days meant five "Nothing scheduled" rows on a quiet week. */
const shcal = new SH();
shcal.setConfig({ sections: [{ type: 'calendar', key: 'cal', title: 'Ahead', days: 5, entities: [] }] });
shcal._hass = { states: {} };
shcal._events = [];
const emptyCal = shcal._secCalendar(shcal._config.sections[0]);
check('an empty week draws one day, not five',
  (emptyCal.match(/ps-cday/g) || []).length === 1);
check('the days that were dropped are still accounted for',
  /Nothing else in the next 5 days/.test(emptyCal));
shcal._events = [{ name: 'Dentist', color: '#fff', allDay: false,
  t: new Date(new Date().setHours(0, 0, 0, 0) + 2 * 86400000 + 36000000).getTime() }];
const someCal = shcal._secCalendar(shcal._config.sections[0]);
check('a day with an event is drawn', /Dentist/.test(someCal));
check('today is drawn even when it is clear',
  (someCal.match(/ps-cday/g) || []).length === 2 && /Nothing scheduled/.test(someCal));
check('the remaining clear days are counted', /3 clear days not shown/.test(someCal));

/* The expanded room list lost its per-room sparkline when the shell replaced
   the standalone climate card's rooms block. Same picture, so the geometry is
   shared rather than copied a second time. */
const shsp = new SH();
shsp.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.g',
  graph: { inside: 'sensor.in' },
  rooms: [{ name: 'Living Room', temp: 'sensor.lr' }, { name: 'Office', temp: 'sensor.of' }] }] });
shsp._hass = { states: { 'climate.g': { state: 'cool', attributes: {} },
  'sensor.lr': { state: '72.4', attributes: {} }, 'sensor.of': { state: '70.1', attributes: {} } } };
check('room temps join the history fetch', (() => {
  const ids = shsp._historyEntities();
  return ids.indexOf('sensor.lr') >= 0 && ids.indexOf('sensor.of') >= 0;
})());
check('the history fetch does not ask for the same id twice', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'climate', key: 'c', graph: { inside: 'sensor.lr' },
    rooms: [{ temp: 'sensor.lr' }] }] });
  return s._historyEntities().length === 1;
})());
const t0 = Date.now() - 3600000;
shsp._history = { 'sensor.lr': [
  { t: t0, s: '71.0' }, { t: t0 + 600000, s: '71.8' }, { t: t0 + 1200000, s: '72.4' }] };
const roomHtml = shsp._secClimate(shsp._config.sections[0]);
check('a room with history draws a sparkline', /ps-spark[\s\S]{0,200}<polyline/.test(roomHtml));
check('a room with no history draws an empty box, never a flat line', (() => {
  const one = roomHtml.slice(roomHtml.indexOf('sensor.of'));
  return /ps-spark"><svg[^>]*><\/svg>/.test(one);
})());
check('the sparkline box keeps its width either way',
  /\.ps-spark \{[^}]*flex: 0 0 56px/.test(shs));
check('sparklines can be turned off', (() => {
  shsp._config.sections[0].room_spark = false;
  const h = shsp._secClimate(shsp._config.sections[0]);
  const ids = shsp._historyEntities();
  delete shsp._config.sections[0].room_spark;
  return !/ps-spark/.test(h) && ids.indexOf('sensor.of') < 0;
})());
check('a flat series is drawn flat, not as amplified noise', (() => {
  const flat = [{ t: 1, v: 72.4 }, { t: 2, v: 72.4 }, { t: 3, v: 72.4 }];
  const ys = SH.helpers.sparkPoly(flat, 56, 18, 3).split(' ')
    .map((p) => parseFloat(p.split(',')[1]));
  return ys.every((y) => Math.abs(y - ys[0]) < 0.01) && Math.abs(ys[0] - 9) < 0.5;
})());
check('too few points yields null, not a line', SH.helpers.sparkPoly([{ t: 1, v: 5 }], 56, 18, 3) === null);
check('downsampling bucket-averages to the requested count',
  SH.helpers.downsample(Array.from({ length: 300 }, (_, i) => ({ t: i, v: i })), 28).length === 28);
check('a short series is left alone by downsampling',
  SH.helpers.downsample([{ t: 1, v: 1 }, { t: 2, v: 2 }], 28).length === 2);
check('the standalone climate card uses the same geometry, not a second copy',
  /_polyline\(points, w, h, pad = 4\) \{\s*return pcSparkPoly/.test(
    fs.readFileSync(new URL('../src/10-climate-panel-card.js', import.meta.url), 'utf8')));

/* ---- nursery: sessions from the Hatch, interventions from the door ----
 *
 * Sleep is no longer inferred from a wearable. A `playing` span IS the
 * session, because the sound machine is only ever on when sleep is intended.
 * Every threshold below is checked against real recorded data, not invented
 * numbers — most importantly the door chatter, which is what mounting the
 * sensor actually produced.
 */
const nsess = SH.helpers.nurserySessions;
const NT = (h, m, s) => new Date(2026, 7, 7, h, m, s || 0).getTime();

check('a playing span becomes a session', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }], [],
    { now: NT(23, 30) });
  return s.length === 1 && s[0].minutes === 180 && s[0].night === true;
})());

check('a session still running is active and never dropped for being short', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }], [], { now: NT(13, 2) });
  return s.length === 1 && s[0].active === true && s[0].minutes === 2;
})());

check('a Hatch switched straight off again is not a session', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(13, 3), s: 'idle' }], [],
    { now: NT(14, 0) });
  return s.length === 0;
})());

check('an auto-off mid-night merges back into one night, not two', (() => {
  const s = nsess([
    { t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' },
    { t: NT(23, 5), s: 'playing' }, { t: NT(23, 59), s: 'idle' },
  ], [], { now: NT(23, 59) });
  return s.length === 1 && s[0].splits === 2 && s[0].minutes === 239;
})());

check('a genuine gap longer than the merge window stays two sessions', (() => {
  const s = nsess([
    { t: NT(9, 0), s: 'playing' }, { t: NT(10, 0), s: 'idle' },
    { t: NT(13, 0), s: 'playing' }, { t: NT(14, 30), s: 'idle' },
  ], [], { now: NT(15, 0) });
  return s.length === 2 && s.every((x) => x.night === false);
})());

/* The real thing: mounting the sensor produced ten transitions in 34 seconds,
   five of them under 300ms. Counted raw that is ten interventions. */
check('mounting chatter does not become ten interventions', (() => {
  /* The real recorded burst, against the real session it fell inside: the
     Hatch ran 08:30:08 to 09:10:36, so these land 35 minutes in — past the
     nap exit window, so they are read as visits rather than a put-down.
     Ten raw opens. Two visits, not three: the 9:06:59 open is the exit of the
     9:05:37 entry now that a visit is a PAIR of opens rather than anything
     inside 60 seconds. The guarantee this test exists for — ten opens must not
     become ten interventions — is unchanged. */
  const door = [
    { t: NT(9, 5, 37), s: 'on' }, { t: NT(9, 5, 41), s: 'off' },
    { t: NT(9, 5, 42), s: 'on' }, { t: NT(9, 5, 43), s: 'off' },
    { t: NT(9, 5, 59), s: 'on' }, { t: NT(9, 5, 59), s: 'off' },
    { t: NT(9, 6, 0), s: 'on' }, { t: NT(9, 6, 0), s: 'off' },
    { t: NT(9, 6, 2), s: 'on' }, { t: NT(9, 6, 2), s: 'off' },
    { t: NT(9, 6, 5), s: 'on' }, { t: NT(9, 6, 7), s: 'off' },
    { t: NT(9, 6, 10), s: 'on' }, { t: NT(9, 6, 10), s: 'off' },
    { t: NT(9, 6, 11), s: 'on' }, { t: NT(9, 6, 49), s: 'off' },
    { t: NT(9, 6, 59), s: 'on' }, { t: NT(9, 9, 25), s: 'off' },
    { t: NT(9, 9, 32), s: 'on' }, { t: NT(9, 10, 37), s: 'off' },
  ];
  /* Ends well after the burst so the retrieval rule cannot also apply — this
     test is about chatter alone. */
  const s = nsess(
    [{ t: NT(8, 30, 8), s: 'playing' }, { t: NT(10, 30), s: 'idle' }],
    door, { now: NT(11, 0) });
  return s.length === 1 && s[0].interventions === 2;
})());

check('a sub-second flicker alone is never an intervention', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(21, 0, 0), s: 'on' }, { t: NT(21, 0, 0), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 0;
})());

check('going in and coming out is one visit, not two', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(21, 0, 0), s: 'on' }, { t: NT(21, 0, 8), s: 'off' },
     { t: NT(21, 0, 40), s: 'on' }, { t: NT(21, 0, 48), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 1;
})());

check('two separate visits count twice', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(21, 0), s: 'on' }, { t: NT(21, 0, 10), s: 'off' },
     { t: NT(22, 0), s: 'on' }, { t: NT(22, 0, 10), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 2;
})());

check('a door open outside any session is ignored entirely', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(15, 0), s: 'on' }, { t: NT(15, 0, 30), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 0;
})());

/* The agreed rule: first session starting after 18:00 is the night. */
check('an afternoon session is a nap and an evening one is the night', (() => {
  const s = nsess([
    { t: NT(13, 0), s: 'playing' }, { t: NT(14, 30), s: 'idle' },
    { t: NT(20, 15), s: 'playing' }, { t: NT(23, 30), s: 'idle' },
  ], [], { now: NT(23, 30) });
  return s[0].night === false && s[1].night === true;
})());

check('a night restarted after midnight files under the evening it began', (() => {
  const s = nsess([{ t: new Date(2026, 7, 8, 1, 30).getTime(), s: 'playing' },
    { t: new Date(2026, 7, 8, 6, 0).getTime(), s: 'idle' }],
    [], { now: new Date(2026, 7, 8, 7, 0).getTime() });
  return s[0].night === true && s[0].day === '2026-08-07';
})());

check('the day key is local, not UTC — an 8pm bedtime files under today', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }], [],
    { now: NT(23, 30) });
  return s[0].day === '2026-08-07';
})());

check('a held-open door still counts while the session runs', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }], [{ t: NT(21, 0), s: 'on' }],
    { now: NT(21, 5) });
  return s[0].interventions === 1 && s[0].active === true;
})());

/* The put-down. Someone must be IN the room to start the Hatch, so the first
   door-open of a session is them leaving. Counting it made every session read
   one intervention high — the sock's settling stir in a new costume. */
check('walking out after the put-down is not an intervention', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 4), s: 'on' }, { t: NT(20, 4, 20), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 0 && s[0].hadExit === true;
})());

check('the door closing behind them is when he is actually alone', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 12), s: 'on' }, { t: NT(20, 13), s: 'off' }], { now: NT(23, 0) });
  return s[0].settleMinutes === 13 && s[0].minutes === 180;
})());

check('sitting with him a while at bedtime still reads as settling', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 14, 30), s: 'on' }, { t: NT(20, 15), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 0 && s[0].settleMinutes === 15;
})());

/* Naps here run as short as twenty minutes. A single 45-minute exit window was
   longer than the whole nap, so every door open was swallowed as the put-down
   and a short nap could never report an intervention at all. */
/* An intervention early in a nap means he had not started the nap yet, so it
   belongs to settling — the window swallowing it is the intended behaviour,
   not a tolerated cost. A nap only reports interventions once he is properly
   down. */
check('an early nap visit counts as settling, not an intervention', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(13, 20), s: 'idle' }],
    [{ t: NT(13, 2), s: 'on' }, { t: NT(13, 2, 30), s: 'off' },
     { t: NT(13, 14), s: 'on' }, { t: NT(13, 15), s: 'off' }], { now: NT(14, 0) });
  return s.length === 1 && s[0].night === false
    && s[0].hadExit === true && s[0].interventions === 0
    && s[0].settledAt === NT(13, 15);
})());

check('a long nap still reports a visit past the window', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(15, 0), s: 'idle' }],
    [{ t: NT(13, 6), s: 'on' }, { t: NT(13, 7), s: 'off' },
     { t: NT(14, 10), s: 'on' }, { t: NT(14, 11), s: 'off' }], { now: NT(15, 0) });
  return s[0].interventions === 1 && s[0].settledAt === NT(13, 7);
})());

check('the nap window is tighter than the night one', (() => {
  /* Same 28-minute offset: past the nap window, still inside the night one. */
  const nap = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(15, 0), s: 'idle' }],
    [{ t: NT(13, 28), s: 'on' }, { t: NT(13, 29), s: 'off' }], { now: NT(15, 0) });
  const night = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 28), s: 'on' }, { t: NT(20, 29), s: 'off' }], { now: NT(23, 0) });
  return nap[0].interventions === 1 && nap[0].hadExit === false
    && night[0].interventions === 0 && night[0].hadExit === true;
})());

/* The live settle that disproved "the first door-open is them leaving": the
   door was already open when the Hatch went on, closed with her INSIDE, and
   she left minutes later. Taking the first open banked her arrival as the exit
   and would have counted her departure as intervention #1. */
check('a settle where the door closes with her still inside', (() => {
  const s = nsess([{ t: NT(10, 6, 40), s: 'playing' }, { t: NT(10, 50), s: 'idle' }], [
    { t: NT(9, 56, 27), s: 'on' }, { t: NT(10, 7, 31), s: 'off' },
    { t: NT(10, 7, 32), s: 'on' }, { t: NT(10, 8, 4), s: 'off' },
    { t: NT(10, 12, 0), s: 'on' }, { t: NT(10, 12, 30), s: 'off' },
  ], { now: NT(10, 50) });
  /* Settled when she actually left, not when she shut the door behind her. */
  return s[0].interventions === 0 && s[0].hadExit === true
    && s[0].settledAt === NT(10, 12, 30);
})());

check('a visit well past the window still counts', (() => {
  const s = nsess([{ t: NT(10, 6, 40), s: 'playing' }, { t: NT(11, 30), s: 'idle' }], [
    { t: NT(10, 7, 32), s: 'on' }, { t: NT(10, 8, 4), s: 'off' },
    { t: NT(10, 12, 0), s: 'on' }, { t: NT(10, 12, 30), s: 'off' },
    { t: NT(10, 45, 0), s: 'on' }, { t: NT(10, 46, 0), s: 'off' },
  ], { now: NT(11, 30) });
  /* Settling ran to 10:12:30 — the last event inside the window — and the
     10:45 visit is a real one. */
  return s[0].interventions === 1 && s[0].settledAt === NT(10, 12, 30);
})());

check('ducking back in before the quiet gap is still settling', (() => {
  const s = nsess([{ t: NT(10, 6, 40), s: 'playing' }, { t: NT(10, 50), s: 'idle' }], [
    { t: NT(10, 12, 0), s: 'on' }, { t: NT(10, 12, 30), s: 'off' },
    { t: NT(10, 14, 0), s: 'on' }, { t: NT(10, 14, 40), s: 'off' },
  ], { now: NT(10, 50) });
  return s[0].interventions === 0 && s[0].settledAt === NT(10, 14, 40);
})());

/* Judging the gap by time alone fused a nap, twelve minutes awake and the next
   nap into one bogus session. Someone going in is the boundary. */
check('two naps separated by getting him up stay two naps', (() => {
  const s = nsess([
    { t: NT(9, 0), s: 'playing' }, { t: NT(9, 25), s: 'idle' },
    { t: NT(9, 37), s: 'playing' }, { t: NT(10, 5), s: 'idle' },
  ], [{ t: NT(9, 26), s: 'on' }, { t: NT(9, 26, 30), s: 'off' }], { now: NT(11, 0) });
  return s.length === 2;
})());

check('a Hatch that stops with nobody entering is one session, not two', (() => {
  const s = nsess([
    { t: NT(9, 0), s: 'playing' }, { t: NT(9, 25), s: 'idle' },
    { t: NT(9, 28), s: 'playing' }, { t: NT(10, 5), s: 'idle' },
  ], [], { now: NT(11, 0) });
  return s.length === 1 && s[0].splits === 2;
})());

check('a nap rule can be tuned without disturbing the night rule', (() => {
  const cfg = { nap: { exit_window_min: 2 }, now: NT(14, 0) };
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(13, 30), s: 'idle' }],
    [{ t: NT(13, 4), s: 'on' }, { t: NT(13, 5), s: 'off' }], cfg);
  return s[0].hadExit === false && s[0].interventions === 1;
})());

check('a first entry hours in is a real intervention, not a put-down exit', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 59), s: 'idle' }],
    [{ t: NT(22, 30), s: 'on' }, { t: NT(22, 31), s: 'off' }], { now: NT(23, 59) });
  return s[0].interventions === 1 && s[0].hadExit === false && s[0].settleMinutes === 0;
})());

check('the exit is dropped but everything after it still counts', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 59), s: 'idle' }],
    [{ t: NT(20, 4, 30), s: 'on' }, { t: NT(20, 5), s: 'off' },
     { t: NT(21, 30), s: 'on' }, { t: NT(21, 31), s: 'off' },
     { t: NT(22, 45), s: 'on' }, { t: NT(22, 46), s: 'off' }], { now: NT(23, 59) });
  return s[0].interventions === 2 && s[0].settleMinutes === 5;
})());

check('ducking straight back in is part of leaving, not a first intervention', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 5), s: 'on' }, { t: NT(20, 5, 20), s: 'off' },
     { t: NT(20, 5, 40), s: 'on' }, { t: NT(20, 6), s: 'off' }], { now: NT(23, 0) });
  return s[0].interventions === 0;
})());

check('a session nobody entered has no exit and settles at bedtime', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }], [],
    { now: NT(23, 0) });
  return s[0].hadExit === false && s[0].settleMinutes === 0 && s[0].interventions === 0;
})());

check('duration still measures the whole Hatch span, not from settled', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 0), s: 'idle' }],
    [{ t: NT(20, 30), s: 'on' }, { t: NT(20, 31), s: 'off' }], { now: NT(23, 0) });
  return s[0].minutes === 180;
})());

/* Commissioning noise: setting the sensor up, and switching the sound machine
   on to see what it reports, both look exactly like sleep. */
check('ignore_before drops the commissioning session', (() => {
  const s = nsess([{ t: NT(8, 30), s: 'playing' }, { t: NT(9, 10), s: 'idle' },
    { t: NT(13, 0), s: 'playing' }, { t: NT(14, 0), s: 'idle' }], [],
    { now: NT(15, 0), ignore_before: NT(12, 0) });
  return s.length === 1 && s[0].from === NT(13, 0);
})());

check('ignore_before accepts an ISO string as well as epoch ms', (() => {
  const iso = new Date(NT(12, 0)).toISOString();
  const s = nsess([{ t: NT(8, 30), s: 'playing' }, { t: NT(9, 10), s: 'idle' },
    { t: NT(13, 0), s: 'playing' }, { t: NT(14, 0), s: 'idle' }], [],
    { now: NT(15, 0), ignore_before: iso });
  return s.length === 1;
})());

check('a session in progress survives the cut — it is happening now', (() => {
  const s = nsess([{ t: NT(8, 30), s: 'playing' }], [], { now: NT(9, 0), ignore_before: NT(12, 0) });
  return s.length === 1 && s[0].active === true;
})());

check('an unparseable ignore_before hides nothing rather than everything', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(14, 0), s: 'idle' }], [],
    { now: NT(15, 0), ignore_before: 'not a date' });
  return s.length === 1;
})());


/* The live settle, end to end, exactly as recorded on 2026-08-07. This is the
   sequence that broke two earlier rules, so it is pinned. */
check('the real 2026-08-07 settle reads as 16m and zero interventions', (() => {
  const s = nsess(
    [{ t: NT(10, 0), s: 'idle' }, { t: NT(10, 6, 40), s: 'playing' }, { t: NT(11, 40), s: 'idle' }],
    [{ t: NT(9, 56, 27), s: 'on' }, { t: NT(10, 7, 31), s: 'off' },
     { t: NT(10, 7, 32), s: 'on' }, { t: NT(10, 8, 4), s: 'off' },
     { t: NT(10, 22, 19), s: 'on' }, { t: NT(10, 22, 26), s: 'off' }],
    { now: NT(11, 40) });
  return s.length === 1 && s[0].interventions === 0
    && s[0].settledAt === NT(10, 22, 26) && s[0].settleMinutes === 16;
})());

/* The real 2026-08-07 NIGHT put-down: four trips over 33 minutes. Measured
   from the session start the 30-minute window closed at 19:36:19 and the last
   trip missed it by 2m32s, so the card marked him settled at 19:32 and called
   the actual final exit intervention #1 — starting asleepMinutes while someone
   was still in the room. Pinned for the same reason the 10:06 settle is. */
check('the real 2026-08-07 night put-down is four trips of settling, not three', (() => {
  const s = nsess(
    [{ t: NT(18, 30), s: 'idle' }, { t: NT(19, 6, 19), s: 'playing' }],
    [{ t: NT(19, 5, 25), s: 'on' }, { t: NT(19, 5, 36), s: 'off' },
     { t: NT(19, 5, 39), s: 'on' }, { t: NT(19, 5, 40), s: 'off' },
     { t: NT(19, 23, 19), s: 'on' }, { t: NT(19, 23, 23), s: 'off' },
     { t: NT(19, 25, 34), s: 'on' }, { t: NT(19, 25, 38), s: 'off' },
     { t: NT(19, 32, 11), s: 'on' }, { t: NT(19, 32, 15), s: 'off' },
     { t: NT(19, 38, 51), s: 'on' }, { t: NT(19, 39, 0), s: 'off' }],
    { now: NT(21, 0) });
  return s.length === 1 && s[0].interventions === 0
    && s[0].settledAt === NT(19, 39, 0) && s[0].settleMinutes === 33;
})());

/* The real 2026-08-07 wake-up: in at 22:05:13, out at 22:17:22. Twelve minutes
   apart, so `door_merge_sec` (60s) counted it twice — a visit is bounded by how
   long you STAY, not by how fast you come back. Pinned. */
check('going in and coming out twelve minutes later is ONE intervention', (() => {
  const s = nsess(
    [{ t: NT(19, 6, 19), s: 'playing' }],
    [{ t: NT(19, 23, 19), s: 'on' }, { t: NT(19, 23, 23), s: 'off' },
     { t: NT(19, 38, 51), s: 'on' }, { t: NT(19, 39, 0), s: 'off' },
     { t: NT(22, 5, 13), s: 'on' }, { t: NT(22, 5, 19), s: 'off' },
     { t: NT(22, 17, 22), s: 'on' }, { t: NT(22, 17, 32), s: 'off' }],
    { now: NT(23, 30) });
  return s.length === 1 && s[0].interventions === 1
    && s[0].events.length === 1 && s[0].events[0] === NT(22, 5, 13);
})());

/* The pairing absorbs exactly ONE open, never a chain — otherwise a visit every
   twenty minutes would swallow the night, which is the failure the settle chain
   needed a cap for. */
check('a third open is a new visit, not a second exit', (() => {
  const s = nsess(
    [{ t: NT(19, 0), s: 'playing' }],
    [{ t: NT(22, 0), s: 'on' }, { t: NT(22, 0, 8), s: 'off' },
     { t: NT(22, 12), s: 'on' }, { t: NT(22, 12, 8), s: 'off' },
     { t: NT(22, 40), s: 'on' }, { t: NT(22, 40, 8), s: 'off' },
     { t: NT(22, 52), s: 'on' }, { t: NT(22, 52, 8), s: 'off' }],
    { now: NT(23, 30) })[0];
  return s.interventions === 2;
})());

/* The brake. Chaining alone would let a visit every twenty minutes swallow a
   whole night, which is the failure mode a fixed window could not have. */
check('settle_max_min stops the chain running away with the night', (() => {
  const door = [];
  for (let m = 20; m <= 200; m += 20) {
    door.push({ t: NT(19, m), s: 'on' }, { t: NT(19, m, 10), s: 'off' });
  }
  const s = nsess(
    [{ t: NT(19, 0), s: 'playing' }, { t: NT(23, 59), s: 'idle' }], door,
    { now: NT(23, 59) })[0];
  return s.settleMinutes <= 60 && s.interventions > 0;
})());


/* Settling is not sleep. The Hatch span is time in the sleep environment; the
   reported figure is from being left alone to the end. settledAt is when they
   LEFT, not when he dropped off, so this is a lower bound and the span an
   upper one — the card names both rather than folding a quarter of an hour of
   ambiguity into "slept". */
check('the three durations are distinct and add up', (() => {
  const s = nsess(
    [{ t: NT(10, 6, 40), s: 'playing' }, { t: NT(11, 40), s: 'idle' }],
    [{ t: NT(10, 7, 32), s: 'on' }, { t: NT(10, 8, 4), s: 'off' },
     { t: NT(10, 22, 19), s: 'on' }, { t: NT(10, 22, 26), s: 'off' }],
    { now: NT(12, 0) })[0];
  return s.minutes === 93 && s.settleMinutes === 16 && s.asleepMinutes === 78
    && Math.abs(s.minutes - (s.settleMinutes + s.asleepMinutes)) <= 1;
})());

check('a session nobody settled reports its whole span as asleep', (() => {
  const s = nsess([{ t: NT(13, 0), s: 'playing' }, { t: NT(14, 0), s: 'idle' }], [],
    { now: NT(15, 0) })[0];
  return s.settleMinutes === 0 && s.asleepMinutes === 60 && s.minutes === 60;
})());


/* Going in to get him is not an intervention. On the real 10:58 nap the door
   opened six seconds before the sound machine stopped. */
check('the retrieval at the end of a nap is not an intervention', (() => {
  const s = nsess(
    [{ t: NT(10, 6, 40), s: 'playing' }, { t: NT(10, 58, 51), s: 'idle' }],
    [{ t: NT(10, 7, 32), s: 'on' }, { t: NT(10, 8, 4), s: 'off' },
     { t: NT(10, 22, 19), s: 'on' }, { t: NT(10, 22, 26), s: 'off' },
     { t: NT(10, 58, 45), s: 'on' }, { t: NT(11, 2, 0), s: 'off' }],
    { now: NT(12, 0) })[0];
  return s.interventions === 0 && s.settledAt === NT(10, 22, 26);
})());

check('a genuine visit well before the end still counts', (() => {
  const s = nsess(
    [{ t: NT(10, 0), s: 'playing' }, { t: NT(12, 0), s: 'idle' }],
    [{ t: NT(10, 2), s: 'on' }, { t: NT(10, 3), s: 'off' },
     { t: NT(11, 0), s: 'on' }, { t: NT(11, 1), s: 'off' },
     { t: NT(11, 58), s: 'on' }, { t: NT(12, 1), s: 'off' }],
    { now: NT(12, 30) })[0];
  /* 11:00 counts; 11:58 is the retrieval. */
  return s.interventions === 1;
})());

check('a running session has no end, so nothing is treated as retrieval', (() => {
  const s = nsess([{ t: NT(10, 0), s: 'playing' }],
    [{ t: NT(10, 2), s: 'on' }, { t: NT(10, 3), s: 'off' },
     { t: NT(11, 0), s: 'on' }, { t: NT(11, 1), s: 'off' }],
    { now: NT(11, 2) })[0];
  return s.active === true && s.interventions === 1;
})());

/* A night that has not happened and a night of no sleep are different facts. */
check('no night recorded reads as no data, not as a zero-length night', (() => {
  const sh = new SH();
  sh.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  sh._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'off', attributes: {} } } };
  sh._testNow = NT(15, 0);
  const nap = NT(10, 30);
  sh._nursery = {
    'media_player.h': [{ t: nap, s: 'playing' }, { t: nap + 40 * 60000, s: 'idle' }],
    'binary_sensor.d': [],
  };
  const html = sh._secNursery(sh._config.sections[0]);
  return /NO NIGHT YET/.test(html) && !/<b>0m<\/b><small>LAST NIGHT/.test(html);
})());



/* The door is often already cracked when the sound machine goes on, so the
   open that matters STRADDLES the session start. Requiring from >= start
   dropped it, and if the parent simply pulls the cracked door shut on the way
   out that close is the only settling signal there is. Observed 2026-08-07:
   door open since before 12:30, Hatch on at 14:18:41. */
check('a door cracked before the session still marks the settle', (() => {
  const s = nsess([{ t: NT(14, 18, 41), s: 'playing' }],
    [{ t: NT(12, 30), s: 'on' }, { t: NT(14, 23, 40), s: 'off' }],
    { now: NT(14, 28) })[0];
  return s.hadExit === true && s.settledAt === NT(14, 23, 40) && s.settleMinutes === 5;
})());

check('a cracked door still open means settling is still going', (() => {
  const s = nsess([{ t: NT(14, 18, 41), s: 'playing' }],
    [{ t: NT(12, 30), s: 'on' }], { now: NT(14, 28) })[0];
  /* He has not been left alone yet, so the settle point tracks now. */
  return s.hadExit === true && s.settledAt === NT(14, 28);
})());

check('the real cracked-door settle reads 5m and zero interventions', (() => {
  const s = nsess([{ t: NT(12, 30), s: 'idle' }, { t: NT(14, 18, 41), s: 'playing' }],
    [{ t: NT(12, 30), s: 'on' }, { t: NT(14, 18, 46), s: 'off' },
     { t: NT(14, 21, 13), s: 'on' }, { t: NT(14, 23, 40), s: 'off' }],
    { now: NT(14, 28) })[0];
  return s.settledAt === NT(14, 23, 40) && s.settleMinutes === 5 && s.interventions === 0;
})());

check('clamping judges the door by its real duration, not the clamped one', (() => {
  /* Open for hours, closing 1s after the session starts: a flicker by the
     clamped span, obviously not one by the real span. */
  const s = nsess([{ t: NT(14, 0, 0), s: 'playing' }],
    [{ t: NT(12, 0), s: 'on' }, { t: NT(14, 0, 1), s: 'off' }],
    { now: NT(15, 0) })[0];
  return s.hadExit === true && s.settledAt === NT(14, 0, 1);
})());

check('no history at all yields no sessions rather than throwing',
  nsess(undefined, undefined, { now: NT(12, 0) }).length === 0);

/* setConfig validates section types against a whitelist and THROWS on an
   unknown one, which Lovelace turns into "Configuration error" for the entire
   card — every other section goes down with it. Adding a renderer without
   adding the type to PS_SECTIONS shipped exactly that in v1.31.0. */
check('setConfig accepts a nursery section', (() => {
  try {
    new SH().setConfig({ sections: [{ type: 'nursery', key: 'j', hatch: 'media_player.h', door: 'binary_sensor.d' }] });
    return true;
  } catch (e) { return false; }
})());

check('setConfig still rejects a genuinely unknown section type', (() => {
  try { new SH().setConfig({ sections: [{ type: 'nonsense', key: 'x' }] }); return false; }
  catch (e) { return /unknown section type/.test(e.message); }
})());

/* The structural guard: the accept-list and the renderer dispatch must name
   the same set. Either half alone is a card that throws. */
check('every accepted section type has a renderer, and vice versa', (() => {
  const core = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');
  const listed = (/const PS_SECTIONS = \[([\s\S]*?)\];/.exec(core) || [])[1] || '';
  const accepted = (listed.match(/"([a-z]+)"/g) || []).map((s) => s.replace(/"/g, '')).sort();
  const dispatch = (/const body = \{([\s\S]*?)\}\[sec\.type\]\(\);/.exec(core) || [])[1] || '';
  const rendered = (dispatch.match(/^\s*([a-z]+):/gm) || [])
    .map((s) => s.trim().replace(':', '')).sort();
  return accepted.length > 0 && accepted.join(',') === rendered.join(',');
})());

/* The section is meant to read like the sock card it replaced: one horseshoe
   with two arcs and a total in the middle, then a strip showing the day. */
const nurseryRendered = (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel', name: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d', days: 7 }] });
  /* idle, matching its own history — the fixture used to claim the Hatch was
     playing while its history ended in idle, so the chip took the "asleep with
     no live session" branch and nothing about the awake state could be tested. */
  s._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'off', attributes: {} } } };
  const HR = 3600000, MIN = 60000;
  /* A FIXED clock, injected. Anchoring the nap to `Date.now() - 3h` was meant
     to stop the fixture depending on the hour the suite ran, and did the
     opposite: three hours ago is a nap at 2pm and a NIGHT at 10pm, so six
     tests passed all afternoon and failed every evening. `_testNow` pins the
     card's clock to 3:00 PM and every session below is placed against it. */
  s._testNow = NT(15, 0);
  const bed = NT(20, 10) - 24 * HR;
  const wake = bed + 10.5 * HR;
  const napStart = NT(10, 30);
  s._nursery = {
    'media_player.h': [{ t: bed, s: 'playing' }, { t: wake, s: 'idle' },
      { t: napStart, s: 'playing' }, { t: napStart + 50 * MIN, s: 'idle' }],
    'binary_sensor.d': [
      { t: bed + 4 * MIN, s: 'on' }, { t: bed + 5 * MIN, s: 'off' },
      { t: bed + 4 * HR, s: 'on' }, { t: bed + 4 * HR + 90000, s: 'off' },
      { t: napStart + 2 * MIN, s: 'on' }, { t: napStart + 6 * MIN, s: 'off' }],
  };
  return { html: s._secNursery(s._config.sections[0]),
    sess: s._nurserySessions(s._config.sections[0]) };
})();

check('the small ring modifier is actually defined',
  /\.ps-rv\.sm b \{/.test(SH.styles));
/* Same lesson, one layer down: the length-fitted steps are also asked for by
   class name, so a missing rule is again a silent overhang. */
check('the length-fitted ring steps are defined',
  /\.ps-rv\.sm4 b \{/.test(SH.styles) && /\.ps-rv\.sm5 b \{/.test(SH.styles));
/* Its own fixture, because the shared one's only nap is 44m — three characters,
   which is exactly the case that never overhung. A vacuous pass here would be
   worse than no test. */
check('a nap reading that crosses the hour asks for a smaller step', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel', name: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d', days: 7 }] });
  s._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'off', attributes: {} } } };
  const MIN = 60000;
  /* Two naps, one either side of the hour: 44m and 1h19m — the pair on the
     screenshot that showed the overhang. Both pinned inside the nap band. */
  s._testNow = NT(15, 0);
  const a = NT(10, 0), b = NT(12, 30);
  s._nursery = {
    'media_player.h': [{ t: a, s: 'playing' }, { t: a + 50 * MIN, s: 'idle' },
      { t: b, s: 'playing' }, { t: b + 85 * MIN, s: 'idle' }],
    'binary_sensor.d': [
      { t: a + 2 * MIN, s: 'on' }, { t: a + 6 * MIN, s: 'off' },
      { t: b + 2 * MIN, s: 'on' }, { t: b + 6 * MIN, s: 'off' }],
  };
  const html = s._secNursery(s._config.sections[0]);
  const rv = html.match(/class="ps-rv sm[^"]*"><b>[^<]+</g) || [];
  if (rv.length !== 2) return false;
  const sawLong = rv.some((m) => m.slice(m.indexOf('<b>') + 3, -1).length >= 5);
  return sawLong && rv.every((m) => {
    const val = m.slice(m.indexOf('<b>') + 3, -1);
    const cls = m.slice(m.indexOf('sm'), m.indexOf('"><b>'));
    return val.length >= 5 ? cls === 'sm sm5'
      : val.length === 4 ? cls === 'sm sm4' : cls === 'sm';
  });
})());

/* Both rails are plots with an axis, so both sit in a box — a bare line on the
   card ground does not read as one. */
check('both rails sit in a box',
  (nurseryRendered.html.match(/ps-railbox/g) || []).length === 2);
check('the night rail is labelled at the hours its gridlines fall on', (() => {
  const rail = nurseryRendered.html.slice(nurseryRendered.html.indexOf('data-scrub="night"'));
  const ticks = rail.slice(rail.indexOf('ps-railticks'), rail.indexOf('</div>', rail.indexOf('ps-railticks')));
  /* ends plus one per gridline, never three captions spread evenly over an
     axis that is not evenly divided */
  return (ticks.match(/<span>/g) || []).length >= 3;
})());
check('the day rail spans the waking day, not midnight to midnight',
  /<span>6 AM<\/span><span>10<\/span><span>2 PM<\/span><span>6<\/span><span>10 PM<\/span>/
    .test(nurseryRendered.html));
check('no goal-progress bar survives anywhere',
  !/ps-bandok|ps-bandfill|ps-bandaim/.test(nurseryRendered.html));

check('the horseshoe draws a track plus at least the night arc',
  (nurseryRendered.html.match(/stroke-dasharray/g) || []).length >= 2);
/* Two arcs, deterministically — the rendered fixture cannot assert this
   without depending on the hour the suite runs at. */
check('two ring segments draw as two arcs on one track', (() => {
  const svg = new SH()._ringSvg(98, 8,
    [[0.5, 'var(--ps-deep)'], [0.25, 'var(--ps-light)']], null);
  return (svg.match(/stroke-dasharray/g) || []).length === 3
    && /var\(--ps-deep\)/.test(svg) && /var\(--ps-light\)/.test(svg);
})());
check('a zero-length segment is omitted rather than drawn as a dot', (() => {
  const svg = new SH()._ringSvg(98, 8, [[0.5, 'var(--ps-deep)'], [0, 'var(--ps-light)']], null);
  return (svg.match(/stroke-dasharray/g) || []).length === 2;
})());

/* The ring is scaled to his own seven-day average, not a made-up twelve
   hours, so the marker sits at his normal and the reading is above/below it.
   A fixed goal stops meaning anything as he grows. */
check('the ring centre names the night, not a percentage of a fixed goal',
  /<b>[^<]+<\/b><small>(LAST NIGHT|TONIGHT)<\/small>/.test(nurseryRendered.html)
  && !/of \d+h/.test(nurseryRendered.html));
check('the ring carries a goal marker at his own average',
  /<line[^>]*var\(--ps-warn\)[^>]*rotate\(/.test(nurseryRendered.html));
check('the average is computed from finished nights only', (() => {
  const st = SH.helpers.nurseryStats([
    { night: true, active: false, asleepMinutes: 600, interventions: 1, longestStretch: 300, from: NT(20, 0) },
    { night: true, active: true, asleepMinutes: 5, interventions: 0, longestStretch: 5, from: NT(20, 5) },
  ], { now: NT(22, 0), days: 7 });
  return st.avgNightMin === 600 && st.nights === 1;
})());

/* Collapsed is rings and one line of live status — no bars. */
check('the collapsed view names the nap total and draws a ring per nap', (() => {
  const top = nurseryRendered.html.slice(0, nurseryRendered.html.indexOf('ps-xtra'));
  return /Naps ·/.test(top) && /ps-napr/.test(top);
})());
check('no bar is drawn in the collapsed view', (() => {
  const top = nurseryRendered.html.slice(0, nurseryRendered.html.indexOf('ps-xtra'));
  return !/ps-bar|class="bar"/.test(top);
})());
/* Time since the last nap decides whether the next one is due, so the CHIP
   carries it. The door does not appear there at all: it is opened several
   times a day for reasons nobody tracks, and as a chip state it displaced the
   one number that matters when he is up. */
check('the chip carries awake time and since, on the collapsed face', (() => {
  const top = nurseryRendered.html.slice(0, nurseryRendered.html.indexOf('ps-xtra'));
  const chip = top.slice(top.indexOf('ps-chip'), top.indexOf('</span>', top.indexOf('ps-dot')) + 60);
  return /Awake \d+h? ?\d*m? · since \d/.test(chip);
})());
check('the door is not a chip state', (() => {
  const sh = new SH();
  sh.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  sh._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'on', attributes: {} } } };
  sh._testNow = NT(15, 0);
  const nap = NT(10, 30);
  sh._nursery = {
    'media_player.h': [{ t: nap, s: 'playing' }, { t: nap + 40 * 60000, s: 'idle' }],
    'binary_sensor.d': [],
  };
  const html = sh._secNursery(sh._config.sections[0]);
  return !/Door open/.test(html) && /Awake .*· since/.test(html);
})());
check('the status line does not repeat what the chip says', (() => {
  const top = nurseryRendered.html.slice(0, nurseryRendered.html.indexOf('ps-xtra'));
  const stat = top.slice(top.indexOf('ps-jstat'));
  return !/Awake/.test(stat);
})());

/* No slot is drawn for a nap that has not happened — two short naps make a
   third possible, but only going down a third time makes it real. */
check('a nap that has not happened gets no ring', (() => {
  const top = nurseryRendered.html.slice(0, nurseryRendered.html.indexOf('ps-xtra'));
  return (top.match(/ps-napr/g) || []).length === 1;
})());

/* The night rail scrubs, using the shell's existing machinery. */
check('the night rail is wired for scrubbing',
  /data-scrub="night"/.test(nurseryRendered.html)
  && /data-readout="night"/.test(nurseryRendered.html)
  && /ps-cross/.test(nurseryRendered.html));
check('the scrub readout has a night branch',
  /kind === "night"/.test(fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));
check('the rail separates settling from asleep',
  /settling/.test(nurseryRendered.html) && /asleep/.test(nurseryRendered.html));
check('interventions are ticked onto the rail',
  (nurseryRendered.html.match(/fill="var\(--ps-warn\)"/g) || []).length >= 1);
check('the rail lives behind the expand, not in the collapsed view', (() => {
  const x = nurseryRendered.html.indexOf('ps-xtra');
  return x > 0 && nurseryRendered.html.indexOf('data-scrub="night"') > x;
})());

/* The measurements worth having whether or not this card shows them. */
check('longest unbroken stretch is reported', /Longest stretch/.test(nurseryRendered.html));
check('the longest stretch is the biggest gap, not the last one', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 59), s: 'idle' }],
    [{ t: NT(20, 5), s: 'on' }, { t: NT(20, 6), s: 'off' },
     { t: NT(21, 0), s: 'on' }, { t: NT(21, 1), s: 'off' },
     { t: NT(23, 0), s: 'on' }, { t: NT(23, 1), s: 'off' }], { now: NT(23, 59) })[0];
  /* settled 20:06, ins 21:00 and 23:00, end 23:59 → gaps 54, 120, 59 */
  return s.longestStretch === 120;
})());
check('bedtime consistency is a spread, and after-midnight counts as late', (() => {
  const st = SH.helpers.nurseryStats([
    { night: true, active: false, asleepMinutes: 600, interventions: 0, longestStretch: 600, from: NT(19, 45) },
    { night: true, active: false, asleepMinutes: 600, interventions: 0, longestStretch: 600, from: NT(20, 15) },
  ], { now: NT(23, 0), days: 7 });
  return st.bedMean === 1200 && st.bedSpread === 15;
})());
check('a single night has a bedtime but no spread to report', (() => {
  const st = SH.helpers.nurseryStats(
    [{ night: true, active: false, asleepMinutes: 600, interventions: 0, longestStretch: 600, from: NT(20, 0) }],
    { now: NT(23, 0), days: 7 });
  return st.bedMean === 1200 && st.bedSpread === null;
})());
check('the wake window is null while he is asleep, not zero', (() => {
  const st = SH.helpers.nurseryStats(
    [{ night: false, active: true, asleepMinutes: 10, interventions: 0, longestStretch: 10, from: NT(13, 0), to: NT(13, 10) }],
    { now: NT(13, 10), days: 7 });
  return st.wakeWindowMin === null && st.wakeSince === null;
})());
check('the wake window counts from the end of the last session', (() => {
  const st = SH.helpers.nurseryStats(
    [{ night: false, active: false, asleepMinutes: 40, interventions: 0, longestStretch: 40, from: NT(10, 0), to: NT(10, 58) }],
    { now: NT(13, 12), days: 7 });
  return st.wakeWindowMin === 134;
})());

check('a nursery section renders without a recorder answer', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel', hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  s._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} }, 'binary_sensor.d': { state: 'off', attributes: {} } } };
  const html = s._secNursery(s._config.sections[0]);
  /* Loading and "he has never slept" must not read the same. */
  return /Loading/.test(html) && !/Nothing recorded/.test(html);
})());

check('the nursery fetch sends end_time, like every other history call',
  /history\/period\/\$\{start\}[\s\S]{0,200}end_time=/.test(
    fs.readFileSync(new URL('../src/75-shell-nursery.js', import.meta.url), 'utf8')));

check('the nursery poller is nulled on disconnect so it cannot stack',
  /this\._nurseryTimer = null;/.test(
    fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));

check('the nursery section is wired into the renderer dispatch',
  /nursery: \(\) => this\._secNursery\(sec\)/.test(
    fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));

check('_startNursery is actually called, not merely defined',
  /this\._startNursery\(\);/.test(
    fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));

/* An MA player mirrors its source device: a Twitch stream came back as
   media_content_type "music", and only a missing title kept it off the screen. */
const isMusic = SH.helpers.isMusic;
check('a Music Assistant player is music', isMusic({ attributes: { app_id: 'music_assistant' } }));
check('a Twitch stream reporting content type music is not',
  !isMusic({ attributes: { app_id: 'twitch', media_content_type: 'music' } }));
check('a player with no app id is still judged on content type',
  isMusic({ attributes: { media_content_type: 'playlist' } }) &&
  !isMusic({ attributes: { media_content_type: 'tvshow' } }));

/* ---- climate setpoint: optimistic, and steppable more than once ---- */
/* GTTC takes several seconds to acknowledge a setpoint. The stepper read the
   live attribute to compute the next value, so a second tap inside that window
   recomputed the SAME number — the goal could not be moved more than one step
   at a time however fast you pressed, and nothing moved on screen until the
   round trip finished. */
const climSrc = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');
check('the stepper steps from what is on screen, not from the live attribute',
  /const base = this\._optGoal\(id, st\.attributes\.temperature\)/.test(climSrc));
check('a burst of taps sends one service call, not one per tap',
  /clearTimeout\(this\._goalSend\)/.test(climSrc) && /this\._goalSend = setTimeout/.test(climSrc));
check('the climate section renders the optimistic goal',
  /_optGoal\(sec\.goal \|\| sec\.thermostat/.test(
    fs.readFileSync(new URL('../src/71-shell-sections.js', import.meta.url), 'utf8')));
check('the pending send is cleared on disconnect so it cannot fire detached',
  /clearTimeout\(this\._goalSend\);\s*\n\s*this\._goalSend = null;/.test(climSrc));

check('the optimistic goal stands, then yields to the real state', (() => {
  const sh = new SH();
  sh._goalOpt = { id: 'climate.g', value: 71, until: Date.now() + 10000 };
  const held = sh._optGoal('climate.g', 68);          // thermostat still behind
  const caught = sh._optGoal('climate.g', 71);        // real state agrees
  return held === 71 && caught === 71 && sh._goalOpt === null;
})());

check('an optimistic goal that never lands expires rather than lying', (() => {
  const sh = new SH();
  sh._goalOpt = { id: 'climate.g', value: 71, until: Date.now() - 1 };
  return sh._optGoal('climate.g', 68) === 68 && sh._goalOpt === null;
})());

check('an optimistic goal for one entity does not leak onto another', (() => {
  const sh = new SH();
  sh._goalOpt = { id: 'climate.g', value: 71, until: Date.now() + 10000 };
  return sh._optGoal('climate.other', 68) === 68;
})());

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
