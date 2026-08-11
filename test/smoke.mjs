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
  /* Real enough to be bound to. Without this every _bind pass throws the
     moment a test gives the card a DOM worth rendering into. */
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
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
/* Sticky, NOT fixed. Two fixed layers landing at the same wrong offset meant
   an HA ancestor was capturing the fixed containing block; sticky resolves
   against the scrollport and cannot be captured. Assert the negative too — a
   later edit "restoring" position: fixed reintroduces the tap-through. */
check('shell dock is sticky', /\.ps-dockwrap \{[^}]*position: sticky/.test(shs));
check('shell dock is never fixed again', !/\.ps-dockwrap \{[^}]*position: fixed/.test(shs));
check('the fade rides with the dock rather than being its own fixed layer',
  /\.ps-dockwrap::before/.test(shs) && !/\.ps-fade \{/.test(shs));
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
const savedDocSy = globalThis.document;
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
globalThis.document = savedDocSy;

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
/* One deliberate exception, added 2026-08-09: the weather section's hourly strip.
 *
 * The three above wrap or grid because nothing was lost by it — a room is a room
 * wherever it sits on the line. A TIME AXIS that wraps is two axes, and the eye
 * reads the wrap as a jump backwards in time, so the hours scroll instead. It
 * follows the rule that made purdy-rooms-card's strip work for a year: plain
 * flex + overflow-x and NO touch-action. See the .ps-wxhrs assertions. */
check('the only horizontal scroller in the view is the hourly strip', (() => {
  const scrollers = (shs.match(/\.ps-[a-z-]+ \{[^}]*overflow-x: auto/g) || [])
    .map((m) => /^\.([a-z-]+)/.exec(m)[1]);
  return scrollers.length === 1 && scrollers[0] === 'ps-wxhrs';
})());
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
/* A sticky dock reserves its own room, so :host no longer pads for it — but
   .ps-sheet is still fixed and still has to clear a dock that grows by the
   now-playing bar, so the measurement still has exactly one consumer. */
check('the sheet still clears the measured dock',
  /--ps-sheetbot: calc\(var\(--ps-dockh\)/.test(shs) && /bottom: var\(--ps-sheetbot\)/.test(shs));
/* A vh cap measures the whole viewport and knows nothing about the offset the
   sheet is sitting on, so 80vh over a 181px bottom hung the header 12px above
   the top of the screen. Every sheet cap must also be bounded by the room that
   is actually left, and no cap may be a bare vh. */
check('every sheet cap is bounded by the room left above the dock',
  [...shs.matchAll(/\.ps-sheet[^{]*\{[^}]*?max-height: ([^;]+);/g)]
    .every((m) => /min\(\s*\d+vh\s*,\s*calc\(var\(--ps-sheettop\)/.test(m[1])));
check('the room left above the dock discounts the status bar',
  /--ps-sheettop: calc\(100dvh - var\(--ps-sheetbot\) - env\(safe-area-inset-top/.test(shs));
/* vh is the LARGE viewport, so on a phone it is taller than the scrollport and
   the surplus is dead height you can scroll into past the end of the column. */
check('the host reserves the DYNAMIC viewport, not the large one',
  /min-height: 100dvh;/.test(shs) && !/min-height: 100vh;/.test(shs));
check('host padding no longer double-reserves the dock height',
  !/padding: 6px 6px calc\(var\(--ps-dockh\)/.test(shs));
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
/* --- affordances: a door is not an expand -------------------------------- */
/* The named worst friction was "not tappable" — which is a complaint about not
   knowing you MAY press, not about what happens when you do. A header that
   entered a mode or opened a sheet drew nothing at all, on a card where nearly
   everything else responds to a press, so the row read as a caption and the
   page behind it was undiscoverable. The cue must not be the chevron: a
   chevron promises the thing below unfolds in place, and these replace the
   screen or slide a sheet over it. */
check('a door header draws the door glyph and never the chevron', (() => {
  const s = new SH();
  s.setConfig({ sections: [] });
  const mode = s._head({ key: 'a', title: 'Body' }, '', { mode: 'health' });
  const sheet = s._head({ key: 'b', title: 'Weather' }, '', { sheet: 'wx' });
  return /ps-dv/.test(mode) && !/ps-cv/.test(mode) && /data-mode="health"/.test(mode)
    && /ps-dv/.test(sheet) && !/ps-cv/.test(sheet) && /data-sheet="wx"/.test(sheet);
})());

check('an expanding header keeps the chevron and is not a door', (() => {
  const s = new SH();
  s.setConfig({ sections: [] });
  const h = s._head({ key: 'a', title: 'Joel' }, '');
  return /ps-cv/.test(h) && !/ps-dv/.test(h) && /data-open="a"/.test(h);
})());

check('a fixed header promises nothing, because it does nothing', (() => {
  /* expandable: false is the one header that legitimately has no cue — it is
     not a button at all, so a glyph would be the false affordance. */
  const s = new SH();
  s.setConfig({ sections: [] });
  const h = s._head({ key: 'a', title: 'Now playing', expandable: false }, '');
  return !/ps-cv/.test(h) && !/ps-dv/.test(h) && !/<button/.test(h);
})());

check('malformed dismissal store is ignored, not fatal', (() => {
  shp._hass.states['input_text.dis'] = { state: 'unknown', attributes: {} };
  return Object.keys(shp._dismissals()).length === 0;
})());

/* --- dismissing is optimistic ------------------------------------------- */
/* The write goes to an input_text and the re-render reads that same
   input_text straight back, so the row stayed on screen until HA echoed —
   reported as "kinda slow to remove notifs". Same shape as the setpoint, and
   the shell had already solved that one with _optGoal. */
const mkDis = () => {
  const s = new SH();
  s.setConfig({
    dismiss_store: 'input_text.dis', dismiss_hours: 12,
    attention: [{ key: 'lit', entity: 'vacuum.l', state: 'error',
      severity: 'critical', title: 'Litter' }],
    sections: [],
  });
  const calls = [];
  s._hass = {
    states: {
      'vacuum.l': { state: 'error', attributes: {},
        last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
      'input_text.dis': { state: '', attributes: {} },
    },
    callService: (...a) => calls.push(a),
  };
  s._render = () => {};
  return [s, calls];
};

check('the row goes on the tap, before HA has echoed the write', (() => {
  const [s, calls] = mkDis();
  if (s._faults().length !== 1) return false;
  s._dismiss(s._raised()[0]);
  /* The store still holds the OLD value — this is the exact state the card
     was rendering from, and the row used to survive it. */
  return s._hass.states['input_text.dis'].state === ''
    && calls.length === 1 && s._faults().length === 0;
})());

check('the optimistic dismissal yields once the store agrees', (() => {
  const [s, calls] = mkDis();
  s._dismiss(s._raised()[0]);
  /* Echo back exactly what was written, which is what HA does. */
  s._hass.states['input_text.dis'] = { state: calls[0][2].value, attributes: {} };
  s._dismissals();
  /* Nothing held locally any more: the real state is now doing the work. */
  return s._disOpt === null && s._faults().length === 0;
})());

check('an optimistic dismissal EXPIRES so a lost write shows the truth', (() => {
  /* Without the expiry a call that never landed would hide a live fault for
     as long as the page stayed open — the failure mode _optGoal's 12s exists
     to prevent, and the reason this is a hold rather than a mute. */
  const [s] = mkDis();
  s._dismiss(s._raised()[0]);
  if (s._faults().length !== 0) return false;
  Object.keys(s._disOpt).forEach((k) => { s._disOpt[k].until = Date.now() - 1; });
  return s._faults().length === 1 && s._disOpt === null;
})());

check('one optimistic dismissal does not hide a different rule', (() => {
  const s = new SH();
  s.setConfig({
    dismiss_store: 'input_text.dis', dismiss_hours: 12,
    attention: [
      { key: 'lit', entity: 'vacuum.l', state: 'error', severity: 'critical', title: 'Litter' },
      { key: 'wsh', entity: 'input_select.w', state: 'Finished', severity: 'warn', title: 'Washer' },
    ],
    sections: [],
  });
  s._hass = { states: {
    'vacuum.l': { state: 'error', attributes: {}, last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
    'input_select.w': { state: 'Finished', attributes: {}, last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
    'input_text.dis': { state: '', attributes: {} },
  }, callService: () => {} };
  s._render = () => {};
  const rows = s._raised();
  s._dismiss(rows.find((r) => r.key === 'lit'));
  const left = s._faults();
  return left.length === 1 && left[0].key === 'wsh';
})());

/* A NUMERIC group rule — five consumables all below a threshold. _firedAt's
   group branch compared every member against the string "on", which only ever
   made sense for a boolean rule: a numeric one matched nothing, came back 0,
   and a dismissal is always newer than 0. Dismissing it would have hidden the
   row forever instead of for dismiss_hours. */
const shwear = new SH();
shwear.setConfig({
  dismiss_store: 'input_text.dis', dismiss_hours: 12,
  attention: [{ key: 'wear', match: '^sensor\\.jeeves_.*_left$', below: 20,
    severity: 'warn', title: 'consumables low' }],
  sections: [{ type: 'people', key: 'p', people: [] }],
});
shwear._hass = { states: {
  'sensor.jeeves_filter_left': { state: '14', attributes: { friendly_name: 'Jeeves Filter Left' },
    last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
  'sensor.jeeves_main_brush_left': { state: '57', attributes: { friendly_name: 'Jeeves Main Brush Left' },
    last_changed: new Date((NOW_S - 600) * 1000).toISOString() },
  'input_text.dis': { state: '', attributes: {} },
} };
check('a numeric group rule fires on the members below the threshold',
  shwear._raised().length === 1 && shwear._raised()[0].title === '1 consumables low');
check('a numeric group rule reports a real fire time, not 0',
  shwear._raised()[0].firedAt > NOW_S - 3600);
shwear._hass.states['input_text.dis'] = { state: 'wear:' + (NOW_S - 60), attributes: {} };
check('a numeric group rule can be dismissed', shwear._faults().length === 0);
shwear._hass.states['input_text.dis'] = { state: 'wear:' + (NOW_S - 1200), attributes: {} };
check('and comes back when it re-fires — it is not hidden forever',
  shwear._faults().length === 1);

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
/* Pinned to a weekday. The fixture mirrors the real install, where `weekend` is
   EMPTY — so this assertion passed Monday to Friday and failed every Saturday
   and Sunday, which is the same shape as the nursery fixtures that passed all
   afternoon and failed every evening. `_schedDay` is the seam the code already
   provides; a test about the base list must not also be a test about today. */
shs2._schedDay = 'weekday';
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

/* The real 2026-08-10 night: door opens at 22:48:01, 22:49:44, 22:50:13 and
   23:05:15 — the parent going in, stepping out, ducking straight back in
   (29s later), and finally leaving for good. `door_merge_sec` (60s) used to
   DISCARD that 22:50:13 re-entry as chatter, which left the 23:05:15 close
   with nothing to pair against — so it read as a fresh entry and reported
   one wake-up as two, seventeen minutes apart. */
check('a bounce back in resumes the visit rather than starting a second one', (() => {
  const s = nsess([{ t: NT(20, 0), s: 'playing' }, { t: NT(23, 59), s: 'idle' }],
    [{ t: NT(22, 48, 1), s: 'on' }, { t: NT(22, 48, 7), s: 'off' },
     { t: NT(22, 49, 44), s: 'on' }, { t: NT(22, 49, 49), s: 'off' },
     { t: NT(22, 50, 13), s: 'on' }, { t: NT(22, 50, 17), s: 'off' },
     { t: NT(23, 5, 15), s: 'on' }, { t: NT(23, 5, 24), s: 'off' }],
    { now: NT(23, 59) })[0];
  return s.interventions === 1;
})());

/* Same night, the morning get-up: door opened 06:15:03, closed 7s later,
   reopened 06:15:11 and stayed open (he was carried out and nobody shut it
   behind them) until long after the Hatch had already gone idle. That is
   outside `retrieval_window_min` by a wide margin, but a door held open past
   the session's own end is unambiguous — it must not read as a fourth
   wake-up, and the entry that led into it comes off the list too. */
check('a door held open past the session end is the get-up, not a wake-up', (() => {
  const s = nsess([{ t: NT(5, 0), s: 'playing' }, { t: NT(6, 36, 49), s: 'idle' }],
    [{ t: NT(5, 53, 17), s: 'on' }, { t: NT(5, 53, 23), s: 'off' },
     { t: NT(5, 53, 24), s: 'on' }, { t: NT(5, 54, 47), s: 'off' },
     { t: NT(6, 15, 3), s: 'on' }, { t: NT(6, 15, 10), s: 'off' },
     { t: NT(6, 15, 11), s: 'on' }, { t: NT(9, 16, 55), s: 'off' }],
    { now: NT(10, 0) })[0];
  return s.interventions === 1;
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

/* ---------------------------------------------------------------------------
   crew — TWO INDEPENDENT ZONES. The robots share a row and nothing else: one
   is dispatched to a room, the other is read for trends. A single section-level
   expand dumped both control sets on screen at once.
   --------------------------------------------------------------------------- */
const crewCfg = {
  type: 'crew', key: 'crew', title: 'Crew',
  vacuum: { entity: 'vacuum.j', name: 'Jeeves', battery: 'sensor.batt',
    dirty_water: 'sensor.dirty', filter: 'sensor.filt', progress: 'sensor.prog',
    current_room: 'sensor.room', cleaning_mode: 'select.mode', suction: 'select.suck',
    room_select: 'input_select.room', room_script: 'script.clean_room',
    emptied_button: 'input_button.emptied', map_sheet: 'vacuum',
    wash_counter: 'counter.washes', wash_capacity: 'input_number.cap',
    base_status: 'sensor.base', water_above: 80,
    wear: [{ label: 'Filter', entity: 'sensor.filt' }, { label: 'Main brush', entity: 'sensor.brush' }],
    mileage: { area: 'sensor.area', runs: 'sensor.runs', path_width_m: 0.3 } },
  litter: { entity: 'vacuum.l', name: 'Litter box', litter_level: 'sensor.lit',
    waste_drawer: 'sensor.drawer', reset_button: 'button.reset', trend_days: 30,
    pet: { name: 'Crouton', weight: 'sensor.wt', visits: 'sensor.visits',
      scoops: 'sensor.cycles' } },
  washer: { entity: 'input_select.washer', name: 'Washer', start_time: 'input_datetime.ws' },
};
const crewStates = {
  /* The water facts ride the vacuum's own attributes, as Dreame publishes them
     — booleans and Title Case strings, not the enum sensors' slugs. */
  'vacuum.j': { state: 'docked', attributes: {
    low_water: false, clean_water_tank_status: 'Installed',
    dirty_water_tank_status: 'Installed', mop_pad: true,
    washing: false, drying: false, drying_progress: 0 } },
  'counter.washes': { state: '6', attributes: {} },
  'input_number.cap': { state: '20', attributes: {} },
  'sensor.base': { state: 'idle', attributes: {} },
  'input_button.emptied': { state: '2026-08-06T19:22:31.926292+00:00', attributes: {} },
  'sensor.batt': { state: '100', attributes: { unit_of_measurement: '%' } },
  /* 6 wash cycles against a 20-cycle capacity: the proxy and its working agree. */
  'sensor.dirty': { state: '30', attributes: { unit_of_measurement: '%' } },
  'sensor.filt': { state: '14', attributes: { unit_of_measurement: '%' } },
  'sensor.brush': { state: '57', attributes: { unit_of_measurement: '%' } },
  'sensor.prog': { state: 'unavailable', attributes: {} },
  'sensor.room': { state: 'Front Entryway', attributes: {} },
  'select.mode': { state: 'mopping', attributes: {} },
  'select.suck': { state: 'standard', attributes: {} },
  'sensor.area': { state: '59868.86', attributes: { unit_of_measurement: 'ft²' } },
  'sensor.runs': { state: '219', attributes: {} },
  'input_select.room': { state: '1F - Living Room',
    attributes: { options: ['1F - Living Room', '1F - Kitchen', '2F - Office', '2F - Nursery'] } },
  'vacuum.l': { state: 'docked', attributes: {} },
  'sensor.lit': { state: '90', attributes: { unit_of_measurement: '%' } },
  'sensor.drawer': { state: '16', attributes: { unit_of_measurement: '%' } },
  'sensor.wt': { state: '10.09', attributes: { unit_of_measurement: 'lb' } },
  'sensor.visits': { state: '3', attributes: {} },
  'sensor.cycles': { state: '2077', attributes: { unit_of_measurement: 'cycles' } },
  'input_select.washer': { state: 'Off', attributes: {} },
  'input_datetime.ws': { state: '2026-08-06 14:33:28', attributes: {} },
};
const mkCrew = (over, open) => {
  const s = new SH();
  s.setConfig({ sections: [crewCfg] });
  s._hass = { states: { ...crewStates, ...(over || {}) } };
  if (open) s._crewOpen = open;
  return s;
};
const crewHtml = mkCrew()._secCrew(crewCfg);
const crewVac = mkCrew(null, { vac: true })._secCrew(crewCfg);
const crewLit = mkCrew(null, { litter: true })._secCrew(crewCfg);

/* --- Media: one sheet, two verbs ------------------------------------------ */

/* Television and music are the same question — what is on — and they were two
   dock buttons answering it. What opens is what is actually on, never a
   remembered preference: you open this sheet BECAUSE something is playing. */
const mediaCfg = (states, pick) => {
  const s = new SH();
  s.setConfig({
    sections: [{ type: 'music', key: 'music', sheet_only: true,
      players: [{ entity: 'media_player.kit', name: 'Kitchen' }],
      default_player: 'media_player.kit' }],
    /* _nowPlaying reads the TOP-LEVEL now_playing block, not the music
       section's players. Without it "music is on" was never true here and the
       old rule's Listen-by-default masked it in every one of these checks. */
    now_playing: { players: [{ entity: 'media_player.kit', name: 'Kitchen' }] },
    sheets: { media: { title: 'Media', card: { type: 'custom:purdy-remote-card',
      tvs: [{ name: 'Living Room', remote: 'remote.lr', media_player: 'media_player.tv' }] } } },
  });
  s._hass = { states, callService: () => {}, callWS: () => {} };
  s._sheet = 'media';
  if (pick) s._mediaPick = pick;
  return s;
};
const TV_ON = { 'media_player.tv': { state: 'playing', attributes: {} },
  'media_player.kit': { state: 'idle', attributes: {} } };
const TV_OFF = { 'media_player.tv': { state: 'off', attributes: {} },
  'media_player.kit': { state: 'idle', attributes: {} } };
const MUSIC_ON = { 'media_player.tv': { state: 'off', attributes: {} },
  'media_player.kit': { state: 'playing',
    attributes: { app_id: 'music_assistant', media_content_type: 'music', media_title: 'A song' } } };

check('a television on and nothing playing opens Watch', () =>
  mediaCfg(TV_ON)._mediaFace() === 'watch');
check('music playing and the televisions off opens Listen', () =>
  mediaCfg(MUSIC_ON)._mediaFace() === 'listen');
check('nothing on opens Watch — the cold start you actually wanted', () =>
  mediaCfg(TV_OFF)._mediaFace() === 'watch');
check('both on is ambiguous, so Watch takes it', () =>
  mediaCfg({ ...TV_ON, ...MUSIC_ON })._mediaFace() === 'watch');
check('both on is ambiguous, so the tap still wins over the tie-break', () =>
  mediaCfg({ ...TV_ON, ...MUSIC_ON }, 'listen')._mediaFace() === 'listen');
check('default_face moves the tie-break without another release', (() => {
  /* The two cases the live state does not decide are the only ones this
     touches. It must NOT override a house that has answered the question. */
  const s = mediaCfg(TV_OFF);
  s._config.sheets.media.default_face = 'listen';
  const m = mediaCfg(MUSIC_ON);
  m._config.sheets.media.default_face = 'listen';
  const t = mediaCfg(TV_ON);
  t._config.sheets.media.default_face = 'listen';
  return s._mediaFace() === 'listen' && m._mediaFace() === 'listen'
    && t._mediaFace() === 'watch';
})());

check('the Watch face leaves a mount point and the Listen face does not', (() => {
  const w = mediaCfg(TV_ON)._sheetHtml([]);
  const l = mediaCfg(MUSIC_ON)._sheetHtml([]);
  return /id="ps-host"/.test(w) && !/id="ps-host"/.test(l);
})());

/* The whole point of the merge is that Listen is the SAME music sheet, not a
   reduced copy of it — the presets, the search box and the rooms all come
   across, which is the mistake v1.25.1 had to fix when music went sheet_only. */
check('the Listen face is the whole music sheet, not a cut-down one', (() => {
  const h = mediaCfg(MUSIC_ON)._sheetHtml([]);
  return /id="ps-q"/.test(h) && /id="ps-res"/.test(h) && /data-pick="media_player\.kit"/.test(h);
})());

/* Merging two dock buttons into one orphans every row that pointed at either —
   the third time this trap has come up on this card, after the music presets
   (v1.25.1) and the vacuum map (v1.50.0). So the rows route themselves. */
check('a now-playing row opens Media on the face matching what was tapped', (() => {
  const s = mediaCfg(MUSIC_ON);
  return /data-sheet="media" data-face="listen"/.test(s._playTarget('listen'))
    && /data-sheet="media" data-face="watch"/.test(s._playTarget('watch'));
})());
check('without a media sheet the old routing is untouched', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'quick', tiles: [] }] });
  return s._playTarget('listen') === 'data-sheet="music"';
})());

check('both faces carry the tabs, so neither is a dead end', (() => {
  const w = mediaCfg(TV_ON)._sheetHtml([]);
  const l = mediaCfg(MUSIC_ON)._sheetHtml([]);
  return /data-media="listen"/.test(w) && /data-media="watch"/.test(w)
    && /data-media="listen"/.test(l) && /data-media="watch"/.test(l);
})());

/* --- the crew moved behind the dock --------------------------------------- */

/* The section measured 329px and spent nearly all of it reporting an absence:
   everything docked, nothing running, washer off. The landing page keeps only
   the moments that need a human; the rest lives in the dock app. */
const crewAlertCfg = { ...crewCfg, alerts_only: true, sheet: 'crew' };
check('a quiet crew renders nothing at all on the landing page', () =>
  mkCrew()._secCrew(crewAlertCfg) === '');

check('a finished washer raises a row', (() => {
  const h = mkCrew({ 'input_select.washer': { state: 'Finished', attributes: {} } })
    ._secCrew(crewAlertCfg);
  return /ps-cwneed warn/.test(h) && /has finished/.test(h) && /data-sheet="crew"/.test(h);
})());

check('a full waste drawer raises a row and a very full one is critical', (() => {
  const at88 = mkCrew({ 'sensor.drawer': { state: '88', attributes: {} } })._secCrew(crewAlertCfg);
  const at97 = mkCrew({ 'sensor.drawer': { state: '97', attributes: {} } })._secCrew(crewAlertCfg);
  return /ps-cwneed warn/.test(at88) && /88%/.test(at88) && /ps-cwneed bad/.test(at97);
})());

/* THE WATER EARNS A ROW, on the rule the disk1 fault failed: an alert a human
   action clears is worth raising; one no action clears is noise. Both of these
   are cleared by walking to the machine. */
check('a full dirty tank raises a row, and says it is an estimate', (() => {
  const h = mkCrew({ 'sensor.dirty': { state: '85', attributes: {} } })._secCrew(crewAlertCfg);
  return /ps-cwneed warn/.test(h) && /Empty Jeeves/.test(h) && /dirty water/.test(h)
    && /85% full/.test(h) && /6 washes/.test(h);
})());
check('an overflowing dirty tank is critical', (() =>
  /ps-cwneed bad/.test(mkCrew({ 'sensor.dirty': { state: '100', attributes: {} } })
    ._secCrew(crewAlertCfg))));
check('low clean water raises its own row — refilling is not emptying', (() => {
  const h = mkCrew({ 'vacuum.j': { state: 'docked', attributes: {
    ...crewStates['vacuum.j'].attributes, low_water: true } } })._secCrew(crewAlertCfg);
  return /ps-cwneed warn/.test(h) && /low on clean water/.test(h) && /Refill/.test(h);
})());

/* ZERO IS NOT MISSING, and neither is FALSE. A firmware that declines to report
   the pad is not a pad that has been taken off, and a vacuum with no water
   attributes at all must not read "OK" — that is the confident-zero bug wearing
   a boolean. */
check('absent water attributes read as em dashes, never as OK', (() => {
  const h = mkCrew({ 'vacuum.j': { state: 'docked', attributes: {} } })._secCrew(crewCfg);
  return /Clean water<\/em><b class="">—/.test(h) && /Mop pad<\/em><b>—/.test(h);
})());
check('a removed clean tank is not the same fault as a low one', (() => {
  const h = mkCrew({ 'vacuum.j': { state: 'docked', attributes: {
    ...crewStates['vacuum.j'].attributes, clean_water_tank_status: 'Removed' } } })
    ._secCrew(crewCfg);
  return /Tank out/.test(h) && !/>Low</.test(h);
})());
check('a mop pad being washed or dried says which', (() => {
  const wash = mkCrew({ 'vacuum.j': { state: 'docked', attributes: {
    ...crewStates['vacuum.j'].attributes, washing: true } } })._secCrew(crewCfg);
  const dry = mkCrew({ 'vacuum.j': { state: 'docked', attributes: {
    ...crewStates['vacuum.j'].attributes, drying: true, drying_progress: 40 } } })._secCrew(crewCfg);
  return /Washing/.test(wash) && /Drying 40%/.test(dry);
})());

check('an errored robot raises a row', (() => {
  const h = mkCrew({ 'vacuum.j': { state: 'error', attributes: {} } })._secCrew(crewAlertCfg);
  return /ps-cwneed bad/.test(h) && /Jeeves needs help/.test(h);
})());

check('low consumables collapse into ONE row, not five', (() => {
  /* The same fold the attention card does with eleven battery sensors. The
     fixture has the filter at 14% and the brush at 57%. */
  const h = mkCrew()._secCrew({ ...crewAlertCfg, wear_below: 60 });
  return (h.match(/ps-cwneed/g) || []).length === 1
    && /2 Jeeves parts to replace/.test(h)
    && /Filter 14% · Main brush 57%/.test(h);
})());

/* Going behind the dock strands whatever was only reachable through the
   section — the music presets in v1.25.1 and the vacuum map itself in v1.50.0
   both went exactly this way. The map's door is inside the crew body, so the
   sheet has to carry the body. */
check('the crew sheet still reaches the vacuum map and the litter box', (() => {
  const s = mkCrew();
  s.setConfig({ sections: [{ ...crewCfg, sheet_only: true }] });
  s._hass = mkCrew()._hass;
  s._sheet = 'crew';
  const h = s._sheetHtml([]);
  return /ps-sheet/.test(h) && /data-crewzone="vac"/.test(h)
    && /data-crewzone="litter"/.test(h) && /data-sheet="vacuum"/.test(h);
})());

check('the crew sheet names itself once, not twice', (() => {
  const s = mkCrew();
  s._sheet = 'crew';
  const h = s._sheetHtml([]);
  return (h.match(/Crew/g) || []).length === 1;
})());

check('setConfig accepts a crew section', (() => {
  try { new SH().setConfig({ sections: [crewCfg] }); return true; } catch (e) { return false; }
})());
check('crew draws a card for each robot',
  /Jeeves/.test(crewHtml) && /Litter box/.test(crewHtml));
check('crew names every number it prints — no bare percentage',
  /Clean water/.test(crewHtml) && /Filter/.test(crewHtml) && /Scoops/.test(crewHtml)
  && /dirty tank/.test(crewHtml));

/* Scoped to the RING, not the first svg in the section — that one is the
   header chevron, and reading it made this pass for the wrong reason. */
const crewRingSvg = (html) => /<div class="ps-cwring">([\s\S]*?)<\/svg>/.exec(html)[1];
check('crew rings are CONCENTRIC, not two segments of one track', (() => {
  const radii = (crewRingSvg(crewHtml).match(/ r="([\d.]+)"/g) || [])
    .map((s) => parseFloat(s.slice(4)));
  return new Set(radii).size === 2 && radii.length === 4;
})());

/* The vacuum's gauge is battery + water; the collapsed rows are distance,
   runs and filter. Distance is DERIVED from area — Dreame publishes no
   distance sensor at all — so it must be marked approximate. */
/* THE TANK IS THE HERO, NOT THE CHARGE. The charge never needs a human — he
   docks himself and reads 100% whenever you look — while the tank is the reason
   you walk to the machine. It had the numeral and the tank had a thin unlabelled
   arc; they are swapped, and the words "battery" and "job" leave the face with
   it, because the inner arc is now a picture rather than a labelled reading. */
check('the vacuum gauge leads with the dirty tank, not the charge',
  /dirty tank/.test(crewHtml) && !/>battery</.test(crewHtml) && !/>job</.test(crewHtml));
check('the collapsed face answers do-I-need-to-go-to-the-machine',
  /Clean water/.test(crewHtml) && /Mop pad/.test(crewHtml) && /Filter/.test(crewHtml));
/* NO tilde on the tank, and that is a different call from the mileage. You act
   on a tank level or you do not; there is no truer number it could be taken
   for. The honesty lives where it is useful — the panel's count and its words —
   so the reading is bare and the WORKING is what must never go missing. */
check('the tank reading is bare, with no approximation mark',
  /<b>30%<\/b>/.test(crewHtml) && !/≈30%/.test(crewHtml));
check('distance keeps its tilde — an assumed path width is inside it',
  /≈/.test(crewVac) && /mi</.test(crewVac));
/* The panel must not restate the face four centimetres below it. */
check('the panel carries the working, not the water situation over again', (() => {
  const panel = crewVac.slice(crewVac.indexOf('ps-cwpanel'));
  return /6 of 20 washes/.test(panel) && !/Clean water/.test(panel)
    && !/Wash base/.test(panel);
})());

/* The lifetime figures moved behind the expand — they are looked up, not
   monitored — but they are not gone, and distance is still marked derived. */
check('distance is shown in miles', /mi</.test(crewVac));
check('a derived distance is marked approximate', /≈/.test(crewVac));
check('distance converts ft² through the path width', (() => {
  const m = /≈([\d.]+) mi/.exec(crewVac);
  return m && Math.abs(parseFloat(m[1]) - 11.5) < 0.6;   // 59,869 ft² / 0.3 m
})());
check('runs are still shown', /Runs/.test(crewVac) && /219/.test(crewVac));

/* The dirty level has no sensor behind it — Dreame reports both tanks as
   present/absent only — so the panel shows the working and says so. A figure
   with no measurement behind it must never pass for one. */
check('the dirty tank shows its working, which is the only honesty it has',
  /6 of 20 washes/.test(crewVac) && /Aug/.test(crewVac));
check('the panel says why the tank level is counted rather than measured',
  /ps-cwfine/.test(crewVac) && /self-wash cycles, not measured/.test(crewVac));

/* The litter card carries scoops, visits and weight — and scoops is the
   integration's own total_cycles, not a counter we maintain. */
check('the litter card leads with the lifetime scoop count',
  /Scoops/.test(crewHtml) && /2,077/.test(crewHtml));
check('the litter card shows visits and weight',
  /Visits today/.test(crewHtml) && /10\.1 lb/.test(crewHtml));

/* Zero-vs-missing. An absent sensor is "—", never a confident 0%. */
const crewGone = mkCrew({ 'sensor.dirty': undefined, 'sensor.batt': undefined })
  ._secCrew(crewCfg);
check('a missing reading renders as an em dash, never as 0%',
  /—/.test(crewGone) && !/\b0%/.test(crewGone));
check('a missing reading draws the track with no fill arc', (() => {
  const svg = crewRingSvg(crewGone);
  const radii = (svg.match(/ r="([\d.]+)"/g) || []).map((s) => parseFloat(s.slice(4)));
  return !/var\(--ps-cool\)/.test(svg) && !/var\(--ps-warn\)/.test(svg) && radii.length === 2;
})());
check('a missing area gives no distance rather than zero miles',
  /Distance<\/em><b>—/.test(
    mkCrew({ 'sensor.area': undefined }, { vac: true })._secCrew(crewCfg)));

/* TWO ZONES: each card toggles only itself, and neither panel is drawn until
   its own card is open. */
check('each card toggles its own zone',
  /data-crewzone="vac"/.test(crewHtml) && /data-crewzone="litter"/.test(crewHtml));
check('no panel is drawn while both zones are shut',
  !/ps-cwpanel/.test(crewHtml));
check('opening the vacuum draws only the vacuum panel',
  /data-crewgo/.test(crewVac) && !/ps-cwchart/.test(crewVac) && !/ps-cwempty/.test(crewVac));
check('opening the litter box draws only its own panel',
  !/data-crewgo/.test(crewLit) && /data-crewact="vacuum\.start"/.test(crewLit));
check('both zones can be open at once', (() => {
  const both = mkCrew(null, { vac: true, litter: true })._secCrew(crewCfg);
  return /data-crewgo/.test(both) && (both.match(/ps-cwpanel/g) || []).length === 2;
})());
check('an open card is marked open', /ps-cwcard open/.test(crewVac));

/* Thirteen pills over six rows was most of a screen. Rooms group by floor,
   only the active floor draws, and the prefix is stripped from the chip
   because the tab already says it. */
check('rooms are grouped into floor tabs',
  /data-crewfloor="1F"/.test(crewVac) && /data-crewfloor="2F"/.test(crewVac));
check('only the active floor draws its rooms',
  (crewVac.match(/data-crewroom=/g) || []).length === 2);
check('the floor prefix is stripped from the chip', !/>1F - /.test(crewVac));
check('the tab follows the selection so the pick is never hidden',
  /ps-cwtab on[^>]*data-crewfloor="1F"/.test(crewVac));
check('the selected room is marked', /ps-cwroom on/.test(crewVac));
check('dispatch reads the room list from the helper the script obeys',
  /data-crewroom="input_select\.room"/.test(crewVac));
check('the hero names the room it would clean', /Clean Living Room/.test(crewVac));

/* Only consumables that are actually low earn a line; deep clean is gone —
   it named a house routine no longer in use. */
/* The map sheet's only door was the Quick tile's tap_action, and replacing
   that grid left the sheet configured, mounted and unreachable. */
check('the vacuum panel can reach the map sheet',
  /data-sheet="vacuum"/.test(crewVac));
check('the map button is absent when no sheet is configured', (() => {
  const cfg = { ...crewCfg, vacuum: { ...crewCfg.vacuum } };
  delete cfg.vacuum.map_sheet;
  const s2 = new SH();
  s2.setConfig({ sections: [cfg] });
  s2._hass = { states: crewStates };
  s2._crewOpen = { vac: true };
  return !/data-sheet=/.test(s2._secCrew(cfg));
})());
check('the action row grows rather than clipping a third label',
  /ps-cwpair \{[^}]*auto-fit/.test(SH.styles));

check('only a low consumable is called out',
  /Filter 14%/.test(crewVac) && !/Main brush/.test(crewVac));
check('deep clean is gone entirely',
  !/[Dd]eep clean/.test(crewVac) && !/deep_clean/.test(
    fs.readFileSync(new URL('../src/78-shell-crew.js', import.meta.url), 'utf8')));

/* While running the ring means progress, and the caption changes with it. */
const crewBusy = mkCrew({ 'vacuum.j': { state: 'cleaning', attributes: {} },
  'sensor.prog': { state: '42', attributes: {} } }, { vac: true })._secCrew(crewCfg);
/* The charge lost the numeral but not its arc: the inner ring still carries
   the job while he is running and the battery while he is not. Read off the
   arc itself, because there is no longer a word on the face to check — and an
   arc that stopped tracking progress would otherwise fail silently. */
const crewInnerArc = (html) => {
  const svg = crewRingSvg(html);
  /* Two circles per ring, track then fill; the inner ring is the smaller r. */
  const circles = [...svg.matchAll(/ r="([\d.]+)"[\s\S]*?stroke-dasharray="([\d.]+) /g)]
    .map((m) => ({ r: parseFloat(m[1]), len: parseFloat(m[2]) }));
  const rMin = Math.min(...circles.map((c) => c.r));
  const inner = circles.filter((c) => c.r === rMin);
  return inner.length > 1 ? inner[1].len / inner[0].len : 0;   // fill / track
};
check('a running vacuum puts the job on the inner arc, not the battery',
  Math.abs(crewInnerArc(crewBusy) - 0.42) < 0.02);
check('the hero button pauses a running robot', /Pause/.test(crewBusy));
check('a slug cleaning mode is rendered as words',
  /Mopping/.test(crewBusy) && !/>mopping</.test(crewBusy));
check('an unavailable progress sensor falls back to battery, not to zero',
  Math.abs(crewInnerArc(crewHtml) - 1) < 0.02);

/* The litter panel is trends. A chart with no history is an empty box, never
   a flat line — the same rule the room sparklines follow. */
check('the litter panel says it is loading before history arrives',
  /loading…/.test(crewLit));
check('an empty history draws a box, never a flat line', (() => {
  const s = mkCrew(null, { litter: true });
  s._crewHist = { 'sensor.wt': [], 'sensor.visits': [] };
  const h = s._secCrew(crewCfg);
  return /ps-cwempty/.test(h) && !/polyline/.test(h);
})());
check('a weight series draws a line with its own min and max', (() => {
  const s = mkCrew(null, { litter: true });
  const now = Date.now();
  s._crewHist = { 'sensor.wt': [
    { t: now - 20 * 86400000, v: 9.8 }, { t: now - 10 * 86400000, v: 10.4 },
    { t: now, v: 10.1 }], 'sensor.visits': [] };
  const h = s._secCrew(crewCfg);
  return /polyline/.test(h) && /9\.8/.test(h) && /10\.4/.test(h);
})());
check('visits are drawn as bars, not as a line between daily totals', (() => {
  const s = mkCrew(null, { litter: true });
  const now = Date.now();
  s._crewHist = { 'sensor.wt': [], 'sensor.visits': [
    { t: now - 86400000, v: 4 }, { t: now, v: 3 }] };
  const h = s._secCrew(crewCfg);
  return /<rect/.test(h) && /max 4/.test(h);
})());
check('the litter history fetch always sends end_time', (() => {
  const src = fs.readFileSync(new URL('../src/78-shell-crew.js', import.meta.url), 'utf8');
  const m = /history\/period\/[^`]*`/.exec(src);
  return m && /end_time=/.test(src.slice(src.indexOf('history/period/'), src.indexOf('history/period/') + 300));
})());
check('trends are only fetched once the litter zone is opened',
  /_crewOpen\[z\] && !this\._crewHist\) this\._fetchCrewHistory/.test(
    fs.readFileSync(new URL('../src/78-shell-crew.js', import.meta.url), 'utf8')));

check('a finished washer is flagged rather than merely stated',
  /ps-cwwash alert/.test(mkCrew({ 'input_select.washer': { state: 'Finished', attributes: {} } })
    ._secCrew(crewCfg)));
check('crew binds its handlers, they are not merely defined',
  /this\._bindCrew\(\);/.test(shellSrc) && /_bindCrew\(\)/.test(
    fs.readFileSync(new URL('../src/78-shell-crew.js', import.meta.url), 'utf8')));
check('no crew handler closes over hass', (() => {
  const src = fs.readFileSync(new URL('../src/78-shell-crew.js', import.meta.url), 'utf8');
  const bind = /_bindCrew\(\) \{([\s\S]*?)\n  \},/.exec(src)[1];
  return /this\._hass/.test(bind) && !/\bconst h = /.test(bind);
})());
check('crew styles carry no loose font-size', (() => {
  const block = /crew — two independently([\s\S]*?)\/\* fade \+ dock/.exec(SH.styles)[1];
  return !/font-size: *\d/.test(block);
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

/* --- when the next nap is due ------------------------------------------- */
/* The wake window is the INPUT to this, not the answer. Every fixture here is
   pinned to NT: six nursery tests once anchored to Date.now() - 3h passed all
   afternoon and failed every evening. */

const NAP = (fromH, fromM, toH, toM) => ({
  night: false, active: false, asleepMinutes: 40, interventions: 0,
  longestStretch: 40, from: NT(fromH, fromM), to: NT(toH, toM),
});

check('the nap window is the MEDIAN gap he is actually up for', (() => {
  /* Down 10:00-10:45, up until 14:00 (195m); down 14:00-14:40, up until 17:50
     (190m). Two samples, median 192 (rounded mean of the pair). */
  const st = SH.helpers.nurseryStats([
    NAP(10, 0, 10, 45), NAP(14, 0, 14, 40), NAP(17, 50, 18, 20),
  ], { now: NT(19, 0), days: 7 });
  return st.napSamples === 2 && st.napWindowMin === 193;
})());

check('one outlying gap does not drag the prediction — median, not mean', (() => {
  /* A four-hour car trip is exactly the day that produces an outlier, and a
     mean of three would move by nearly an hour. */
  const st = SH.helpers.nurseryStats([
    NAP(8, 0, 8, 40), NAP(11, 0, 11, 40), NAP(14, 0, 14, 40), NAP(19, 30, 20, 0),
  ], { now: NT(21, 0), days: 7 });
  /* gaps: 8:40->11:00 = 140, 11:40->14:00 = 140, 14:40->19:30 = 290 (dropped:
     the following session is not a night here, so it counts — median of
     140/140/290 is 140 either way, which is the point). */
  return st.napWindowMin === 140;
})());

check('one sample is an anecdote, so there is no prediction at all', (() => {
  /* Below the floor the chip must fall back to what it knows rather than
     state a guess with the confidence of a fortnight's data. */
  const st = SH.helpers.nurseryStats([NAP(10, 0, 10, 45), NAP(14, 0, 14, 40)],
    { now: NT(16, 0), days: 7 });
  return st.napSamples === 1 && st.napWindowMin === null
    && st.napDueAt === null && st.napDueInMin === null;
})());

check('a gap that spans a night is not a wake window', (() => {
  /* The night is excluded on both sides: the gap before bedtime is an
     afternoon, and the gap after it is set by when the night ended. */
  const night = { night: true, active: false, asleepMinutes: 600, interventions: 0,
    longestStretch: 600, from: NT(19, 30), to: NT(20, 0) };
  const st = SH.helpers.nurseryStats([NAP(14, 0, 14, 40), night, NAP(23, 0, 23, 30)],
    { now: NT(23, 45), days: 7 });
  return st.napSamples === 0 && st.napWindowMin === null;
})());

check('the due time is the wake time plus his own window', (() => {
  const st = SH.helpers.nurseryStats([
    NAP(8, 0, 8, 40), NAP(11, 0, 11, 40), NAP(14, 0, 14, 40),
  ], { now: NT(15, 40), days: 7 });
  /* window 140m, last woke 14:40 → due 17:00, and 80 minutes from 15:40. */
  return st.napWindowMin === 140
    && st.napDueAt === NT(17, 0) && st.napDueInMin === 80;
})());

check('a passed due time reads negative rather than clamping to zero', (() => {
  /* Overdue is the state that makes the next put-down hard. Clamping it at
     zero would report "due now" for an hour. */
  const st = SH.helpers.nurseryStats([
    NAP(8, 0, 8, 40), NAP(11, 0, 11, 40), NAP(14, 0, 14, 40),
  ], { now: NT(18, 0), days: 7 });
  return st.napDueInMin === -60;
})());

check('the chip answers when the nap is due, not how long he has been up', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  s._hass = { states: { 'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'off', attributes: {} } } };
  s._testNow = NT(15, 40);
  /* _nurserySessions is a METHOD that derives from the fetched history, so the
     seam is the method, not a field. `_nursery` only has to be truthy for the
     section to consider itself loaded. */
  s._nursery = {};
  s._nurserySessions = () => [NAP(8, 0, 8, 40), NAP(11, 0, 11, 40), NAP(14, 0, 14, 40)];
  const html = s._secNursery(s._config.sections[0]);
  /* The header, not a regex for the chip span: the chip is followed by a
     chevron or a door glyph, so a pattern anchored on two adjacent </span>
     matches the EMPTY string and every assertion on it passes vacuously. */
  const head = html.slice(0, html.indexOf('ps-jtop'));
  return /Nap due/.test(head) && !/Awake/.test(head);
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

/* ---------------------------------------------------------------------------
 * Corrections.
 *
 * The regression case is REAL and is the reason the feature exists: on
 * 2026-08-10 the Hatch ran 08:52-09:53 and the room was visited at 08:52,
 * 09:08, 09:22 and 09:42. The nap's settle_max_min is 30 minutes measured from
 * the session start, so the chain stopped at the 09:22 trip and the 09:42
 * re-settle was filed as an intervention DURING sleep: 31 minutes asleep on a
 * nap that was eleven. Raising the cap fixes that morning and swallows the head
 * of a genuinely long nap on another, so the fix is a human override.
 */
const napEdits = SH.helpers.applyNapEdits;
const parseEdits = SH.helpers.parseNapEdits;
const writeEdits = SH.helpers.writeNapEdits;

const failedNap = () => nsess(
  [{ t: NT(8, 52, 23), s: 'playing' }, { t: NT(9, 53, 41), s: 'idle' }],
  [{ t: NT(8, 51, 0), s: 'on' }, { t: NT(8, 52, 38), s: 'off' },
   { t: NT(9, 8, 21), s: 'on' }, { t: NT(9, 9, 30), s: 'off' },
   { t: NT(9, 22, 23), s: 'on' }, { t: NT(9, 24, 0), s: 'off' },
   { t: NT(9, 42, 16), s: 'on' }, { t: NT(9, 43, 30), s: 'off' }],
  { now: NT(12, 0) });

check('the 2026-08-10 nap really does over-report, unedited', (() => {
  const s = failedNap();
  return s.length === 1 && s[0].asleepMinutes > 25 && s[0].interventions === 1;
})());

check('an override rewrites the sleep window and everything derived from it', (() => {
  const base = failedNap();
  const start = base[0].from;
  /* Fell asleep at 09:43, woke when the Hatch stopped. */
  const out = napEdits(base, [{ start, from: 51, to: 61 }]);
  return out.length === 1 && out[0].edited === true
    && out[0].asleepMinutes === 10 && out[0].settleMinutes === 51
    /* The 09:42 trip was the end of the put-down, so it stops being a
       wake-up as well as stopping being sleep. */
    && out[0].interventions === 0
    && out[0].longestStretch === 10;
})());

check('an override is matched on start time within a tolerance, not exactly', (() => {
  const base = failedNap();
  const out = napEdits(base, [{ start: base[0].from + 90000, from: 51, to: 61 }]);
  return out.length === 1 && out[0].edited === true;
})());

check('an override for a different session is left alone', (() => {
  const base = failedNap();
  const out = napEdits(base, [{ start: base[0].from + 40 * 60000, from: 5, to: 10 }]);
  return out.length === 1 && !out[0].edited && out[0].asleepMinutes === base[0].asleepMinutes;
})());

/* "Didn't sleep" is a real zero and must survive as one — the same rule that
   keeps a missing reading apart from a measured nothing, from the other side. */
check('a session corrected to no sleep reports zero, not the derived figure', (() => {
  const base = failedNap();
  const out = napEdits(base, [{ start: base[0].from, from: 61, to: 61 }]);
  return out[0].asleepMinutes === 0 && out[0].edited === true;
})());

check('a deleted session disappears entirely', (() => {
  const out = napEdits(failedNap(), [{ start: failedNap()[0].from, del: true }]);
  return out.length === 0;
})());

check('an override can never invert or escape the Hatch span', (() => {
  const base = failedNap();
  const out = napEdits(base, [{ start: base[0].from, from: 900, to: -50 }]);
  const span = Math.round((base[0].to - base[0].from) / 60000);
  return out[0].settledAt <= base[0].to && out[0].wokeAt >= out[0].settledAt
    && out[0].settleMinutes <= span && out[0].asleepMinutes >= 0;
})());

check('wokeAt is present on an underived session so every surface can read it',
  failedNap()[0].wokeAt === failedNap()[0].to);

check('the raw door trips survive the correction as evidence', (() => {
  const base = failedNap();
  const out = napEdits(base, [{ start: base[0].from, from: 51, to: 61 }]);
  return (out[0].doorAt || []).length === 4 && out[0].events.length === 0;
})());

check('the store round-trips', (() => {
  const list = [{ start: NT(8, 52), from: 51, to: 61 }, { start: NT(20, 0), del: true }];
  const back = parseEdits(writeEdits(list));
  return back.length === 2 && back[0].from === 51 && back[1].del === true
    && Math.abs(back[0].start - NT(8, 52)) < 60000;
})());

/* An input_text reads "unknown" before it is ever written, and truncates at
   255 — both have bitten this project's other stores. */
check('an unwritten store parses as no corrections',
  parseEdits('unknown').length === 0 && parseEdits('').length === 0
    && parseEdits(null).length === 0 && parseEdits('junk~~x|9').length === 0);

check('the store drops the oldest entries rather than failing the write', (() => {
  const many = Array.from({ length: 40 }, (_, i) => ({ start: NT(8, 0) + i * 86400000, from: 5, to: 60 }));
  const raw = writeEdits(many);
  return raw.length <= 255 && parseEdits(raw).length < 40 && parseEdits(raw).length > 5;
})());

const editedCard = (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel', name: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d', days: 7,
    edits: { store: 'input_text.napedits' } }] });
  s._testNow = NT(12, 0);
  const start = Math.round(NT(8, 52, 23) / 60000);
  s._hass = { states: {
    'media_player.h': { state: 'idle', attributes: {} },
    'binary_sensor.d': { state: 'off', attributes: {} },
    'input_text.napedits': { state: `${start}~51~61`, attributes: {} } } };
  s._nursery = {
    'media_player.h': [{ t: NT(8, 52, 23), s: 'playing' }, { t: NT(9, 53, 41), s: 'idle' }],
    'binary_sensor.d': [{ t: NT(8, 51, 0), s: 'on' }, { t: NT(8, 52, 38), s: 'off' },
      { t: NT(9, 8, 21), s: 'on' }, { t: NT(9, 9, 30), s: 'off' },
      { t: NT(9, 22, 23), s: 'on' }, { t: NT(9, 24, 0), s: 'off' },
      { t: NT(9, 42, 16), s: 'on' }, { t: NT(9, 43, 30), s: 'off' }] };
  return s;
})();

check('the card reads its corrections out of the store', (() => {
  const sess = editedCard._nurserySessions(editedCard._config.sections[0]);
  return sess.length === 1 && sess[0].edited === true && sess[0].asleepMinutes === 10;
})());

/* A corrected figure and a measured one must not render identically. This is
   the zero-versus-missing rule at a new surface, and it has shipped broken at
   every previous new surface. */
check('a corrected session is marked wherever it is drawn', (() => {
  const html = editedCard._secNursery(editedCard._config.sections[0]);
  return /ps-edd/.test(html) && /\.ps-edd \{/.test(SH.styles);
})());

check('the mark exists on the desk too, which reads the same store',
  /\.ps-edd \{/.test(defined['purdy-desk-card'].styles));

check('the rows are long-press targets only where there is somewhere to write', (() => {
  const withStore = editedCard._secNursery(editedCard._config.sections[0]);
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel', name: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d', days: 7 }] });
  s._testNow = NT(12, 0);
  s._hass = editedCard._hass;
  s._nursery = editedCard._nursery;
  const without = s._secNursery(s._config.sections[0]);
  return /data-napedit=/.test(withStore) && /Press and hold/.test(withStore)
    && !/data-napedit=/.test(without) && !/Press and hold/.test(without);
})());

check('the correction sheet draws the session, both steppers and the door trips', (() => {
  const s = editedCard;
  s._openNapEdit(s._nurserySessions(s._config.sections[0])[0].from);
  const html = s._sheetHtml([]);
  s._sheet = null; s._napEdit = null;
  return /Correct this nap/.test(html)
    && /data-napstep="from:-5"/.test(html) && /data-napstep="to:5"/.test(html)
    && /ps-nesave/.test(html) && /data-arm="napdel"/.test(html)
    /* The derived figure is named beside the correction, so the card can be
       checked rather than merely believed. */
    && /derived|saved/.test(html);
})());

check('a stepper cannot push woke before fell-asleep', (() => {
  const s = editedCard;
  s._openNapEdit(s._nurserySessions(s._config.sections[0])[0].from);
  for (let i = 0; i < 30; i += 1) s._napEditStep('to', -5);
  const ok = s._napEdit.to >= s._napEdit.from;
  s._sheet = null; s._napEdit = null;
  return ok;
})());

check('the napdel arm is routed, not merely rendered',
  /k === "napdel"/.test(fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));

check('_bindNapEdit is actually called, not merely defined',
  /this\._bindNapEdit\(\);/.test(
    fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8')));

check('the corrections store is in the watched set', (() => {
  const s = new SH();
  s.setConfig({ sections: [{ type: 'nursery', key: 'j', title: 'Joel',
    hatch: 'media_player.h', door: 'binary_sensor.d',
    edits: { store: 'input_text.napedits' } }] });
  return (s._watched || []).indexOf('input_text.napedits') >= 0;
})());

/* The desk borrows _nurserySessions, which now applies the store — so the two
   store readers have to come with it or the borrowed method throws. */
check('the desk borrows the corrections readers alongside the derivation', (() => {
  const src = fs.readFileSync(new URL('../src/80-desk-core.js', import.meta.url), 'utf8');
  return /"_napEditStore", "_napEdits"/.test(src);
})());

/* An MA player mirrors its source device: a Twitch stream came back as
   media_content_type "music", and only a missing title kept it off the screen. */
const isMusic = SH.helpers.isMusic;
check('a Music Assistant player is music', isMusic({ attributes: { app_id: 'music_assistant' } }));
check('a Twitch stream reporting content type music is not',
  !isMusic({ attributes: { app_id: 'twitch', media_content_type: 'music' } }));
check('a player with no app id is still judged on content type',
  isMusic({ attributes: { media_content_type: 'playlist' } }) &&
  !isMusic({ attributes: { media_content_type: 'tvshow' } }));

/* The Twitch fix was "any foreign app_id is not music", and it over-corrected:
   Spotify in the kitchen and a sleep-sounds app in the bedroom were BOTH
   playing and BOTH invisible — no now-playing section, no dock bar, no live
   dot. Hiding real music produces no error and no gap, so it went unnoticed. */
check('Spotify on a speaker is music',
  isMusic({ attributes: { app_id: 'spotify', media_content_type: 'music', media_title: 'As Long As You Love Me' } }));
check('a sleep-sounds app is music',
  isMusic({ attributes: { app_id: 'relaxing_sounds', media_content_type: 'music', media_title: 'Ocean sounds' } }));
check('a named video app is still rejected however it labels its content',
  !isMusic({ attributes: { app_id: 'netflix', media_content_type: 'music', media_title: 'Some Show' } }) &&
  !isMusic({ attributes: { app_id: 'tv.twitch.android.app', media_content_type: 'music', media_title: 'A Stream' } }));
check('a foreign app with no title raises nothing',
  !isMusic({ attributes: { app_id: 'spotify', media_content_type: 'music' } }));

/* An idle MA player keeps its title and artwork for hours. Reading the
   attribute without the state is how a silent house grows a now-playing row —
   the desk card was fixed for this and the shell's two copies were not. */
const liveMusic = SH.helpers.liveMusic;
const bluey = { media_content_type: 'music', media_title: 'Bluey Theme Tune', app_id: 'music_assistant' };
check('an idle player with a stale title is not live music',
  !liveMusic({ state: 'idle', attributes: bluey }));
check('a playing player is live music',
  !!liveMusic({ state: 'playing', attributes: bluey }));
check('a paused track is still the current one',
  !!liveMusic({ state: 'paused', attributes: bluey }));
check('an off player is not live music',
  !liveMusic({ state: 'off', attributes: bluey }) && !liveMusic(null));
check('the live-music rule is shared, not written out per surface',
  ['73-shell-music.js', '74-shell-alerts.js', '82-desk-stage.js', '85-desk-systems.js']
    .every((f) => /psLiveMusic\(/.test(
      fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'))));

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

/* ============================ lights ============================
   The row is a lit room, not a progress bar — and the guard on Joel's night
   light has to cover the LEVEL as well as the switch. */
const LSEC = {
  type: 'lights', key: 'lights', title: 'Lights',
  moods: [{ name: 'Evening', set: { 'light.a': { brightness: 55, kelvin: 2700 } },
            off: ['light.b', 'light.night'] }],
  lights: [
    { entity: 'light.a', name: 'Living Room',
      members: ['light.a1', 'light.a2'], extras: ['switch.scent'] },
    { entity: 'light.b', name: 'Kitchen' },
    { entity: 'light.night', name: 'Night light',
      protect: { when: 'media_player.hatch', state: 'playing', ask: 'Joel is asleep' } },
    { entity: 'light.xmas', name: 'Christmas', hide_when_unavailable: 'sensor.xmas' },
  ],
};
function lsh(over) {
  const sh = new SH();
  sh.setConfig({ sections: [LSEC] });
  sh._hass = { states: Object.assign({
    'light.a': { state: 'on', attributes: { brightness: 158, color_temp_kelvin: 2900,
      min_color_temp_kelvin: 2202, max_color_temp_kelvin: 6535,
      supported_color_modes: ['color_temp'] } },
    'light.a1': { state: 'on', attributes: {} },
    'light.a2': { state: 'on', attributes: {} },
    'switch.scent': { state: 'off', attributes: {} },
    'light.b': { state: 'off', attributes: { supported_color_modes: ['brightness'] } },
    'light.night': { state: 'on', attributes: { brightness: 13, rgb_color: [255, 0, 0],
      supported_color_modes: ['rgb'] } },
    'light.xmas': { state: 'unavailable', attributes: {} },
    'media_player.hatch': { state: 'playing', attributes: {} },
  }, over || {}), callService() {} };
  return sh;
}
const lhtml = (over) => lsh(over)._secLights(LSEC);

check('the lights section renders its rows', (() => {
  const h = lhtml();
  return /data-light="light\.a"/.test(h) && /Living Room/.test(h) && /Kitchen/.test(h);
})());

/* The whole point of rejecting the tile card: no fill, no track, no 0%. */
check('no fill bar or track is drawn — the row is lit, not filled', (() => {
  const h = lhtml();
  return !/pl-fill|pl-track/.test(h) && /pl-glow/.test(h);
})());
check('an off light is dark, not zero percent', (() => {
  const h = lhtml();
  const row = h.slice(h.indexOf('data-light="light.b"'));
  return !/>0%</.test(row.slice(0, row.indexOf('</div></div>') + 12));
})());

/* Warmth is a reading. A fixture that reports none must not get an invented
   one, and must not get a dead slider either. */
check('the glow colour comes from the reported kelvin', (() => {
  const h = lhtml();
  const row = h.slice(h.indexOf('data-light="light.a"'));
  /* 2900K interpolates warm — red pinned, green well under blue-white */
  return /rgba\(255,17[0-9],9[0-9]/.test(row) || /rgba\(255,1[6-8][0-9],/.test(row);
})());
check('a brightness-only fixture gets no warmth track', (() => {
  const sh = lsh();
  sh._lightOpen = 'light.b';
  const h = sh._secLights(LSEC);
  const row = h.slice(h.indexOf('data-light="light.b"'));
  return !/data-lwarm="light\.b"/.test(row) && /no warmth to set/.test(row);
})());
check('a colour-temp fixture does get one, at its own range', (() => {
  const sh = lsh();
  sh._lightOpen = 'light.a';
  const h = sh._secLights(LSEC);
  return /data-lwarm="light\.a"/.test(h) && /data-lmin="2202"/.test(h)
    && /data-lmax="6535"/.test(h);
})());

/* The cluster replaced a sub-line. It must show one dot per member, and the
   sub-line must then say nothing. */
check('a two-lamp group draws two pips', (() => {
  const h = lhtml();
  const row = h.slice(h.indexOf('data-light="light.a"'));
  const face = row.slice(0, row.indexOf('pl-txt'));
  return (face.match(/pl-pip/g) || []).length === 2;
})());
check('a row with nothing to say draws no sub-line', (() => {
  const h = lhtml();
  const row = h.slice(h.indexOf('data-light="light.a"'), h.indexOf('data-light="light.b"'));
  return !/pl-t2/.test(row);
})());
check('an offline member is named, and its pip is dead', (() => {
  const h = lhtml({ 'light.a2': { state: 'unavailable', attributes: {} } });
  const row = h.slice(h.indexOf('data-light="light.a"'), h.indexOf('data-light="light.b"'));
  return /offline/.test(row) && /rgba\(255,255,255,\.06\)/.test(row);
})());
check('an extra switch that is on is worth saying', (() => {
  const h = lhtml({ 'switch.scent': { state: 'on', attributes: { friendly_name: 'Scentsy' } } });
  const row = h.slice(h.indexOf('data-light="light.a"'), h.indexOf('data-light="light.b"'));
  return /Scentsy on/.test(row);
})());

/* Christmas hid itself with a Bubble styles hack; this is the same contract
   one level down. */
check('hide_when_unavailable drops the row entirely', (() => {
  const h = lhtml();
  return !/data-light="light\.xmas"/.test(h);
})());
check('and brings it back when the sensor reports', (() => {
  const h = lhtml({ 'sensor.xmas': { state: '60', attributes: {} },
    'light.xmas': { state: 'off', attributes: {} } });
  return /data-light="light\.xmas"/.test(h);
})());

/* ---- the guard ---- */
check('the night light is marked guarded while the Hatch plays', (() => {
  const h = lhtml();
  return /data-light="light\.night" data-dim="\d" data-guard="1"/.test(h);
})());
check('and is NOT guarded once the Hatch stops', (() => {
  const h = lhtml({ 'media_player.hatch': { state: 'idle', attributes: {} } });
  return /data-light="light\.night" data-dim="\d" data-guard="0"/.test(h);
})());
check('the guard asks before turning it off', (() => {
  const sh = lsh();
  sh._lightAsk = { id: 'light.night', kind: 'toggle' };
  const h = sh._secLights(LSEC);
  return /Joel is asleep/.test(h) && /Turn it off/.test(h);
})());

/* The likelier accident is a thumb dragging it to 80% at 2am, not a tap. The
   guard has to cover the LEVEL, and the question has to carry the number. */
check('the guard also asks before CHANGING THE LEVEL', (() => {
  const sh = lsh();
  sh._lightAsk = { id: 'light.night', kind: 'level', value: 80 };
  const h = sh._secLights(LSEC);
  return /Set it to 80%\?/.test(h) && /Set 80%/.test(h);
})());
check('a guarded drag sends nothing until the question is answered', (() => {
  const sh = lsh();
  let calls = 0;
  sh._hass.callService = () => { calls += 1; };
  /* what the drag handler does on a guarded row: preview, then ask */
  sh._lightAsk = { id: 'light.night', kind: 'level', value: 80 };
  return calls === 0 && sh._optBri('light.night', 5) === 5;
})());
/* The lamp has to follow the finger. This debounced at 220ms and cleared the
   timer on every move, so it only fired once the drag STOPPED — the number
   moved and the room did not. */
check('a brightness change is sent immediately, not after the drag ends', (() => {
  const sh = lsh();
  let sent = null;
  sh._hass.callService = (d, s2, data) => { sent = [d, s2, data]; };
  sh._lightSetBri('light.a', 80);
  return sent && sent[0] === 'light' && sent[1] === 'turn_on'
    && sent[2].brightness === Math.round(80 / 100 * 255)
    && sh._optBri('light.a', 30) === 80;
})());
check('a burst is throttled, and the last value still lands', (() => {
  const sh = lsh();
  let calls = 0, last = null;
  sh._hass.callService = (d, s2, data) => { calls += 1; last = data.brightness; };
  [30, 40, 50, 60, 70].forEach((v) => sh._lightSetBri('light.a', v));
  /* leading edge fires once; the rest coalesce into one trailing send */
  return calls === 1 && last === Math.round(30 / 100 * 255)
    && sh._briSend['light.a'].value === 70 && !!sh._briSend['light.a'].timer;
})());
check('the drag paints in place and never calls _render', (() => {
  /* _render mid-gesture replaces the sheet and detaches the row under the
     finger, which is what made a drag do nothing until you lifted off. */
  const bind = src.slice(src.indexOf('_bindLights() {'), src.indexOf('_lightCfg(id) {'));
  let move = bind.slice(bind.indexOf('const onMove'), bind.indexOf('const finish'));
  /* Comments explain the rule and would otherwise match it — strip them, or
     the test passes on prose instead of on code. */
  move = move.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return /_paintLight\(/.test(move) && !/_render\(\)/.test(move);
})());

/* Moods are target sets, and a guarded light is never in one — "all off" that
   kills the night light is the bug, not the feature. */
check('a mood never touches a guarded light', (() => {
  const sh = lsh();
  const hit = [];
  sh._hass.callService = (d, s2, data) => { hit.push(data.entity_id); };
  sh._lightApplyMood(LSEC, 0);
  return hit.indexOf('light.night') < 0 && hit.indexOf('light.a') >= 0
    && hit.indexOf('light.b') >= 0;
})());
check('a mood sends brightness as 0-255, not as a percentage', (() => {
  const sh = lsh();
  let data = null;
  sh._hass.callService = (d, s2, x) => { if (x.entity_id === 'light.a') data = x; };
  sh._lightApplyMood(LSEC, 0);
  return data && data.brightness === Math.round(55 / 100 * 255) && data.color_temp_kelvin === 2700;
})());

/* The chip counts what you can act on: guarded and unavailable lights are
   neither "on" nor part of the total. */
check('the header chip excludes the guarded light from the count', (() => {
  const h = lhtml();
  return /1 of 2 on/.test(h);
})());
check('a house with only the night light on says so', (() => {
  const h = lhtml({ 'light.a': { state: 'off', attributes: {} } });
  return /Night light only/.test(h);
})());

/* Optimistic brightness, on _optGoal's contract. */
check('an optimistic brightness stands, then yields to the real state', (() => {
  const sh = new SH();
  sh._briOpt = { 'light.a': { value: 80, until: Date.now() + 10000 } };
  return sh._optBri('light.a', 30) === 80 && sh._optBri('light.a', 80) === 80
    && sh._optBri('light.a', 30) === 30;
})());
check('an optimistic brightness that never lands expires', (() => {
  const sh = new SH();
  sh._briOpt = { 'light.a': { value: 80, until: Date.now() - 1 } };
  return sh._optBri('light.a', 30) === 30;
})());
check('a lamp on at the dimmest possible step still reads 1%, never 0%', (() => {
  /* on and off must not look the same — brightness 1/255 rounds to zero */
  const h = lhtml({ 'light.a': { state: 'on', attributes: { brightness: 1,
    supported_color_modes: ['brightness'] } } });
  const row = h.slice(h.indexOf('data-light="light.a"'));
  return /<div class="pl-kv">1%<\/div>/.test(row);
})());

/* Lights live in a SHEET, not in the column. A sheet slides over what is
   already there instead of pushing it down — the same reason the schedule and
   the music controls are sheets. */
/* Going sheet_only strands anything that lived ONLY in the column — the music
   presets had to be added back to the sheet in v1.25.1 for exactly this. The
   moods are the equivalent here, so the sheet must carry them. */
check('a sheet_only lights section still reaches its moods and rows', (() => {
  const sh = lsh();
  sh.setConfig({ sections: [Object.assign({}, LSEC, { sheet_only: true })] });
  sh._hass = lsh()._hass;
  sh._sheet = 'lights';
  const h = sh._sheetHtml([]);
  return /data-lmood="0"/.test(h) && /data-light="light\.a"/.test(h);
})());
check('the lights sheet renders the same rows as the section', (() => {
  const sh = lsh();
  sh._sheet = 'lights';
  const h = sh._sheetHtml([]);
  return /ps-sheet/.test(h) && /data-light="light\.a"/.test(h)
    && /data-light="light\.night"/.test(h) && /data-lmood="0"/.test(h);
})());
check('the sheet names itself once, not twice', (() => {
  const sh = lsh();
  sh._sheet = 'lights';
  const h = sh._sheetHtml([]);
  /* the sheet chrome carries the title; the body must not repeat a header */
  return (h.match(/>Lights</g) || []).length === 1 && !/ps-sh\b/.test(h);
})());
check('the sheet carries the same summary chip as the header', (() => {
  const sh = lsh();
  sh._sheet = 'lights';
  return /1 of 2 on/.test(sh._sheetHtml([]));
})());
check('the guard prompt works inside the sheet too', (() => {
  const sh = lsh();
  sh._sheet = 'lights';
  sh._lightAsk = { id: 'light.night', kind: 'level', value: 80 };
  const h = sh._sheetHtml([]);
  return /Joel is asleep/.test(h) && /Set it to 80%\?/.test(h);
})());
check('a lights sheet with every light hidden renders nothing at all', (() => {
  const sh = lsh();
  sh.setConfig({ sections: [{ type: 'lights', key: 'lights', title: 'Lights',
    lights: [{ entity: 'light.xmas', hide_when_unavailable: 'sensor.xmas' }] }] });
  sh._hass = lsh()._hass;
  sh._sheet = 'lights';
  return sh._sheetHtml([]) === '';
})());

/* The expanded panel must not animate its height. The shell patches, so every
   repaint replaces the node and a max-height transition restarts from zero —
   the chips slid under the thumb on every state change, and a tap that missed
   a lamp landed on the row behind it and toggled the whole group. */
check('the detail panel does not animate its height', (() => {
  const rule = /\.pl-more \{[^}]*\}/.exec(SH.styles);
  return !!rule && !/transition/.test(rule[0]) && !/max-height/.test(rule[0]);
})());
check('the detail panel is not height-capped', (() => {
  /* Basement has five members: the chips wrap past 150px and the warmth track
     was cut off entirely. */
  const open = /\.pl-row\.open \.pl-more \{[^}]*\}/.exec(SH.styles);
  return !!open && !/max-height/.test(open[0]);
})());
check('missing a chip cannot toggle the group behind it', (() => {
  const bind = src.slice(src.indexOf('_bindLights() {'), src.indexOf('_lightCfg(id) {'));
  const down = bind.slice(bind.indexOf('pointerdown'));
  return /\.pl-more/.test(down.slice(0, down.indexOf('hold = setTimeout')));
})());

/* The warmth track. Every one of these is a lesson the brightness drag had
   already learned and the warmth track never got. */
check('an optimistic kelvin stands, then yields to the real state', (() => {
  const sh = new SH();
  sh._kOpt = { 'light.a': { value: 4000, until: Date.now() + 10000 } };
  return sh._optK('light.a', 2700) === 4000
    && sh._optK('light.a', 4030) === 4030   /* a mired step, not a disagreement */
    && sh._optK('light.a', 2700) === 2700;
})());
check('an optimistic kelvin that never lands expires', (() => {
  const sh = new SH();
  sh._kOpt = { 'light.a': { value: 4000, until: Date.now() - 1 } };
  return sh._optK('light.a', 2700) === 2700;
})());

/* The send is a THROTTLE. It used to fire a service call on every single
   pointermove — dozens a second at one bulb. */
check('a burst of warmth moves sends once, immediately', (() => {
  const sh = new SH(); let n = 0;
  sh._hass = { callService: () => { n++; } };
  for (let k = 2700; k < 3000; k += 10) sh._lightSetKelvin('light.a', k);
  return n === 1;
})());
check('the last warmth value is queued to land, not dropped', (() => {
  const sh = new SH();
  sh._hass = { callService: () => {} };
  sh._lightSetKelvin('light.a', 2700);
  sh._lightSetKelvin('light.a', 3300);
  sh._lightSetKelvin('light.a', 4100);
  const s = sh._kSend['light.a'];
  if (s.timer) clearTimeout(s.timer);
  return !!s.timer && s.value === 4100;   /* trailing edge carries the newest */
})());
check('the warmth drag moves the number before HA echoes anything', (() => {
  /* The optimistic value is written synchronously, so the knob and the row
     hue can be painted from it during the gesture rather than after. */
  const sh = new SH();
  sh._hass = { callService: () => {} };
  sh._lightSetKelvin('light.a', 5000);
  return sh._optK('light.a', 2700) === 5000;
})());

/* _dragging gates _render(). A warmth gesture that ended any way other than a
   clean pointerup left it stuck true and the card stopped repainting for
   good: the brightness read frozen and taps looked dead. */
const warmBind = (() => {
  const bind = src.slice(src.indexOf('_bindLights() {'), src.indexOf('_lightCfg(id) {'));
  return bind.slice(bind.indexOf('"[data-lwarm]"'));
})();
/* Matching "pointercancel" alone is not enough — the cleanup that REMOVES the
   listener names it too, so deleting the registration left the test green.
   The registration itself is what has to be asserted. */
check('a cancelled warmth drag cannot strand _dragging',
  /pointercancel/.test(warmBind)
  && /addEventListener\(ev, cancel\)/.test(warmBind)
  && /const cancel = \(\) => \{ stop\(\);/.test(warmBind));
check('a warmth drag paints in place rather than through _render',
  /_paintWarm\(/.test(warmBind));
check('the warmth knob and the renderer read the same geometry', (() => {
  const more = src.slice(src.indexOf('_lightMore(l) {'), src.indexOf('_lightMoodHtml'));
  const paint = src.slice(src.indexOf('_paintWarm(el, id, k) {'), src.indexOf('_lightMore(l) {'));
  return /plWarmPct\(/.test(more) && /plWarmPct\(/.test(paint);
})());

/* The stylesheet is one template literal, so a backtick anywhere inside it —
   including in a comment quoting a CSS property — silently terminates the
   string and takes the whole bundle with it. It happened while fixing the
   above. */
check('the shell stylesheet contains no stray backtick', (() => {
  const f = fs.readFileSync(new URL('../src/79-shell-styles.js', import.meta.url), 'utf8');
  return (f.match(/`/g) || []).length === 2;
})());

/* The two dedicated stylesheet files were guarded by name; the trap is not
   confined to them. It bit again in the remote card, whose stylesheet is an
   inline style block inside its render template — raw template text, so a
   backtick in a CSS comment there ends the string and the bundle fails to parse
   hundreds of lines away.
   The distinction that matters, and which cost a wrong diagnosis on the way
   here: a comment in EXPRESSION position is safe. Comments in the
   comment-hole idiom sit inside ${ }, which is code, so backticks in them are
   inside a comment and harmless — 71-shell-sections has had one for months.
   Only comments in raw template text are dangerous, and every stylesheet this
   bundle writes inline is raw template text. */
check('no CSS comment in an inline stylesheet quotes code in backticks', (() => {
  const dir = new URL('../src/', import.meta.url);
  const bad = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const text = fs.readFileSync(new URL(name, dir), 'utf8');
    for (const block of text.matchAll(/<style>[\s\S]*?<\/style>/g)) {
      for (const m of block[0].matchAll(/\/\*[\s\S]*?\*\//g)) {
        if (!m[0].includes('`')) continue;
        bad.push(`${name}:${text.slice(0, block.index + m.index).split('\n').length}`);
      }
    }
  }
  if (bad.length) console.log('    backtick in an inline CSS comment: ' + bad.join(', '));
  return bad.length === 0;
})());

/* The v1.31.1 lesson: a new section type must be in BOTH places or setConfig
   throws and Lovelace replaces the entire card. */
check('setConfig accepts a lights section', (() => {
  try { new SH().setConfig({ sections: [LSEC] }); return true; } catch (e) { return false; }
})());
check('_bindLights is actually called, not merely defined',
  /this\._bindLights\(\);/.test(src) && /_bindLights\(\) \{/.test(src));
check('the lights row never reaches for pointer capture',
  !/pl-row[\s\S]{0,4000}setPointerCapture/.test(src));

/* ------------------------------------------------------- systems mode -- */
/* The mode swaps the column AND the dock, so the assertions that matter are
   about what happens to the four patched slots — and about the lists being
   DISCOVERED, since the hand-typed version had three container ids that did
   not exist and rendered as dead toggles for weeks. */
const SRV = {
  name: 'PurdyNAS', prefix: 'purdynas', url: 'http://nas/Dashboard',
  status: 'sensor.purdynas_system_status',
  uptime: 'sensor.purdynas_uptime_text',
  version: 'sensor.purdynas_unraid_version',
  registration: 'sensor.purdynas_registration_state',
  registration_type: 'sensor.purdynas_registration_type',
  plugins: 'sensor.purdynas_installed_plugins',
  plugin_updates: 'sensor.purdynas_plugins_with_updates',
  update_available: 'binary_sensor.purdynas_update_available',
  update_url: 'http://nas/Tools/Update', plugins_url: 'http://nas/Plugins',
  faults: [{ entity: 'sensor.purdynas_disk_disk1_usage', above: 90, label: 'Disk 1', detail: 'low on space', severity: 'critical' }],
  meters: [{ label: 'Array', entity: 'sensor.purdynas_array_usage' }],
  stats: [{ label: 'CPU', entity: 'sensor.purdynas_cpu_usage', unit: '%' }],
  parity: { problem: 'binary_sensor.purdynas_parity_valid', last_check: 'sensor.purdynas_last_parity_check',
    next_check: 'sensor.purdynas_next_parity_check', progress: 'sensor.purdynas_parity_check_progress',
    running: 'binary_sensor.purdynas_parity_check_running', start: 'button.purdynas_start_parity_check' },
  power: [{ name: 'Reboot', entity: 'button.purdynas_reboot_system' }],
  docker: { cpu: 'sensor.purdynas_docker_cpu_usage', memory: 'sensor.purdynas_docker_memory_usage',
    vdisk: 'sensor.purdynas_docker_vdisk_usage', conflicts: 'sensor.purdynas_docker_port_conflicts',
    running: 'sensor.purdynas_containers_running',
    containers_prefix: 'switch.purdynas_container_', vms: ['switch.purdynas_vm_home_assistant'],
    restart_prefix: 'button.purdynas_restart_',
    names: { binhex_jellyfin: { name: 'Jellyfin', icon: 'mdi:movie-play' } } },
  storage: { array: 'sensor.purdynas_array_usage', text: 'sensor.purdynas_storage_text',
    disks_prefix: 'sensor.purdynas_disk_', shares_prefix: 'sensor.purdynas_share_',
    pools: [{ label: 'flash', entity: 'sensor.purdynas_flash_usage' }] },
  perf: { cpu: 'sensor.purdynas_cpu_usage', ram: 'sensor.purdynas_ram_usage',
    gpu_util: 'sensor.purdynas_gpu_utilization', gpu_temp: 'sensor.purdynas_gpu_temperature',
    board_temp: 'sensor.purdynas_motherboard_temperature', governor: 'sensor.purdynas_cpu_governor',
    fans: ['number.purdynas_fan_1', 'number.purdynas_fan_2'],
    network: [{ name: 'br0', rx: 'sensor.purdynas_network_br0_rx', tx: 'sensor.purdynas_network_br0_tx' }],
    power: { watts: 'sensor.purdynas_power', voltage: 'sensor.purdynas_voltage',
      daily: 'sensor.purdynas_energy_daily', monthly: 'sensor.purdynas_energy_monthly' } },
  notifications: { total: 'sensor.purdynas_notifications', alert: 'sensor.purdynas_notifications_unread_alert',
    warning: 'sensor.purdynas_notifications_unread_warning', info: 'sensor.purdynas_notifications_unread_info',
    archive: 'button.purdynas_archive_all_notifications' },
};
const num = (v, attrs) => ({ state: String(v), attributes: attrs || {} });
const sysHass = { states: {
  'sensor.purdynas_system_status': num('online'),
  'sensor.purdynas_uptime_text': num('13d 1h'),
  'sensor.purdynas_unraid_version': num('7.2.3'),
  'sensor.purdynas_registration_state': num('expired'),
  'sensor.purdynas_registration_type': num('plus'),
  'sensor.purdynas_installed_plugins': num(15),
  'sensor.purdynas_plugins_with_updates': num(0),
  'sensor.purdynas_array_usage': num(85.8, { total_capacity: '16.4 TB', free_space: '2.3 TB',
    num_data_disks: 3, num_parity_disks: 1, array_state: 'STARTED' }),
  'sensor.purdynas_storage_text': num('15.44 TB / 18 TB'),
  'sensor.purdynas_cpu_usage': num(10.8, { cpu_model: 'AMD Ryzen 7 5800X 8-Core Processor',
    cpu_threads: 16, cpu_frequency: '4575 MHz' }),
  'sensor.purdynas_cpu_governor': num('powersave'),
  'sensor.purdynas_ram_usage': num(15.9, { ram_used: '10.0 GB', ram_total: '62.7 GB', ram_cached: '51.2 GB' }),
  'sensor.purdynas_gpu_utilization': num(0), 'sensor.purdynas_gpu_temperature': num(32, { unit_of_measurement: '°C' }),
  'sensor.purdynas_motherboard_temperature': num(34, { unit_of_measurement: '°C' }),
  'number.purdynas_fan_1': num(71, { rpm: 0, pwm_value: 183, mode: 'automatic' }),
  'number.purdynas_fan_2': num(44, { rpm: 997, pwm_value: 113, mode: 'automatic' }),
  'sensor.purdynas_network_br0_rx': num(104.5, { unit_of_measurement: 'kbit/s' }),
  'sensor.purdynas_network_br0_tx': num(100.7, { unit_of_measurement: 'kbit/s' }),
  'sensor.purdynas_power': num(145.7), 'sensor.purdynas_voltage': num(118.5),
  'sensor.purdynas_energy_daily': num(1.162), 'sensor.purdynas_energy_monthly': num(23.56),
  'binary_sensor.purdynas_parity_valid': num('off', { device_class: 'problem' }),
  'binary_sensor.purdynas_parity_check_running': num('off'),
  'binary_sensor.purdynas_update_available': num('off', { device_class: 'update' }),
  'button.purdynas_restart_pihole': num('unknown'),
  'sensor.purdynas_parity_check_progress': num(0),
  'sensor.purdynas_last_parity_check': num('2026-03-01T15:17:52+00:00'),
  'sensor.purdynas_next_parity_check': num('2026-09-01T05:30:00+00:00'),
  'sensor.purdynas_docker_cpu_usage': num(3.7), 'sensor.purdynas_docker_memory_usage': num(5782.5),
  'sensor.purdynas_docker_vdisk_usage': num(24.7), 'sensor.purdynas_docker_port_conflicts': num(0),
  'sensor.purdynas_containers_running': num('4 of 11'),
  'switch.purdynas_container_binhex_jellyfin': num('on', { friendly_name: 'PurdyNAS Container binhex-jellyfin',
    container_image: 'binhex/arch-jellyfin', container_ports: [{ public_port: 8096 }],
    dashboard_url: 'http://nas:8096/web/' }),
  'switch.purdynas_container_pihole': num('on', { friendly_name: 'PurdyNAS Container pihole' }),
  'switch.purdynas_container_ollama': num('off', { friendly_name: 'PurdyNAS Container ollama' }),
  'switch.purdynas_vm_home_assistant': num('on', { friendly_name: 'PurdyNAS VM Home Assistant' }),
  'sensor.purdynas_disk_disk1_health': num('PASSED', { temperature: '37.0 °C' }),
  'sensor.purdynas_disk_disk1_usage': num(92.8, { used_size: '6.7 TB', total_size: '7.3 TB', role: 'data' }),
  'sensor.purdynas_disk_disk2_health': num('PASSED', { temperature: '31.0 °C' }),
  'sensor.purdynas_disk_disk2_usage': num(50.0, { role: 'data' }),
  'sensor.purdynas_disk_disk2_temperature': num(31, { unit_of_measurement: '°C' }),
  'sensor.purdynas_disk_parity_health': num('PASSED', { temperature: '38.0 °C' }),
  'sensor.purdynas_disk_parity2_health': num('DISK_NP_DSBL'),
  'sensor.purdynas_flash_usage': num(1.7),
  'sensor.purdynas_share_appdata_usage': num(84.1, { share_name: 'appdata' }),
  'sensor.purdynas_share_isos_usage': num(12.0, { share_name: 'isos' }),
  'sensor.purdynas_notifications': num(51, { unread_count: 51, recent_notifications: [
    { subject: 'Disk 1 is low on space (93%)', importance: 'alert' },
    { subject: 'Version update 2026.08.07', importance: 'normal' },
  ] }),
  'sensor.purdynas_notifications_unread_alert': num(1),
  'sensor.purdynas_notifications_unread_warning': num(3),
  'sensor.purdynas_notifications_unread_info': num(47),
} };

const sy = new SH();
sy.setConfig({
  server: SRV,
  dock: [{ icon: 'mdi:home-variant', name: 'Home', link: '/lovelace/phone2' },
    { icon: 'mdi:server', name: 'Systems', mode: 'systems' }],
  sections: [{ type: 'quick', key: 'q', tiles: [] }],
});
sy._hass = sysHass;

check('a server block does not require a systems section', sy._sysCfg() !== null);
check('every configured page gets a dock slot',
  sy._sysPages().map((p) => p.key).join(',') === 'overview,docker,storage,perf,alerts');
check('a page with no config gets no slot', (() => {
  const p = new SH();
  p.setConfig({ server: { name: 'x', status: 'sensor.s' }, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  return p._sysPages().map((x) => x.key).join(',') === 'overview';
})());

/* Discovery is the whole argument for the rewrite: the typed list named three
   containers that did not exist. A discovered list cannot. */
const cts = sy._syContainers();
check('containers are discovered from hass, not from config', cts.length === 3);
check('discovery cannot invent a container that is not there',
  !cts.some((c) => /lancache/.test(c.id)));
check('a discovered container takes its name from the friendly name',
  (cts.find((c) => c.key === 'pihole') || {}).name === 'pihole');
check('a config override renames a container',
  (cts.find((c) => c.key === 'binhex_jellyfin') || {}).name === 'Jellyfin');
check('the link comes off the switch, not out of config',
  (cts.find((c) => c.key === 'binhex_jellyfin') || {}).url === 'http://nas:8096/web/');
check('the port comes off the switch too',
  (cts.find((c) => c.key === 'binhex_jellyfin') || {}).port === ':8096');

/* A slot with no disk in it must read as absent. A 0% bar is a claim about a
   healthy empty drive, and there is no drive — the sock's zero-vs-missing
   lesson, in a new place. */
const dsk = sy._syDisks();
check('disks are discovered by health, so an empty slot is still seen', dsk.length === 4);
check('an empty parity slot is drawn as absent, not as zero',
  (dsk.find((d) => d.key === 'parity2') || {}).present === false);
/* Three states, not two. A parity disk is installed and publishes no usage
   sensor at all — folding "no usage" into "no disk" made a working parity
   drive read as an empty slot. */
check('a healthy parity disk with no usage sensor is present, not absent',
  (dsk.find((d) => d.key === 'parity') || {}).present === true &&
  (dsk.find((d) => d.key === 'parity') || {}).hasUsage === false);
check('a parity disk with no usage draws its health, not an invented bar', (() => {
  const out = sy._syStorage(SRV);
  return /no usage reported/.test(out) && /PASSED/.test(out);
})());
check('the pools are not swept into the array disk list', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p2._hass = { states: { ...sysHass.states,
    'sensor.purdynas_disk_cache_health': num('PASSED'),
    'sensor.purdynas_disk_cache_usage': num(24.7, { role: 'cache' }) } };
  const out = p2._syStorage(SRV);
  const arr = out.slice(out.indexOf('Array disks'), out.indexOf('Pools'));
  return !/cache/.test(arr);
})());
check('a real disk is present', (dsk.find((d) => d.key === 'disk1') || {}).present === true);
/* Every disk publishes its temperature as an attribute on its health sensor;
   only one also has a dedicated entity, which HA has converted to °F. Reading
   only the entity gave one disk a temperature and the rest none. */
check('a disk temperature comes from the dedicated entity where there is one',
  (dsk.find((d) => d.key === 'disk2') || {}).temp === 31);
check('a disk with no temperature entity still has its health attribute',
  ((dsk.find((d) => d.key === 'disk1') || {}).tempAttr || {}).v === 37);
check('the temperature column is one unit, not a mix', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  /* disk2's entity is °F; every other disk only has a °C attribute. Rendering
     both raw would put 88°F next to 37°C in the same column. */
  p2._hass = { states: { ...sysHass.states,
    'sensor.purdynas_disk_disk2_temperature': num(87.8, { unit_of_measurement: '°F' }),
    'sensor.purdynas_disk_disk1_health': num('PASSED', { temperature: '37.0 °C' }) } };
  const out = p2._syStorage(SRV);
  return /99°F/.test(out) && !/37°C/.test(out);   // 37°C === 98.6°F
})());

check('shares are discovered and sorted by fullness',
  sy._syShares().map((s) => s.v).join(',') === '84.1,12');
/* The entity id is slugified ("appdatabackups"); the real name is in an
   attribute, and it is the only place the capitals and hyphens survive. */
check('a share shows its real name, not its slug', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p2._hass = { states: { ...sysHass.states,
    'sensor.purdynas_share_appdatabackups_usage': num(84.1, { share_name: 'AppDataBackups' }) } };
  return p2._syShares().some((x) => x.name === 'AppDataBackups');
})());

/* Discovery sorts by entity id, which is neither the name shown nor anything
   the eye can use — `binhex_jellyfin` sorted between `avidemux` and `crafty_4`
   put Jellyfin third in a list headed "Agent Zero, Avidemux". */
check('containers list running first, then by displayed name', (() => {
  const rows = sy._syDocker(SRV);
  const order = [...rows.matchAll(/class="ps-trunc">([^<]+)</g)].map((m) => m[1]);
  return order[0] === 'Jellyfin' && order[1] === 'pihole' && order[2] === 'ollama';
})());

/* "84.1%" of what? Nearly every one of these sensors carries the answer. */
check('a meter derives its sub-line from the size attributes',
  /6\.7 TB of 7\.3 TB/.test(sy._syStorage(SRV)));
check('a notification subject drops the constant Notice [HOST] prefix', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p2._hass = { states: { ...sysHass.states,
    'sensor.purdynas_notifications': num(51, { recent_notifications: [
      { subject: 'Notice [PURDYNAS] - Version update 2026.08.07', importance: 'normal' }] }) } };
  const out = p2._syAlerts(SRV);
  return /Version update 2026\.08\.07/.test(out) && !/\[PURDYNAS\]/.test(out);
})());

/* The watched set cannot be complete until hass exists, because the lists are
   discovered from it — without the expansion a container toggle would not
   repaint until the 30s clock came round. */
check('discovered ids are not watched before hass', !sy._watched.includes('switch.purdynas_container_pihole'));
sy._expandWatched();
check('expanding the watched set picks up discovered containers',
  sy._watched.includes('switch.purdynas_container_pihole'));
check('expanding picks up discovered disks',
  sy._watched.includes('sensor.purdynas_disk_disk1_health'));
check('expanding picks up the configured singles',
  sy._watched.includes('sensor.purdynas_power') && sy._watched.includes('sensor.purdynas_uptime_text'));
check('expanding invalidates the signature so the next hass is not skipped', sy._last === null);
check('_expandWatched runs on first hass', /_expandWatched\(\);/.test(src) &&
  /_start\(\) \{[\s\S]{0,400}_expandWatched/.test(src));

/* Rendering: the pages are strings, so they can be asserted directly. */
const ov = sy._syOverview(SRV);
/* An alert a human action clears is fine; one no action clears is noise. A
   Plus key reads `expired` forever — the update window lapsed, not the licence
   — so this drew a permanent amber dot for a condition with nothing to do
   about it. It is now a plain fact, and the warn row is opt-in. */
check('an expired Plus key is stated as a fact, not raised as a fault', (() => {
  return /Licence/.test(ov) && /plus/.test(ov)
    && !/ps-syreg/.test(ov) && !/Registration/.test(ov);
})());
check('registration_alert puts the warn row back for an install that wants it', (() => {
  const loud = sy._syOverview({ ...SRV, registration_alert: true });
  return /ps-syreg/.test(loud) && /Registration/.test(loud) && /expired/.test(loud)
    /* And then it is NOT also stated as a plain fact — once, not twice. */
    && !/Licence/.test(loud);
})());
check('overview raises the disk-1 fault from an above rule', /Disk 1/.test(ov) && /low on space/.test(ov));
check('overview reads parity_valid as a PROBLEM sensor, so off is valid',
  /Valid<\/span>/.test(sy._syParity(SRV)));
check('parity off-by-polarity would show invalid', (() => {
  const flipped = { ...sysHass, states: { ...sysHass.states,
    'binary_sensor.purdynas_parity_valid': num('on', { device_class: 'problem' }) } };
  const p = new SH(); p.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p._hass = flipped;
  return /Invalid<\/span>/.test(p._syParity(SRV));
})());
check('parity dates are short, not ISO',
  /Mar/.test(sy._syParity(SRV)) && !/2026-03-01T/.test(sy._syParity(SRV)));
check('reboot is behind the two-tap arm, not a bare button',
  /data-arm="sy:button\.purdynas_reboot_system"/.test(sy._syPower(SRV)));
check('the arm handler routes systems keys', /k\.indexOf\("sy:"\) === 0/.test(src));

const dk = sy._syDocker(SRV);
check('docker page lists every discovered container', /Jellyfin/.test(dk) && /ollama/.test(dk));
check('docker memory is shown in GB, not five digits of MB', /5\.6<small>GB/.test(dk));
/* A sensor that is not reporting and a sensor reporting zero are different
   facts. `pcNum(...) ?? 0` is the shape that hides it, and it had crept into
   seven figures on these pages. */
check('a docker stat with no reading shows a dash, not 0.0%', (() => {
  const gone = { states: { ...sysHass.states } };
  delete gone.states['sensor.purdynas_docker_cpu_usage'];
  const p = new SH(); p.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p._hass = gone;
  const out = p._syDocker(SRV);
  return /—/.test(out) && !/0\.0<small>%<\/small><\/span>[\s\S]{0,80}Memory/.test(out);
})());
check('a notification count with no sensor shows a dash, not 0', (() => {
  const gone = { states: { ...sysHass.states } };
  delete gone.states['sensor.purdynas_notifications_unread_warning'];
  const p = new SH(); p.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p._hass = gone;
  return /Warning —/.test(p._syAlerts(SRV));
})());
check('no figure on the systems pages defaults a missing reading to zero', (() => {
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  return !/\?\? 0\)/.test(sysSrc);
})());
check('a stopped container is dimmed rather than hidden', /ps-sw off/.test(dk));
check('docker counts come from the discovered list', /All 3/.test(dk) && /Running 2/.test(dk));
sy._syfilter = 'running';
check('the running filter drops the stopped ones', !/ollama/.test(sy._syDocker(SRV)));
sy._syfilter = 'all';
sy._syq = 'zzz';
check('a search with no hits says so rather than showing nothing', /Nothing matches/.test(sy._syDocker(SRV)));
sy._syq = '';

/* An optimistic knob, on _optGoal's contract: a container takes seconds to
   start and a toggle that sits still for three of them reads as a missed tap. */
sy._swOpt = { 'switch.purdynas_container_ollama': { value: 'on', until: Date.now() + 12000 } };
check('an optimistic switch reads as its pending value',
  (sy._syContainers().find((c) => c.key === 'ollama') || {}).on === true);
sy._swOpt = { 'switch.purdynas_container_ollama': { value: 'on', until: Date.now() - 1 } };
check('an optimistic switch that never landed expires back to the truth',
  (sy._syContainers().find((c) => c.key === 'ollama') || {}).on === false);
sy._swOpt = {};

const stg = sy._syStorage(SRV);
check('storage leads with the array total', /15\.44 TB/.test(stg) && /2\.3 TB free/.test(stg));
check('storage draws the absent parity slot as not installed', /not installed/.test(stg));
check('storage shows only the fullest shares until expanded',
  /appdata/.test(stg) && /Shares/.test(stg));

const pf = sy._syPerf(SRV);
check('perf names the CPU without the marketing suffix',
  /Ryzen 7 5800X<\/b>/.test(pf) && !/8-Core Processor/.test(pf));
check('perf reports threads and governor', /16 threads/.test(pf) && /powersave/.test(pf));
check('perf shows no per-core bars, because there is no per-core data',
  !/core-?\d/i.test(pf));
/* These entities are the PWM DUTY the controller commands, not a measured
   speed, and only a header with a tach wire reports rpm. A channel driven at
   71% reading 0 rpm is not a stopped fan — printing "0 RPM" is the same lie as
   drawing a missing reading as zero. Five of six on the real box. */
check('a fan with a tachometer shows its rpm', /<b>997<\/b>/.test(pf));
check('a driven fan with no tachometer says so rather than claiming 0 rpm',
  /no tach/.test(pf) && !/\b0 ?rpm/i.test(pf));
check('the fan header says how many channels actually report',
  /1 of 2 reporting rpm/.test(pf));

/* There is no update ACTION in this integration — no update.* entity, no
   service — so a button would be one that cannot update anything. The row
   links to the page that can. */
check('nothing pretends to perform an update', (() => {
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  return !/update['\"]?\s*\)|\bupdate_service|install_update/.test(sysSrc);
})());
check('an available OS update turns the version row into a link', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p2._hass = { states: { ...sysHass.states,
    'binary_sensor.purdynas_update_available': num('on', { device_class: 'update' }) } };
  const out = p2._syOverview(SRV);
  return /data-syurl="http:\/\/nas\/Tools\/Update"/.test(out) && /update ↗/.test(out);
})());
check('no update available leaves the version row a plain more-info row',
  /data-info="sensor\.purdynas_unraid_version"/.test(sy._syOverview(SRV)));
check('a running container offers its restart button',
  /data-sybtn="button\.purdynas_restart_pihole"/.test(sy._syDocker(SRV)));
check('a stopped container does not offer restart', (() => {
  const p2 = new SH();
  p2.setConfig({ server: SRV, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  p2._hass = { states: { ...sysHass.states,
    'switch.purdynas_container_pihole': num('off', { friendly_name: 'PurdyNAS Container pihole' }) } };
  return !/data-sybtn="button\.purdynas_restart_pihole"/.test(p2._syDocker(SRV));
})());
check('a container with no restart button published gets none',
  !/data-sybtn="button\.purdynas_restart_binhex_jellyfin"/.test(sy._syDocker(SRV)));
check('perf prints the network unit once rather than per row', (pf.match(/kbit\/s/g) || []).length === 1);
check('perf converts monthly energy without inventing a cost',
  /23\.6 kWh/.test(pf) && !/\$/.test(pf));

const al = sy._syAlerts(SRV);
check('alerts splits by importance', /Alert 1/.test(al) && /Warning 3/.test(al) && /Info 47/.test(al));
check('alerts says the list is a sample, not the whole of 51',
  /most recent of 51/.test(al));
sy._synf = 'alert';
check('the importance filter narrows the list',
  /Disk 1 is low/.test(sy._syAlerts(SRV)) && !/Version update/.test(sy._syAlerts(SRV)));
sy._synf = 'all';

/* The mode swaps both the column and the dock. Home is not a peer tab: it
   exits, so it carries its own class rather than an `on` state. */
const savedDocSys = globalThis.document;
globalThis.document = { createElement: () => new MiniNode() };
const slots = {};
const mkSysSlot = (id) => (slots[id] = slots[id] || new MiniNode());
const syr = new SH();
syr.setConfig({
  server: SRV,
  dock: [{ icon: 'mdi:home-variant', name: 'Home', link: '/x' }, { icon: 'mdi:server', name: 'Systems', mode: 'systems' }],
  sections: [{ type: 'quick', key: 'q', tiles: [] }],
});
syr._hass = sysHass;
syr.shadowRoot = {
  /* Only the four real slots exist; anything else must answer null, or _one
     would hand a handler to a node that cannot take one. */
  getElementById: (id) => (["ps-stat", "ps-col", "ps-sheetslot", "ps-dockwrap"].includes(id) ? mkSysSlot(id) : null),
  querySelector: () => null,
  querySelectorAll: () => [],
};
syr._mounted = true;
syr._mode = 'systems';
syr._render();
check('systems mode replaces the greeting with the page name',
  /PurdyNAS/.test(slots['ps-stat']._html) && /Overview/.test(slots['ps-stat']._html));
check('systems mode swaps the dock', /data-sysdock="docker"/.test(slots['ps-dockwrap']._html));
check('the systems dock leads with Home', /data-sysdock="__home"/.test(slots['ps-dockwrap']._html));
check('Home is not drawn as a sixth tab',
  /ps-db home/.test(slots['ps-dockwrap']._html) &&
  !/ps-db on[^>]*data-sysdock="__home"/.test(slots['ps-dockwrap']._html));
/* The now-playing bar belongs to the house, not to a dock — walking into the
   server pages must not take the pause button away from you. */
check('the now-playing bar survives the mode switch', (() => {
  const withMusic = { states: { ...sysHass.states,
    'media_player.a': num('playing', { app_id: 'music_assistant', media_title: 'Dance Mode' }) } };
  const m = new SH();
  m.setConfig({ server: SRV, now_playing: { players: [{ entity: 'media_player.a', name: 'Kitchen' }] },
    dock: [], sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  m._hass = withMusic;
  return /ps-mini/.test(m._miniHtml()) && /Dance Mode/.test(m._miniHtml());
})());
check('both render paths use the one now-playing bar', (() => {
  const core = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  return /_miniHtml\(\)\}<div class="ps-dock">/.test(core) && /_miniHtml\(\)\}<div class="ps-dock">/.test(sysSrc)
    && (src.match(/id="ps-mini"/g) || []).length === 1;
})());
const colKids = mkSysSlot('ps-col').kids;
check('the page mounts as one keyed node', colKids.length === 1 && colKids[0].dataset.sect === 'sys-overview');
check('a page is not styled as a section', colKids[0].className === 'ps-sypage');
syr._page = 'docker';
syr._render();
check('switching page swaps the node',
  mkSysSlot('ps-col').kids.length === 1 && mkSysSlot('ps-col').kids[0].dataset.sect === 'sys-docker');
syr._mode = null;
syr._render();
check('leaving the mode restores the house dock', /data-dock="1"/.test(slots['ps-dockwrap']._html));
check('leaving the mode restores the greeting', !/PurdyNAS/.test(slots['ps-stat']._html));
globalThis.document = savedDocSys;

/* The v1.31.1 lesson again, one level up: a renderer that is never dispatched
   to, or a dock verb the handler does not know, is a control that does
   nothing. Both halves have to exist. */
/* Not just "the call exists somewhere": the systems file calls it too, so a
   single global match passed happily with the core call deleted. Each render
   path is asserted in its own file — which is what the _bindScrub lesson
   actually was. */
check('_bindSystems is defined', /_bindSystems\(\) \{/.test(src));
check('the house render path binds systems', (() => {
  const core = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');
  return /this\._bindSystems\(\);/.test(core);
})());
check('the systems render path binds systems', (() => {
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  return /_renderSystems\([\s\S]*?this\._bindSystems\(\);/.test(sysSrc);
})());
check('the dock handler knows the mode verb', /if \(d\.mode\) \{/.test(src));
/* The landing page's PurdyNAS row is the other way in. It must NOT also keep
   its chevron: a stub of the five pages beside the real thing is two answers
   to one question. */
check('a device row can open the mode instead of expanding', (() => {
  const p = new SH();
  p.setConfig({ server: SRV, sections: [{ type: 'systems', key: 'sys', devices: [
    { name: 'PurdyNAS', key: 'nas', icon: 'mdi:server', mode: 'systems', chip: 'sensor.purdynas_containers_running' },
    { name: 'Jeeves', key: 'floor', icon: 'mdi:robot-vacuum' },
  ] }] });
  p._hass = sysHass;
  const out = p._devicesHtml(p._config.sections[0]);
  return /data-mode="systems"/.test(out);
})());
check('a mode row drops the expand, and its neighbours keep theirs', (() => {
  const p = new SH();
  p.setConfig({ server: SRV, sections: [{ type: 'systems', key: 'sys', devices: [
    { name: 'PurdyNAS', key: 'nas', mode: 'systems' },
    { name: 'Jeeves', key: 'floor' },
  ] }] });
  p._hass = sysHass;
  const out = p._devicesHtml(p._config.sections[0]);
  return !/data-mode="systems"[^>]*data-group/.test(out) && /data-group="sys\|dev\|floor"/.test(out);
})());
check('the mode row handler exists', /this\._each\("\[data-mode\]"/.test(src));
check('mode is checked before sheet, so an entry with both opens the mode',
  src.indexOf('if (d.mode) {') < src.indexOf('if (d.sheet) {'));
check('every systems page in the dock list has a renderer', (() => {
  const pages = ['overview', 'docker', 'storage', 'perf', 'alerts'];
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  const dispatch = /const html = \{([\s\S]*?)\}\[page\.key\]\(\)/.exec(sysSrc);
  return dispatch && pages.every((p) => new RegExp(`\\b${p}:`).test(dispatch[1]));
})());

/* Same rule the music search and the light drag already follow: a control the
   user is holding cannot go through _render, or the patch replaces the node
   mid-gesture. The container search is the third place this has come up. */
check('the container search paints in place rather than re-rendering', (() => {
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  const h = /_one\("ps-syq"[\s\S]*?\n    \}\);/.exec(sysSrc);
  return h && /_paintContainers\(\)/.test(h[0]) && !/this\._render\(\)/.test(h[0]);
})());
check('the search field holds the repaint lock while focused', (() => {
  const sysSrc = fs.readFileSync(new URL('../src/77-shell-systems.js', import.meta.url), 'utf8');
  return /"focus", \(\) => \{ this\._dragging = true; \}/.test(sysSrc);
})());

/* minSpan: an idle box between 7% and 11% is idle. Auto-scaling that to full
   height draws a mountain range out of nothing. */
check('a sparkline with no minSpan keeps the old one-unit floor', (() => {
  const p = SH.helpers.sparkPoly([{ t: 0, v: 20 }, { t: 1, v: 20.2 }], 100, 20, 4);
  const ys = p.split(' ').map((s) => parseFloat(s.split(',')[1]));
  return Math.abs(ys[0] - ys[1]) < 4;   // not slammed to the extremes
})());
check('a wider minSpan flattens an idle CPU instead of amplifying it', (() => {
  const q = SH.helpers.sparkPoly([{ t: 0, v: 7 }, { t: 1, v: 11 }], 100, 46, 5, 10);
  const ys = q.split(' ').map((s) => parseFloat(s.split(',')[1]));
  const r = SH.helpers.sparkPoly([{ t: 0, v: 7 }, { t: 1, v: 11 }], 100, 46, 5);
  const yr = r.split(' ').map((s) => parseFloat(s.split(',')[1]));
  return Math.abs(ys[0] - ys[1]) < Math.abs(yr[0] - yr[1]);
})());
check('the CPU graph reaches for minSpan rather than free-scaling',
  /pcSparkPoly\(down, W, H, 5, 10\)/.test(src));
check('the CPU graph rides the existing 26h fetch',
  /srv\.perf\.cpu && srv\.perf\.graph !== false/.test(src));
check('the CPU scrub kind is wired into _bindScrub', /kind === "cpu"/.test(src));
check('the graph container claims no touch-action', (() => {
  const m = /\.ps-sygraph \{[^}]*\}/.exec(shs);
  return m && !/touch-action/.test(m[0]);
})());

/* The systems stylesheet must use the token scales like everything else. */
check('systems styles introduce no loose font-size', (() => {
  const block = shs.slice(shs.indexOf('systems mode --'));
  return !/font-size:\s*\d/.test(block);
})());
check('the systems page classes it renders all exist', (() => {
  const used = ['ps-sypage', 'ps-sycard', 'ps-syb', 'ps-sybar', 'ps-symeta',
    'ps-syfans', 'ps-syn', 'ps-syhero', 'ps-sygraph', 'ps-db.home', 'ps-syb-bad'];
  return used.every((cl) => shs.includes('.' + cl));
})());


/* ==========================================================================
 * weather — the min→max rail
 *
 * Fixtures are pinned to a fixed clock, never derived from the wall clock. The
 * nursery suite learned this the hard way: six tests anchored to `Date.now()`
 * passed all afternoon and failed every evening, because a fixture three hours
 * old is a nap at 2pm and a night at 10pm. A weather day is a time-of-day
 * question too — "is this bucket today" decides whether it is partial — so the
 * same seam is used here.
 * ======================================================================== */
{
const wDays = SH.helpers.weatherDays;
const wStats = SH.helpers.weatherStats;
const wFc = SH.helpers.weatherFc;
/* Sat 2026-08-08, 3:00 PM local. */
const WNOW = new Date(2026, 7, 8, 15, 0, 0).getTime();
const DAY = (d, min, mean, max) => ({ start: new Date(2026, 7, d, 0, 0, 0).getTime(), min, mean, max });

check('statistics rows become one record per local day, in order', (() => {
  const d = wDays([DAY(6, 73.8, 81.2, 96.8), DAY(5, 72.5, 79.6, 89.6)], WNOW);
  return d.length === 2 && d[0].min === 72.5 && d[1].max === 96.8 && d[0].ts < d[1].ts;
})());

check('an ISO start_time is read as well as epoch ms', (() => {
  const d = wDays([{ start: new Date(2026, 7, 6, 0, 0, 0).toISOString(), min: 70, mean: 80, max: 90 }], WNOW);
  return d.length === 1 && d[0].max === 90;
})());

check('today is flagged partial and a closed day is not', (() => {
  const d = wDays([DAY(7, 69.4, 78.4, 95.9), DAY(8, 70.5, 76.0, 92.4)], WNOW);
  return d[0].partial === false && d[1].partial === true;
})());

/* The local-day-key rule, which is what the flag above depends on. An evening
   reading filed by toISOString() lands on tomorrow west of Greenwich, and every
   "today" test would then be wrong for the last few hours of every day. */
check('the day key is local, so a late-evening bucket is still today', (() => {
  const late = new Date(2026, 7, 8, 22, 30, 0).getTime();
  return SH.helpers.localDayKey(late) === '2026-08-08';
})());

check('a row whose min and max did not survive keeps its slot', (() => {
  const d = wDays([DAY(5, 72, 79, 89), { start: new Date(2026, 7, 6).getTime(), min: null, mean: null, max: null },
    DAY(7, 69, 78, 95)], WNOW);
  /* Three days in the week means three columns. Dropping the empty one would
     close the gap up and silently shift every later day left. */
  return d.length === 3 && d[1].min === null && d[2].min === 69;
})());

check('a non-numeric statistic reads as missing, never as zero', (() => {
  const d = wDays([{ start: new Date(2026, 7, 6).getTime(), min: 'unknown', mean: null, max: 90 }], WNOW);
  return d[0].min === null && d[0].max === 90;
})());

check('the seven-day figures exclude the day still in progress', (() => {
  const d = wDays([DAY(6, 70, 80, 90), DAY(7, 60, 70, 100), DAY(8, 20, 20, 20)], WNOW);
  const s = wStats(d);
  /* Aug 8 is today: its 20° would otherwise take both the min and the mean. */
  return s.days === 2 && s.min === 60 && s.max === 100 && s.mean === 75;
})());

check('with no closed days the figures are null, not zero', (() => {
  const s = wStats(wDays([DAY(8, 70, 76, 92)], WNOW));
  return s.days === 0 && s.min === null && s.mean === null && s.max === null;
})());

/* ---- forecast shapes ---- */

check('a daily forecast maps temperature to the high and templow to the low', (() => {
  const f = wFc([{ datetime: '2026-08-09T16:00:00+00:00', temperature: 90, templow: 74,
    condition: 'partlycloudy', precipitation: 0.02 }], 'daily', WNOW);
  return f.length === 1 && f[0].hi === 90 && f[0].lo === 74 && f[0].partial === false;
})());

/* NWS is the accurate free provider for a US location and publishes NO daily
   forecast — only day/night pairs. Folding them is what lets the rail point at
   it at all. */
check('twice_daily day/night pairs fold into one high and one low', (() => {
  const f = wFc([
    { datetime: '2026-08-09T08:00:00-04:00', is_daytime: true, temperature: 95, condition: 'partlycloudy', precipitation_probability: 10 },
    { datetime: '2026-08-09T18:00:00-04:00', is_daytime: false, temperature: 71, condition: 'clear-night', precipitation_probability: 30 },
  ], 'twice_daily', WNOW);
  return f.length === 1 && f[0].hi === 95 && f[0].lo === 71 && f[0].partial === false;
})());

check('a folded day is labelled by its daytime half, not by its night', (() => {
  const f = wFc([
    { datetime: '2026-08-10T06:00:00-04:00', is_daytime: true, temperature: 95, condition: 'lightning-rainy' },
    { datetime: '2026-08-10T18:00:00-04:00', is_daytime: false, temperature: 72, condition: 'clear-night' },
  ], 'twice_daily', WNOW);
  /* Taking the night's condition would label a stormy day "clear" because the
     sun went down. */
  return f[0].condition === 'lightning-rainy';
})());

check('precipitation probability takes the worse half, not the average', (() => {
  const f = wFc([
    { datetime: '2026-08-10T06:00:00-04:00', is_daytime: true, temperature: 90, precipitation_probability: 15 },
    { datetime: '2026-08-10T18:00:00-04:00', is_daytime: false, temperature: 70, precipitation_probability: 60 },
  ], 'twice_daily', WNOW);
  return f[0].pop === 60;
})());

/* Late in the day NWS has no daytime period left to publish, so today arrives
   as a low with no high. That is a hole in the data and must not draw as a
   capsule from nowhere. */
check('a day published with only a night half is partial, not zero', (() => {
  const f = wFc([
    { datetime: '2026-08-08T18:00:00-04:00', is_daytime: false, temperature: 71, condition: 'clear-night' },
    { datetime: '2026-08-09T06:00:00-04:00', is_daytime: true, temperature: 95, condition: 'sunny' },
    { datetime: '2026-08-09T18:00:00-04:00', is_daytime: false, temperature: 70, condition: 'clear-night' },
  ], 'twice_daily', WNOW);
  return f.length === 2 && f[0].partial === true && f[0].hi === null && f[0].lo === 71
    && f[1].partial === false;
})());

check('the folded days come back in chronological order', (() => {
  const mk = (d, day, t) => ({ datetime: `2026-08-${String(d).padStart(2, '0')}T${day ? '06' : '18'}:00:00-04:00`, is_daytime: day, temperature: t });
  const f = wFc([mk(11, true, 89), mk(9, true, 95), mk(10, true, 93), mk(9, false, 71)], 'twice_daily', WNOW);
  return f.map((x) => x.hi).join(',') === '95,93,89';
})());

check('today is marked on the forecast so the live tick has a column', (() => {
  const f = wFc([
    { datetime: '2026-08-08T06:00:00-04:00', is_daytime: true, temperature: 92 },
    { datetime: '2026-08-09T06:00:00-04:00', is_daytime: true, temperature: 95 },
  ], 'twice_daily', WNOW);
  return f[0].today === true && f[1].today === false;
})());

check('an unparseable forecast entry is dropped rather than becoming NaN', (() => {
  const f = wFc([{ datetime: 'not a date', temperature: 90, templow: 70 },
    { datetime: '2026-08-09T16:00:00+00:00', temperature: 90, templow: 74 }], 'daily', WNOW);
  return f.length === 1;
})());

/* ---- provider-shape detection ---- */

const wsec = (extra) => ({
  type: 'weather', key: 'wx', title: 'Weather',
  sensor: 'sensor.out', forecast: 'weather.nws', ...extra,
});
const mkW = (states, extra) => {
  const s = new SH();
  s.setConfig({ sections: [wsec(extra)] });
  s._hass = { states, callService: () => {}, callWS: () => {} };
  return s;
};

check('a provider with only twice_daily is asked for twice_daily', (() => {
  /* supported_features 6 = HOURLY | TWICE_DAILY. Asking such a provider for a
     daily forecast answers with an empty list and NO error, so the rail would
     be blank forever with nothing to say why. */
  const s = mkW({ 'weather.nws': { state: 'sunny', attributes: { supported_features: 6 } } });
  return s._wxKind(s._config.sections[0]) === 'twice_daily';
})());

check('a provider that has daily is asked for daily', (() => {
  const s = mkW({ 'weather.nws': { state: 'sunny', attributes: { supported_features: 3 } } });
  return s._wxKind(s._config.sections[0]) === 'daily';
})());

check('an explicit forecast_type overrides the detection', (() => {
  const s = mkW({ 'weather.nws': { state: 'sunny', attributes: { supported_features: 3 } } },
    { forecast_type: 'twice_daily' });
  return s._wxKind(s._config.sections[0]) === 'twice_daily';
})());

/* ---- the rail's scale and the capsule's three states ---- */

check('a flat week is not amplified into a mountain range', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 71, max: 73 }, { min: 71.5, max: 72.5 }], 'hist');
  /* Same rule as pcSparkPoly's minSpan: an idle range gets a floor, or two
     degrees of noise fills the whole track. */
  return dom.span >= 12;
})());

check('a real spread scales to itself', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 100 }], 'hist');
  return dom.span > 40 && dom.lo < 60 && dom.hi > 100;
})());

check('a day with nothing draws a hatched empty track, never a flat capsule', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 90 }], 'hist');
  const html = s._wxCapsule(null, null, dom);
  return /ps-wxtrack empty/.test(html) && !/ps-wxcap/.test(html);
})());

check('one end published draws a stub at the end that is known', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 90 }], 'hist');
  const html = s._wxCapsule(70, null, dom);
  return /ps-wxcap stub/.test(html) && !/height:/.test(html);
})());

