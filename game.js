// Pizza Parlour main game script

const config = {
  dayLength: 120, // seconds of service phase
  fixedCost: 20,
  unitCost: { dough: 1, sauce: 0.5, cheese: 0.8, pepperoni: 0.4, mushrooms: 0.4, peppers: 0.4 },
  dBase: 30,
  elasticity: 0.08,
  priceRef: 8
};

let state = JSON.parse(localStorage.getItem('pp-state')) || {
  day: 1,
  cash: 100,
  inventory: { dough: 0, sauce: 0, cheese: 0, pepperoni: 0, mushrooms: 0, peppers: 0 },
  price: 8,
  settings: { audio: true, reducedMotion: false },
  history: []
};

function saveState() {
  localStorage.setItem('pp-state', JSON.stringify(state));
}

// UI references
const topDay = document.getElementById('day');
const topTime = document.getElementById('time');
const topCoins = document.getElementById('coins');
const topSatisfaction = document.getElementById('satisfaction');
const center = document.getElementById('center');
const bottom = document.getElementById('bottom-bar');
const dashboardBox = document.getElementById('dashboard');
const menuBtn = document.getElementById('menu-btn');
const bgMusic = document.getElementById('bg-music');
if (state.settings.audio) {
  bgMusic.play().catch(() => {});
}

menuBtn.addEventListener('click', () => {
  dashboardBox.classList.toggle('hidden');
  if (!dashboardBox.classList.contains('hidden')) {
    renderDashboard();
  }
});

function setTopBar(timeLeft, coins, satisfaction) {
  topDay.textContent = `Day ${state.day}`;
  topTime.textContent = `${Math.ceil(timeLeft)}s`;
  topCoins.textContent = `$${coins.toFixed(2)}`;
  const face = satisfaction > 70 ? '😊' : (satisfaction > 40 ? '😐' : '☹️');
  topSatisfaction.textContent = `${face}${Math.round(satisfaction)}`;
}

function updateInventoryBar() {
  bottom.innerHTML = '';
  Object.keys(state.inventory).forEach(k => {
    const span = document.createElement('span');
    span.className = 'inventory-item';
    span.textContent = `${k}:${state.inventory[k]}`;
    bottom.appendChild(span);
  });
}

function startPrep() {
  setTopBar(config.dayLength, state.cash, 100);
  center.innerHTML = '';
  const summary = document.createElement('div');
  if (state.history.length) {
    const y = state.history[state.history.length - 1];
    summary.innerHTML = `<h2>Yesterday</h2>
      <div>Revenue: $${y.revenue.toFixed(2)}</div>
      <div>Costs: $${y.costs.toFixed(2)}</div>
      <div>Profit: $${y.profit.toFixed(2)}</div>
      <div>Fulfillment: ${Math.round(y.fulfillment)}%</div>`;
  } else {
    summary.innerHTML = '<h2>Order ingredients to start!</h2>';
  }
  center.appendChild(summary);

  const orderDiv = document.createElement('div');
  orderDiv.innerHTML = '<h2>Order Ingredients</h2>';
  const inputs = {};
  ['dough','sauce','cheese','pepperoni','mushrooms','peppers'].forEach(k => {
    const cost = config.unitCost[k];
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    const img = document.createElement('img');
    img.src = `img/${k}.png`;
    img.alt = k;
    img.style.width = '60px';
    img.style.height = '60px';
    img.style.marginRight = '4px';
    label.appendChild(img);
    const span = document.createElement('span');
    span.textContent = `($${cost})`;
    span.style.marginRight = '4px';
    label.appendChild(span);
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 0; inp.value = 0; inp.style.width='60px';
    inputs[k]=inp;
    label.appendChild(inp);
    orderDiv.appendChild(label);
  });
  const totalP = document.createElement('div');
  orderDiv.appendChild(totalP);
  const btn = document.createElement('button');
  btn.textContent = 'Next: Set Price';
  orderDiv.appendChild(btn);
  center.appendChild(orderDiv);

  function updateTotal(){
    let total=0; Object.keys(inputs).forEach(k=>{total+=inputs[k].valueAsNumber*config.unitCost[k]});
    totalP.textContent = `Total Spend: $${total.toFixed(2)}`;
  }
  Object.values(inputs).forEach(inp=>inp.addEventListener('input',updateTotal));
  updateTotal();

  btn.addEventListener('click',()=>{
    let total=0; const order={};
    Object.keys(inputs).forEach(k=>{const q=inputs[k].valueAsNumber||0; if(q){order[k]=q; state.inventory[k]+=q; total+=q*config.unitCost[k];}});
    if (total>state.cash){ alert('Not enough cash'); return; }
    state.cash-=total; state.lastOrderCost=total; saveState();
    updateInventoryBar();
    startPricing();
  });
  updateInventoryBar();
}

