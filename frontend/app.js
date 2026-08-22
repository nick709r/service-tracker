const apiBase = '/api';
let currentUser = null;

const SERVICE_LOGOS = {
  sonarr: { bg: '#1d4ed8', initials: 'S' },
  lidarr: { bg: '#14b8a6', initials: 'L' },
  transmission: { bg: '#f97316', initials: 'T' },
  homeassistant: { bg: '#3b82f6', initials: 'H' },
  agentdvr: { bg: '#7c3aed', initials: 'A' },
  default: { bg: '#475569', initials: 'S' }
};

function getServiceLogo(service){
  const key = (service && (service.type || service.id || 'default')).toLowerCase();
  const config = SERVICE_LOGOS[key] || SERVICE_LOGOS.default;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="${config.bg}"/>
      <circle cx="32" cy="20" r="8" fill="rgba(255,255,255,0.25)"/>
      <path d="M18 46c4-8 11-12 14-12s10 4 14 12" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="4" stroke-linecap="round"/>
      <text x="32" y="39" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="22" fill="#ffffff">${config.initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

  title.innerText = service ? 'Edit service' : 'Add service';
  idField.value = service ? (service.id || '') : '';
  nameField.value = service ? (service.name || '') : '';
  urlField.value = service ? (service.url || '') : '';
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

  if(!name) {
    alert('Service name is required.');
    return;
  }

  const payload = { name, url };

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

async function loadServices(){
  const list = await api('/services');
  const container = document.getElementById('services-list');
  container.innerHTML = '';
  for(const s of list){
    const card = document.createElement('div');
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