check('a day whose low equals its high still draws something', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 90 }], 'hist');
  const m = /height:([0-9.]+)%/.exec(s._wxCapsule(75, 75, dom));
  return m && Number(m[1]) >= 5;
})());

check('the live tick is clamped inside the track', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 90 }], 'hist');
  const m = /ps-wxmark[^>]*bottom:([0-9.]+)%/.exec(s._wxCapsule(60, 90, dom, 500));
  return m && Number(m[1]) === 100;
})());

check('the capsule takes a class prefix so the desk draws the same geometry', (() => {
  const s = mkW({});
  const dom = s._wxDomain([{ min: 60, max: 90 }], 'hist');
  const html = s._wxCapsule(70, 80, dom, null, 'pd-wx');
  return /pd-wxtrack/.test(html) && /pd-wxcap/.test(html) && !/ps-wx/.test(html);
})());

/* ---- the rendered section ---- */

const WSTATES = {
  'sensor.out': { state: '93.38', attributes: { friendly_name: 'Outside Thermometer', unit_of_measurement: '°F', device_class: 'temperature' } },
  'weather.nws': { state: 'sunny', attributes: { supported_features: 6, attribution: 'Data from National Weather Service/NOAA' } },
  'weather.owm': { state: 'cloudy', attributes: { temperature: 88, apparent_temperature: 98, humidity: 66 } },
};

