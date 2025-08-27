/* Hotel Revenue Dashboard (client-side only)
   No APIs required. Editable competitors + simulations.
   Author: Hardik Hariyani (app owner)
*/

// ---------- Utilities ----------
const $ = id => document.getElementById(id);
const fmt = n => typeof n === 'number' && isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
const pct = v => typeof v === 'number' && isFinite(v) ? `${v.toFixed(2)}%` : '0.00%';
const clamp = (v,min,max) => Math.min(max, Math.max(min, v));

// escape text for safety when using innerHTML (we avoid innerHTML where possible)
const escapeText = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// ---------- Local storage keys & defaults ----------
const KEY_DATA = 'hrm_data_v1';
const KEY_COMPS = 'hrm_comps_v1';
const defaultComps = [
  {name:'Hotel Sunshine', price:120.00},
  {name:'Ocean View Resort', price:150.00},
  {name:'Budget Inn', price:79.99},
  {name:'Luxury Palace', price:249.00}
];

// ---------- State ----------
let competitors = loadComps();
let lastMetrics = null;

// ---------- Persistence ----------
function saveComps(){
  localStorage.setItem(KEY_COMPS, JSON.stringify(competitors));
}
function loadComps(){
  try{
    const raw = localStorage.getItem(KEY_COMPS);
    return raw ? JSON.parse(raw) : defaultComps.slice();
  }catch(e){ return defaultComps.slice(); }
}
function saveFormValues(obj){
  localStorage.setItem(KEY_DATA, JSON.stringify(obj));
}
function loadFormValues(){
  try{
    const raw = localStorage.getItem(KEY_DATA);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

// ---------- Math / Metrics ----------
function calcMetrics({roomsAvailable, roomsSold, roomRevenue, totalRevenue, grossProfit, yourRate}){
  const ra = Number(roomsAvailable) || 0;
  const rs = Number(roomsSold) || 0;
  const rr = Number(roomRevenue) || 0;
  const tr = Number(totalRevenue) || 0;
  const gp = Number(grossProfit) || 0;
  const yr = Number(yourRate) || 0;

  const ADR = rs ? rr / rs : 0;
  const RevPAR = ra ? rr / ra : 0;
  const Occupancy = ra ? (rs / ra) * 100 : 0;
  const GOPPAR = ra ? gp / ra : 0;
  const TRevPAR = ra ? tr / ra : 0;

  return {
    roomsAvailable: ra, roomsSold: rs, roomRevenue: rr, totalRevenue: tr, grossProfit: gp, yourRate: yr,
    ADR, RevPAR, Occupancy, GOPPAR, TRevPAR
  };
}

function compStats(list){
  if(!list || list.length === 0) return {avg:0,min:0,max:0,std:0,count:0};
  const prices = list.map(c => Number(c.price) || 0);
  const n = prices.length;
  const sum = prices.reduce((a,b)=>a+b,0);
  const avg = sum / n;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const variance = prices.reduce((a,p)=>a+Math.pow(p-avg,2),0) / n;
  const std = Math.sqrt(variance);
  return {avg, min, max, std, count:n};
}

// Suggest rate change (simple rules)
function recommendRate(metrics, comp){
  const occ = metrics.Occupancy;
  const your = metrics.yourRate;
  const avg = comp.avg;
  if(!metrics.roomsAvailable) return {suggestion:null, reason:'Insufficient data'};

  // If occupancy low and you're above market -> lower price
  if(occ < 60 && your > avg){
    // reduce proportionally up to 15%
    const diffPercent = ((your - avg)/your) * 100;
    const reducePct = clamp(Math.min(15, Math.max(5, diffPercent)), 5, 15);
    const newRate = your * (1 - reducePct/100);
    return {suggestion: newRate, changePct: -reducePct, reason:`Occupancy low (${occ.toFixed(1)}%). Consider lowering price to be competitive.`};
  }

  // If occupancy high and you're below market -> increase slightly
  if(occ > 85 && your < avg){
    const increasePct = clamp(Math.min(8, (avg - your)/your * 100), 2, 8);
    const newRate = your * (1 + increasePct/100);
    return {suggestion:newRate, changePct: increasePct, reason:`High occupancy (${occ.toFixed(1)}%). You may be underpriced vs market.`};
  }

  // If close to market, small nudges based on std
  if(Math.abs(your - avg) <= comp.std){
    return {suggestion: your, changePct:0, reason:'Your pricing is within one standard deviation of competitors.'};
  }

  return {suggestion:your, changePct:0, reason:'No aggressive change recommended.'};
}

// Simulation: estimate occupancy when price changes using elasticity
// elasticity = %ΔQ / %ΔP (ex: -0.5). occupancy expressed in percent (0-100)
function simulatePriceEffect(metrics, newRate, elasticity){
  const currentOcc = metrics.Occupancy;
  const yourRate = metrics.yourRate || newRate;
  if(!yourRate || !isFinite(currentOcc)) return null;
  const priceChangePct = ((newRate - yourRate) / yourRate) * 100; // %ΔP
  const occChangePct = elasticity * priceChangePct; // %ΔQ
  const predictedOcc = clamp(currentOcc + occChangePct, 0, 100);
  const predictedRoomsSold = Math.round(metrics.roomsAvailable * (predictedOcc/100));
  const predictedRoomRevenue = predictedRoomsSold * newRate;
  const predictedRevPAR = metrics.roomsAvailable ? predictedRoomRevenue / metrics.roomsAvailable : 0;
  return {
    predictedOcc, predictedRoomsSold, predictedRoomRevenue, predictedRevPAR, priceChangePct, occChangePct
  };
}

// ---------- Rendering ----------
function renderCompetitors(){
  const container = $('competitorList');
  container.innerHTML = '';
  if(!competitors.length){
    container.textContent = 'No competitors yet. Add one above.';
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Hotel</th><th>Price ($)</th><th class="small">Actions</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  competitors.forEach((c, i) => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td'); tdName.textContent = c.name;
    const tdPrice = document.createElement('td'); tdPrice.textContent = Number(c.price).toFixed(2);
    const tdAct = document.createElement('td');
    tdAct.className = 'small';
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'secondary';
    del.addEventListener('click', ()=> {
      competitors.splice(i,1); saveComps(); renderCompetitors(); rerenderResultsIfPresent();
    });
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.className = 'secondary';
    edit.style.marginLeft = '0.4rem';
    edit.addEventListener('click', ()=> {
      const newName = prompt('Edit hotel name', c.name);
      if(newName === null) return;
      const newPrice = prompt('Edit price', c.price);
      if(newPrice === null) return;
      c.name = newName.trim() || c.name;
      c.price = Number(newPrice) || c.price;
      saveComps(); renderCompetitors(); rerenderResultsIfPresent();
    });
    tdAct.appendChild(del); tdAct.appendChild(edit);
    tr.appendChild(tdName); tr.appendChild(tdPrice); tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderResults(metrics, comp){
  lastMetrics = metrics;
  const out = $('results');
  out.innerHTML = ''; // we'll build nodes to avoid innerHTML injection
  const h = document.createElement('h3'); h.textContent = 'Key metrics';
  out.appendChild(h);

  const ul = document.createElement('div');
  ul.className = 'small';
  ul.innerHTML = `
    <div><strong>ADR:</strong> ${fmt(metrics.ADR)}</div>
    <div><strong>RevPAR:</strong> ${fmt(metrics.RevPAR)}</div>
    <div><strong>Occupancy:</strong> ${pct(metrics.Occupancy)}</div>
    <div><strong>GOPPAR:</strong> ${fmt(metrics.GOPPAR)}</div>
    <div><strong>TRevPAR:</strong> ${fmt(metrics.TRevPAR)}</div>
  `;
  out.appendChild(ul);

  // competitor stats
  const cs = comp;
  const compWrap = document.createElement('div');
  compWrap.style.marginTop = '0.6rem';
  compWrap.innerHTML = `<h4>Market / competitor snapshot</h4>
    <div class="small"><strong>Count:</strong> ${cs.count} &nbsp; <strong>Avg:</strong> ${fmt(cs.avg)}
    &nbsp; <strong>Min:</strong> ${fmt(cs.min)} &nbsp; <strong>Max:</strong> ${fmt(cs.max)} &nbsp; <strong>Std:</strong> ${fmt(cs.std)}</div>
  `;
  out.appendChild(compWrap);

  // recommendation
  const rec = recommendRate(metrics, cs);
  const recWrap = document.createElement('div'); recWrap.style.marginTop = '0.6rem';
  const recTitle = document.createElement('h4'); recTitle.textContent = 'Recommendation';
  recWrap.appendChild(recTitle);
  const recBody = document.createElement('div');
  recBody.className = 'small';
  if(rec && rec.suggestion !== null){
    recBody.innerHTML = `
      <div><strong>Reason:</strong> ${escapeText(rec.reason)}</div>
      <div><strong>Suggested rate:</strong> ${fmt(rec.suggestion)} (${rec.changePct >=0 ? '+' : ''}${rec.changePct.toFixed(2)}%)</div>
    `;
  } else {
    recBody.textContent = 'No recommendation available.';
  }
  recWrap.appendChild(recBody);
  out.appendChild(recWrap);

  // quick tips
  const tips = document.createElement('div'); tips.className='small'; tips.style.marginTop='0.6rem';
  tips.innerHTML = '<strong>Quick tips:</strong> Use the simulator to model price/occupancy changes. Edit competitor prices to mirror your market.';
  out.appendChild(tips);
}

function renderSimulation(sim){
  const container = $('simulationResults');
  container.innerHTML = '';
  if(!sim){
    container.textContent = 'No simulation run yet.';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'small';
  wrap.innerHTML = `
    <div><strong>Predicted Occupancy:</strong> ${pct(sim.predictedOcc)}</div>
    <div><strong>Predicted Rooms Sold:</strong> ${sim.predictedRoomsSold}</div>
    <div><strong>Predicted Room Revenue:</strong> ${fmt(sim.predictedRoomRevenue)}</div>
    <div><strong>Predicted RevPAR:</strong> ${fmt(sim.predictedRevPAR)}</div>
    <div><strong>Price change (%):</strong> ${sim.priceChangePct.toFixed(2)}%</div>
    <div><strong>Predicted occupancy change (%):</strong> ${sim.occChangePct.toFixed(2)}%</div>
  `;
  container.appendChild(wrap);
}

// ---------- UI wiring ----------
function rerenderResultsIfPresent(){
  const saved = loadFormValues();
  if(saved){
    const metrics = calcMetrics(saved);
    const cs = compStats(competitors);
    renderResults(metrics, cs);
  }
}

document.addEventListener('DOMContentLoaded', ()=> {
  // fill competitor list
  renderCompetitors();

  // restore values
  const saved = loadFormValues();
  if(saved){
    $('roomsAvailable').value = saved.roomsAvailable ?? '';
    $('roomsSold').value = saved.roomsSold ?? '';
    $('yourRate').value = saved.yourRate ?? '';
    $('roomRevenue').value = saved.roomRevenue ?? '';
    $('totalRevenue').value = saved.totalRevenue ?? '';
    $('grossProfit').value = saved.grossProfit ?? '';
    rerenderResultsIfPresent();
  } else {
    // put some friendly defaults
    $('roomsAvailable').value = 50;
    $('roomsSold').value = 30;
    $('yourRate').value = 129.00;
    $('roomRevenue').value = (30 * 129).toFixed(2);
    $('totalRevenue').value = (30 * 129 * 1.1).toFixed(2);
    $('grossProfit').value = 1000;
  }
});

// form submit
$('revenueForm').addEventListener('submit', e => {
  e.preventDefault();
  const payload = {
    roomsAvailable: Number($('roomsAvailable').value) || 0,
    roomsSold: Number($('roomsSold').value) || 0,
    yourRate: Number($('yourRate').value) || 0,
    roomRevenue: Number($('roomRevenue').value) || 0,
    totalRevenue: Number($('totalRevenue').value) || 0,
    grossProfit: Number($('grossProfit').value) || 0
  };
  saveFormValues(payload);
  const metrics = calcMetrics(payload);
  const cs = compStats(competitors);
  renderResults(metrics, cs);
  // small UI feedback
  toast('Metrics calculated');
});

// clear inputs
$('clearBtn').addEventListener('click', () => {
  if(confirm('Clear saved inputs?')){
    localStorage.removeItem(KEY_DATA);
    document.querySelectorAll('#revenueForm input').forEach(i=>i.value='');
    $('results').innerHTML = '';
    lastMetrics = null;
    toast('Inputs cleared');
  }
});

// competitor add
$('addComp').addEventListener('click', () => {
  const name = $('compName').value.trim();
  const price = Number($('compPrice').value);
  if(!name || !isFinite(price)){
    return alert('Enter a valid name and price.');
  }
  competitors.push({name, price});
  saveComps(); renderCompetitors(); $('compName').value=''; $('compPrice').value='';
  rerenderResultsIfPresent();
  toast('Competitor added');
});

// simulation
$('simulateBtn').addEventListener('click', () => {
  if(!lastMetrics) return alert('First calculate metrics for your hotel (top form).');
  const newRate = Number($('hypoRate').value);
  const elasticity = Number($('elasticity').value);
  if(!isFinite(newRate) || !isFinite(elasticity)) return alert('Enter a valid rate and elasticity.');
  const sim = simulatePriceEffect(lastMetrics, newRate, elasticity);
  renderSimulation(sim);
  toast('Simulation complete');
});
$('resetSim').addEventListener('click', () => {
  $('hypoRate').value = '';
  $('elasticity').value = '-0.5';
  $('simulationResults').innerHTML = '';
});

// copy / open report
function createReportText(){
  if(!lastMetrics) return 'No metrics available. Calculate first.';
  const cs = compStats(competitors);
  const rec = recommendRate(lastMetrics, cs);
  let txt = `Hotel Revenue Dashboard - Report\nBy Hardik Hariyani\n\n-- Hotel metrics --\n`;
  txt += `Rooms Available: ${lastMetrics.roomsAvailable}\nRooms Sold: ${lastMetrics.roomsSold}\nYour Rate: ${lastMetrics.yourRate}\nADR: ${lastMetrics.ADR.toFixed(2)}\nRevPAR: ${lastMetrics.RevPAR.toFixed(2)}\nOccupancy: ${lastMetrics.Occupancy.toFixed(2)}%\nGOPPAR: ${lastMetrics.GOPPAR.toFixed(2)}\nTRevPAR: ${lastMetrics.TRevPAR.toFixed(2)}\n\n-- Market snapshot --\nCompetitor count: ${cs.count}\nAvg price: ${cs.avg.toFixed(2)}\nMin: ${cs.min.toFixed(2)}\nMax: ${cs.max.toFixed(2)}\nStd dev: ${cs.std.toFixed(2)}\n\n-- Recommendation --\n${rec.reason}\nSuggested rate: ${rec.suggestion ? rec.suggestion.toFixed(2) : 'N/A'} (${rec.changePct ? rec.changePct.toFixed(2) : '0.00'}%)\n\n(Generated client-side)\n`;
  return txt;
}

$('copyReport').addEventListener('click', async () => {
  const txt = createReportText();
  try{
    await navigator.clipboard.writeText(txt);
    toast('Report copied to clipboard');
  }catch(e){
    prompt('Copy the report below (Ctrl+C):', txt);
  }
});

$('openReport').addEventListener('click', () => {
  const txt = createReportText();
  const w = window.open();
  w.document.write('<pre>'+escapeText(txt)+'</pre>');
  w.document.title = 'HRM Report - Hardik Hariyani';
  w.document.close();
});

// simple toast
function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.position='fixed'; t.style.right='16px'; t.style.bottom='16px';
  t.style.background='#0b5ed7'; t.style.color='white'; t.style.padding='8px 12px';
  t.style.borderRadius='8px'; t.style.boxShadow='0 6px 14px rgba(11,94,215,0.18)'; t.style.zIndex=9999;
  document.body.appendChild(t);
  setTimeout(()=>t.style.opacity='0.0',1800);
  setTimeout(()=>t.remove(),2400);
}
