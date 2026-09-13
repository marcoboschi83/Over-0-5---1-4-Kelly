const STORAGE_KEY = 'over05_tracker_v1';
const DEFAULT_STATE = { initialBankroll: 100, bankroll: 100, history: [] };
const COMMISSION = 0.045;
let matches = [];
let state = loadState();

const $ = (id) => document.getElementById(id);

function loadState(){
  try { return {...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}; }
  catch { return {...DEFAULT_STATE}; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function euro(v){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0)); }
function pct(v){ return `${v.toFixed(1).replace('.',',')}%`; }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

function calcStake(match){
  const p = Number(match.stake_pct || 0);
  return Math.max(0, Math.round(state.bankroll * p / 100));
}

/*
  REV04 ladder:
  - stake base = % classe sulla cassa corrente
  - 1,07 / 1,11 dividono lo stake base in rapporto 17/8
  - 1,22 aggiunge €5 oltre allo stake base
  Esempio su cassa €100:
  A+ 25% -> 17 / 8 / 5 = €30 max
  A  20% -> 14 / 6 / 5 = €25 max
  B  15% -> 10 / 5 / 5 = €20 max
*/
function ladderFor(match){
  const base = calcStake(match);
  if(base <= 0) return {base:0, q107:0, q111:0, q122:0, total:0};
  const q107 = Math.round(base * 17 / 25);
  const q111 = base - q107;
  const q122 = 5;
  return {base, q107, q111, q122, total: base + q122};
}

function matchedFromUI(id){
  const m = matches.find(x => String(x.id) === String(id));
  if(!m) return {steps:[], stake:0, grossProfit:0, netProfit:0};
  const l = ladderFor(m);
  const defs = [
    {q:1.07, stake:l.q107, el:`m107-${id}`},
    {q:1.11, stake:l.q111, el:`m111-${id}`},
    {q:1.22, stake:l.q122, el:`m122-${id}`}
  ];
  const steps = defs.filter(x => $(x.el)?.checked && x.stake > 0);
  const stake = steps.reduce((s,x)=>s+x.stake,0);
  const grossProfit = steps.reduce((s,x)=>s + x.stake*(x.q-1),0);
  const netProfit = +(grossProfit * (1-COMMISSION)).toFixed(2);
  return {steps, stake, grossProfit, netProfit};
}

function formatMatched(steps){
  if(!Array.isArray(steps) || !steps.length) return '—';
  return steps.map(x => `${Number(x.q).toFixed(2).replace('.',',')} (${euro(x.stake)})`).join(' · ');
}

async function loadMatches(){
  try{
    const res = await fetch(`matches.json?ts=${Date.now()}`);
    if(!res.ok) throw new Error('matches.json non trovato');
    const data = await res.json();
    matches = Array.isArray(data) ? data : data.matches || [];
    renderMatches();
  }catch(err){
    $('matchesList').innerHTML = `<div class="empty">Errore caricamento matches.json: ${esc(err.message)}</div>`;
  }
}

function registerResult(match, result){
  const alreadyRegistered = state.history.some(h => String(h.id) === String(match.id));
  if(alreadyRegistered) return;

  const matched = matchedFromUI(match.id);

  if(result === 'WIN' && !matched.steps.length){
    alert('Per registrare WIN seleziona almeno uno stake abbinato.');
    return;
  }
  if(result === 'LOSS' && !matched.steps.length){
    alert('Per registrare LOSS seleziona almeno uno stake abbinato.');
    return;
  }
  if(result === 'NULLA' && matched.steps.length){
    if(!confirm('Hai selezionato uno o più stake abbinati ma stai registrando NULLA. Continuare?')) return;
  }

  let pl = 0;
  if(result === 'WIN') pl = matched.netProfit;
  if(result === 'LOSS') pl = -matched.stake;

  const before = state.bankroll;
  state.bankroll = +(state.bankroll + pl).toFixed(2);

  state.history.unshift({
    ts: new Date().toISOString(),
    id: match.id,
    match: match.match,
    class: match.class,
    stake_pct: match.stake_pct,
    stake: matched.stake,
    guide_stake: calcStake(match),
    result,
    matchedSteps: matched.steps.map(x=>({q:x.q, stake:x.stake})),
    pl,
    bankroll_before: before,
    bankroll_after: state.bankroll,
    ladder_version: 'REV04-1.07-1.11-1.22',
    commission: COMMISSION
  });

  saveState();
}