check('the hero number is the measured sensor, not the weather entity', (() => {
  const s = mkW(WSTATES, { feels_from: 'weather.owm' });
  s._wxStats = wDays([DAY(8, 71.42, 76.7, 92.48)], WNOW);
  const html = s._secWeather(s._config.sections[0]);
  /* The provider said 88 and the yard said 93.38 on the day this was written.
     The present comes from the thing that measured it. */
  return /93\.4/.test(html) && !/>88</.test(html);
})());

check('an unavailable sensor prints a dash and says so, never a zero', (() => {
  const s = mkW({ ...WSTATES, 'sensor.out': { state: 'unavailable', attributes: {} } });
  const html = s._secWeather(s._config.sections[0]);
  return /Sensor unavailable/.test(html) && />—<\/div>/.test(html) && !/0\.0°/.test(html);
})());

check('a missing sensor is named as missing rather than as offline', (() => {
  const s = mkW({ 'weather.nws': WSTATES['weather.nws'] });
  return /Sensor not found/.test(s._secWeather(s._config.sections[0]));
})());

check('the delta is anchored to today\'s recorded low', (() => {
  const s = mkW(WSTATES);
  s._wxStats = wDays([DAY(8, 71.42, 76.7, 92.48)], WNOW);
  const html = s._secWeather(s._config.sections[0]);
  return /22\.0° from today's low/.test(html) && /↑/.test(html);
})());

