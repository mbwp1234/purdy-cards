import fs from 'fs';
const src = fs.readFileSync(new URL('../purdy-cards.js', import.meta.url),'utf8');

const defined = {};
class FakeEl {
  constructor(){ this.shadowRoot=null; this._listeners={}; }
  attachShadow(){ this.shadowRoot = { innerHTML:'', querySelector:()=>null, querySelectorAll:()=>[] }; return this.shadowRoot; }
  addEventListener(){} dispatchEvent(){ return true; }
}
globalThis.HTMLElement = FakeEl;
globalThis.customElements = { define:(n,c)=>{ defined[n]=c; }, get:()=>undefined };
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
check('two entries in customCards', window.customCards.length===2);

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
c.setConfig({ thermostat:'climate.gttc', compact:true, navigate:'#Climate' });
check('climate setConfig(compact) ok', c._config.compact===true);
check('climate getCardSize compact = 3', c.getCardSize()===3);
const c2 = new CPC(); c2.setConfig({ thermostat:'climate.gttc' });
check('climate getCardSize full = 6', c2.getCardSize()===6);
check('climate _renderCompact exists', typeof c._renderCompact === 'function');

const s = new SPC();
s.setConfig({ sleep_state:'sensor.owlet_sock_sleep_state', ribbon:true, navigate:'#joel' });
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

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail?1:0);
