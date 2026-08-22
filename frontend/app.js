const apiBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://127.0.0.1:6862/api' : '/api';
let currentUser = null;
const APP_NAME = 'LennyCat Service Monitor';

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
    await loadServices();
    await loadEmailSettings();
    await loadHomeAssistantNetworkStatus();
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
    panel.innerHTML = cameras.map(camera => {
      const detailPairs = Array.isArray(camera.details) ? camera.details : [];
      const detailHtml = detailPairs.length ? `
        <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          ${detailPairs.map(detail => `
            <div class="border rounded px-2 py-1 bg-white">
              <span class="text-gray-500">${detail.label}:</span>
              <span class="ml-1 font-medium">${detail.value}</span>
            </div>
          `).join('')}
        </div>
      ` : '';
      return `
        <div class="border rounded p-2 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium">${camera.name}</span>
            <span class="text-xs px-2 py-1 rounded ${camera.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
              ${camera.online ? 'Online' : 'Offline'}
            </span>
          </div>
          ${camera.snapshot_url ? `<img src="${camera.snapshot_url}" alt="${camera.name} snapshot" class="w-full h-32 object-cover rounded border" />` : '<div class="text-xs text-gray-500">No snapshot available</div>'}
          <div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
            <span class="px-2 py-1 rounded ${camera.recording ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}">${camera.recording ? 'Recording' : 'Idle'}</span>
            <span class="px-2 py-1 rounded ${camera.motion_detected ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-700'}">${camera.motion_detected ? 'Motion detected' : 'No motion'}</span>
            <span class="px-2 py-1 rounded bg-gray-200 text-gray-700">${camera.status || 'unknown'}</span>
          </div>
          ${detailHtml}
          ${camera.stream_url ? `<div class="mt-2 text-[11px] text-gray-600 break-all">Stream: ${camera.stream_url}</div>` : ''}
        </div>
      `;
    }).join('');
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
    const hasUrl = Boolean((s.url || '').trim());
    card.className = 'bg-gray-50 p-3 rounded shadow';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <img src="${getServiceLogo(s)}" alt="${s.name} logo" class="w-12 h-12 rounded-lg object-cover" />
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <div class="font-semibold break-words">${s.name}</div>
              <div class="text-sm text-gray-600 break-all">${s.url || 'No URL configured yet'}</div>
            </div>
            <div class="text-right shrink-0">
              <button class="status-btn bg-blue-500 text-white px-2 py-1 rounded" data-id="${s.id}" ${hasUrl ? '' : 'disabled title="Add a URL first"'}>Check</button>
              <button class="edit-btn bg-yellow-400 text-white px-2 py-1 rounded ml-2" data-id="${s.id}">Edit</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-2 text-sm" id="status-${s.id}">${hasUrl ? '' : 'Add a URL to begin monitoring.'}</div>
      ${isAgentDvr ? '<div id="agentdvr-cameras" class="mt-3 space-y-2"></div>' : ''}
    `;
    container.appendChild(card);
  }

  document.querySelectorAll('.status-btn').forEach(b => b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const st = document.getElementById('status-' + id);
    const service = list.find(item => item.id === id);
    if(!service || !(service.url || '').trim()){
      st.innerHTML = '<span class="inline-flex items-center gap-2 text-yellow-700"><span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> Add a URL to begin monitoring.</span>';
      return;
    }
    st.innerHTML = '<span class="inline-flex items-center gap-2 text-gray-600"><span class="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse"></span> Checking...</span>';
    try{
      const r = await api(`/services/${id}/status`);
      const isReachable = r.status === 'reachable';
      const isNoUrl = r.status === 'no_url';
      const statusLabel = isReachable ? 'Reachable' : (isNoUrl ? 'No URL configured' : r.status || 'Unknown');
      const statusTone = isReachable ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200';
      const statusDot = isReachable ? 'bg-green-500' : 'bg-red-500';
      const detailText = r.status === 'unreachable' && r.error ? ` — ${r.error}` : '';
      st.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center gap-2 px-2 py-1 rounded-full ${statusTone}">
            <span class="w-2.5 h-2.5 rounded-full ${statusDot}"></span>
            ${isReachable ? '✓' : '✕'} ${statusLabel}
          </span>
          <span class="text-xs text-gray-600">${r.code || 'n/a'}${detailText}${r.final_url ? ` → ${r.final_url}` : ''}</span>
        </div>
      `;
      if(id === 'agentdvr' || id === 'agent-dvr') {
        await loadAgentDvrCameras();
      }
    }catch(err){
      st.innerHTML = '<span class="inline-flex items-center gap-2 text-red-700"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span> Error — ' + (err.message || 'request failed') + '</span>';
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

async function loadEmailSettings(){
  try {
    const settings = await api('/email_notifications');
    const fields = {
      enabled: document.getElementById('email-enabled'),
      smtp_host: document.getElementById('email-smtp-host'),
      smtp_port: document.getElementById('email-smtp-port'),
      smtp_username: document.getElementById('email-username'),
      smtp_password: document.getElementById('email-password'),
      from_email: document.getElementById('email-from'),
      to_email: document.getElementById('email-to'),
      use_tls: document.getElementById('email-use-tls')
    };
    if (fields.enabled) fields.enabled.checked = !!settings.enabled;
    if (fields.smtp_host) fields.smtp_host.value = settings.smtp_host || '';
    if (fields.smtp_port) fields.smtp_port.value = settings.smtp_port || 587;
    if (fields.smtp_username) fields.smtp_username.value = settings.smtp_username || '';
    if (fields.smtp_password) fields.smtp_password.value = settings.smtp_password || '';
    if (fields.from_email) fields.from_email.value = settings.from_email || '';
    if (fields.to_email) fields.to_email.value = settings.to_email || '';
    if (fields.use_tls) fields.use_tls.checked = settings.use_tls !== false;
  } catch (e) {
    document.getElementById('email-status').innerText = 'Email settings not available yet';
  }
}

async function saveEmailSettings(){
  const payload = {
    enabled: document.getElementById('email-enabled').checked,
    smtp_host: document.getElementById('email-smtp-host').value.trim(),
    smtp_port: Number(document.getElementById('email-smtp-port').value || 587),
    smtp_username: document.getElementById('email-username').value.trim(),
    smtp_password: document.getElementById('email-password').value,
    from_email: document.getElementById('email-from').value.trim(),
    to_email: document.getElementById('email-to').value.trim(),
    use_tls: document.getElementById('email-use-tls').checked
  };
  await api('/email_notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  document.getElementById('email-status').innerText = 'Email alerts saved.';
}

async function saveHA(){
  const url = document.getElementById('ha-url').value;
  const token = document.getElementById('ha-token').value;
  await api('/home_assistant', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url,token})});
  await loadHomeAssistantNetworkStatus();
  alert('Saved');
}