function startPricing(){
  center.innerHTML='<h2>Set Pizza Price</h2>';
  const slider=document.createElement('input');
  slider.type='range'; slider.min=4; slider.max=12; slider.value=state.price; slider.step=0.1; slider.style.width='80%';
  const label=document.createElement('div');
  center.appendChild(slider); center.appendChild(label);
  function demand(p){
    const E=config.elasticity, D=config.dBase, P_ref=config.priceRef;
    let D_eff = Math.max(0, Math.round(D*(1 - E*Math.max(0, p - P_ref))));
    if(p<P_ref) D_eff += Math.round((P_ref-p)*E*0.5*D);
    return D_eff;
  }
  function update(){
    const p=parseFloat(slider.value); state.price=p; const d=demand(p);
    const face = d>config.dBase? '😃':(d>config.dBase*0.6?'😐':'☹️');
    label.textContent=`Price: $${p.toFixed(2)} Demand: ${d} ${face}`;
  }
  slider.addEventListener('input',update); update();
  const btn=document.createElement('button'); btn.textContent='Open Shop'; center.appendChild(btn);
  btn.addEventListener('click',()=>{saveState(); startService(demand(state.price));});
}

// Service Phase
let serviceData;
function startService(demand){
  serviceData={timeLeft:config.dayLength,revenue:0,served:0,missed:0,ingredientUsed:{dough:0,sauce:0,cheese:0,pepperoni:0,mushrooms:0,peppers:0},satisfaction:100,customers:[],arrivalTotal:demand};
  center.innerHTML='<h2>Service Time!</h2><div id="customers"></div><div id="assembly"></div>';
  updateInventoryBar();
  const custDiv=document.getElementById('customers');
  const assembly=document.getElementById('assembly');

  const ingredients=['dough','sauce','cheese','pepperoni','mushrooms','peppers'];
  const assemble={dough:0,sauce:0,cheese:0,pepperoni:0,mushrooms:0,peppers:0};
  ingredients.forEach(k=>{
    const b=document.createElement('button');
    b.className='image-btn';
    const img=document.createElement('img');
    img.src=`img/${k}.png`;
    img.alt=k;
    b.appendChild(img);
    b.addEventListener('click',()=>{assemble[k]++; renderAssembly();});
    assembly.appendChild(b);
  });
  const serveBtn=document.createElement('button');
  serveBtn.className='image-btn';
  const serveImg=document.createElement('img');
  serveImg.src='img/bakeandserve.png';
  serveImg.alt='Bake and Serve';
  serveBtn.appendChild(serveImg);
  assembly.appendChild(serveBtn);
  const assembleView=document.createElement('div'); assembly.appendChild(assembleView);
  function renderAssembly(){
    let parts=[]; ingredients.forEach(k=>{if(assemble[k]) parts.push(`${k}(${assemble[k]})`);});
    assembleView.textContent='Pizza: '+parts.join(',');
  }
  renderAssembly();

  serveBtn.addEventListener('click',()=>{
    if(!serviceData.customers.length) return;
    const cust=serviceData.customers[0];
    if(assemble.dough<1||assemble.sauce<1||assemble.cheese<1){alert('Need dough, sauce, cheese');return;}
    // check inventory
    for(const k of ['dough','sauce','cheese',...cust.toppings]){
      if(state.inventory[k]<=0){
        alert('Out of '+k);
        serviceData.satisfaction-=10; serviceData.missed++; removeCustomer(cust); resetAssembly(); updateTop(); return;
      }
    }
    // deduct inventory and record used
    const usage={dough:1,sauce:1,cheese:1,pepperoni:0,mushrooms:0,peppers:0};
    cust.toppings.forEach(t=>usage[t]++);
    Object.keys(usage).forEach(k=>{state.inventory[k]-=usage[k]; serviceData.ingredientUsed[k]+=usage[k];});
    serviceData.revenue+=state.price;
    serviceData.served++;
    if(cust.toppings.every(t=>assemble[t])) serviceData.satisfaction+=5;
    removeCustomer(cust);
    resetAssembly();
    updateInventoryBar();
    updateTop();
  });

  function resetAssembly(){ingredients.forEach(k=>assemble[k]=0); renderAssembly();}

  function removeCustomer(c){
    const idx=serviceData.customers.indexOf(c);
    if(idx>-1){serviceData.customers.splice(idx,1); renderCustomers();}
  }

  function renderCustomers(){
    custDiv.innerHTML='';
    serviceData.customers.forEach(c=>{
      const div=document.createElement('div'); div.className='customer';
      const toppingText=c.toppings.length?c.toppings.join(','):'plain';
      div.innerHTML=`Customer wants: ${toppingText} <div id="wait-${c.id}">😀</div>`;
      custDiv.appendChild(div);
    });
  }

  function spawnCustomer(){
    const id=Date.now()+Math.random();
    const toppings=[]; const opts=['pepperoni','mushrooms','peppers'];
    const count=Math.floor(Math.random()*3);
    for(let i=0;i<count;i++){toppings.push(opts[Math.floor(Math.random()*opts.length)]);}
    serviceData.customers.push({id,arrival:Date.now(),toppings,patience:6});
    renderCustomers();
  }

  function tick(){
    serviceData.timeLeft-=1; if(serviceData.timeLeft<0){endService(); return;}
    serviceData.customers.forEach(c=>{
      const wait = (Date.now()-c.arrival)/1000;
      const face = wait>6? '😠': '😀';
      const el=document.getElementById('wait-'+c.id);
      if(el) el.textContent = `${face} ${Math.max(0,Math.round(10-wait))}`;
      if(wait>10){
        serviceData.satisfaction-=10; serviceData.missed++; removeCustomer(c);
      } else if(wait>6){
        serviceData.satisfaction-=1;
      }
    });
    updateTop();
  }

  function updateTop(){
    setTopBar(serviceData.timeLeft, serviceData.revenue, Math.min(100,Math.max(0,serviceData.satisfaction)));
  }
  updateTop();

  const interval=setInterval(tick,1000);
  // customer spawn interval
  const spawnInterval = config.dayLength / serviceData.arrivalTotal * 1000;
  const spawner=setInterval(()=>{if(serviceData.customers.length<5) spawnCustomer();},spawnInterval);

  function endService(){
    clearInterval(interval); clearInterval(spawner);
    startSummary();
  }
}