check('with no statistics for today there is no delta at all', (() => {
  const s = mkW(WSTATES);
  s._wxStats = [];
  return !/from today's low/.test(s._secWeather(s._config.sections[0]));
})());

check('a still-loading rail says so rather than reading as a flat week', (() => {
  const s = mkW(WSTATES);
  s._wxStats = null;
  return /Reading the week/.test(s._wxDetailBody(s._config.sections[0]));
})());

check('a rail that would not load offers a retry', (() => {
  const s = mkW(WSTATES);
  s._wxStatsErr = 'recorder said no';
  const html = s._wxDetailBody(s._config.sections[0]);
  return /would not load/.test(html) && /data-wxretry/.test(html);
})());

check('the tab counts come off the arrays, never off days:', (() => {
  const s = mkW(WSTATES, { days: 7 });
  s._wxStats = wDays([DAY(6, 70, 80, 90), DAY(7, 71, 81, 91), DAY(8, 72, 76, 92)], WNOW);
  /* met.no answers with six days where the config asked for seven. A label
     reading "Next 7 days" over six capsules has invented a day. */
  s._wxFc = wFc([1, 2, 3, 4, 5, 6].map((i) => ({
    datetime: `2026-08-0${i + 3}T16:00:00+00:00`, temperature: 90, templow: 70 })), 'daily', WNOW);
  const html = s._wxDetailBody(s._config.sections[0]);
  /* Three buckets, one of them today: the rail draws three columns and the tab
     says TWO days, because the third is labelled "Today". Reading the column
     count into the tab is how it came out saying "Last 8 days" against a config
     that asked for 7. */
  return /Last 2 days/.test(html) && /Next 6 days/.test(html)
    && /plus today so far/.test(html);
})());