async function checkHA(){
  try{
    const r = await api('/home_assistant/check');
    document.getElementById('ha-status').innerText = JSON.stringify(r);
    await loadHomeAssistantNetworkStatus();
  }catch(e){
    document.getElementById('ha-status').innerText = 'Not configured or unreachable';
  }
}

async function loadHomeAssistantNetworkStatus(){
  const summaryEl = document.getElementById('ha-network-summary');
  const detailsEl = document.getElementById('ha-network-details');
  if (!summaryEl || !detailsEl) return;

  try {
    const summary = await api('/home_assistant/network');
    const zigbee = summary.zigbee || {};
    const bluetooth = summary.bluetooth || {};
    const network = summary.network || {};

    const summarize = (label, item, accent = 'gray') => {
      const state = String(item?.status || 'unknown').toLowerCase();
      const tone = state === 'online' ? 'bg-green-100 text-green-700' : state === 'offline' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
      return `
        <div class="border rounded p-3 bg-gray-50">
          <div class="text-xs uppercase tracking-wide text-gray-500">${label}</div>
          <div class="mt-2 inline-block rounded px-2 py-1 text-sm font-semibold ${tone}">${state}</div>
          <div class="mt-2 text-xs text-gray-600">${item?.count ?? 0} entities</div>
        </div>
      `;
    };

    const networkStatus = network.connected > 0 ? 'text-green-700' : 'text-red-700';
    summaryEl.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        ${summarize('Zigbee', zigbee)}
        ${summarize('Bluetooth', bluetooth)}
        <div class="border rounded p-3 bg-gray-50">
          <div class="text-xs uppercase tracking-wide text-gray-500">Network devices</div>
          <div class="mt-2 text-lg font-semibold ${networkStatus}">${network.connected ?? 0} connected</div>
          <div class="mt-2 text-xs text-gray-600">${network.disconnected ?? 0} disconnected / ${network.total ?? 0} total</div>
        </div>
      </div>
    `;

    const renderList = (items, emptyText) => {
      if (!Array.isArray(items) || !items.length) {
        return `<div class="text-sm text-gray-500">${emptyText}</div>`;
      }
      return items.map(item => `
        <div class="border rounded p-2 bg-gray-50">
          <div class="font-medium">${item.friendly_name || item.entity_id || 'Unknown'}</div>
          <div class="text-xs text-gray-600">${item.entity_id || 'unknown'} • ${item.state || 'unknown'}</div>
        </div>
      `).join('');
    };

    detailsEl.classList.remove('hidden');
    detailsEl.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <h4 class="font-semibold mb-2">Zigbee</h4>
          <div class="space-y-2">${renderList(zigbee.items, 'No Zigbee entities found.')}</div>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Bluetooth</h4>
          <div class="space-y-2">${renderList(bluetooth.items, 'No Bluetooth entities found.')}</div>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Network devices</h4>
          <div class="space-y-2">${renderList(network.devices, 'No network device data found.')}</div>
        </div>
      </div>
    `;
  } catch (e) {
    summaryEl.innerHTML = '<div class="text-sm text-gray-500 mt-3">Home Assistant network summary unavailable yet.</div>';
    detailsEl.innerHTML = '';
    detailsEl.classList.add('hidden');
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
  const networkToggle = document.getElementById('network-details-toggle');
  if (networkToggle) {
    networkToggle.addEventListener('click', () => {
      const details = document.getElementById('ha-network-details');
      if (!details) return;
      const hidden = details.classList.toggle('hidden');
      networkToggle.innerText = hidden ? 'Show details' : 'Hide details';
    });
  }
  document.getElementById('email-save').addEventListener('click', saveEmailSettings);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupUI, { once: true });
} else {
  setupUI();
}
