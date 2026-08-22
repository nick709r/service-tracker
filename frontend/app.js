const apiBase = '/api';
let currentUser = null;

async function api(path, opts={}){
  const res = await fetch(apiBase+path, opts);
  if(res.status===401) throw new Error('unauthorized');
  return res.json();
}

async function login(){
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try{
    const r = await api('/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
    currentUser = r.username;
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-area').innerText = `Logged in as ${currentUser}`;
    loadServices();
  }catch(e){
    alert('Login failed');
  }
}

async function loadServices(){
  const list = await api('/services');
  const container = document.getElementById('services-list');
  container.innerHTML = '';
  for(const s of list){
    const card = document.createElement('div');
    card.className = 'bg-gray-50 p-3 rounded shadow';
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold">${s.name}</div>
          <div class="text-sm text-gray-600">${s.url || ''}</div>
        </div>
        <div class="text-right">
          <button class="status-btn bg-blue-500 text-white px-2 py-1 rounded" data-id="${s.id}">Check</button>
          <button class="edit-btn bg-yellow-400 text-white px-2 py-1 rounded ml-2" data-id="${s.id}">Edit</button>
        </div>
      </div>
      <div class="mt-2 text-sm" id="status-${s.id}"></div>
    `;
    container.appendChild(card);
  }
  document.querySelectorAll('.status-btn').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const st = document.getElementById('status-'+id);
    st.innerText = 'Checking...';
    try{
      const r = await api(`/services/${id}/status`);
      st.innerText = JSON.stringify(r);
    }catch(err){
      st.innerText = 'Error';
    }
  }))
}

async function addService(){
  const name = prompt('Service name');
  if(!name) return;
  const url = prompt('Service URL (include protocol and port if needed)');
  await api('/services', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,url})});
  loadServices();
}

async function saveHA(){
  const url = document.getElementById('ha-url').value;
  const token = document.getElementById('ha-token').value;
  await api('/home_assistant', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url,token})});
  alert('Saved');
}

async function checkHA(){
  try{
    const r = await api('/home_assistant/check');
    document.getElementById('ha-status').innerText = JSON.stringify(r);
  }catch(e){
    document.getElementById('ha-status').innerText = 'Not configured or unreachable';
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('add-service-btn').addEventListener('click', addService);
  document.getElementById('ha-save').addEventListener('click', saveHA);
  document.getElementById('ha-check').addEventListener('click', checkHA);
});
