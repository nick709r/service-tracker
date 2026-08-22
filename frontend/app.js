const apiBase = '/api';
let currentUser = null;

const SERVICE_LOGOS = {
  sonarr: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/sonarr.svg',
  lidarr: 'https://raw.githubusercontent.com/Lidarr/Lidarr/develop/Logo/1024.png',
  transmission: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/transmission.svg',
  homeassistant: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/homeassistant.svg',
  agentdvr: 'https://www.ispyconnect.com/img/icons/ispy_196.png',
  default: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/monitor.svg'
};

function getServiceLogo(service){
  const key = (service && (service.type || service.id || 'default')).toLowerCase();
  return SERVICE_LOGOS[key] || SERVICE_LOGOS.default;
}

async function api(path, opts={}){
  const res = await fetch(apiBase + path, opts);
  if(res.status === 401) throw new Error('unauthorized');
  if(!res.ok) {
    let msg = 'Request failed';
    try { const data = await res.json(); msg = data.detail || data.message || msg; } catch (e) {}
    throw new Error(msg);
  }
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

function openServiceDialog(service = null){
  const modal = document.getElementById('service-modal');
  const title = document.getElementById('service-modal-title');
  const idField = document.getElementById('service-id');
  const nameField = document.getElementById('service-name');
  const urlField = document.getElementById('service-url');
  const apiKeyField = document.getElementById('service-api-key');

  title.innerText = service ? 'Edit service' : 'Add service';
  idField.value = service ? (service.id || '') : '';
  nameField.value = service ? (service.name || '') : '';
  urlField.value = service ? (service.url || '') : '';
  apiKeyField.value = service ? (service.api_key || '') : '';
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  nameField.focus();
}

function closeServiceDialog(){
  const modal = document.getElementById('service-modal');
  modal.style.display = 'none';
  modal.classList.add('hidden');
  document.getElementById('service-form').reset();
}

async function saveServiceFromDialog(event){
  event.preventDefault();
  const id = document.getElementById('service-id').value;
  const name = document.getElementById('service-name').value.trim();
  const url = document.getElementById('service-url').value.trim();
  const api_key = document.getElementById('service-api-key').value.trim();

  if(!name) {
    alert('Service name is required.');
    return;
  }

  const payload = { name, url, api_key };

  try {
    if(id) {
      await api(`/services/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    } else {
      await api('/services', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    }
    closeServiceDialog();
    await loadServices();
  }catch(err){
    alert(err.message || 'Unable to save service');
  }
}

async function loadAgentDvrCameras(){
  try {
    const response = await api('/services/agentdvr/cameras');
    const cameras = response.cameras || [];
    const panel = document.getElementById('agentdvr-cameras');
    if(!panel) return;
    if(!cameras.length){
      panel.innerHTML = '<div class="text-sm text-gray-500">No cameras found. Make sure Agent DVR is running and reachable.</div>';
      return;
    }
    panel.innerHTML = cameras.map(camera => `
      <div class="border rounded p-2 bg-gray-50">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium">${camera.name}</span>
          <span class="text-xs px-2 py-1 rounded ${camera.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            ${camera.online ? 'Online' : 'Offline'}
          </span>
        </div>
        ${camera.snapshot_url ? `<img src="${camera.snapshot_url}" alt="${camera.name} snapshot" class="w-full h-32 object-cover rounded border" />` : '<div class="text-xs text-gray-500">No snapshot available</div>'}
        <div class="mt-2 text-xs text-gray-600">${camera.recording ? 'Recording' : 'Idle'} • ${camera.status || 'unknown'}</div>
      </div>
    `).join('');
  }catch(err){
    const panel = document.getElementById('agentdvr-cameras');
    if(panel){
      panel.innerHTML = '<div class="text-sm text-red-600">Camera status unavailable. Check Agent DVR connectivity.</div>';
    }
  }
}

async function loadServices(){
  const list = await api('/services');
  const container = document.getElementById('services-list');
  container.innerHTML = '';
  for(const s of list){
    const card = document.createElement('div');
    const isAgentDvr = s.id === 'agentdvr' || s.type === 'agentdvr';
    card.className = 'bg-gray-50 p-3 rounded shadow';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <img src="${getServiceLogo(s)}" alt="${s.name} logo" class="w-12 h-12 rounded-lg object-cover" />
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <div class="font-semibold break-words">${s.name}</div>
              <div class="text-sm text-gray-600 break-all">${s.url || ''}</div>
            </div>
            <div class="text-right shrink-0">
              <button class="status-btn bg-blue-500 text-white px-2 py-1 rounded" data-id="${s.id}">Check</button>
              <button class="edit-btn bg-yellow-400 text-white px-2 py-1 rounded ml-2" data-id="${s.id}">Edit</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-2 text-sm" id="status-${s.id}"></div>
      ${isAgentDvr ? '<div id="agentdvr-cameras" class="mt-3 space-y-2"></div>' : ''}
    `;
    container.appendChild(card);
  }

  document.querySelectorAll('.status-btn').forEach(b => b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const st = document.getElementById('status-' + id);
    st.innerText = 'Checking...';
    try{
      const r = await api(`/services/${id}/status`);
      st.innerText = JSON.stringify(r);
      if(id === 'agentdvr' || id === 'agent-dvr') {
        await loadAgentDvrCameras();
      }
    }catch(err){
      st.innerText = 'Error';
    }
  }));

  document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const service = list.find(item => item.id === id);
    if(service){
      openServiceDialog(service);
    }
  }));

  if(list.some(service => service.id === 'agentdvr' || service.type === 'agentdvr')) {
    await loadAgentDvrCameras();
  }
}

async function addService(){
  openServiceDialog();
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

function setupUI(){
  if (document.getElementById('service-modal')) return;

  const modal = `
    <div id="service-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-4">
        <div class="flex justify-between items-center mb-4">
          <h3 id="service-modal-title" class="text-lg font-semibold">Edit service</h3>
          <button id="close-service-modal" type="button" class="text-gray-500 text-2xl leading-none">&times;</button>
        </div>
        <form id="service-form">
          <input id="service-id" type="hidden" />
          <label class="block mb-3">
            <span class="block mb-1 font-medium">Service name</span>
            <input id="service-name" class="w-full border rounded p-2" required />
          </label>
          <label class="block mb-3">
            <span class="block mb-1 font-medium">Service URL</span>
            <input id="service-url" class="w-full border rounded p-2" placeholder="http://host:port" />
          </label>
          <label class="block mb-3">
            <span class="block mb-1 font-medium">API key (optional)</span>
            <input id="service-api-key" class="w-full border rounded p-2" placeholder="Optional API key or token" />
          </label>
          <div class="flex justify-end gap-2 mt-4">
            <button type="button" id="cancel-service-edit" class="bg-gray-200 px-3 py-2 rounded">Cancel</button>
            <button type="submit" class="bg-blue-600 text-white px-3 py-2 rounded">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modal);

  document.getElementById('service-form').addEventListener('submit', saveServiceFromDialog);
  document.getElementById('cancel-service-edit').addEventListener('click', closeServiceDialog);
  document.getElementById('close-service-modal').addEventListener('click', closeServiceDialog);
  document.getElementById('service-modal').addEventListener('click', (e) => {
    if(e.target.id === 'service-modal') closeServiceDialog();
  });

  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('add-service-btn').addEventListener('click', addService);
  document.getElementById('ha-save').addEventListener('click', saveHA);
  document.getElementById('ha-check').addEventListener('click', checkHA);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupUI, { once: true });
} else {
  setupUI();
}
