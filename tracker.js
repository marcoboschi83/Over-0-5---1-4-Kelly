const STORAGE_KEY = 'over05_tracker_v1';
const DEFAULT_STATE = { initialBankroll: 100, bankroll: 100, history: [] };
let matches = [];
let state = loadState();

const $ = (id) => document.getElementById(id);

function loadState(){
  try { return {...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}; }
  catch { return {...DEFAULT_STATE}; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function euro(v){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v); }
function pct(v){ return `${v.toFixed(1).replace('.',',')}%`; }
function calcStake(match){
  const p = Number(match.stake_pct || 0);
  return Math.max(0, Math.round(state.bankroll * p / 100));
}
function netProfit(stake, match){
  const net = Number(match.net_win_pct ?? 10);
  return +(stake * net / 100).toFixed(2);
}

async function loadMatches(){
  try{
    const res = await fetch(`matches.json?ts=${Date.now()}`);
    if(!res.ok) throw new Error('matches.json non trovato');
    const data = await res.json();
    matches = Array.isArray(data) ? data : data.matches || [];
    renderMatches();
  }catch(err){
    $('matchesList').innerHTML = `<div class="empty">Errore caricamento matches.json: ${err.message}</div>`;
  }
}

function registerResult(match, result){
  const alreadyRegistered = state.history.some(h => String(h.id) === String(match.id));
  if(alreadyRegistered) return;

  const stake = calcStake(match);
  let pl = 0;
  if(result === 'WIN') pl = netProfit(stake, match);
  if(result === 'LOSS') pl = -stake;

  const before = state.bankroll;
  state.bankroll = +(state.bankroll + pl).toFixed(2);

  state.history.unshift({
    ts: new Date().toISOString(), id: match.id, match: match.match, class: match.class,
    stake_pct: match.stake_pct, stake, result, pl, bankroll_before: before, bankroll_after: state.bankroll
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
    const cls = String(m.class || 'C').toLowerCase().replace('+','p');
    const disabled = Number(m.stake_pct || 0) <= 0;
    return `<div class="match">
      <div>
        <div class="match-top">
          <span class="match-title">${m.match}</span>
          <span class="badge class-${cls}">${m.class}</span>
          ${m.step1_pct != null ? `<span class="badge">Step 1 ${String(m.step1_pct).replace('.',',')}%</span>` : ''}
        </div>
        <div class="meta">
          ${m.datetime ? `<span>${m.datetime}</span>` : ''}
          ${m.step3_status ? `<span>Step 3: ${m.step3_status}</span>` : ''}
          ${m.note ? `<span>${m.note}</span>` : ''}
        </div>
      </div>
      <div class="stake-box">
        <div class="stake-label">Stake guida (${m.stake_pct || 0}%)</div>
        <div class="stake-value">${disabled ? 'NO TRADE' : euro(stake)}</div>
        <div class="result-buttons">
          <button class="win" ${disabled?'disabled':''} onclick="registerById('${m.id}','WIN')">WIN</button>
          <button class="null" onclick="registerById('${m.id}','NULLA')">NULLA</button>
          <button class="loss" ${disabled?'disabled':''} onclick="registerById('${m.id}','LOSS')">LOSS</button>
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
    body.innerHTML = '<tr><td colspan="7" class="empty">Nessun trade registrato.</td></tr>';
    return;
  }
  body.innerHTML = state.history.map(h => `<tr>
    <td>${new Date(h.ts).toLocaleString('it-IT')}</td>
    <td>${h.match}</td><td>${h.class}</td><td>${euro(h.stake)}</td><td>${h.result}</td>
    <td class="${h.pl>0?'positive':h.pl<0?'negative':''}">${h.pl>0?'+':''}${euro(h.pl)}</td><td>${euro(h.bankroll_after)}</td>
  </tr>`).join('');
}

function renderStats(){
  const wins = state.history.filter(h=>h.result==='WIN').length;
  const losses = state.history.filter(h=>h.result==='LOSS').length;
  const nulls = state.history.filter(h=>h.result==='NULLA').length;
  const settled = wins + losses;
  const total = state.history.length;
  const profit = state.bankroll - state.initialBankroll;
  const totalStaked = state.history.filter(h=>h.result!=='NULLA').reduce((s,h)=>s+Number(h.stake||0),0);

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

  // Ogni pressione elimina l'ultima registrazione disponibile nello storico.
  // Premendo di nuovo elimina la penultima, poi la terzultima, e così via.
  // La partita eliminata dallo storico ricompare automaticamente nella lista.
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
