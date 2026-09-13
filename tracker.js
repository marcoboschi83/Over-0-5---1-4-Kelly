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
  REV04 ladder percentuale:
  - A+ = 30% totale cassa, proporzione 17/8/5
  - A  = 25% totale cassa, proporzione 14/6/5
  - B  = 20% totale cassa, proporzione 10/5/5
  Il +5 è quindi +5 punti percentuali rispetto allo stake_pct originale.
*/
function ladderFor(match){
  const cls = String(match.class || '').toUpperCase();
  const originalPct = Number(match.stake_pct || 0);
  if(originalPct <= 0) return {originalPct:0,totalPct:0,total:0,q107:0,q111:0,q122:0};

  const totalPct = originalPct + 5;
  const total = Math.max(0, Math.round(state.bankroll * totalPct / 100));

  let weights;
  if(cls === 'A+') weights = [17,8,5];
  else if(cls === 'A') weights = [14,6,5];
  else if(cls === 'B') weights = [10,5,5];
  else weights = [0,0,0];

  const sumW = weights.reduce((a,b)=>a+b,0);
  if(!sumW || !total) return {originalPct,totalPct,total:0,q107:0,q111:0,q122:0};

  const q107 = Math.round(total * weights[0] / sumW);
  const q122 = Math.round(total * weights[2] / sumW);
  const q111 = total - q107 - q122;

  return {originalPct,totalPct,total,q107,q111,q122};
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

function updateMatchPreview(id){
  const x = matchedFromUI(id);
  const el = $(`preview-${id}`);
  if(!el) return;
  if(!x.steps.length){
    el.textContent = 'Nessun ordine abbinato selezionato.';
    return;
  }
  el.innerHTML = `Abbinati: <strong>${formatMatched(x.steps)}</strong> · Totale effettivamente abbinato: <strong>${euro(x.stake)}</strong>`;
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
    alert('NULLA significa nessun ordine abbinato. Deseleziona gli stake oppure registra WIN/LOSS.');
    return;
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
    total_trade: ladderFor(match).total,
    total_pct: ladderFor(match).totalPct,
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
          ${m.note ? `<span><strong>Nota:</strong> ${esc(m.note)}</span>` : ''}
        </div>
      </div>

      <div class="stake-box">
        <div class="stake-label">Totale trade (${disabled ? 0 : ladder.totalPct}% della cassa)</div>
        <div class="stake-value">${disabled ? 'NO TRADE' : euro(ladder.total)}</div>${disabled ? '' : `<div class="stake-label" style="margin-top:2px">Somma ingressi: ${euro(ladder.q107)} + ${euro(ladder.q111)} + ${euro(ladder.q122)} = <strong>${euro(ladder.q107+ladder.q111+ladder.q122)}</strong></div>`}

        ${disabled ? '' : `
        
        <div style="margin-top:10px;font-size:13px"><strong>Budget da inserire sulle 3 quote</strong></div>
        <div class="trade-ladder-grid" style="margin-top:6px">
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:12px;color:#6b7280">Quota</div>
            <div><strong>1,07</strong></div>
            <div class="budget" style="font-size:18px;font-weight:800;margin:3px 0">${euro(ladder.q107)}</div>
            <div style="font-size:11px;color:#6b7280">Abbinato?</div>
            <input type="checkbox" id="m107-${esc(m.id)}" style="margin-top:4px" onchange="updateMatchPreview('${esc(m.id)}')">
          </label>
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:12px;color:#6b7280">Quota</div>
            <div><strong>1,11</strong></div>
            <div class="budget" style="font-size:18px;font-weight:800;margin:3px 0">${euro(ladder.q111)}</div>
            <div style="font-size:11px;color:#6b7280">Abbinato?</div>
            <input type="checkbox" id="m111-${esc(m.id)}" style="margin-top:4px" onchange="updateMatchPreview('${esc(m.id)}')">
          </label>
          <label style="border:1px solid #d1d5db;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:12px;color:#6b7280">Quota</div>
            <div><strong>1,22</strong></div>
            <div class="budget" style="font-size:18px;font-weight:800;margin:3px 0">${euro(ladder.q122)}</div>
            <div style="font-size:11px;color:#6b7280">Abbinato?</div>
            <input type="checkbox" id="m122-${esc(m.id)}" style="margin-top:4px" onchange="updateMatchPreview('${esc(m.id)}')">
          </label>
        </div>

        <div id="preview-${esc(m.id)}" class="stake-label" style="margin-top:7px">
          Spunta solo gli ordini realmente abbinati, poi registra WIN / NULLA / LOSS.
        </div>
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

window.updateMatchPreview = updateMatchPreview;

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