function renderMatches(){
  const root = $('matchesList');

  if(!matches.length){
    root.innerHTML = '<div class="empty">Nessuna partita presente in matches.json.</div>';
    return;
  }

  const registeredIds = new Set(state.history.map(h => String(h.id)));
  const availableMatches = matches.filter(m => !registeredIds.has(String(m.id)));

  if(!availableMatches.length){
    root.innerHTML = '<div class="empty">Tutti gli eventi sono stati registrati.</div>';
    return;
  }

  root.innerHTML = availableMatches.map(m => {
    const stake = calcStake(m);
    const ladder = ladderFor(m);
    const cls = String(m.class || 'C').toLowerCase().replace('+','p');
    const disabled = Number(m.stake_pct || 0) <= 0;

    return `<div class="match">
      <div>
        <div class="match-top">
          <span class="match-title">${esc(m.match)}</span>
          <span class="badge class-${cls}">${esc(m.class)}</span>
          ${m.step1_pct != null ? `<span class="badge">Step 1 ${String(m.step1_pct).replace('.',',')}%</span>` : ''}
        </div>
        <div class="meta">
          ${m.datetime ? `<span>${esc(m.datetime)}</span>` : ''}
          ${m.step3_status ? `<span>Step 3: ${esc(m.step3_status)}</span>` : ''}
          ${m.note ? `<span>${esc(m.note)}</span>` : ''}
        </div>
      </div>

      <div class="stake-box">
        <div class="stake-label">Stake base classe (${m.stake_pct || 0}%)</div>
        <div class="stake-value">${disabled ? 'NO TRADE' : euro(stake)}</div>

        ${disabled ? '' : `
        <div style="margin-top:10px;font-size:13px"><strong>Ordini da impostare</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:7px;text-align:center">
            <div><strong>1,07</strong></div>
            <div>${euro(ladder.q107)}</div>
            <input type="checkbox" id="m107-${esc(m.id)}" style="margin-top:5px">
          </label>
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:7px;text-align:center">
            <div><strong>1,11</strong></div>
            <div>${euro(ladder.q111)}</div>
            <input type="checkbox" id="m111-${esc(m.id)}" style="margin-top:5px">
          </label>
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:7px;text-align:center">
            <div><strong>1,22</strong></div>
            <div>${euro(ladder.q122)}</div>
            <input type="checkbox" id="m122-${esc(m.id)}" style="margin-top:5px">
          </label>
        </div>
        <div class="stake-label" style="margin-top:6px">Esposizione max: ${euro(ladder.total)}</div>
        `}

        <div class="result-buttons">
          <button class="win" ${disabled?'disabled':''} onclick="registerById('${esc(m.id)}','WIN')">WIN</button>
          <button class="null" onclick="registerById('${esc(m.id)}','NULLA')">NULLA</button>
          <button class="loss" ${disabled?'disabled':''} onclick="registerById('${esc(m.id)}','LOSS')">LOSS</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.registerById = function(id,result){
  const m = matches.find(x => String(x.id) === String(id));
  if(m) registerResult(m,result);
}

function renderHistory(){
  const body = $('historyBody');
  if(!state.history.length){
    body.innerHTML = '<tr><td colspan="8" class="empty">Nessun trade registrato.</td></tr>';
    return;
  }

  body.innerHTML = state.history.map(h => {
    const matched = formatMatched(h.matchedSteps);
    // Retrocompatibilità: i vecchi record non hanno matchedSteps.
    const stakeShown = h.stake != null ? Number(h.stake) : 0;
    return `<tr>
      <td>${new Date(h.ts).toLocaleString('it-IT')}</td>
      <td>${esc(h.match)}</td>
      <td>${esc(h.class || '—')}</td>
      <td>${euro(stakeShown)}</td>
      <td>${esc(matched)}</td>
      <td>${esc(h.result)}</td>
      <td class="${h.pl>0?'positive':h.pl<0?'negative':''}">${h.pl>0?'+':''}${euro(h.pl)}</td>
      <td>${euro(h.bankroll_after)}</td>
    </tr>`;
  }).join('');
}

function renderStats(){
  const wins = state.history.filter(h=>h.result==='WIN').length;
  const losses = state.history.filter(h=>h.result==='LOSS').length;
  const nulls = state.history.filter(h=>h.result==='NULLA').length;
  const settled = wins + losses;
  const total = state.history.length;
  const profit = state.bankroll - state.initialBankroll;
  const totalStaked = state.history
    .filter(h=>h.result!=='NULLA')
    .reduce((s,h)=>s+Number(h.stake||0),0);

  $('bankrollValue').textContent = euro(state.bankroll);
  $('profitValue').textContent = `${profit>=0?'+':''}${euro(profit)}`;
  $('winRateValue').textContent = settled ? pct(wins/settled*100) : '—';
  $('nullRateValue').textContent = total ? pct(nulls/total*100) : '—';
  $('roiValue').textContent = totalStaked ? pct(profit/totalStaked*100) : '—';
  $('initialBankroll').value = state.initialBankroll;
}

function render(){
  renderStats();
  renderHistory();
  renderMatches();
}

$('saveBankrollBtn').addEventListener('click',()=>{
  const v = Math.round(Number($('initialBankroll').value));
  if(!Number.isFinite(v) || v<=0) return alert('Inserisci una cassa valida.');
  if(state.history.length && !confirm('Cambiare la cassa iniziale modifica profitto e ROI storici. Continuare?')) return;
  const delta = v - state.initialBankroll;
  state.initialBankroll = v;
  state.bankroll = +(state.bankroll + delta).toFixed(2);
  saveState();
});

$('undoBtn').addEventListener('click',()=>{
  if(!state.history.length) return;
  const last = state.history.shift();
  state.bankroll = Number(last.bankroll_before);
  saveState();
});

$('resetBtn').addEventListener('click',()=>{
  if(confirm('Azzera tutto lo storico e riparti dalla cassa iniziale?')){
    state.bankroll = state.initialBankroll;
    state.history = [];
    saveState();
  }
});

$('reloadBtn').addEventListener('click',loadMatches);

$('exportBtn').addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'over05_tracker_backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('importInput').addEventListener('change',async(e)=>{
  const file=e.target.files[0];
  if(!file) return;
  try{
    const imported=JSON.parse(await file.text());
    state={...DEFAULT_STATE,...imported};
    saveState();
  }catch{
    alert('Backup non valido.');
  }
  e.target.value='';
});

render();
loadMatches();