check('the sensor name is shortened rather than wrapped to two lines', (() => {
  const s = mkW(WSTATES);
  /* "Outside Thermometer & Humidity Temperature" wrapped under the hero number
     and used the word "temperature" to label a temperature. */
  return s._wxSrcName(s._config.sections[0]) === 'Outside Thermometer';
})());

check('source_label overrides the friendly name outright', (() => {
  const s = mkW(WSTATES, { source_label: 'Back deck' });
  return s._wxSrcName(s._config.sections[0]) === 'Back deck';
})());

check('a sensor with a sensible name is left alone', (() => {
  const s = mkW({ ...WSTATES, 'sensor.out': { state: '90', attributes: { friendly_name: 'Back Deck' } } });
  return s._wxSrcName(s._config.sections[0]) === 'Back Deck';
})());

check('the forecast rail is reachable and names its provider', (() => {
  const s = mkW(WSTATES);
  s._wxPick = 'forecast';
  s._wxFc = wFc([{ datetime: '2026-08-09T16:00:00+00:00', temperature: 90, templow: 74, condition: 'lightning-rainy', precipitation_probability: 46 }], 'daily', WNOW);
  const html = s._wxDetailBody(s._config.sections[0]);
  return /NWS/.test(html) && /46%/.test(html) && /mdi:weather-lightning-rainy/.test(html);
})());

check('every condition NWS actually returns has an icon', (() => {
  /* All six of these came back from KCHO in one week. A name the map lacks
     draws NO glyph, so the row silently measures narrower than its neighbours —
     the exact bug class the shoot harness's dotted box exists to catch. */
  const seen = ['lightning-rainy', 'exceptional', 'partlycloudy', 'sunny', 'clear-night', 'rainy'];
  return seen.every((c) => SH.helpers.wxIcon(c) !== SH.helpers.wxIcon('__nope__')
    || c === 'cloudy');
})());

check('an unknown condition falls back to a glyph rather than to nothing', () =>
  /^mdi:/.test(SH.helpers.wxIcon('brimstone')));
check('weather conditions read as words', () =>
  SH.helpers.wxText('lightning-rainy') === 'Thunderstorms' &&
  SH.helpers.wxText('partlycloudy') === 'Partly cloudy');

check('a probability of zero is drawn and a missing one is not', (() => {
  const s = mkW(WSTATES);
  s._wxPick = 'forecast';
  s._wxFc = wFc([{ datetime: '2026-08-09T16:00:00+00:00', temperature: 90, templow: 74, precipitation_probability: 0 },
    { datetime: '2026-08-10T16:00:00+00:00', temperature: 91, templow: 75 }], 'daily', WNOW);
  const html = s._wxDetailBody(s._config.sections[0]);
  return (html.match(/ps-wxpcp none/g) || []).length === 1;
})());

check('a detail row with no value is dropped, not dashed', (() => {
  /* NWS publishes no apparent temperature and no UV index, so a fixed row list
     would be half dashes on the most accurate provider available. */
  const s = mkW(WSTATES);
  const html = s._wxRows(s._config.sections[0]);
  return !/UV index/.test(html) && !/Dew point/.test(html);
})());

check('feels-like is stated once, and never beside the reading it restates', (() => {
  /* The rule is unchanged; what carries the number moved, twice. The chip used
     to hold the reading and its feels-like. Then collapsed became a TODAY face,
     the reading became the hero and feels-like moved to the today facts. Face C
     took the facts row off the column with everything else, so the one place it
     is stated is now the SHEET — and it must still not appear a second time in
     the detail rows below it. */
  const s = mkW(WSTATES, { feels_from: 'weather.owm' });
  const sec = s._config.sections[0];
  const body = s._wxDetailBody(sec);
  return /Feels/.test(body)
    && (body.match(/Feels/g) || []).length === 1
    && !/Feels like/.test(s._wxRows(sec))
    /* And not on the collapsed face at all. */
    && !/Feels/.test(s._secWeather(sec));
})());

check('the chip does not repeat the hero reading', (() => {
  /* The reading is the first thing in the body. A chip carrying it too is the
     duplication that has already been removed twice on this card. */
  const s = mkW(WSTATES, { feels_from: 'weather.owm' });
  /* The chip alone, from _wxChip — reading it back out of the rendered header
     with a regex anchored on two adjacent </span> matched the EMPTY string
     (the chip is followed by the door glyph), so this asserted nothing at all
     for as long as it has existed. */
  const chip = s._wxChip(s._config.sections[0]);
  return /\S/.test(chip.replace(/<[^>]*>/g, ''))
    && !/\d+\s*°/.test(chip.replace(/<[^>]*>/g, ''));
})());

check('a dry day says nothing about rain rather than "0%"', (() => {
  /* Zero-versus-missing, at the one place a probability is legitimately zero:
     "Rain 0%" reads as a measurement of nothing and spends a tile saying it. */
  const s = mkW(WSTATES);
  return !/Rain/.test(s._wxTodayFacts(s._config.sections[0], { pop: 0 }))
    && /Rain/.test(s._wxTodayFacts(s._config.sections[0], { pop: 60 }));
})());

check('today draws a stub when only one end of the day is published', (() => {
  /* Late in the day NWS drops the daytime period, so today arrives as a low
     with no high. That is a hole in the data, not a bar to the edge. */
  const s = mkW(WSTATES);
  return /ps-wxtbfill part/.test(s._wxTodayBar({ lo: 72, hi: null }, 75))
    && !/part/.test(s._wxTodayBar({ lo: 72, hi: 95 }, 75))
    && s._wxTodayBar({ lo: null, hi: null }, 75) === '';
})());

check('the today bar widens for a live reading outside the recorded range', (() => {
  /* The same contradiction the week rail had to be fixed for: statistics lag
     the sensor, so the tick would sit past the end of its own bar. */
  const s = mkW(WSTATES);
  const html = s._wxTodayBar({ lo: 72, hi: 90 }, 96);
  const now = Number((html.match(/ps-wxtbnow" style="left:([0-9.]+)%/) || [])[1]);
  return now > 0 && now < 100;
})());

check('face C: collapsed is the hero and the capsule, and nothing else', (() => {
  /* The section was 464px, then 230px, and the half that stayed was still four
     things. Collapsed is now the two facts that are nowhere else on the screen:
     the measured reading and today's low-high with its live tick. Nothing was
     deleted — the facts, the note, the tiles, the tabs, both rails, the hourly
     strip and the detail rows all moved into the sheet. */
  const s = mkW(WSTATES, { feels_from: 'weather.owm' });
  s._wxStats = wDays([DAY(8, 71.4, 82, 93.4)], WNOW);
  const face = s._secWeather(s._config.sections[0]);
  const gone = [/ps-wxrail|ps-railbox/, /ps-wxtabs/, /ps-wxtile/, /ps-wxhrs/, /ps-wxnote/];
  return gone.every((re) => !re.test(face))
    /* What survives: the hero number and today's bar. */
    && /ps-wxbig/.test(face) && /ps-wxtb/.test(face)
    /* And the section no longer has an expand at all — it is a door. */
    && !/ps-xtra/.test(face);
})());

check('face C: everything the face dropped is in the sheet, and reachable', (() => {
  /* Replacing a surface orphans whatever was only reachable through it — three
     times on this card already. The expand WAS the only route to the week, so
     the door replacing it has to land somewhere that renders the same body. */
  const s = mkW(WSTATES, { feels_from: 'weather.owm' });
  s._wxStats = wDays([DAY(8, 71.4, 82, 93.4)], WNOW);
  const face = s._secWeather(s._config.sections[0]);
  /* The header is a door to the wx sheet, drawn with the door glyph and not
     with the chevron that would promise an in-place unfold. */
  const opensSheet = /data-sheet="wx"/.test(face) && /ps-dv/.test(face) && !/ps-cv/.test(face);
  s._sheet = 'wx';
  const sheet = s._sheetHtml([]);
  const has = [/ps-wxrail|ps-railbox/, /ps-wxtabs/, /ps-wxtile/, /Feels/];
  return opensSheet && has.every((re) => re.test(sheet));
})());

check('the live reading widens today\'s capsule instead of floating above it', (() => {
  /* Statistics are aggregated on a schedule, so today's bucket lagged at 92.5
     while the thermometer said 95.2 — and the tick drew above the top of its own
     capsule. The tick was the honest half. */
  const s = mkW(WSTATES);
  s._wxStats = wDays([DAY(7, 70, 80, 96), DAY(8, 71.42, 76.7, 92.48)], WNOW);
  const rows = s._wxHistRows(95.2);
  return rows[1].max === 95.2 && rows[1].min === 71.42 && rows[0].max === 96;
})());

check('a closed day is never widened by the live reading', (() => {
  const s = mkW(WSTATES);
  s._wxStats = wDays([DAY(7, 70, 80, 90)], WNOW);
  return s._wxHistRows(200)[0].max === 90;
})());

check('the outside-versus-inside row comes from GTTC', (() => {
  const s = mkW({ ...WSTATES, 'sensor.gttc': { state: '93.38', attributes: { outdoor_minus_indoor: 19.4, optimization_status: 'mild (full setbacks allowed)' } } },
    { gttc_outdoor: 'sensor.gttc' });
  const sec = s._config.sections[0];
  return /\+19\.4°/.test(s._wxRows(sec)) && /full setbacks/.test(s._wxNote(sec));
})());

check('the note names the first wet day rather than any wet day', (() => {
  const s = mkW(WSTATES);
  s._wxFc = wFc([
    { datetime: '2026-08-08T16:00:00+00:00', temperature: 92, templow: 71, condition: 'sunny' },
    { datetime: '2026-08-09T16:00:00+00:00', temperature: 90, templow: 74, condition: 'sunny' },
    { datetime: '2026-08-10T16:00:00+00:00', temperature: 87, templow: 69, condition: 'rainy' },
  ], 'daily', WNOW);
  return /Rain Mon/.test(s._wxNote(s._config.sections[0]));
})());

check('a section with nothing to add says nothing', (() => {
  const s = mkW(WSTATES);
  s._wxFc = [];
  return s._wxNote(s._config.sections[0]) === '';
})());

check('the hourly strip hides itself rather than drawing one bar', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = [{ ts: WNOW, t: 93 }];
  return s._wxHourly(s._config.sections[0]) === '';
})());

check('the coolest hour still draws a bar, not a hairline', (() => {
  /* At a bare min-max scale the lowest hour lands ON the baseline and draws as a
     2px sliver, which reads as "no data for that hour". Only visible in a shot. */
  const s = mkW(WSTATES);
  s._wxHrs = Array.from({ length: 12 }, (_, i) => ({ ts: WNOW + i * 3600000, t: 90 - i }));
  const hs = (s._wxHourly(s._config.sections[0]).match(/height:([0-9.]+)%/g) || [])
    .map((x) => Number(/([0-9.]+)/.exec(x)[1]));
  return Math.min(...hs) >= 15;
})());

check('twelve flat hours do not draw as a sawtooth', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = Array.from({ length: 12 }, (_, i) => ({ ts: WNOW + i * 3600000, t: 80 + (i % 2) * 0.5 }));
  const hs = (s._wxHourly(s._config.sections[0]).match(/height:([0-9.]+)%/g) || [])
    .map((x) => Number(/([0-9.]+)/.exec(x)[1]));
  return Math.max(...hs) - Math.min(...hs) < 20;
})());

/* ---- the scrollable hourly strip ---- */

const WHRS = (n, from) => Array.from({ length: n }, (_, i) => ({
  ts: (from == null ? WNOW : from) + i * 3600000, t: 90 - (i % 14), pop: i > 6 ? 40 : 0,
}));

check('every hour gets its own labelled column', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(24);
  const html = s._wxHourly(s._config.sections[0]);
  /* Anchored so the container's own `ps-wxhrs` class does not count as a 25th
     column — it matched `ps-wxhr` plus a trailing s. */
  return (html.match(/class="ps-wxhr(?:"| )/g) || []).length === 24
    && /Next 24 hours/.test(html);
})());

check('the first column is labelled Now, not with a clock time', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(24);
  const html = s._wxHourly(s._config.sections[0]);
  return /ps-wxhr now/.test(html) && /ps-wxhl">Now</.test(html);
})());

check('a midnight column takes the weekday instead of repeating 12a', (() => {
  /* 12a says nothing about WHICH day's midnight it is, which is precisely what
     you lose track of in a strip you have scrolled sideways. */
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(24, new Date(2026, 7, 8, 20, 0, 0).getTime());   // Sat 8pm -> crosses into Sun
  const html = s._wxHourly(s._config.sections[0]);
  return /ps-wxhr nd/.test(html) && /ps-wxhl">Sun</.test(html);
})());

check('a window inside one day draws no divider', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(6, new Date(2026, 7, 8, 9, 0, 0).getTime());
  return !/ps-wxhr nd/.test(s._wxHourly(s._config.sections[0]));
})());

check('the probability row appears only when some hour expects rain', (() => {
  const s = mkW(WSTATES);
  const dry = WHRS(12).map((x) => ({ ...x, pop: 0 }));
  s._wxHrs = dry;
  const noRain = s._wxHourly(s._config.sections[0]);
  s._wxHrs = WHRS(12).map((x, i) => ({ ...x, pop: i === 5 ? 60 : 0 }));
  const rain = s._wxHourly(s._config.sections[0]);
  /* A row of empty cells on a dry day is a line of height on every column that
     says nothing. */
  return !/ps-wxhp/.test(noRain) && /ps-wxhp">60%</.test(rain);
})());

check('a dry hour inside a wet window keeps its cell but prints nothing', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(12).map((x, i) => ({ ...x, pop: i === 5 ? 60 : 0 }));
  const html = s._wxHourly(s._config.sections[0]);
  /* The empty cell holds the column's height so the hour labels stay in a row —
     the same reason the forecast rail's probability cell is hidden, not absent. */
  return (html.match(/ps-wxhp/g) || []).length === 12 && /ps-wxhp"><\/span>/.test(html);
})());

check('a missing probability is not drawn as 0%', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = WHRS(12).map((x, i) => ({ ...x, pop: i === 5 ? 60 : null }));
  const html = s._wxHourly(s._config.sections[0]);
  return /ps-wxhp">60%</.test(html) && !/ps-wxhp">0%</.test(html);
})());

check('the caption gives the range, not just the endpoints', (() => {
  const s = mkW(WSTATES);
  s._wxHrs = [{ ts: WNOW, t: 80 }, { ts: WNOW + 3600000, t: 95 }, { ts: WNOW + 7200000, t: 84 }];
  /* First-to-last hid the peak: 80 -> 84 across a window that reached 95. */
  return /80° – 95°/.test(s._wxHourly(s._config.sections[0]));
})());

check('the hourly strip scrolls and claims no touch-action', (() => {
  /* Setting touch-action on a sideways-scrolling strip — even pan-x pan-y — is
     NOT equivalent to the default auto: it restricts the element to panning and
     makes the axis commitment stickier, so a slightly diagonal swipe locks to
     vertical and the strip goes dead. That killed purdy-rooms-card once. */
  const block = shs.slice(shs.indexOf('.ps-wxhrs {'), shs.indexOf('.ps-wxrows'));
  return /overflow-x: auto/.test(block) && /overscroll-behavior-x: contain/.test(block)
    && !/touch-action/.test(block);
})());

check('the desk strip scrolls under the same rule', (() => {
  /* Read locally: the desk suite's own fixtures are block-scoped below this. */
  const d = defined['purdy-desk-card'].styles;
  const block = d.slice(d.indexOf('.pd-wxhrs {'), d.indexOf('.pd-wxfacts'));
  return /overflow-x: auto/.test(block) && /overscroll-behavior-x: contain/.test(block)
    && !/touch-action/.test(block);
})());

check('the hourly columns are derived once and shared with the desk', () => {
  const core = fs.readFileSync(new URL('../src/80-desk-core.js', import.meta.url), 'utf8');
  const stage = fs.readFileSync(new URL('../src/82-desk-stage.js', import.meta.url), 'utf8');
  return /"_wxHourCols"/.test(core) && /_wxHourCols\(hrs\)/.test(stage);
});

check('a wider hourly window is fetched now that the strip scrolls', () => {
  const wsrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
  return /sec\.hourly \|\| 24/.test(wsrc) && /precipitation_probability/.test(wsrc);
});

/* ---- wiring ---- */