function startSummary(){
  const usedCost = Object.keys(serviceData.ingredientUsed).reduce((sum,k)=>sum+serviceData.ingredientUsed[k]*config.unitCost[k],0);
  const costs = state.lastOrderCost + config.fixedCost;
  const revenue = serviceData.revenue;
  const profit = revenue - costs;
  state.cash += revenue - config.fixedCost; // spent order cost earlier
  const fulfillment = serviceData.served / (serviceData.served + serviceData.missed || 1) * 100;
  const dayRecord = { day: state.day, revenue, costs, profit, fulfillment, satisfaction: serviceData.satisfaction, waste:0, price: state.price };
  state.history.push(dayRecord);
  if(state.history.length>5) state.history.shift();
  saveState();

  center.innerHTML = `<h2>Day ${state.day} Summary</h2>
    <div>Revenue: $${revenue.toFixed(2)}</div>
    <div>Costs (incl. fixed): $${costs.toFixed(2)}</div>
    <div>Profit: $${profit.toFixed(2)}</div>
    <div>Fulfillment: ${fulfillment.toFixed(0)}%</div>
    <div>Satisfaction: ${Math.round(serviceData.satisfaction)}</div>`;
  const tip = document.createElement('div');
  tip.style.marginTop='10px';
  const tips=[
    'Try lowering price a little to attract more customers!',
    'Great job keeping customers happy!',
    'Order enough ingredients to avoid stockouts.',
    'Profit = Revenue – Costs.'
  ];
  tip.textContent=tips[Math.floor(Math.random()*tips.length)];
  center.appendChild(tip);

  const btn=document.createElement('button'); btn.textContent='Next Day'; center.appendChild(btn);
  btn.addEventListener('click',()=>{state.day++; saveState(); startPrep();});
  updateInventoryBar();
}

function renderDashboard(){
  dashboardBox.innerHTML='<h2>Last 5 Days</h2>';
  state.history.forEach(d=>{
    const div=document.createElement('div');
    div.innerHTML=`Day ${d.day}: Profit $${d.profit.toFixed(2)}`;
    const bar=document.createElement('div'); bar.className='chart-bar'; bar.style.width=(d.profit+50)+'px';
    div.appendChild(bar);
    dashboardBox.appendChild(div);
  });
  const btn=document.createElement('button'); btn.textContent='Export JSON'; dashboardBox.appendChild(btn);
  btn.addEventListener('click',()=>{
    const data=JSON.stringify(state.history);
    const blob=new Blob([data],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='summary.json'; a.click(); URL.revokeObjectURL(url);
  });
}

// Start game
startPrep();
