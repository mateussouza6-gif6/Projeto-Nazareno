import QRCode from 'qrcode';
import { supabase, loadCloudTrees, saveCloudTree, deleteCloudTree } from './lib/cloud.js';
import { exportInventoryWorkbook } from './lib/export.js';
const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;

const STORE_KEY = 'nazareno_demo_trees_v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sidebar = $('#sidebar');
const mobileMenu = $('#mobileMenu');
const searchInput = $('#treeSearch');
let trees = loadTrees();
let activeFilter = { condition: '', identification: '' };
let scannerStream = null;
let staffUser = null;
let staffRole = null;
let realtimeChannel = null;

function loadTrees() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch { return []; }
}
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trees));
    if (supabase && staffUser && ['admin','editor'].includes(staffRole)) {
      syncCloudInventory().catch(error => notify(`Falha ao sincronizar: ${error.message}`));
    }
    return true;
  } catch {
    alert('O armazenamento deste navegador está cheio. Remova algumas fotos e tente novamente.');
    return false;
  }
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function calculateDap(capCm) {
  const cap = Number(capCm);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return Number((cap / Math.PI).toFixed(1));
}
function nextCode() {
  const next = trees.reduce((max, tree) => Math.max(max, Number(tree.number) || 0), 0) + 1;
  return { number: next, code: `PRA-${String(next).padStart(3, '0')}` };
}
function openModal(title, body, actions = '') {
  closeModal();
  const wrapper = document.createElement('div');
  wrapper.className = 'app-dialog-backdrop';
  wrapper.id = 'appDialog';
  wrapper.innerHTML = `<section class="app-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="dialog-header"><div><span class="eyebrow">ÁRVORES DE NAZARENO</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-close aria-label="Fechar">×</button></header>
    <div class="dialog-body">${body}</div>${actions ? `<footer class="dialog-actions">${actions}</footer>` : ''}
  </section>`;
  document.body.append(wrapper);
  wrapper.addEventListener('click', event => { if (event.target === wrapper || event.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', onEscape);
  return wrapper;
}
function onEscape(event) { if (event.key === 'Escape') closeModal(); }
function closeModal() {
  stopScanner();
  $('#appDialog')?.remove();
  document.removeEventListener('keydown', onEscape);
}
function notify(message) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2800);
}
function updateMetrics() {
  $('#treeCount')?.replaceChildren(document.createTextNode(`${trees.length} ${trees.length === 1 ? 'registro' : 'registros'}`));
  $('#metricTrees') && ($('#metricTrees').textContent = trees.length);
  $('#metricSpecies') && ($('#metricSpecies').textContent = new Set(trees.map(t => t.scientific || t.common).filter(Boolean)).size);
  $('#metricLocated') && ($('#metricLocated').textContent = trees.filter(t => t.latitude && t.longitude).length);
  $('#metricMaintenance') && ($('#metricMaintenance').textContent = trees.reduce((sum, t) => sum + (t.maintenance || []).length, 0));
}
function renderInventory() {
  const host = $('#inventoryResults');
  const term = (searchInput?.value || '').trim().toLocaleLowerCase('pt-BR');
  const list = trees.filter(tree => [tree.code, tree.common, tree.scientific, tree.family].join(' ').toLocaleLowerCase('pt-BR').includes(term) && (!activeFilter.condition || tree.condition === activeFilter.condition) && (!activeFilter.identification || tree.identification === activeFilter.identification));
  if (!list.length) {
    host.classList.remove('inventory-list');
    host.innerHTML = `<div class="empty-illustration"><svg viewBox="0 0 100 100" fill="none"><path d="M50 13 27 43h13L23 64h54L60 43h13L50 13Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M50 56v30m-12 0h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
      <h3>${term ? 'Nenhum registro encontrado' : 'O inventário está começando'}</h3>
      <p>${term ? 'Não encontramos árvores com esse termo.' : 'Cadastre a primeira árvore para iniciar o inventário real da Praça Central.'}</p>
      <button class="button button-outline" id="emptyNewTree"><span>＋</span> Novo cadastro</button>
      <span class="empty-note">Os registros de demonstração ficam salvos somente neste navegador.</span>`;
    $('#emptyNewTree').addEventListener('click', () => showTreeForm());
  } else {
    host.classList.add('inventory-list');
    host.innerHTML = list.map(tree => `<article class="tree-row">
      <div class="tree-thumb">${tree.photos?.[0] ? `<img src="${tree.photos[0].data || tree.photos[0].url}" alt="Foto de ${esc(tree.common || tree.code)}">` : '<span>♧</span>'}</div>
      <div class="tree-row-main"><strong>${esc(tree.code)} · ${esc(tree.common || 'Nome popular não informado')}</strong><span><em>${esc(tree.scientific || 'Identificação botânica pendente')}</em> · ${esc(tree.family || 'Família não informada')}</span><small>CAP: ${esc(tree.cap || '—')} cm · DAP: ${esc(tree.dap || '—')} cm · Altura: ${esc(tree.height || '—')} m</small></div>
      <span class="tree-status">${esc(tree.condition || 'Não avaliada')}</span>
      <button class="button button-outline tree-open" data-open-tree="${tree.id}">Abrir ficha</button>
    </article>`).join('');
    $('[data-open-tree]', host).forEach(button => button.addEventListener('click', () => staffUser ? showTreeDetails(button.dataset.openTree) : showPublicTreeByCode(trees.find(t=>t.id===button.dataset.openTree)?.code)));
  }
  updateMetrics();
}
function showTreeForm(tree = null) {
  if (!staffUser && !import.meta.env.DEV) { showProfile(); return; }
  const editing = Boolean(tree);
  const code = tree?.code || nextCode().code;
  const body = `<form id="treeForm" class="tree-form">
    <div class="form-note">Código de identificação <strong>${esc(code)}</strong><span>Gerado automaticamente para a área Praça Central.</span></div>
    <input type="hidden" name="id" value="${esc(tree?.id || '')}"><input type="hidden" name="code" value="${esc(code)}">
    <div class="form-grid">
      <label>Nome popular<input name="common" value="${esc(tree?.common || '')}" placeholder="Ex.: Ipê-amarelo"></label>
      <label>Nome científico<input name="scientific" value="${esc(tree?.scientific || '')}" placeholder="Ex.: Handroanthus albus"></label>
      <label>Família botânica<input name="family" value="${esc(tree?.family || '')}" placeholder="Ex.: Bignoniaceae"></label>
      <label>Origem<select name="origin"><option value="unknown">Não identificada</option><option value="native" ${tree?.origin === 'native' ? 'selected' : ''}>Nativa</option><option value="exotic" ${tree?.origin === 'exotic' ? 'selected' : ''}>Exótica</option></select></label>
      <label>Identificação<select name="identification"><option value="pending">Pendente</option><option value="confirmed" ${tree?.identification === 'confirmed' ? 'selected' : ''}>Confirmada</option><option value="unconfirmed">Não confirmada</option></select></label>
      <label>Altura estimada (m)<input name="height" type="number" min="0" step="0.1" value="${esc(tree?.height || '')}"></label>
      <label>CAP (cm)<input name="cap" id="capInput" type="number" min="0" step="0.1" value="${esc(tree?.cap || '')}"></label>
      <label>DAP calculado (cm)<input name="dap" id="dapInput" value="${esc(tree?.dap || '')}" readonly></label>
      <label>Estado geral<select name="condition"><option value="">Não avaliado</option><option>Bom</option><option>Regular</option><option>Ruim</option><option>Morta</option></select></label>
      <label>Estado fitossanitário<input name="phytosanitary" value="${esc(tree?.phytosanitary || '')}" placeholder="Ex.: sem sintomas aparentes"></label>
      <label>Pragas<input name="pests" value="${esc(tree?.pests || '')}"></label>
      <label>Doenças<input name="diseases" value="${esc(tree?.diseases || '')}"></label>
      <label>Necessidade de poda<select name="pruningNeeded"><option value="">Não avaliada</option><option value="true">Sim</option><option value="false">Não</option></select></label>
      <label>Conflito com fiação<select name="wireConflict"><option value="">Não avaliado</option><option value="true">Sim</option><option value="false">Não</option></select></label>
      <label>Conflito com calçada<select name="sidewalkConflict"><option value="">Não avaliado</option><option value="true">Sim</option><option value="false">Não</option></select></label>
      <label>Status da ficha pública<select name="publicationStatus"><option value="draft">Rascunho — não público</option><option value="published">Publicada</option><option value="archived">Arquivada</option></select></label>
      <label>Latitude<input name="latitude" type="number" step="any" value="${esc(tree?.latitude || '')}" placeholder="-21.XXX"></label>
      <label>Longitude<input name="longitude" type="number" step="any" value="${esc(tree?.longitude || '')}" placeholder="-44.XXX"></label>
      <label>Responsável pelo levantamento<input name="responsible" value="${esc(tree?.responsible || '')}"></label>
      <label>Data do levantamento<input name="surveyDate" type="date" value="${esc(tree?.surveyDate || new Date().toISOString().slice(0,10))}"></label>
    </div>
    <label class="full-label">Importância ambiental<textarea name="environmentalImportance" rows="3">${esc(tree?.environmentalImportance || '')}</textarea></label>
    <label class="full-label">Você sabia? — curiosidade verificada<textarea name="educationalFact" rows="2">${esc(tree?.educationalFact || '')}</textarea></label>
    <label class="full-label">Observações<textarea name="observations" rows="3">${esc(tree?.observations || '')}</textarea></label>
    <h3 class="form-section-title">Registro fotográfico do inventário</h3>
    <div class="photo-slots">
      <label>Foto 1 — Árvore inteira<input type="file" accept="image/*" capture="environment" data-photo-category="whole_tree"></label>
      <label>Foto 2 — Tronco<input type="file" accept="image/*" capture="environment" data-photo-category="trunk"></label>
      <label>Foto 3 — Copa<input type="file" accept="image/*" capture="environment" data-photo-category="crown"></label>
      <label>Foto 4 — Folha, flor ou fruto (quando pertinente)<input type="file" accept="image/*" capture="environment" data-photo-category="botanical_detail"></label>
    </div>
    <div id="photoPreview" class="photo-preview"></div>
    <button type="button" class="button button-outline" id="captureLocation">Registrar latitude e longitude automaticamente</button>
    <p class="storage-warning">Modo de avaliação: os dados e fotos ficam apenas neste navegador. Ainda não são enviados ao banco de dados.</p>
  </form>`;
  const dialog = openModal(editing ? `Editar árvore ${code}` : 'Cadastrar nova árvore', body, '<button type="button" class="button button-outline" data-close>Cancelar</button><button type="submit" form="treeForm" class="button button-primary">Salvar cadastro</button>');
  const form = $('#treeForm', dialog);
  let photos = [...(tree?.photos || [])];
  $('#capInput', form).addEventListener('input', event => { $('#dapInput', form).value = event.target.value ? (Number(event.target.value) / Math.PI).toFixed(1) : ''; });
  async function addFiles(files, category) {
    for (const file of [...files]) {
      if (!file.type.startsWith("image/")) continue;
      const oldIndex=photos.findIndex(photo=>photo.category===category);
      if(oldIndex>=0) photos.splice(oldIndex,1);
      notify("Registrando foto e obtendo coordenadas...");
      const photo=await capturePhotoWithLocation(file,form);
      photo.category=category;
      photos.push(photo);
    }
    $("#photoPreview",form).innerHTML=photos.map((photo,i)=>`<img src="${photo.data || photo.url || ""}" alt="Foto ${i+1}" title="${photo.category || ""}">`).join("");
  }
  $$("[data-photo-category]",form).forEach(input=>input.addEventListener("change",event=>addFiles(event.target.files,event.target.dataset.photoCategory)));
  $("#captureLocation",form).addEventListener("click",async()=>{try{const position=await getCurrentPosition();form.elements.latitude.value=position.latitude;form.elements.longitude.value=position.longitude;notify("Coordenadas registradas. Precisão aproximada: "+position.accuracy+" m.");}catch(error){notify(error.message);}});
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.common && !data.scientific) { alert('Informe ao menos o nome popular ou científico.'); return; }
    if(['whole_tree','trunk','crown'].some(type=>!photos.some(photo=>photo.category===type))){alert('Registre as fotos da árvore inteira, tronco e copa. O detalhe botânico é adicionado quando pertinente.');return;}
    const number = tree?.number || nextCode().number;
    const cameraLocation = [...photos].reverse().find(photo => photo.type === 'camera' && photo.location)?.location;
    const saved = { ...tree, ...data, ...(cameraLocation ? { latitude: cameraLocation.latitude, longitude: cameraLocation.longitude, locationAccuracy: cameraLocation.accuracy, locationCapturedAt: cameraLocation.capturedAt } : {}), number, id: tree?.id || crypto.randomUUID(), photos, dap: data.cap ? (Number(data.cap) / Math.PI).toFixed(1) : '', maintenance: tree?.maintenance || [], updatedAt: new Date().toISOString() };
    trees = editing ? trees.map(item => item.id === tree.id ? saved : item) : [...trees, saved];
    if (persist()) { closeModal(); renderInventory(); notify(editing ? 'Cadastro atualizado.' : `Árvore ${code} cadastrada neste dispositivo.`); }
  });
}
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo não disponibilizou o GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: Number(position.coords.latitude.toFixed(7)),
        longitude: Number(position.coords.longitude.toFixed(7)),
        accuracy: Math.round(position.coords.accuracy),
        capturedAt: new Date(position.timestamp).toISOString()
      }),
      error => {
        const messages = {
          1: 'Permita o acesso à localização nas configurações do aplicativo.',
          2: 'O GPS não conseguiu determinar a localização. Tente em uma área aberta.',
          3: 'O GPS demorou para responder. Tente novamente.'
        };
        reject(new Error(messages[error.code] || 'Não foi possível obter a localização.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
async function capturePhotoWithLocation(file, form = null) {
  let location = null;
  try {
    location = await getCurrentPosition();
    if (form) {
      form.elements.latitude.value = location.latitude;
      form.elements.longitude.value = location.longitude;
    }
  } catch (error) {
    notify(error.message + ' A foto será mantida sem coordenadas.');
  }
  const data = await compressImage(file);
  return { name: file.name, data, type: 'camera', location };
}
async function compressImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1200 / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .68));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function showTreeDetails(id) {
  const tree = trees.find(item => item.id === id);
  if (!tree) return;
  const body = `<div class="tree-detail">
    <div class="detail-code">${esc(tree.code)} <span>${esc(tree.condition || 'Condição não avaliada')}</span></div>
    <h3>${esc(tree.common || 'Nome popular não informado')}</h3><p><em>${esc(tree.scientific || 'Identificação científica pendente')}</em></p>
    <div class="detail-grid"><div><small>Família</small><strong>${esc(tree.family || '—')}</strong></div><div><small>Origem</small><strong>${esc(tree.origin || '—')}</strong></div><div><small>CAP</small><strong>${esc(tree.cap || '—')} cm</strong></div><div><small>DAP</small><strong>${esc(tree.dap || '—')} cm</strong></div><div><small>Altura</small><strong>${esc(tree.height || '—')} m</strong></div><div><small>Identificação</small><strong>${esc(tree.identification || 'Pendente')}</strong></div></div>
    <p><strong>Fitossanidade:</strong> ${esc(tree.phytosanitary || 'Não informada')}</p><p><strong>Pragas / doenças:</strong> ${esc([tree.pests, tree.diseases].filter(Boolean).join(' / ') || 'Não informadas')}</p><p><strong>Coordenadas:</strong> ${tree.latitude && tree.longitude ? `${esc(tree.latitude)}, ${esc(tree.longitude)} (precisão aproximada: ${esc(tree.locationAccuracy || 'não informada')} m)` : 'Não registradas'}</p><p><strong>Observações:</strong> ${esc(tree.observations || 'Nenhuma')}</p>
    <div class="detail-photos">${(tree.photos || []).map(photo => `<img src="${photo.data}" alt="Foto de ${esc(tree.code)}">`).join('')}</div>
    <div class="photo-actions"><button type="button" class="button button-outline" id="detailCamera">▣ Tirar foto</button><button type="button" class="button button-outline" id="detailGallery">＋ Enviar foto</button><input id="detailCameraInput" type="file" accept="image/*" capture="environment" hidden><input id="detailGalleryInput" type="file" accept="image/*" multiple hidden></div>
    <div class="maintenance-history"><h4>Histórico de manejo</h4>${(tree.maintenance || []).map(item => `<p><strong>${esc(item.date)}</strong> · ${esc(item.type)} — ${esc(item.description)}</p>`).join('') || '<p>Nenhum manejo registrado.</p>'}<button class="button button-outline" id="addMaintenance">＋ Registrar manejo</button></div>
    <p class="storage-warning">Ficha de demonstração local. Publicação por QR Code e sincronização dependem do banco de dados.</p>
  </div>`;
  const dialog = openModal(`Ficha da árvore · ${tree.code}`, body, '<button class="button button-outline" data-close>Fechar</button><button class="button button-outline" id="showQr">Gerar QR Code</button><button class="button button-outline" id="editTree">Editar</button><button class="button button-primary" id="deleteTree">Excluir</button>');
  $('#editTree', dialog).addEventListener('click', () => showTreeForm(tree));
  $('#deleteTree', dialog).addEventListener('click', () => {
    if (confirm(`Excluir o cadastro ${tree.code} deste dispositivo?`)) {
      trees = trees.filter(item => item.id !== tree.id); persist(); closeModal(); renderInventory(); notify('Cadastro excluído.');
    }
  });
  $('#showQr', dialog).addEventListener('click', () => showQr(tree));
  $('#addMaintenance', dialog).addEventListener('click', () => showMaintenanceForm(tree));
  $('#detailCamera', dialog).addEventListener('click', () => $('#detailCameraInput', dialog).click());
  $('#detailGallery', dialog).addEventListener('click', () => $('#detailGalleryInput', dialog).click());
  async function saveMorePhotos(files, fromCamera = false) {
    const updated = [...(tree.photos || [])];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (fromCamera) {
        notify('Obtendo coordenadas do local da foto…');
        const photo = await capturePhotoWithLocation(file);
        updated.push(photo);
        if (photo.location) {
          tree.latitude = photo.location.latitude;
          tree.longitude = photo.location.longitude;
          tree.locationAccuracy = photo.location.accuracy;
          tree.locationCapturedAt = photo.location.capturedAt;
        }
      } else {
        updated.push({ name: file.name, data: await compressImage(file), type: 'gallery', location: null });
      }
    }
    tree.photos = updated; persist(); showTreeDetails(tree.id);
  }
  $('#detailCameraInput', dialog).addEventListener('change', e => saveMorePhotos(e.target.files, true));
  $('#detailGalleryInput', dialog).addEventListener('change', e => saveMorePhotos(e.target.files));
}
async function showQr(tree) {
  const value = `${PUBLIC_APP_URL}/?tree=${encodeURIComponent(tree.code)}`;
  const image = await QRCode.toDataURL(value, { width: 260, margin: 2, color: { dark: '#173f32', light: '#ffffff' } });
  const dialog = openModal(`QR Code · ${tree.code}`, `<div class="qr-display"><img src="${image}" alt="QR Code de ${esc(tree.code)}"><strong>${esc(tree.common || tree.code)}</strong><span>${esc(tree.code)}</span><p>Este endereço abre a ficha digital pública quando o aplicativo estiver publicado em um endereço HTTPS permanente.</p></div>`, '<button class="button button-outline" data-close>Fechar</button><button class="button button-primary" id="printQr">Imprimir QR Code</button>');
  $('#printQr', dialog).addEventListener('click', () => {
    const win = window.open('', '_blank');
    if (!win) { alert('Permita a abertura de janelas para imprimir.'); return; }
    win.document.write(`<html><body style="font-family:Arial;text-align:center;padding:30px"><h2>${esc(tree.common || tree.code)}</h2><img width="260" src="${image}"><h3>${esc(tree.code)}</h3><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  });
}
function showMaintenanceForm(tree) {
  const dialog = openModal('Registrar manejo', `<form id="maintenanceForm" class="tree-form"><label>Tipo<select name="type"><option>Inspeção</option><option>Poda</option><option>Controle de pragas</option><option>Tratamento de doença</option><option>Avaliação de risco</option><option>Outro</option></select></label><label>Data<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label class="full-label">Descrição<textarea name="description" rows="4" required></textarea></label><label>Responsável<input name="responsible"></label></form>`, '<button class="button button-outline" data-close>Cancelar</button><button class="button button-primary" type="submit" form="maintenanceForm">Salvar manejo</button>');
  $('#maintenanceForm', dialog).addEventListener('submit', event => {
    event.preventDefault();
    const item = Object.fromEntries(new FormData(event.currentTarget).entries());
    tree.maintenance = [...(tree.maintenance || []), item]; persist(); showTreeDetails(tree.id); notify('Manejo registrado.');
  });
}
function showScanner() {
  const dialog = openModal('Ler QR Code', `<p>Aponte a câmera para o QR Code de uma árvore cadastrada.</p><video id="scannerVideo" class="scanner-video" playsinline></video><p id="scannerStatus" class="storage-warning">Solicitaremos acesso à câmera somente para esta leitura.</p><label class="full-label">Ou digite o código manualmente<input id="manualQr" placeholder="Ex.: PRA-001"></label><button class="button button-outline" id="manualOpen">Abrir ficha pelo código</button>`, '<button class="button button-outline" data-close>Fechar leitor</button>');
  const video = $('#scannerVideo', dialog);
  const status = $('#scannerStatus', dialog);
  $('#manualOpen', dialog).addEventListener('click', () => openByCode($('#manualQr', dialog).value));
  if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Câmera indisponível neste navegador. Use o campo para digitar o código.'; return; }
  if (!('BarcodeDetector' in window)) { status.textContent = 'Este navegador não oferece leitura automática de QR. Use o campo manual; a câmera poderá ser habilitada em uma versão futura.'; return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
    scannerStream = stream; video.srcObject = stream; video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const scan = async () => {
      if (!$('#scannerVideo')) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) { openByCode(codes[0].rawValue); return; }
      } catch {}
      requestAnimationFrame(scan);
    };
    video.addEventListener('loadeddata', scan, { once: true });
  }).catch(() => { status.textContent = 'Não foi possível acessar a câmera. Verifique a permissão ou digite o código manualmente.'; });
}
function openByCode(value) {
  let raw = String(value || '').trim();
  try { const parsed = new URL(raw); raw = parsed.searchParams.get('tree') || parsed.pathname.split('/').pop(); } catch { raw = raw.split('/').pop(); }
  const code = raw.toUpperCase();
  const tree = trees.find(item => item.code.toUpperCase() === code);
  if (!tree) { alert('Nenhuma árvore com esse código foi encontrada neste dispositivo.'); return; }
  if(staffUser) showTreeDetails(tree.id); else showPublicTreeByCode(tree.code);
}
function stopScanner() {
  scannerStream?.getTracks().forEach(track => track.stop());
  scannerStream = null;
}
function showFilters() {
  const dialog = openModal('Filtrar inventário', `<label>Estado geral<select id="conditionFilter"><option value="">Todos</option><option>Bom</option><option>Regular</option><option>Ruim</option><option>Morta</option></select></label><label>Identificação botânica<select id="identificationFilter"><option value="">Todas</option><option value="confirmed">Confirmada</option><option value="pending">Pendente</option><option value="unconfirmed">Não confirmada</option></select></label>`, '<button class="button button-outline" data-close>Cancelar</button><button class="button button-primary" id="applyFilters">Aplicar filtros</button>');
  $('#applyFilters', dialog).addEventListener('click', () => {
    const condition = $('#conditionFilter', dialog).value;
    const identification = $('#identificationFilter', dialog).value;
    activeFilter = { condition, identification };
    closeModal();
    renderInventory();
    $('#filterButton span').textContent = Number(Boolean(condition)) + Number(Boolean(identification));
  });
}
function renderFilteredInventory(list) {
  const original = trees;
  trees = list;
  renderInventory();
  trees = original;
  $('#filterButton span').textContent = Number(Boolean(activeFilter.condition)) + Number(Boolean(activeFilter.identification));
}
function showProfile() {
  if (!supabase) {
    openModal('Acesso administrativo', '<div class="access-info"><h3>Configuração do banco de dados pendente</h3><p>Para liberar o acesso da equipe, configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local e aplique as migrações SQL do projeto.</p><p>O acesso será restrito a contas autorizadas com perfil administrador ou editor. Visitantes não terão acesso a esta área.</p></div>', '<button class="button button-primary" data-close>Fechar</button>');
    return;
  }
  if (staffUser) { showAdminPanel(); return; }
  const dialog = openModal('Acesso da equipe', '<form id="staffLogin" class="tree-form"><label>E-mail institucional<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><p class="storage-warning">Somente contas previamente autorizadas pela administração municipal poderão acessar os recursos internos.</p></form>', '<button class="button button-outline" data-close>Cancelar</button><button class="button button-primary" type="submit" form="staffLogin">Entrar</button>');
  $('#staffLogin',dialog).addEventListener('submit', async event => {
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget).entries());
    const {data:auth,error}=await supabase.auth.signInWithPassword(data);
    if(error){notify('Não foi possível entrar. Confira o e-mail e a senha.');return;}
    const {data:profile,error:profileError}=await supabase.from('profiles').select('role,full_name').eq('id',auth.user.id).single();
    if(profileError || !['admin','editor'].includes(profile?.role)){
      await supabase.auth.signOut();notify('Esta conta não possui autorização para a área técnica.');return;
    }
    staffUser=auth.user;staffRole=profile.role;closeModal();await bootstrapCloud();showAdminPanel();
  });
}
async function syncCloudInventory() {
  for (const tree of trees) {
    const cloudId=await saveCloudTree(tree,staffUser.id);
    if(cloudId) tree.id=cloudId;
  }
}
async function showAdminPanel() {
  const isAdmin=staffRole==='admin';
  const dialog=openModal('Painel administrativo', `<div class="access-info"><h3>Gestão do inventário</h3><p>Conta: ${esc(staffUser?.email || '')} · Perfil: ${esc(staffRole || '')}</p><p>Os registros publicados ficam disponíveis nas fichas públicas e nos QR Codes. Rascunhos permanecem restritos à equipe.</p><div class="admin-actions"><button class="button button-primary" id="exportWorkbook">Exportar planilha Excel</button><button class="button button-outline" id="newEducation">Criar conteúdo educativo</button><button class="button button-outline" id="manageEducation">Gerenciar conteúdos</button>${isAdmin?'<button class="button button-outline" id="adminUsers">Orientações de usuários</button>':''}</div><p class="storage-warning">A exportação contém quatro abas: Inventário, Manejo, Fotografias e QR Codes.</p></div>`, '<button class="button button-outline" id="staffLogout">Sair da conta</button><button class="button button-primary" data-close>Fechar</button>');
  $('#exportWorkbook',dialog).addEventListener('click',()=>exportInventoryWorkbook(trees));
  $('#newEducation',dialog).addEventListener('click',()=>showEducationEditor());
  $('#manageEducation',dialog).addEventListener('click',()=>manageEducationContent());
  $('#staffLogout',dialog).addEventListener('click',async()=>{await supabase.auth.signOut();staffUser=null;staffRole=null;closeModal();notify('Sessão encerrada.');});
  $('#adminUsers',dialog)?.addEventListener('click',()=>openModal('Autorização de usuários','<p>Novas contas devem ser criadas pelo administrador do projeto Supabase. Depois, atribua o perfil editor ou admin na tabela profiles. O perfil viewer não acessa esta área.</p>','<button class="button button-primary" data-close>Fechar</button>'));
}
async function showEducationEditor(item=null) {
  const dialog=openModal(item?'Editar conteúdo educativo':'Novo conteúdo educativo',`<form id="educationForm" class="tree-form"><label>Título<input name="title" required value="${esc(item?.title||'')}"></label><label>Resumo<input name="summary" value="${esc(item?.summary||'')}"></label><label>Espécie relacionada<input name="related_species" value="${esc(item?.related_species||'')}"></label><label>Público-alvo<select name="target_audience"><option value="public">População</option><option value="schools">Escolas</option><option value="children">Crianças</option><option value="teachers">Educadores</option></select></label><label>Conteúdo<textarea name="body" rows="7" required>${esc(item?.body||'')}</textarea></label><label>Status<select name="status"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label></form>`, '<button class="button button-outline" data-close>Cancelar</button><button class="button button-primary" type="submit" form="educationForm">Salvar conteúdo</button>');
  $('#educationForm',dialog).addEventListener('submit',async event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const slug=(form.title.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''));const row={...form,slug,updated_by:staffUser.id,...(item?{}:{created_by:staffUser.id})};const result=item?await supabase.from('education_contents').update(row).eq('id',item.id):await supabase.from('education_contents').insert(row);if(result.error){notify('Não foi possível salvar: '+result.error.message);return;}closeModal();notify('Conteúdo educativo salvo.');});
}
async function manageEducationContent() {
  const {data,error}=await supabase.from('education_contents').select('*').order('updated_at',{ascending:false});
  if(error){notify(error.message);return;}
  const body=data.length?data.map(item=>`<div class="education-admin-row"><strong>${esc(item.title)}</strong><span>${esc(item.status)}</span><button class="button button-outline" data-edit-content="${item.id}">Editar</button></div>`).join(''):'<p>Nenhum conteúdo educativo cadastrado.</p>';
  const dialog=openModal('Conteúdos educativos',body,'<button class="button button-primary" data-close>Fechar</button>');
  $('[data-edit-content]',dialog).forEach(button=>button.addEventListener('click',()=>showEducationEditor(data.find(x=>x.id===button.dataset.editContent))));
}
async function bootstrapCloud() {
  if(!supabase)return;
  try {
    const remote=await loadCloudTrees();
    if(remote){trees=remote;localStorage.setItem(STORE_KEY,JSON.stringify(trees));renderInventory();}
    realtimeChannel?.unsubscribe();
    realtimeChannel=supabase.channel('public-arboreal-inventory').on('postgres_changes',{event:'*',schema:'public',table:'trees'},async()=>{const refreshed=await loadCloudTrees();trees=refreshed||[];localStorage.setItem(STORE_KEY,JSON.stringify(trees));renderInventory();}).subscribe();
  } catch(error){notify('Não foi possível atualizar o inventário: '+error.message);}
}

function showQrManager() {
  const body = trees.length ? `<div class="qr-list">${trees.map(t => `<button class="button button-outline" data-qr-tree="${t.id}">${esc(t.code)} · ${esc(t.common || 'Sem nome popular')}</button>`).join('')}</div>` : '<p>Cadastre uma árvore para gerar seu QR Code individual.</p>';
  const dialog = openModal('QR Codes e placas', body, '<button class="button button-primary" data-close>Fechar</button>');
  $$('[data-qr-tree]', dialog).forEach(button => button.addEventListener('click', () => showQr(trees.find(t => t.id === button.dataset.qrTree))));
}
function showMap() {
  const located = trees.filter(t => t.latitude && t.longitude);
  const body = located.length ? `<div class="map-records">${located.map(t => `<p><strong>${esc(t.code)}</strong> · ${esc(t.common || 'Árvore')} <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(t.latitude)}&mlon=${encodeURIComponent(t.longitude)}#map=19/${encodeURIComponent(t.latitude)}/${encodeURIComponent(t.longitude)}">Abrir localização</a></p>`).join('')}</div>` : '<p>Nenhuma árvore possui coordenadas registradas. Informe latitude e longitude no cadastro para visualizar sua localização.</p>';
  openModal('Mapa das árvores', body, '<button class="button button-primary" data-close>Fechar</button>');
}
async function showEducation() {
  let content=[];
  if(supabase){const result=await supabase.from("education_contents").select("title,summary,body,target_audience").eq("status","published").order("updated_at",{ascending:false});if(!result.error)content=result.data||[];}
  const cards=content.map(item=>`<article class="education-public-item"><h3>${esc(item.title)}</h3><p>${esc(item.summary||"")}</p><p>${esc(item.body)}</p></article>`).join("");
  const fallback='<div class="access-info"><h3>Conheça as árvores da Praça Central</h3><p>O projeto apresenta informações botânicas, características das árvores e sua importância ambiental.</p><p>Os conteúdos educativos serão elaborados e publicados pela equipe técnica após revisão.</p></div>';
  openModal("Educação ambiental",cards||fallback,'<button class="button button-primary" data-close>Fechar</button>');
}
async function showPublicTreeByCode(code) {
  const tree=trees.find(item=>String(item.code).toLowerCase()===String(code).toLowerCase());
  if(!tree){openModal("Ficha não encontrada","<p>Não encontramos uma árvore com esse código.</p>","<button class=\"button button-primary\" data-close>Fechar</button>");return;}
  if(supabase && tree.publicationStatus!=="published"){openModal("Ficha não publicada","<p>Esta ficha ainda não foi liberada pela equipe técnica.</p>","<button class=\"button button-primary\" data-close>Fechar</button>");return;}
  const labels={whole_tree:"Árvore inteira",trunk:"Tronco",crown:"Copa",botanical_detail:"Folha, flor ou fruto"};
  const photos=(tree.photos||[]).filter(p=>p.data||p.url).map(p=>"<figure><img src=\""+(p.url||p.data)+"\" alt=\""+esc(labels[p.category]||"Fotografia da árvore")+"\"><figcaption>"+esc(labels[p.category]||"Fotografia")+"</figcaption></figure>").join("");
  const body="<article class=\"public-tree-card\"><div class=\"detail-code\">"+esc(tree.code)+" <span>Inventário arbóreo · Praça Central</span></div>"+
    "<h2>"+esc(tree.common||"Nome popular não informado")+"</h2><p><em>"+esc(tree.scientific||"Identificação botânica pendente")+"</em></p>"+
    "<p><strong>Família botânica:</strong> "+esc(tree.family||"Não informada")+"</p><p><strong>Origem:</strong> "+esc(tree.origin==="native"?"Nativa":tree.origin==="exotic"?"Exótica":"Não identificada")+"</p>"+
    "<h3>Características</h3><p>Altura estimada: "+esc(tree.height||"Não registrada")+" m</p><p>Circunferência: "+esc(tree.cap||"Não registrada")+" cm</p><p>Diâmetro: "+esc(tree.dap||"Não registrado")+" cm</p>"+
    "<h3>Localização</h3><p>Praça Central — Nazareno/MG</p><p>Latitude: "+esc(tree.latitude||"Não registrada")+" · Longitude: "+esc(tree.longitude||"Não registrada")+"</p>"+
    "<h3>Importância ambiental</h3><p>"+esc(tree.environmentalImportance||"Conteúdo em elaboração pela equipe técnica.")+"</p>"+
    "<h3>Fotografias</h3><div class=\"public-photo-grid\">"+(photos||"<p>Fotografias ainda não disponibilizadas.</p>")+"</div>"+
    "<h3>Você sabia?</h3><p>"+esc(tree.educationalFact||"Curiosidade em elaboração após revisão botânica.")+"</p>"+
    "<footer>Projeto Árvores de Nazareno · Secretaria Municipal de Meio Ambiente</footer></article>";
  openModal("Ficha digital da árvore",body,"<button class=\"button button-primary\" data-close>Fechar ficha</button>");
}

function bindEvents() {
  $('#newTreeButton').addEventListener('click', () => showTreeForm());
  $('#emptyNewTree').addEventListener('click', () => showTreeForm());
  $('#scanQrButton').addEventListener('click', showScanner);
  $('#scanQrShortcut')?.addEventListener('click', showScanner);
  $('#filterButton').addEventListener('click', showFilters);
  $('#profileButton').addEventListener('click', showProfile);
  $('#openMapButton').addEventListener('click', showMap);
  $('#mapCardButton')?.addEventListener('click', showMap);
  $('#educationButton').addEventListener('click', showEducation);
  $('#maintenanceButton').addEventListener('click', () => {
    if (!trees.length) { notify('Cadastre uma árvore antes de registrar manejo.'); return; }
    const dialog = openModal('Escolher árvore', trees.map(t => `<button class="button button-outline choose-maintenance" data-id="${t.id}">${esc(t.code)} · ${esc(t.common || 'Sem nome')}</button>`).join(''), '<button class="button button-outline" data-close>Fechar</button>');
    $$('.choose-maintenance', dialog).forEach(button => button.addEventListener('click', () => showMaintenanceForm(trees.find(t => t.id === button.dataset.id))));
  });
  $('#treeSearch').addEventListener('input', renderInventory);
  $('#mobileMenu').addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    mobileMenu.setAttribute('aria-expanded', String(isOpen));
  });
  $$('.nav-link').forEach(link => link.addEventListener('click', () => {
    $$('.nav-link').forEach(item => item.classList.remove('active'));
    link.classList.add('active'); sidebar.classList.remove('open'); mobileMenu.setAttribute('aria-expanded', 'false');
    if (link.dataset.section === 'qrcodes') { showQrManager(); }
    if (link.dataset.section === 'manejo') { $('#maintenanceButton').click(); }
  }));
  $$('.text-link[href^="#"], .hero-link, .card-link[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
}
document.documentElement.dataset.app = 'arvores-de-nazareno';
bindEvents();
renderInventory();
if (supabase) bootstrapCloud();
const requestedTree=new URLSearchParams(window.location.search).get('tree');
if(requestedTree) setTimeout(()=>openByCode(requestedTree),250);