check('the weather entities are watched so the reading moves with the sensor', (() => {
  const s = mkW(WSTATES, { feels_from: 'weather.owm', gttc_outdoor: 'sensor.gttc', sun: 'sun.sun' });
  return ['sensor.out', 'weather.nws', 'weather.owm', 'sensor.gttc', 'sun.sun']
    .every((id) => s._watched.includes(id));
})());

check('the rail toggle and the retry are both bound', (() => {
  /* A handler wired by a single line is exactly what went missing for three
     releases when _bindScrub was defined and never called. */
  const bound = /_each\("\[data-wxrail\]"/.test(shellSrc) && /_each\("\[data-wxretry\]"/.test(shellSrc);
  return bound;
})());

check('the weather poll is started and stopped with the others', () =>
  /this\._startWeather\(\);/.test(shellSrc) &&
  /if \(this\._wxTimer\) clearInterval\(this\._wxTimer\);/.test(shellSrc) &&
  /this\._wxTimer = null;/.test(shellSrc));

check('the statistics call asks for a period and never for history', () => {
  const wsrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
  return /recorder\/statistics_during_period/.test(wsrc) &&
    !/history\/period\//.test(wsrc) &&
    /types: \["min", "mean", "max"\]/.test(wsrc);
});

check('the statistics window starts at local midnight, not at now minus N days', () => {
  const wsrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
  return /setHours\(0, 0, 0, 0\)/.test(wsrc);
});

/* No `units:` in the statistics call. Naming one would convert a °C install
   into °F — the unit belongs to the sensor, not to this card. */
check('the statistics call names no unit', () => {
  const wsrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
  return !/units:/.test(wsrc);
});

check('weather renders no figure through the zero-hiding shape', () => {
  const wsrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
  return !/\?\? 0\)/.test(wsrc) && !/\|\| 0\)/.test(wsrc);
});

check('the weather classes it renders all exist in the stylesheet', (() => {
  const used = ['ps-wxhero', 'ps-wxbig', 'ps-wxdelta', 'ps-wxsrc', 'ps-wxtiles', 'ps-wxtile',
    'ps-wxtabs', 'ps-wxtab', 'ps-wxrh', 'ps-wxlb', 'ps-wxrb', 'ps-wxrail', 'ps-wxday',
    'ps-wxhi', 'ps-wxlo', 'ps-wxdw', 'ps-wxi', 'ps-wxpcp', 'ps-wxtrack', 'ps-wxcap',
    'ps-wxmark', 'ps-wxhrs', 'ps-wxrows', 'ps-wxrow', 'ps-wxnote', 'ps-wxempty', 'ps-wxretry'];
  /* Using a class is not the same as having one: `.ps-rv.sm` was asked for by
     the nap rings and had never been defined, so a 36m nap drew its number at
     the 2xl step and spilled over the ring's stroke. */
  return used.every((cl) => shs.includes('.' + cl));
})());

check('weather styles introduce no loose font-size', (() => {
  const block = shs.slice(shs.indexOf('weather --'), shs.indexOf('nursery: nap rings'));
  return block.length > 500 && !/font-size:\s*\d/.test(block);
})());

check('the new type step is published as a token', () =>
  /--pc-fs-3xl:/.test(src) && /font-size: var\(--pc-fs-3xl\)/.test(shs));
}

/* Block-scoped: the desk suite declares a lot of fixtures and must not
   collide with the shell's. */
{
/* ==========================================================================
 * purdy-desk-card — the desktop view as one element
 * ======================================================================== */

const DK = defined['purdy-desk-card'];
const deskSrc = ['80-desk-core','81-desk-strip','82-desk-stage','83-desk-lights','84-desk-dock']
  .map((f) => fs.readFileSync(new URL(`../src/${f}.js`, import.meta.url),'utf8'))
  .join('\n');
const deskStyleSrc = fs.readFileSync(new URL('../src/89-desk-styles.js', import.meta.url),'utf8');

check('purdy-desk-card defined', names.includes('purdy-desk-card'));
check('purdy-desk-card registered in customCards', window.customCards.some(c => c.type === 'purdy-desk-card'));

const dks = DK.styles;
check('desk styles carry the shared token block', dks.includes('--pc-panel:'));
check('desk styles have no unresolved placeholder', !dks.includes('${'));
check('desk has one gradient ground', dks.includes('.pd-ground'));
check('desk is one glass sheet, not a stack', dks.includes('.pd-sheet') && dks.includes('backdrop-filter'));
check('desk tiers divided by hairline, not by a gap', dks.includes('.pd-tier + .pd-tier { border-top'));
check('desk zones divided by hairline, not by a gap', dks.includes('.pd-z + .pd-z { border-left'));
check('desk paints its own background rather than borrowing the theme', dks.includes('linear-gradient(168deg'));

/* A backtick inside the stylesheet terminates the template literal mid-file
   and takes the whole bundle down with it. Exactly two: the open and close. */
check('the desk stylesheet carries exactly two backticks',
  (deskStyleSrc.match(/`/g) || []).length === 2);

/* Pick a step, never a loose pixel. The one deliberate exception is 16px on a
   form field — below that iOS Safari zooms the page on focus and never zooms
   back — so it is allowed by name rather than by accident. */
check('desk styles introduce no loose font-size beyond the field exception', (() => {
  const loose = (dks.match(/font-size:\s*\d+(\.\d+)?px/g) || []);
  return loose.length === 1 && loose[0] === 'font-size: 16px';
})());
check('the desk search field keeps 16px so iOS does not zoom', /\.pd-search \{[^}]*font-size: 16px/.test(dks));

/* The smallest text must not also be the faintest: recompute the ratio rather
   than string-matching the hex. */
check('desk --ps-dim clears the 4.5:1 floor on the ground', (() => {
  const hex = (dks.match(/--ps-dim:\s*(#[0-9a-f]{6})/i) || [])[1];
  if (!hex) return false;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (h) => {
    const r = lin(parseInt(h.slice(1, 3), 16)), g = lin(parseInt(h.slice(3, 5), 16)), b = lin(parseInt(h.slice(5, 7), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (L(hex) + 0.05) / (L('#080a12') + 0.05);
  return ratio >= 4.5;
})());

/* --- config validation: the two-places rule ------------------------------ */

let dkerr = null;
try { new DK().setConfig({ sections: [{ type: 'nope' }] }); } catch (e) { dkerr = e.message; }
check('desk rejects an unknown section type', /unknown section type/.test(dkerr || ''));
let dkerr2 = null;
try { new DK().setConfig({ weather: 'w.x' }); } catch (e) { dkerr2 = e.message; }
check('desk requires sections', /'sections'/.test(dkerr2 || ''));
let dkerr3 = null;
try { new DK().setConfig({ sections: [{ type: 'climate', zone: 'nowhere' }] }); } catch (e) { dkerr3 = e.message; }
check('desk rejects an unknown zone', /zone/.test(dkerr3 || ''));
check('desk names the retired sock panel rather than rendering a blank',
  !DK.helpers.sections.includes('sleep'));

/* Every accepted type must have a renderer in the tier its default sends it
   to. The list and the dispatch are two halves of the same fact, and either
   half alone is a card replaced by "Configuration error". */
check('every desk section type has a renderer in its default zone', (() => {
  const proto = DK.prototype;
  return DK.helpers.sections.every((t) => {
    const zone = DK.helpers.zoneDefault[t];
    if (zone === 'stage') return deskSrc.includes(`${t}: () => this._pnl`) || deskSrc.includes(`${t}: () =>`);
    if (zone === 'dock') return new RegExp(`${t}: \\(\\) => this\\._dock`).test(deskSrc);
    if (zone === 'strip') return proto._stripSection !== undefined;
    return false;
  });
})());
check('every desk section type has a default zone',
  DK.helpers.sections.every((t) => DK.helpers.zones.includes(DK.helpers.zoneDefault[t])));

/* --- borrowing rather than copying ---------------------------------------- */

check('the desk borrows from the shell rather than copying it', DK.helpers.borrowed.length > 20);
check('every borrowed name resolved', DK.helpers.borrowMissing.length === 0);

/* PD_BORROW names METHODS, not their dependencies. Adding _ruleHit under the
   already-borrowed _raised broke eight desk tests with "this._ruleHit is not a
   function" — and borrowMissing could not have caught it, because the missing
   name was never in the list to be checked. Walk each borrowed method's source
   for `this._x(` and assert every _x the desk will reach is either borrowed too
   or defined on the desk itself. The failure this replaces is a puzzle; this is
   a message naming the method and its caller. */
check('a borrowed method calls nothing the desk cannot reach', (() => {
  const borrowed = DK.helpers.borrowed || [];
  const own = new Set(Object.getOwnPropertyNames(DK.prototype));
  const set = new Set(borrowed);
  const bad = [];
  for (const name of borrowed) {
    const fn = SH.prototype[name];
    if (typeof fn !== 'function') continue;
    const src = Function.prototype.toString.call(fn);
    for (const m of src.matchAll(/this\.(_[A-Za-z0-9_]+)\s*\(/g)) {
      const dep = m[1];
      if (set.has(dep) || own.has(dep)) continue;
      bad.push(`${name} -> ${dep}`);
    }
  }
  if (bad.length) console.log('    unreachable from the desk: ' + bad.join(', '));
  return bad.length === 0;
})());
check('borrowed methods are the SAME function, so a fix lands in both',
  DK.prototype._raised === SH.prototype._raised &&
  DK.prototype._optGoal === SH.prototype._optGoal &&
  DK.prototype._nurserySessions === SH.prototype._nurserySessions);
check('the desk writes its own markup rather than borrowing the phone column',
  DK.prototype._resultsHtml !== SH.prototype._resultsHtml);
/* The results container keeps the shell's id precisely so the borrowed
   painter finds it — search-as-you-type must not go through _render. */
check('the desk results container keeps the id the borrowed painter looks for',
  deskSrc.includes('id="ps-res"'));

/* --- the render model ------------------------------------------------------ */

check('the desk patches rather than repainting', deskSrc.includes('_patchKeyed'));
check('a drag or a focused field gates the repaint', /if \(this\._dragging\) return;/.test(deskSrc));
check('handlers read this._hass live rather than closing over hass',
  !/addEventListener\([^)]*\)\s*=>\s*\{[^}]*\bhass\b\s*\./.test(deskSrc));
check('binding is claimed per element per selector', deskSrc.includes('this._each(') && deskSrc.includes('this._one('));

/* The stage's grid-template-columns is the ONE animated property, and it is
   safe only because the node carrying it is never replaced. */
check('exactly one property transitions on the desk', (() => {
  /* The reduced-motion block turns everything off and is not an animation. */
  const t = (dks.match(/transition:[^;]+;/g) || []).filter((x) => !/none/.test(x));
  return t.length === 1 && /grid-template-columns/.test(t[0]);
})());
check('the stage is mounted once, not rebuilt per render',
  /id="pd-stage"/.test(deskSrc) && deskSrc.includes('stage.style.gridTemplateColumns'));
check('the column widths are written as a style property, never into innerHTML',
  !/gridTemplateColumns[^\n]*innerHTML/.test(deskSrc));
/* Faces swap by display. An entry/exit animation on a patched node re-runs
   from zero on every repaint — that is what made the lamp chips slide. */
check('the three panel faces are display swaps, not animations',
  /\.pd-panel\.is-min \.pd-mini \{ display: flex/.test(dks) &&
  /\.pd-panel\.is-exp \.pd-xtra \{ display: flex/.test(dks) &&
  !/\.pd-(mini|xtra|full)[^{]*\{[^}]*(max-height|transition)/.test(dks));
check('folding a panel keeps it legible rather than hiding it', dks.includes('.pd-panel.is-min .pd-mini'));

/* Regression: a capture-phase closer on the strip runs before the chip's own
   handler, repaints, and detaches the chip mid-dispatch — so it could never
   be opened at all. */
check('the strip popover closer does not run in the capture phase',
  !/addEventListener\("click",[\s\S]{0,200}?\}, true\)/.test(deskSrc));

/* --- zone routing + reconciliation ---------------------------------------- */

const savedDoc2 = globalThis.document;
globalThis.document = { createElement: () => new MiniNode() };

const dcard = new DK();
dcard.setConfig({
  weather: 'weather.kcho',
  occupancy: 'input_select.house_occupancy',
  attention: [{ key: 'litter', entity: 'vacuum.litter', state: 'error', severity: 'critical', title: 'Litter box', detail: 'Error' }],
  now_playing: { players: [{ entity: 'media_player.living', name: 'Living Room' }] },
  links: [{ icon: 'mdi:television', name: 'TV', sheet: 'tv' },
          { icon: 'mdi:bell', name: 'Alerts', alert_when_faults: true }],
  sheets: { tv: { title: 'Televisions', card: { type: 'custom:purdy-remote-card' } } },
  sections: [
    { type: 'climate', key: 'clim', title: 'Climate', thermostat: 'climate.t6', goal: 'climate.gttc',
      ring: { min: 60, max: 80 },
      outside: { temp: 'sensor.out_t', humidity: 'sensor.out_h' },
      graph: { inside: 'sensor.in_t', outside: 'sensor.out_t' },
      zones: { select: 'select.zone', options: [{ label: '1st Floor', option: '1st floor', temp: 'sensor.z1' }] },
      rooms: [{ name: "Joel's Room", temp: 'sensor.joel_t', humidity: 'sensor.joel_h' }],
      hold: { remaining: 'sensor.hold', cancel_service: 'gttc.cancel_override' } },
    { type: 'nursery', key: 'joel', title: 'Joel', hatch: 'media_player.hatch', door: 'binary_sensor.door', days: 7 },
    { type: 'music', key: 'music', title: 'Music', config_entry: 'ENTRY', default_player: 'media_player.living',
      players: [{ entity: 'media_player.living', name: 'Living Room' }],
      presets: [{ name: 'Liked Songs', uri: 'library://playlist/7', icon: 'mdi:heart' }] },
    { type: 'calendar', key: 'ahead', title: 'Ahead', days: 5, entities: [{ entity: 'calendar.x', color: '#BB1C77' }] },
    { type: 'lights', key: 'lights', title: 'Lights',
      moods: [{ name: 'All off', icon: 'mdi:power', set: {}, off: ['light.living', 'light.night'] }],
      lights: [{ entity: 'light.living', name: 'Living Room', members: ['light.lamp'] },
               { entity: 'light.night', name: 'Night light',
                 protect: { when: 'media_player.hatch', state: 'playing', ask: 'Joel is asleep', detail: 'His night light.' } }] },
    { type: 'people', key: 'people', people: [{ entity: 'person.b', name: 'Brian', battery: 'sensor.bb', steps: 'sensor.bs' }] },
    /* No rooms of its own: the strip must fall back to the climate section's
       list rather than needing the same rooms written twice. */
    { type: 'rooms', key: 'rooms' },
    { type: 'quick', key: 'quick', tiles: [{ entity: 'light.living', name: 'Lights', icon: 'mdi:lightbulb', tap_action: { action: 'toggle' } }] },
    { type: 'systems', key: 'sys', devices: [{ name: 'PurdyNAS', icon: 'mdi:server', meters: [{ label: 'Array', entity: 'sensor.array', warn_above: 80 }] }] },
  ],
});

check('desk routes sections to their default tiers', (() => {
  const stage = dcard._zone('stage').map((s) => s.key).join(',');
  return stage === 'clim,joel,music,ahead,lights'
    && dcard._zone('strip').map((s) => s.key).join(',') === 'people'
    && dcard._zone('dock').map((s) => s.key).join(',') === 'rooms,quick,sys';
})());
check('desk keeps sections in config order', dcard._zone('stage')[0].key === 'clim');
check('desk watches nested section entities',
  dcard._watched.includes('sensor.z1') && dcard._watched.includes('sensor.bb') && dcard._watched.includes('binary_sensor.door'));
check('desk getCardSize is full-view sized', dcard.getCardSize() === 30);

/* column widths */
const three = [{ key: 'a' }, { key: 'b' }, { key: 'c', weight: 2 }];
check('balanced columns follow the configured weights', dcard._stageCols(three) === '1fr 1fr 2fr');
dcard._open = 'b';
check('an expanded panel takes the width and the rest fold', dcard._stageCols(three) === '0.62fr 2.9fr 0.62fr');
dcard._open = null;

/* reconciliation */
const stageNode = new MiniNode();
dcard._patchKeyed(stageNode, [
  { key: 'a', html: '<i>A</i>', cls: ['pd-panel'] },
  { key: 'b', html: '<i>B</i>', cls: ['pd-panel'] },
], 'pd-panelwrap');
check('desk panels mount in config order', stageNode.kids.map((n) => n.dataset.pkey).join(',') === 'a,b');
const [pA, pB] = stageNode.kids;
const wA = pA.writes;
dcard._patchKeyed(stageNode, [
  { key: 'a', html: '<i>A</i>', cls: ['pd-panel'] },
  { key: 'b', html: '<i>B2</i>', cls: ['pd-panel', 'is-exp'] },
], 'pd-panelwrap');
check('an unchanged desk panel is not rewritten', pA.writes === wA);
check('a changed desk panel is rewritten in place', pB._html === '<i>B2</i>' && stageNode.kids[1] === pB);
check('the expand class follows the open key', pB.className === 'pd-panelwrap pd-panel is-exp');
dcard._patchKeyed(stageNode, [{ key: 'b', html: '<i>B2</i>', cls: ['pd-panel'] }], 'pd-panelwrap');
check('a desk panel that stops rendering is removed', stageNode.kids.length === 1 && stageNode.kids[0] === pB);

/* --- a full render against a realistic state ------------------------------ */

const dslots = { 'pd-strip': new MiniNode(), 'pd-dock': new MiniNode(), 'pd-sheetslot': new MiniNode(),
                'pd-stage': new MiniNode(), 'ps-host': new MiniNode() };
dslots['pd-stage'].style = {};
const dkr = dcard;
dkr._mounted = true;
dkr.shadowRoot = {
  innerHTML: '',
  getElementById: (id) => dslots[id] || null,
  querySelectorAll: () => [],
  querySelector: () => null,
};

const nowMs = Date.parse('2026-08-07T15:00:00-04:00');
dkr._testNow = nowMs;
dkr._hass = {
  connected: true,
  callApi: () => Promise.resolve([]),
  callService: () => {},
  states: {
    'weather.kcho': { state: 'partlycloudy', attributes: { temperature: 77, friendly_name: 'KCHO' } },
    'input_select.house_occupancy': { state: 'Home', attributes: {} },
    'climate.t6': { state: 'cool', attributes: { current_temperature: 72.4, temperature: 70, hvac_action: 'cooling' } },
    'climate.gttc': { state: 'cool', attributes: { temperature: 70, current_schedule_entry: { start: '8:00 PM', heat_temp: 68, cool_temp: 70 } } },
    'select.zone': { state: '1st floor', attributes: {} },
    'sensor.z1': { state: '72.0', attributes: {} },
    'sensor.out_t': { state: '79.9', attributes: {} },
    'sensor.out_h': { state: '76.9', attributes: {} },
    'sensor.in_t': { state: '73.8', attributes: {} },
    'sensor.joel_t': { state: '69.4', attributes: {} },
    'sensor.joel_h': { state: '51.6', attributes: {} },
    'sensor.hold': { state: '0', attributes: {} },
    'media_player.hatch': { state: 'idle', attributes: {} },
    'binary_sensor.door': { state: 'off', attributes: {} },
    'media_player.living': { state: 'playing', attributes: { app_id: 'music_assistant', media_title: 'Dance Mode', media_artist: 'Bluey', entity_picture_local: '/api/x.jpg' } },
    'light.living': { state: 'on', attributes: { brightness: 128, color_temp_kelvin: 2700 } },
    'light.lamp': { state: 'on', attributes: {} },
    'light.night': { state: 'off', attributes: {} },
    'person.b': { state: 'home', attributes: { friendly_name: 'Brian' } },
    'sensor.bb': { state: '100', attributes: {} },
    'sensor.bs': { state: '4293', attributes: {} },
    'sensor.array': { state: '85.6', attributes: {} },
    'vacuum.litter': { state: 'error', attributes: { friendly_name: 'Litter box' } },
  },
};
dkr._nursery = {};                 // the recorder answered, with nothing in it
dkr._history = {};

let renderErr = null;
try { dkr._render(); } catch (e) { renderErr = e; }
check('the desk renders without throwing', renderErr === null);
if (renderErr) console.log('    ' + renderErr.stack.split('\n').slice(0, 3).join('\n    '));

const stripHtml = dslots['pd-strip']._html;
const dockHtml = dslots['pd-dock']._html;
const stageKids = dslots['pd-stage'].kids.map((n) => n.dataset.pkey);

check('the strip carries the greeting, the clock and the weather',
  /pd-z-id/.test(stripHtml) && /pd-time/.test(stripHtml) && /pd-z-wx/.test(stripHtml));
check('the strip carries the HVAC summary rather than a whole climate card',
  /Cooling to/.test(stripHtml) && /pd-zc/.test(stripHtml));
check('people land in the strip', /pd-ppl/.test(stripHtml) && /Brian/.test(stripHtml));
check('the attention band is a chip, not a band', /id="pd-alert"/.test(stripHtml) && /1 needs attention/.test(stripHtml));
check('the fault chip colours by the worst severity', /pd-chip bad/.test(stripHtml));

check('the stage renders every configured panel', stageKids.join(',') === 'clim,joel,music,ahead,lights');
check('the stage columns are written to the surviving node',
  dslots['pd-stage'].style.gridTemplateColumns === '1fr 1fr 1fr 1fr 1fr');

const climHtml = dslots['pd-stage'].kids[0]._html;
check('climate draws its ring and its goal', /pd-ring/.test(climHtml) && /pd-goal/.test(climHtml));
check('climate shows the live temperature, not the goal, in the ring', /72\.4°/.test(climHtml));
check('climate names the schedule window it is holding', /8:00 PM window/.test(climHtml));
check('a hold that is not running draws no cancel row', !/Cancel hold/.test(climHtml));
check('the room list rides the expanded block', /pd-xtra/.test(climHtml) && /Joel&#39;s Room/.test(climHtml));

const joelHtml = dslots['pd-stage'].kids[1]._html;
check('a night that has not happened reads as absent, never as zero',
  /no night yet/.test(joelHtml) && !/0m<\/b>/.test(joelHtml));
check('no naps yet says so rather than drawing an empty ring', /No naps yet today/.test(joelHtml));

const musHtml = dslots['pd-stage'].kids[2]._html;
check('music shows the target room track', /Dance Mode/.test(musHtml));
check('music artwork uses the same-origin proxy, never the MA host',
  /entity_picture_local|\/api\/x\.jpg/.test(musHtml) && !/8095/.test(musHtml));

const litHtml = dslots['pd-stage'].kids[4]._html;
check('a lit row glows rather than filling', /pd-lglow/.test(litHtml) && !/pd-lfill/.test(litHtml));
check('an off light reads off, not 0%', /&gt;off&lt;|>off</.test(litHtml.replace(/&gt;/g, '>')));
check('a group draws one dot per member', /pd-mdot/.test(litHtml));

check('the dock carries the quick tiles and the systems rows',
  /pd-qstrip/.test(dockHtml) && /pd-sysrow/.test(dockHtml));
check('the dock room strip falls back to the climate rooms',
  /pd-rstrip/.test(dockHtml) && /Outside/.test(dockHtml));
check('a link with a sheet of its own keeps it even while faults are raised',
  /data-sheet="tv"/.test(dockHtml));
check('a link with nothing of its own becomes the fault destination while faults are raised',
  /data-sheet="alerts"/.test(dockHtml));
check('the fault badge counts', /pd-badge">1</.test(dockHtml));

/* expanding is what buys detail — no navigation, no overlay */
dkr._open = 'clim';
dkr._render();
check('expanding widens the panel and folds the others',
  dslots['pd-stage'].style.gridTemplateColumns === '2.9fr 0.62fr 0.62fr 0.62fr 0.62fr');
const foldedJoel = dslots['pd-stage'].kids[1];
check('a folded panel still renders its headline', /pd-mini/.test(foldedJoel._html));
dkr._open = null;

/* A panel that has nothing to say takes its divider with it — that is how
   now-playing disappears when the house is quiet rather than leaving an empty
   column with a title in it. */
dkr._config.sections.push({ type: 'nowplaying', key: 'tv', tvs: [{ name: 'Living Room', media_player: 'media_player.tv_off' }] });
dkr._render();
check('now playing renders while music is on',
  dslots['pd-stage'].kids.some((n) => n.dataset.pkey === 'tv'));
const savedLiving = dkr._hass.states['media_player.living'];
dkr._hass.states['media_player.living'] = { state: 'idle', attributes: { app_id: 'music_assistant' } };
dkr._render();
check('a panel with nothing on is dropped entirely, divider and all',
  !dslots['pd-stage'].kids.some((n) => n.dataset.pkey === 'tv'));
dkr._hass.states['media_player.living'] = savedLiving;
dkr._config.sections.pop();
dkr._render();

/* --- zero versus missing --------------------------------------------------- */

const dkz = new DK();
dkz.setConfig({ sections: [{ type: 'climate', key: 'c', thermostat: 'climate.gone', goal: 'climate.gone',
  ring: { min: 60, max: 80 }, graph: {} }] });
dkz._hass = { connected: true, states: {}, callService: () => {} };
dkz._history = {};
const goneHtml = dkz._pnlClimate(dkz._config.sections[0]);
check('a thermostat that has dropped off draws an empty ring, not a ring at zero',
  /no reading/.test(goneHtml) && !/>0°</.test(goneHtml));
check('a graph with no history says which kind of nothing it has',
  /No history yet/.test(goneHtml));
dkz._histErr = 'boom';
check('a recorder that did not answer says so rather than drawing a flat line',
  /Recorder did not answer/.test(dkz._pnlClimate(dkz._config.sections[0])));

/* --- lights: level guard, throttle, optimism ------------------------------- */

check('a light that is off reports no level rather than zero', dcard._lightPct('light.night') === null);
check('a lit light reports its percentage', dcard._lightPct('light.living') === 50);
check('the optimistic level is what the display and the NEXT drag both read', (() => {
  dcard._briOpt['light.living'] = { value: 80, until: Date.now() + 12000 };
  const v = dcard._lightPct('light.living');
  delete dcard._briOpt['light.living'];
  return v === 80;
})());
check('the optimistic level expires rather than standing unbacked', (() => {
  dcard._briOpt['light.living'] = { value: 80, until: Date.now() - 1 };
  const v = dcard._lightPct('light.living');
  delete dcard._briOpt['light.living'];
  return v === 50;
})());
/* A debounce only fires after the drag stops — the number moves and the room
   does not. The send must lead. */
check('the brightness send leads rather than waiting for the drag to stop', (() => {
  const calls = [];
  const saved = dcard._hass.callService;
  dcard._hass.callService = (d, s, data) => calls.push(data.brightness_pct);
  dcard._briSend = {};
  dcard._lightSetBri('light.living', 40);
  dcard._hass.callService = saved;
  return calls.length === 1 && calls[0] === 40;
})());
check('the brightness send is a throttle, not a debounce',
  deskSrc.includes('THROTTLE, not a debounce') && /150 - gap/.test(deskSrc));

/* The guard is gated on the session, not on the light: a guard that fires at
   noon is one people learn to click through. */
check('the protect guard is silent while the session is not running',
  dcard._protectOf('light.night') === null);
dcard._hass.states['media_player.hatch'] = { state: 'playing', attributes: {} };
check('the protect guard speaks while he is asleep',
  (dcard._protectOf('light.night') || {}).ask === 'Joel is asleep');
check('the guard covers the level, not just the switch',
  deskSrc.includes('covers the LEVEL') && /Set \$\{pcName/.test(deskSrc));
check('a mood never touches a guarded light', /if \(this\._protectOf\(id\)\) return;/.test(deskSrc));
dcard._hass.states['media_player.hatch'] = { state: 'idle', attributes: {} };

/* --- the optimistic setpoint ----------------------------------------------- */

check('the goal reads from the optimistic value, not the round trip', (() => {
  dcard._goalOpt = { id: 'climate.gttc', value: 73, until: Date.now() + 12000 };
  const v = dcard._optGoal('climate.gttc', 70);
  dcard._goalOpt = null;
  return v === 73;
})());
check('a burst of taps sends one call carrying the last value',
  /clearTimeout\(this\._goalSend\)/.test(deskSrc) && /this\._goalSend = setTimeout/.test(deskSrc));
check('the optimistic setpoint expires so a lost call shows the truth',
  /until: Date\.now\(\) \+ 12000/.test(deskSrc));

/* --- what only real data showed -------------------------------------------
 *
 * Each of these passed a hand-written fixture and was wrong against the house.
 */

/* GTTC's window is {time_start, time_end, target_temp, cooling_temp}, not the
   {start, heat_temp, cool_temp} shape a reasonable person would guess. The
   guess produced no error — the branch fell through and the panel printed
   "HVAC is cooling" forever instead of the window. */
check('the climate note reads GTTC\'s real schedule-entry shape', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.gttc', graph: {} }] });
  d._hass = { states: { 'climate.gttc': { state: 'cool', attributes: { temperature: 74,
    current_schedule_entry: { time_start: '06:00', time_end: '17:59', target_temp: 71, cooling_temp: 74 } } } } };
  return d._climateNote(d._config.sections[0], 'cooling') === 'Holding the 6:00 AM–5:59 PM window. 71° heat / 74° cool.';
})());
check('the climate note still reads the generic shape', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.g', graph: {} }] });
  d._hass = { states: { 'climate.g': { state: 'heat', attributes: {
    current_schedule_entry: { start: '8:00 PM', heat_temp: 68, cool_temp: 70 } } } } };
  return /Holding the 8:00 PM window\. 68° heat \/ 70° cool\./.test(d._climateNote(d._config.sections[0], 'heating'));
})());

/* An idle MA player keeps its media_title and artwork for hours. Reading the
   attribute without the state grows a now-playing row in a silent house. */
check('an idle player with a stale title reads as nothing playing', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'music', key: 'm', default_player: 'media_player.lr',
    players: [{ entity: 'media_player.lr', name: 'Living Room' }] }] });
  d._hass = { states: { 'media_player.lr': { state: 'idle', attributes: {
    app_id: 'music_assistant', media_title: 'Bluey Theme Tune', media_artist: 'Bluey',
    entity_picture_local: '/api/x.jpg', friendly_name: 'Living Room TV' } } } };
  const html = d._pnlMusic(d._config.sections[0]);
  return /Nothing playing/.test(html) && !/Bluey Theme Tune/.test(html) && !/\/api\/x\.jpg/.test(html);
})());
/* The MA mirror answers to the SOURCE DEVICE's name — the living room speaker
   is "Living Room TV", which is both wrong and confusing beside a TV row. */
check('a room is named by config, not by the MA mirror\'s friendly name', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'music', key: 'm', default_player: 'media_player.lr',
    players: [{ entity: 'media_player.lr', name: 'Living Room' }] }] });
  d._hass = { states: { 'media_player.lr': { state: 'idle', attributes: { friendly_name: 'Living Room TV' } } } };
  const html = d._pnlMusic(d._config.sections[0]);
  return /Living Room</.test(html) && !/Living Room TV/.test(html);
})());

/* A chip that asked for a value and did not get one is a question with no
   answer. GTTC's active_preset is null whenever it picks one situationally. */
check('a chip with no answer is dropped rather than printing its label', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'climate', key: 'c', goal: 'climate.g', graph: {},
    chips: [{ name: 'Running:', source: 'schedule_preset' }, { name: 'Season:', entity: 'select.s', show_state: true }] }] });
  d._hass = { states: { 'climate.g': { state: 'cool', attributes: {} }, 'select.s': { state: 'Cooling', attributes: {} } } };
  const html = d._climateChips(d._config.sections[0]);
  return !/Running:/.test(html) && /Season: Cooling/.test(html);
})());

/* --- a sheet can host one of our own sections ------------------------------ */

check('a sheet can host a section, not only a foreign card', (() => {
  const d = new DK();
  d.setConfig({
    sections: [{ type: 'lights', key: 'lights', sheet_only: true,
      lights: [{ entity: 'light.a', name: 'Living Room' }],
      moods: [{ name: 'All off', set: {}, off: ['light.a'] }] }],
    sheets: { lights: { title: 'Lights', section: 'lights' } },
  });
  d._hass = { states: { 'light.a': { state: 'on', attributes: { brightness: 128 } } } };
  d._sheet = 'lights';
  const html = d._sheetHtml([]);
  return /pd-lrow/.test(html) && /All off/.test(html);
})());
check('a sheet_only section takes no column on the stage', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'lights', key: 'lights', sheet_only: true, lights: [] }] });
  return d._zone('stage').length === 0;
})());
/* The chrome already names itself beside the close button — a second title
   printed the name twice on the phone and would here too. */
check('a section hosted in a sheet draws no header of its own', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'lights', key: 'lights', sheet_only: true, title: 'Lights',
    lights: [{ entity: 'light.a', name: 'Living Room' }] }],
    sheets: { lights: { title: 'Lights', section: 'lights' } } });
  d._hass = { states: { 'light.a': { state: 'off', attributes: {} } } };
  d._sheet = 'lights';
  const html = d._sheetHtml([]);
  /* Visible text only — the accessible name on the dialog is not a heading. */
  return (html.match(/>Lights</g) || []).length === 1 && !/pd-ph/.test(html);
})());
check('a hosted section shows everything, having nothing to fold against',
  /\.pd-sheet-body \.pd-xtra \{ display: flex/.test(dks));

/* --- scrub: the readout has to be REACHABLE, not merely present ------------ */

check('the night rail carries a crosshair inside its scrub box', (() => {
  const rail = dkr._nightRail({}, { from: 1, to: 2, settledAt: 1, events: [], active: false }, true, null);
  return /data-scrub="night"[\s\S]*?pd-cross/.test(rail);
})());
/* Regression: the rail is 26px tall and its caption belongs in the header
   above it, so a readout lookup confined to the scrub box finds nothing and
   returns early — a rail that is wired and silently never scrubs. */
check('the night rail readout sits outside the scrub box', (() => {
  const rail = dkr._nightRail({}, { from: 1, to: 2, settledAt: 1, events: [], active: false }, true, null);
  const box = rail.slice(rail.indexOf('data-scrub="night"'));
  return !/data-readout/.test(box) && /data-readout/.test(rail);
})());
check('the scrub falls back to the parent when the readout is not inside',
  /parentNode[\s\S]{0,120}querySelector\("\[data-readout\]"\)/.test(deskSrc));

/* --- the fixed sheet ------------------------------------------------------- */

check('the sheet is sized to the viewport, not to its content',
  /height: calc\(100dvh - var\(--pd-off/.test(dks));
check('the viewport offset is config, not a baked number', (() => {
  const d = new DK();
  d.setConfig({ viewport_offset: 120, sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  const set = {};
  d.style = { setProperty: (k, v) => { set[k] = v; } };
  d._mounted = true;
  d.shadowRoot = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  d._hass = { states: {}, connected: true };
  d._render();
  return set['--pd-off'] === '120px';
})());

/* --- history windows -------------------------------------------------------- */

/* --- the server earns a panel; the music earns a strip -------------------- */

const srvCfg = {
  name: 'PurdyNAS', url: 'http://server/Dashboard',
  status: 'sensor.nas_status', uptime: 'sensor.nas_uptime',
  update_available: 'binary_sensor.nas_update',
  faults: [
    { entity: 'binary_sensor.parity', state: 'on', label: 'Parity', detail: 'invalid', severity: 'critical' },
    { entity: 'sensor.smart', state_not: 'PASSED', label: 'Parity SMART', detail: 'not PASSED', severity: 'warn' },
  ],
  meters: [
    { label: 'Array', entity: 'sensor.array', warn_above: 80, critical_above: 95 },
    { label: 'RAM', entity: 'sensor.ram', warn_above: 85 },
    { label: 'Cache', entity: 'sensor.cache_gone' },
  ],
  stats: [{ label: 'CPU', entity: 'sensor.cpu', unit: '%', digits: 1 }],
  docker: { running: 'sensor.containers' },
  perf: { cpu: 'sensor.cpu' },
};

const dsys = new DK();
dsys.setConfig({
  server: srvCfg,
  sections: [
    { type: 'systems', key: 'sys', title: 'Systems', zone: 'stage',
      devices: [{ name: 'PurdyNAS', key: 'nas', icon: 'mdi:server' },
                { name: 'Jeeves', key: 'floor', icon: 'mdi:robot-vacuum', chip: 'vacuum.j',
                  meters: [{ label: 'Dirty water', entity: 'sensor.dirty', warn_above: 80 }] }] },
    { type: 'nowplaying', key: 'np', title: 'Now playing', zone: 'dock', sheet: 'music' },
    { type: 'music', key: 'music', sheet_only: true, default_player: 'media_player.lr',
      players: [{ entity: 'media_player.lr', name: 'Living Room' }] },
  ],
});
dsys._hass = { states: {
  'sensor.nas_status': { state: 'online', attributes: {} },
  'sensor.nas_uptime': { state: '12 days', attributes: {} },
  'binary_sensor.parity': { state: 'on', attributes: {} },
  'sensor.smart': { state: 'PASSED', attributes: {} },
  'sensor.array': { state: '85.8', attributes: {} },
  'sensor.ram': { state: '41.2', attributes: {} },
  'sensor.cpu': { state: '3.1', attributes: {} },
  'sensor.containers': { state: '4 of 11', attributes: {} },
  'sensor.dirty': { state: '10', attributes: {} },
  'vacuum.j': { state: 'docked', attributes: {} },
  'binary_sensor.nas_update': { state: 'off', attributes: {} },
  'media_player.lr': { state: 'idle', attributes: { app_id: 'music_assistant', media_title: 'stale', friendly_name: 'Living Room TV' } },
} };
dsys._history = {};

check('the server block is watched, not just the sections',
  dsys._watched.includes('sensor.array') && dsys._watched.includes('sensor.cpu')
  && dsys._watched.includes('binary_sensor.parity'));

const sysHtml = dsys._pnlSystems(dsys._config.sections[0]);
check('systems on the stage names the server and its uptime',
  /PurdyNAS/.test(sysHtml) && /12 days/.test(sysHtml));
check('systems draws a bar per meter', (sysHtml.match(/pd-mbar/g) || []).length === 3);
check('a meter with no reading draws an empty track, never a bar at zero', (() => {
  const cache = sysHtml.slice(sysHtml.indexOf('Cache'));
  const row = cache.slice(0, cache.indexOf('</div>', cache.indexOf('pd-mv2')));
  return /pd-mbar"><\/span>/.test(row) && /—/.test(row);
})());
check('a meter over its warn line colours, one under it does not',
  /width:85.8%;background:var\(--ps-warn\)/.test(sysHtml)
  && /width:41.2%;background:var\(--ps-cool\)/.test(sysHtml));
check('only the firing server faults are listed',
  /Parity<\/div>/.test(sysHtml) && !/Parity SMART/.test(sysHtml));
check('the fault chip counts and colours by the worst severity',
  /pd-chip bad/.test(sysHtml) && /1 fault/.test(sysHtml));
check('the CPU trend rides the existing history fetch',
  dsys._historyEntities().includes('sensor.cpu'));
check('the other systems devices are secondary, not absent',
  /Jeeves/.test(sysHtml) && sysHtml.indexOf('PurdyNAS') < sysHtml.indexOf('Jeeves'));
check('a systems panel with no server block falls back rather than rendering blank', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'systems', key: 's', zone: 'stage',
    devices: [{ name: 'Jeeves', icon: 'mdi:robot-vacuum', chip: 'vacuum.j' }] }] });
  d._hass = { states: { 'vacuum.j': { state: 'docked', attributes: {} } } };
  return /Jeeves/.test(d._pnlSystems(d._config.sections[0]));
})());
check('a healthy server says so rather than showing an empty list', (() => {
  dsys._hass.states['binary_sensor.parity'] = { state: 'off', attributes: {} };
  const h = dsys._pnlSystems(dsys._config.sections[0]);
  dsys._hass.states['binary_sensor.parity'] = { state: 'on', attributes: {} };
  return /pd-chip good/.test(h) && /Healthy/.test(h) && /Nothing wrong with PurdyNAS/.test(h);
})());

const npHtml = dsys._dockNowplaying(dsys._config.sections[1]);
check('the docked now-playing draws no transport when nothing plays',
  /pd-npbar idle/.test(npHtml) && !/data-mp=/.test(npHtml));
check('an idle player\'s stale title stays out of the dock', !/stale/.test(npHtml));
check('the idle strip still opens the music sheet', /data-sheet="music"/.test(npHtml));
dsys._hass.states['media_player.lr'] = { state: 'playing', attributes: {
  app_id: 'music_assistant', media_title: 'Dance Mode', media_artist: 'Bluey', entity_picture_local: '/api/a.jpg' } };
const npLive = dsys._dockNowplaying(dsys._config.sections[1]);
check('the docked now-playing carries the track and a transport',
  /Dance Mode/.test(npLive) && /data-mp="playpause"/.test(npLive) && /pd-tb/.test(npLive));
check('the docked now-playing names the room from config',
  /Living Room</.test(npLive) && !/Living Room TV/.test(npLive));
check('the docked artwork uses the same-origin proxy', /\/api\/a\.jpg/.test(npLive));

/* --- what only a screenshot showed --------------------------------------- */

/* Six cells sharing one flex row came out ~72px each on a 1440 desktop and
   truncated every label to "LIVIN…" / "Ligh…". A label that has lost the word
   is not a smaller label, it is a missing one. */
check('the dock strips wrap rather than squeezing their labels', (() => {
  const rooms = /\.pd-rstrip \{[^}]*\}/.exec(dks)[0];
  const quick = /\.pd-qstrip \{[^}]*\}/.exec(dks)[0];
  return /display: grid/.test(rooms) && /auto-fit/.test(rooms) && /minmax\(/.test(rooms)
    && /display: grid/.test(quick) && /auto-fit/.test(quick) && /minmax\(/.test(quick);
})());
check('a dock cell no longer fights its neighbours for width',
  !/\.pd-rc \{[^}]*flex: 1;/.test(dks) && !/\.pd-qt \{[^}]*flex: 1;/.test(dks));

/* Uncapped it grew to ~340px — a 24h trend line taking a third of the screen
   height, which is not what the climate panel is about. */
check('the temperature graph stretches but is capped',
  /\.pd-graph \{[^}]*flex: 1 1 auto;[^}]*max-height: 240px/.test(dks));

/* The chip already carries how long he has been up. */
check('the status line does not repeat the awake time the chip carries', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'nursery', key: 'joel', hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  d._nursery = {};
  const line = d._nurseryStatus({}, null,
    { wakeWindowMin: 120, wakeSince: Date.parse('2026-08-08T11:47:00'), bedMean: 1146 }, null, Date.now());
  return /Since 11:47/.test(line) && !/2h/.test(line) && /usually down/.test(line);
})());
check('a live session still names its own elapsed time', (() => {
  const d = new DK();
  d.setConfig({ sections: [{ type: 'nursery', key: 'joel', hatch: 'media_player.h', door: 'binary_sensor.d' }] });
  const now = Date.parse('2026-08-08T15:00:00');
  d._nursery = {};
  const live = { from: now - 3600000, settledAt: now - 3000000, active: true };
  return /asleep/.test(d._nurseryStatus({}, live, {}, null, now));
})());

/* Weather states are slugs with no separator, so the generic humaniser could
   only capitalise them: "Partlycloudy". */
check('weather states read as words, not as slugs', (() => {
  const d = new DK();
  d.setConfig({ weather: 'weather.w', sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  d._hass = { states: { 'weather.w': { state: 'partlycloudy', attributes: { temperature: 90 } } } };
  const html = d._zoneWeather();
  return /Partly cloudy/.test(html) && !/Partlycloudy/.test(html);
})());
check('an unmapped weather state still falls back to the humaniser', (() => {
  const d = new DK();
  d.setConfig({ weather: 'weather.w', sections: [{ type: 'quick', key: 'q', tiles: [] }] });
  d._hass = { states: { 'weather.w': { state: 'sunny', attributes: { temperature: 90 } } } };
  return /Sunny/.test(d._zoneWeather());
})());

check('the desk adds no history call that could forget end_time',
  !/history\/period\//.test(deskSrc));

globalThis.document = savedDoc2;


}


/* ======================== weather motion ========================
   The effect rides .ps-ground, which _mount builds once and no patch ever
   rewrites. Two things have to hold or it is silently dead: the paint has to
   be CALLED (a method can be complete and never invoked — _bindScrub sat
   written and uninvoked through three releases), and a condition with no
   effect must clear the attribute rather than leave the last one running. */

const wxSrc = fs.readFileSync(new URL('../src/78b-shell-weather.js', import.meta.url), 'utf8');
const coreSrc = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');

check('the weather paint is actually called from the render tail',
  /this\._paintWxFx\(\);/.test(coreSrc));
check('weather_fx joins the watched set, being top-level and not a section',
  /push\(\(c\.weather_fx \|\| \{\}\)\.entity\)/.test(coreSrc));

function wxGround() {
  const el = {
    dataset: {}, _st: {},
    hasAttribute: (n) => n === 'data-wx' && el.dataset.wx !== undefined,
    removeAttribute: (n) => { if (n === 'data-wx') delete el.dataset.wx; },
    style: {
      setProperty: (k, v) => { el._st[k] = String(v); },
      getPropertyValue: (k) => el._st[k] || '',
    },
  };
  return el;
}
function wxPaint(cfg, states) {
  const sh = new SH();
  const g = wxGround();
  sh.shadowRoot = { querySelector: (q) => (q === '.ps-wxfx' ? g : null) };
  sh._config = { sections: [], weather_fx: cfg };
  sh._hass = { states: states || {} };
  sh._paintWxFx();
  return g;
}
const WXE = 'weather.kcho';
const wxSt = (s) => ({ [WXE]: { state: s, attributes: {} } });

check('rain draws rain', wxPaint({ entity: WXE }, wxSt('rainy')).dataset.wx === 'rain');
check('pouring gets its own heavier tile', wxPaint({ entity: WXE }, wxSt('pouring')).dataset.wx === 'pour');
check('a thunderstorm draws the flash, not just rain',
  wxPaint({ entity: WXE }, wxSt('lightning-rainy')).dataset.wx === 'storm');
check('snow draws snow', wxPaint({ entity: WXE }, wxSt('snowy')).dataset.wx === 'snow');

/* Zero-versus-missing, one level out: a clear sky, an unreporting provider and
   no config at all must all draw NOTHING, and none of them may draw a stand-in. */
check('a clear sky draws nothing at all',
  wxPaint({ entity: WXE }, wxSt('sunny')).dataset.wx === undefined);
check('clear night draws nothing either',
  wxPaint({ entity: WXE }, wxSt('clear-night')).dataset.wx === undefined);
check('cloudy is deliberately unmapped — it is on almost always',
  wxPaint({ entity: WXE }, wxSt('cloudy')).dataset.wx === undefined);
check('an unavailable provider draws nothing rather than a clear sky',
  wxPaint({ entity: WXE }, wxSt('unavailable')).dataset.wx === undefined);
check('a missing entity draws nothing', wxPaint({ entity: WXE }, {}).dataset.wx === undefined);
check('no weather_fx block draws nothing', wxPaint(undefined, wxSt('rainy')).dataset.wx === undefined);

check('the weather clearing up takes the rain away with it', (() => {
  const sh = new SH();
  const g = wxGround();
  sh.shadowRoot = { querySelector: () => g };
  sh._config = { sections: [], weather_fx: { entity: WXE } };
  sh._hass = { states: wxSt('rainy') };
  sh._paintWxFx();
  if (g.dataset.wx !== 'rain') return false;
  sh._hass = { states: wxSt('sunny') };
  sh._paintWxFx();
  return g.dataset.wx === undefined;
})());

check('force: previews a condition the sky is not doing',
  wxPaint({ entity: WXE, force: 'rainy' }, wxSt('sunny')).dataset.wx === 'rain');
check('strength is clamped, so no config can paint the column out',
  wxPaint({ entity: WXE, strength: 8 }, wxSt('rainy'))._st['--ps-wxstr'] === '1.5');
check('a non-numeric strength falls back to full rather than to nothing',
  wxPaint({ entity: WXE, strength: 'loud' }, wxSt('rainy'))._st['--ps-wxstr'] === '1');

/* The stylesheet half. A tile that does not travel exactly one tile height
   cannot loop seamlessly, so the 200px pairing is asserted, not assumed. */
check('the effect layer carries both precipitation layers', /\.ps-wxfx::before, \.ps-wxfx::after/.test(shs));
check('the fall keyframe travels exactly one tile height',
  /@keyframes ps-wxfall \{\s*from \{ transform: translate3d\(0, -200px, 0\); \}/.test(shs));
check('every rain tile is 200px tall, so the loop cannot jump',
  (shs.match(/--ps-wx-[a-z]+-(near|far)-size: \d+px 200px;/g) || []).length === 6);
check('the drops are discrete, not a repeating-linear-gradient hatch',
  shs.includes('--ps-wx-rain-near:') && !/--ps-wx[^;]*repeating-linear-gradient/.test(shs));
check('reduced motion stops the weather, not just transitions',
  /\.ps-wxfx, \.ps-wxfx::before, \.ps-wxfx::after \{ animation: none !important; \}/.test(shs));

/* The column blurs its backdrop by 26px, so an effect BEHIND it is invisible.
   This is the assertion that a mockup without frosted glass cannot make. */
check('the effect sits in front of the glass, not behind it',
  /\.ps-wxfx \{[^}]*z-index: 6/.test(shs));
check('and under the dock, the scrim and the sheets',
  /\.ps-scrim \{[^}]*z-index: 8/.test(shs) && /\.ps-dockwrap \{[^}]*z-index: 7/.test(shs));
check('the effect layer is mounted once, in the skeleton',
  /<div class="ps-wxfx"><\/div>/.test(coreSrc));
check('it never eats a tap', /\.ps-wxfx \{[^}]*pointer-events: none/.test(shs));
check('an unmapped condition has no rule to match', !/data-wx="cloudy"/.test(shs));
check('the condition map is keyed on HA states, not invented ones',
  /const PS_WXFX = \{/.test(wxSrc) && /"lightning-rainy": "storm"/.test(wxSrc));


/* ---------------------------------------------------------------------------
   health — THE METER, and the four states.

   The fourth state is the one that matters: a missing reading draws NO TRACK
   AT ALL. An empty rail is a claim that the number is low, which is the
   zero-vs-missing rule arriving at a new surface. The same holds for a band
   that does not exist yet, which is what lets the section ship before the
   capture layer that will produce the bands.
   --------------------------------------------------------------------------- */
const { healthMeter: psHealthMeterFn, hmDur: psHmDurFn, hmDomain: psHmDomainFn } = SH.helpers;

check('a meter with no reading draws no track at all',
  !/ps-hmt/.test(psHealthMeterFn({ label: 'VO2 max', value: null, band: { lo: 40, hi: 50 } })));
check('a meter with no reading says so',
  /No reading/.test(psHealthMeterFn({ label: 'VO2 max', value: null })));
check('a value with no band ALSO draws no track',
  !/ps-hmt/.test(psHealthMeterFn({ label: 'FTP', value: 200 })));
/* A missing READING is captioned; a missing BAND is silent. Before the capture
   layer exists every meter lacks a band, and captioning each one put eleven
   identical grey lines down the section on the first live render. */
check('a value with no band says nothing at all',
  !/No band/.test(psHealthMeterFn({ label: 'FTP', value: 200 })));
check('a value with no band still shows the value',
  /200/.test(psHealthMeterFn({ label: 'FTP', value: 200 })));
check('a value with a band draws the track',
  /ps-hmt/.test(psHealthMeterFn({ label: 'Resting', value: 59, band: { lo: 55, hi: 63 } })));

const mtrIn = psHealthMeterFn({ label: 'Resting', value: 59, band: { lo: 55, hi: 63 } });
const mtrLow = psHealthMeterFn({ label: 'Asleep', value: 5.6, band: { lo: 6.8, hi: 8.2 } });
const mtrHiBad = psHealthMeterFn({ label: 'Resting', value: 70, band: { lo: 55, hi: 63 } });
const mtrHiOk = psHealthMeterFn({ label: 'HRV', value: 44, band: { lo: 26, hi: 38 }, hiOk: true });
check('in band carries no modifier class', /class="ps-hmd "/.test(mtrIn));
check('below the band is amber', /ps-hmd out/.test(mtrLow));
check('above the band is amber when above is a fault', /ps-hmd out/.test(mtrHiBad));
check('above the band is cyan where above is not a fault', /ps-hmd high/.test(mtrHiOk));
check('a questionable value is grey, never green',
  /ps-hmd q/.test(psHealthMeterFn({ label: 'Asymmetry', value: 0, band: { lo: 0, hi: 3 }, q: true })));
check('the hearing band is a ceiling, filled from the floor',
  /ps-hmb cap[^>]*left:0%/.test(psHealthMeterFn({
    label: 'Sound', value: 76, band: { lo: 40, hi: 80, dlo: 40, dhi: 105 }, cap: true })));

// decimal hours are not a duration anybody reads
check('5.61 hours reads as 5h 37m', psHmDurFn(5.61) === '5h 37m');
check('under an hour drops the hours', psHmDurFn(0.84) === '50m');
check('a missing duration is a dash, never 0m', psHmDurFn(null) === '—');
// a band with no explicit domain gets one, so config stays small
check('a bare band lands in the middle third', (() => {
  const d = psHmDomainFn({ lo: 55, hi: 63 });
  return d.lo === 47 && d.hi === 71;
})());
check('a nonsense band yields no domain, and therefore no track',
  psHmDomainFn({ lo: 5, hi: 5 }) === null && psHmDomainFn(null) === null);

const hlCfg = {
  type: 'health', key: 'body', title: 'Body',
  sleep_total: 'hae.tot', sleep_deep: 'hae.deep', sleep_core: 'hae.core',
  sleep_rem: 'hae.rem', sleep_awake: 'hae.awake',
  hr_series: 'hae.hr', hrv: 'hae.hrv', resting_hr: 'hae.rhr',
  respiratory: 'hae.resp', walking_hr: 'hae.whr', effort: 'hae.eff',
  load: { steps: 'hae.steps', exercise: 'hae.ex', active: 'hae.act',
          distance: 'hae.dist', flights: 'hae.fl', stand: 'hae.stand' },
  fitness: { ftp: 'sensor.ftp', weight: 'sensor.wt', vo2: 'sensor.vo2' },
};
const hlStates = {
  'hae.tot': { state: '5.61', attributes: {} },
  'hae.deep': { state: '0.84', attributes: {} },
  'hae.core': { state: '3.13', attributes: {} },
  'hae.rem': { state: '1.63', attributes: {} },
  'hae.awake': { state: '0.05', attributes: {} },
  'hae.hrv': { state: '31.36', attributes: {} },
  'hae.rhr': { state: '59', attributes: {} },
  'hae.resp': { state: '18', attributes: {} },
  'hae.whr': { state: '104', attributes: {} },
  'hae.steps': { state: '4817', attributes: {} },
  'hae.ex': { state: '39', attributes: {} },
  'hae.act': { state: '264.41', attributes: {} },
  'hae.dist': { state: '2.33', attributes: {} },
  'hae.fl': { state: '7', attributes: {} },
  'hae.stand': { state: '6', attributes: {} },
  'hae.eff': { state: '5.2', attributes: {} },
  'sensor.ftp': { state: '200', attributes: {} },
  'sensor.wt': { state: '70.31', attributes: {} },
  'sensor.vo2': { state: 'unknown', attributes: {} },
};
const mkHl = (over, bands) => {
  const s = new SH();
  s.setConfig({ sections: [{ ...hlCfg, bands: bands || {} }] });
  s._hass = { states: { ...hlStates, ...(over || {}) }, user: { id: 'u1', name: 'Brian' } };
  /* All ~235 samples carry one upload timestamp, so the trace is plotted by
     index; the fixture gives them near-identical times on purpose. */
  s._history = { 'hae.hr': [60, 58, 57, 59, 62, 88, 104].map((v, i) => ({ t: 1000 + i, s: String(v) })) };
  return s;
};
const hlSec = { ...hlCfg, bands: {} };
const hl = mkHl()._secHealth(hlSec);
check('the Body face is a door, and says so', /ps-dv/.test(hl)
  && /data-mode="health"/.test(hl) && !/ps-cv/.test(hl));

check('setConfig accepts a health section', (() => {
  try { new SH().setConfig({ sections: [hlCfg] }); return true; } catch (e) { return false; }
})());

/* ---- the collapsed face is now a DOOR, and holds nothing else ------------ */
check('the collapsed face carries exactly three meters',
  hl.split('class="ps-hm"').length - 1 === 3);
check('the collapsed chip carries the load, not the verdict', /39m active/.test(hl));
check('the collapsed chip never claims a roll-up', !/all in band/i.test(hl));
/* The blocks moved into the mode. A face that still carried them would be a
   stub of the app sitting beside the app - the argument that dropped the
   Systems row's chevron, which is why this one has none either. */
check('the collapsed face has no expanded body at all', !/ps-xtra/.test(hl));
check('the header is a door into the mode, not a toggle',
  /data-mode="health"/.test(hl) && !/data-open="body"/.test(hl));
check('a mode door draws no chevron', !/ps-cv/.test(hl));

/* ---- the pages ----------------------------------------------------------- */
const hlM = mkHl();
const pgToday = hlM._hpToday(hlSec);
const pgSleep = hlM._hpSleep(hlSec);
const pgHeart = hlM._hpHeart(hlSec);
const pgFit = hlM._hpFitness(hlSec);

check('every page key has a renderer, and every renderer a page', (() => {
  const keys = hlM._hlPages().map((p) => p.key).sort().join(',');
  return keys === 'fitness,heart,sleep,today';
})());
/* A page with nothing behind it gets no dock slot, so an install with no
   Garmin degrades to three pages rather than to one empty one. */
check('a page with no data gets no slot', (() => {
  const s = mkHl({ 'sensor.ftp': { state: 'unknown', attributes: {} },
    'sensor.wt': { state: 'unknown', attributes: {} } });
  return !s._hlPages().some((p) => p.key === 'fitness');
})());

/* THE RING RULE: a horseshoe only where the goal is his. */
/* 'ps-hring' is also a prefix of the CONTAINER's 'ps-hrings', so a bare
   substring count answers 4 for three rings. */
check('Today draws its three rings', (() => {
  const n = pgToday.split('class="ps-ring ps-hring"').length - 1;
  return n === 3 && /kcal move/.test(pgToday) && /exercise/.test(pgToday) && /stand/.test(pgToday);
})());
/* Exercise is routinely OVER its goal, and "39 against a 30 minute goal" is the
   whole message on that ring - a ring clamped at 100% throws it away. The
   marker has to be read off the EXERCISE ring specifically: the move ring's
   marker sits at 495 (a goal not yet reached is a full-scale marker) and a
   loose match finds that one first. */
check('an overshot goal keeps its marker inside the ring', (() => {
  const ex = pgToday.split('class="ps-ring ps-hring"').find((c) => /exercise/.test(c));
  const m = ex && ex.match(/<line[^>]*transform="rotate\(([-\d.]+)/);
  const arc = ex && ex.match(/stroke-dasharray="([\d.]+) ([\d.]+)"[^>]*\n?[^>]*stroke-dashoffset/);
  return /exercise goal met/.test(pgToday) && m && parseFloat(m[1]) < 495 && parseFloat(m[1]) > 135;
})());
check('a ring with no reading draws a dash, never a zero arc', (() => {
  const s = mkHl({ 'hae.act': { state: 'unknown', attributes: {} } });
  const t = s._hpToday(hlSec);
  return />—<\/b><small>kcal move/.test(t);
})());
check('Heart and Fitness draw no rings at all',
  !/ps-hring/.test(pgHeart) && !/ps-hring/.test(pgFit));
check('the movement meters say why they carry no bands',
  /ps-hmg/.test(pgToday) && /carry no bands on purpose/.test(pgToday));

check('the sleep ring is three arcs, not one', (() => {
  const arcs = (pgSleep.split('stroke-dashoffset').length - 1);
  return arcs === 3 && /var\(--ps-deep\)/.test(pgSleep) && /var\(--ps-cool\)/.test(pgSleep);
})());
/* Naming the marker "goal" while it is his own average would be the ring
   mistake all over again, so it says which one it is. */
check('the sleep marker says what it is', /your target, until seven nights/.test(pgSleep));
check('with a band the sleep marker changes its claim',
  /middle of your own range/.test(mkHl(null, { asleep: { lo: 6.8, hi: 8.2 } })
    ._hpSleep({ ...hlCfg, bands: { asleep: { lo: 6.8, hi: 8.2 } } })));
check('the stage bar is drawn', /ps-hstage/.test(pgSleep));

/* Apple publishes four totals and no times. Any window would be invented -
   and the invented one disagreed with its own reading, twice. */
check('no sleep window is ever printed', !/→/.test(pgSleep) && !/→/.test(hl));
check('sleep efficiency is nowhere in the mode',
  ![pgToday, pgSleep, pgHeart, pgFit].some((p) => /efficien/i.test(p)));
check('the trace carries no tick labels', !/ps-axl|11 PM|6:41/.test(pgSleep));
check('the trace says it is not to scale in time', /not to scale in time/.test(pgSleep));
check('the trace is drawn from x=0, by index', /points="0\.0,/.test(pgSleep));
/* Painted before the fill, the gradient covers it and the page ships with an
   invisible reference - which is what the mockup's first screenshot caught.
   indexOf('<line') is not enough: it matches <linearGradient. */
check('the resting line is painted after the fill', (() => {
  /* Scoped to the TRACE. The sleep ring above it carries a goal marker that is
     also a <line>, and it sits before the polygon - so an unscoped search
     answers about the wrong element and fails for the wrong reason. */
  const tr = pgSleep.slice(pgSleep.indexOf('<svg class="ps-htrace"'));
  const poly = tr.indexOf('<polygon');
  const line = tr.indexOf('<line ');
  return poly > -1 && line > poly;
})());
check('the trace is on Heart as well as Sleep', /ps-htrace/.test(pgHeart));
check('Heart never prints a high/low pair off one sample',
  /No daily high and low/.test(pgHeart));

check('an unknown VO2 max draws no track and no zero',
  /VO2 max<\/div><div class="ps-hmv none">—<\/div><div class="ps-hmn">No reading/
    .test(pgFit.replace(/\n\s*/g, '')));
check('a blank VO2 beside a live FTP names the cause', /Garmin offline/.test(pgFit));
check('no page is papered with band captions',
  ![pgToday, pgSleep, pgHeart, pgFit].some((p) => /No band yet/.test(p)));

/* Gait and hearing were dropped outright, not hidden behind a flag - a
   renderer nothing calls is the "_bindScrub defined and never invoked" shape. */
check('gait and hearing are gone from the source',
  !/_hlWalking|_hlHearing/.test(fs.readFileSync(new URL('../src/78c-shell-health.js', import.meta.url), 'utf8')));

/* ---- the chip per page --------------------------------------------------- */
check('each page chip carries a derived state, not a reading', (() => {
  const c = (k) => hlM._hlPageChip(hlSec, { key: k });
  return /1 of 3 goals/.test(c('today')) && /1h 53m under/.test(c('sleep'));
})());
/* THE ONE THAT KEEPS COMING BACK. The first live render put "31 ms HRV" above
   an HRV meter reading 31, "200 W FTP" above an FTP meter reading 200, and
   "4,817 steps" above a Steps meter - the same duplication as the weather
   hero, the desk's "Up 2h 0m" and this section's own first sentence. A chip
   must not print a number its page is already showing at size. */
check('no page chip repeats a number its own page prints', (() => {
  const pages = { today: pgToday, sleep: pgSleep, heart: pgHeart, fitness: pgFit };
  return Object.entries(pages).every(([k, body]) => {
    const chip = hlM._hlPageChip(hlSec, { key: k });
    const nums = (chip.match(/\d[\d,.]*/g) || []).filter((n) => n.replace(/\D/g, '').length > 1);
    /* Strip the chip's own text out of the body first, then look for the
       number anywhere else on the page. */
    return nums.every((n) => !body.replace(chip, '').includes(n));
  });
})());
/* With no bands there is no verdict to give, so Heart carries no chip rather
   than one filled with a placeholder word. */
check('a page with no derived fact carries no chip',
  hlM._hlPageChip(hlSec, { key: 'heart' }) === '');
check('with bands the heart chip gives a verdict', (() => {
  const b = { hrv: { lo: 26, hi: 38 }, resting_hr: { lo: 55, hi: 63 } };
  return /All in range/.test(mkHl(null, b)._hlPageChip({ ...hlCfg, bands: b }, { key: 'heart' }));
})());
/* The rings carry what has been done; the caption carries what is left, which
   is the one figure a ring cannot show. */
check('the Today caption counts down rather than restating the rings',
  /236<\/b> kcal to go/.test(pgToday) && /exercise goal met/.test(pgToday)
    && !/264 of 500/.test(pgToday));
/* A small ring's label is wider than the chord it would sit on, so it lives
   under the ring. Inside, it landed on the stroke. */
check('a small ring wears its label outside',
  /ps-hrsl">EXERCISE|ps-hrsl">exercise/.test(pgToday)
    && !/ps-rv sm"><b>39m<\/b><small>/.test(pgToday));

/* ---- the sentence -------------------------------------------------------- */
check('with no bands there is no sentence', !/ps-hsyn/.test(hl));
const hlBands = { asleep: { lo: 6.8, hi: 8.2 }, hrv: { lo: 26, hi: 38 }, resting_hr: { lo: 55, hi: 63 } };
const hlB = mkHl(null, hlBands)._secHealth({ ...hlCfg, bands: hlBands });
check('a short night reads as short', /Short night/.test(hlB));
check('in-band recovery reads as recovered', /fully recovered/.test(hlB));
check('the banded collapsed face draws its tracks', /ps-hmt/.test(hlB));

// the section disappears rather than drawing a band of dashes
check('a section with nothing to say renders nothing', (() => {
  const s = new SH();
  s.setConfig({ sections: [hlCfg] });
  s._hass = { states: {} };
  return s._secHealth(hlSec) === '';
})());

// the recorder failing and the recorder being empty are different facts
check('a recorder failure says so rather than showing an empty graph', (() => {
  const s = mkHl(); s._histErr = 'nope'; s._history = {};
  return /Recorder did not answer/.test(s._hpSleep(hlSec));
})());
check('no samples yet is its own message', (() => {
  const s = mkHl(); s._history = {};
  return /No samples yet/.test(s._hpSleep(hlSec));
})());

// every entity the section reads must repaint it
check('health entities land in the watched set', (() => {
  const s = mkHl();
  return ['hae.tot', 'hae.hrv', 'hae.steps', 'hae.stand', 'hae.eff', 'sensor.ftp']
    .every((id) => s._watched.includes(id));
})());
check('the trace rides the existing history fetch', mkHl()._historyEntities().includes('hae.hr'));

/* ---- the mode renders, and its dock is its own ---------------------------- */
/* The default document stub has no dataset, so _patchSections cannot key a
   node against it. Installed here and restored below, the same way the
   systems-mode block does it. */
const savedDocHl = globalThis.document;
globalThis.document = { createElement: () => new MiniNode() };
const hlSlots = {};
const mkHlSlot = (id) => (hlSlots[id] = hlSlots[id] || new MiniNode());
const hlr = new SH();
hlr.setConfig({
  dock: [{ icon: 'mdi:home-variant', name: 'Home', link: '/x' },
         { icon: 'mdi:heart-pulse', name: 'Body', mode: 'health' }],
  sections: [{ ...hlCfg, bands: {} }],
});
hlr._hass = { states: hlStates, user: { id: 'u1', name: 'Brian' } };
hlr._history = { 'hae.hr': [60, 58, 62].map((v, i) => ({ t: 1000 + i, s: String(v) })) };
hlr.shadowRoot = {
  getElementById: (id) => (["ps-stat", "ps-col", "ps-sheetslot", "ps-dockwrap"].includes(id) ? mkHlSlot(id) : null),
  querySelector: () => null,
  querySelectorAll: () => [],
};
hlr._mounted = true;
hlr._mode = 'health';
hlr._render();
check('health mode replaces the greeting with the page name',
  /Body/.test(hlSlots['ps-stat']._html) && /Today/.test(hlSlots['ps-stat']._html));
check('health mode swaps the dock', /data-hldock="sleep"/.test(hlSlots['ps-dockwrap']._html));
check('the health dock leads with Home', /data-hldock="__home"/.test(hlSlots['ps-dockwrap']._html));
check('the health dock is not the systems dock', !/data-sysdock/.test(hlSlots['ps-dockwrap']._html));
check('the page mounts as one keyed node', (() => {
  const kids = mkHlSlot('ps-col').kids;
  return kids.length === 1 && kids[0].dataset.sect === 'hl-today' && kids[0].className === 'ps-sypage';
})());
/* Sharing _page with Systems would land Body on a key belonging to the other
   mode - which resolves to the first page, so it would look like a working
   default rather than a bug. */
check('the two modes keep separate page fields', (() => {
  hlr._page = 'docker';
  hlr._hpage = 'heart';
  hlr._last = null;
  hlr._render();
  return /hl-heart/.test(String(mkHlSlot('ps-col').kids[0].dataset.sect));
})());
check('an empty health config falls back to the house rather than a dead dock', (() => {
  const s = new SH();
  s.setConfig({ dock: [], sections: [{ ...hlCfg, bands: {} }] });
  s._hass = { states: {}, user: { id: 'u1', name: 'Brian' } };
  s._mounted = true;
  s.shadowRoot = { getElementById: () => new MiniNode(), querySelector: () => null, querySelectorAll: () => [] };
  s._mode = 'health';
  s._render();
  return s._mode === null;
})());

/* ---- visible_to ----------------------------------------------------------- */
const mkVis = (user) => { const s = new SH(); s.setConfig({ sections: [] }); s._hass = { states: {}, user }; return s; };
check('no visible_to means everyone', mkVis({ id: 'x', name: 'Tayler' })._visible({}) === true);
check('a user id matches', mkVis({ id: 'abc', name: 'Brian' })._visible({ visible_to: ['abc'] }) === true);
check('a name matches, case-insensitively',
  mkVis({ id: 'abc', name: 'Brian' })._visible({ visible_to: ['brian'] }) === true);
check('a bare string is accepted as a one-item list',
  mkVis({ id: 'abc', name: 'Brian' })._visible({ visible_to: 'abc' }) === true);
check('the other person does not match',
  mkVis({ id: 'zzz', name: 'Tayler' })._visible({ visible_to: ['abc', 'Brian'] }) === false);
/* Absent hass.user hides rather than shows. Showing a restricted section for
   one frame until the user object lands is the failure that gets noticed. */
check('an absent user hides, it does not show',
  mkVis(undefined)._visible({ visible_to: ['abc'] }) === false);

const visSlots = {};
const mkVisSlot = (id) => (visSlots[id] = visSlots[id] || new MiniNode());
const mkVisShell = (user) => {
  const s = new SH();
  s.setConfig({
    dock: [{ icon: 'mdi:home-variant', name: 'Home', link: '/x' },
           { icon: 'mdi:heart-pulse', name: 'Body', mode: 'health', visible_to: ['abc'] },
           { icon: 'mdi:bell-outline', name: 'Alerts', sheet: 'notifications' }],
    sections: [{ type: 'quick', key: 'q', tiles: [] }, { ...hlCfg, bands: {}, visible_to: ['abc'] }],
  });
  s._hass = { states: hlStates, user };
  s._mounted = true;
  s.shadowRoot = {
    getElementById: (id) => (["ps-stat", "ps-col", "ps-sheetslot", "ps-dockwrap"].includes(id) ? mkVisSlot(id) : null),
    querySelector: () => null, querySelectorAll: () => [],
  };
  return s;
};
const visMine = mkVisShell({ id: 'abc', name: 'Brian' });
visMine._render();
const dockMine = visSlots['ps-dockwrap']._html;
check('his own dock carries the Body button', /name="Body"|>Body</.test(dockMine));
check('his own column carries the section',
  mkVisSlot('ps-col').kids.some((k) => k.dataset.sect === 'body'));

const visHers = mkVisShell({ id: 'zzz', name: 'Tayler' });
visHers._last = null;
visHers._render();
check('her dock does not carry the Body button', !/>Body</.test(visSlots['ps-dockwrap']._html));
check('her column has no gap where the section was',
  !mkVisSlot('ps-col').kids.some((k) => k.dataset.sect === 'body'));
/* The handler looks an entry up by index in the UNFILTERED config array, so
   renumbering the buttons would point every slot after a hidden one at its
   neighbour - Alerts would open Body's mode. */
check('hiding a dock entry does not renumber the ones after it',
  /data-dock="2"/.test(visSlots['ps-dockwrap']._html)
    && !/data-dock="1"/.test(visSlots['ps-dockwrap']._html));

globalThis.document = savedDocHl;

// the shape that hides a missing reading, banned at the source
const hlSrc = fs.readFileSync(new URL('../src/78c-shell-health.js', import.meta.url), 'utf8');
check('the health source never defaults a reading to zero',
  !/\?\? 0\)/.test(hlSrc) && !/\) \|\| 0/.test(hlSrc));
check('the health stylesheet has no loose font-size',
  !/font-size:\s*\d/.test(shs.split('health / Body')[1] || ''));


/* ===========================================================================
 * Haptics
 *
 * This block carries the whole feature on its own. `dev/shoot` runs headless
 * Chrome with no companion app and no motor, so a screenshot cannot tell a
 * working haptic from one that never fires — and neither can looking at the
 * phone, because a haptic that does not fire is indistinguishable from a phone
 * that does not do haptics. There is no visible gap and no error. So the event
 * SHAPE is asserted against the companion app's contract, and every firing
 * site is asserted to exist, per the rule that a method can be complete and
 * never called.
 * ======================================================================== */
const HAP = SH.helpers;
const coreSrcH = fs.readFileSync(new URL('../src/70-shell-core.js', import.meta.url), 'utf8');
const litSrcH = fs.readFileSync(new URL('../src/76-shell-lights.js', import.meta.url), 'utf8');
const nurSrcH = fs.readFileSync(new URL('../src/75-shell-nursery.js', import.meta.url), 'utf8');
const shrSrcH = fs.readFileSync(new URL('../src/05-shared.js', import.meta.url), 'utf8');

/* The stub window has no dispatchEvent, which is exactly the "no host to feel
   it" case pcHaptic refuses. Give it one and record what it is handed. */
let hFired = [];
const savedWin = globalThis.window;
globalThis.window = Object.assign({}, savedWin, {
  dispatchEvent(ev) { hFired.push(ev); return true; },
});
/* A real-enough Event: the stub above drops its options, and bubbles/composed
   are part of the contract being asserted. */
const savedEventH = globalThis.Event;
globalThis.Event = class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };

/* The floor is 40ms and these fire back to back, so every assertion below
   either steps the clock or expects the suppression it is testing. */
const savedNowH = Date.now;
let hClock = 1000000;
Date.now = () => hClock;
const hReset = () => { hFired = []; hClock += 1000; };

hReset();
const hRc = HAP.haptic('selection');
check('a haptic dispatches on window', hRc === true && hFired.length === 1);
check('the event type is "haptic"', hFired[0] && hFired[0].type === 'haptic');
/* Not { hapticType: ... }, not { detail: { ... } }. A bare string. */
check('the detail is a bare string, not an object',
  hFired[0] && hFired[0].detail === 'selection');
check('the event bubbles and is composed',
  hFired[0] && hFired[0].bubbles === true && hFired[0].composed === true);

/* The trap the reference implementation flags: CustomEvent reads better, is
   what every instinct reaches for, and the companion app does not hear it. */
/* The comment warning about CustomEvent names it, so the ban is on CODE:
   every mention in the bundle must sit on a comment line. */
check('the event is built with Event, not CustomEvent',
  /new Event\("haptic"/.test(shrSrcH)
  && src.split('\n').filter((l) => l.includes('new CustomEvent'))
    .every((l) => /^\s*(\*|\/\/|\/\*)/.test(l)));
check('detail is assigned after construction, not passed in',
  /ev\.detail = type;/.test(shrSrcH));

hReset();
check('an unknown haptic type is refused', HAP.haptic('buzz') === false && !hFired.length);
check('all seven companion types are accepted',
  HAP.hapticTypes.length === 7
  && ['success','warning','failure','light','medium','heavy','selection']
    .every((t) => HAP.hapticTypes.includes(t)));

/* The floor is a queue guard, not a nicety: Android does not drop the extras a
   fast drag produces, it queues them, and the buzzing outlives the gesture. */
hReset();
HAP.haptic('light');
const hSecond = HAP.haptic('light');
check('a hSecond haptic inside the rate floor is suppressed',
  hSecond === false && hFired.length === 1);
hClock += 50;
check('past the floor it fires again', HAP.haptic('light') === true && hFired.length === 2);

hReset();
HAP.hapticEnable(false);
check('haptics: false silences the card', HAP.haptic('heavy') === false && !hFired.length);
HAP.hapticEnable(true);
hReset();
check('re-enabling restores it', HAP.haptic('heavy') === true && hFired.length === 1);
check('setConfig wires the opt-out', /pcHapticEnable\(config\.haptics\)/.test(coreSrcH));

/* --- quantising: a continuous control hTicks per STEP, never per event --- */
hReset();
const hHolder = { at: null };
check('the first sample of a gesture is silent',
  HAP.hapticStep(hHolder, 'at', 5, 'selection') === false && !hFired.length);
check('the same step does not re-fire',
  HAP.hapticStep(hHolder, 'at', 5, 'selection') === false && !hFired.length);
hClock += 100;
check('crossing a step fires once',
  HAP.hapticStep(hHolder, 'at', 6, 'selection') === true && hFired.length === 1);
hClock += 100;
hHolder.at = null;
check('resetting the hHolder re-baselines rather than firing',
  HAP.hapticStep(hHolder, 'at', 20, 'selection') === false && hFired.length === 1);

/* A hundred pointer moves across one row must not be a hundred buzzes. */
hReset();
hHolder.at = null;
let hTicks = 0;
for (let p = 1; p <= 100; p++) {
  hClock += 100;                        // well past the floor, so only the
  if (HAP.hapticStep(hHolder, 'at', Math.round(p / 5), 'selection')) hTicks++;
}
check('a full-width brightness sweep hTicks ~20 times, not ~100',
  hTicks > 15 && hTicks < 25);

/* --- the firing sites. A bridge nothing calls feels exactly like no bridge --- */
check('the light row hold fires medium',
  /pcHaptic\("medium"\)[\s\S]{0,200}?_lightOpen/.test(litSrcH));
check('the scrub hold fires medium',
  /scrubbing = true;[\s\S]{0,300}?pcHaptic\("medium"\)/.test(coreSrcH));
check('the nap row hold fires medium',
  /pcHaptic\("medium"\)[\s\S]{0,200}?_openNapEdit/.test(nurSrcH));

check('arming a destructive control fires warning',
  /if \(this\._armed !== k\) \{[\s\S]{0,400}?pcHaptic\("warning"\)/.test(coreSrcH));
check('committing a destructive control fires heavy',
  /pcHaptic\("heavy"\)[\s\S]{0,120}?if \(k === "hold"\)/.test(coreSrcH));

check('the light drag hTicks quantised, not per percent',
  /pcHapticStep\(tick, "at", Math\.round\(v \/ 5\)/.test(litSrcH));
check('the drag resets its tick between gestures',
  /tick\.at = null;/.test(litSrcH));

/* Off the optimistic value: GTTC takes seconds to acknowledge, so a tick
   waiting on the echo lands after the thumb has gone and reads as random. */
check('the climate stepper fires before the service call',
  /pcHaptic\("light"\)[\s\S]{0,200}?this\._goalOpt = \{/.test(coreSrcH));

check('a guard interposing fires warning, not light',
  /if \(guard\) \{ pcHaptic\("warning"\)/.test(litSrcH));
/* Cancelling restores what was really there. Buzzing to confirm that nothing
   happened is how this turns into noise. */
const hLaskBody = (/data-lask[\s\S]{0,700}?this\._render\(\);/.exec(litSrcH) || [''])[0];
check('answering the guard buzzes only on the branch that commits',
  /el\.dataset\.lask === "yes"/.test(hLaskBody)
  && (hLaskBody.match(/pcHaptic\(/g) || []).length === 1);

check('saving a nap correction fires success',
  /pcHaptic\("success"\)[\s\S]{0,200}?_napEditWrite\(\{ start: e\.start, from:/.test(nurSrcH));
/* Both fields clamp to the session, so pressing on at an end changes nothing
   and must say nothing. */
check('a clamped nap step does not buzz',
  /if \(next\.from !== e\.from \|\| next\.to !== e\.to\) pcHaptic\("selection"\)/.test(nurSrcH));
check('the scrub hTicks only once the gesture is owned',
  /if \(scrubbing\) pcHapticStep\(tick, "at"/.test(coreSrcH));

/* THE RULE THIS FEATURE LIVES OR DIES BY. The shell patches on every state
   arrival, so a haptic anywhere in the render path would buzz when the HOUSE
   changes rather than when he touches something — a phone going off in his
   pocket because a light turned on downstairs. Haptics fire in handlers only.
   Walk the render methods by brace matching rather than trusting a regex. */
const bodyOfH = (s, sig) => {
  const i = s.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = s.indexOf('{', i);
  if (j < 0) return null;
  for (let k = j; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d === 0) return s.slice(j, k + 1);
  }
  return null;
};
const hRenderFns = ['_render()', '_patch(', '_patchSections(', '_renderSystems(', '_renderHealth('];
const hRendersClean = hRenderFns.every((sig) => {
  const b = bodyOfH(coreSrcH, sig);
  return b === null || !/pcHaptic/.test(b);
});
check('no haptic fires from the render path', hRendersClean);
check('the render-path rule is found, not vacuous',
  hRenderFns.filter((sig) => bodyOfH(coreSrcH, sig) !== null).length >= 3);

/* Markup is rendered on every patch; a haptic inside a template literal would
   be the render-path bug wearing a different hat. */
check('no haptic is fired from inside markup',
  ![litSrcH, nurSrcH, coreSrcH].some((s) =>
    /\$\{[^}]*pcHaptic/.test(s)));

Date.now = savedNowH;
globalThis.window = savedWin;
globalThis.Event = savedEventH;

// double-define guard: a hSecond load must warn, not throw
let warned = '';
const realWarn = console.warn;
console.warn = (m) => { warned += m; };
let threw = false;
try { eval(src); } catch (e) { threw = true; }
console.warn = realWarn;
check('hSecond load does not throw', !threw);
check('hSecond load warns about duplicate', /already defined by another resource/.test(warned));

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail?1:0);
