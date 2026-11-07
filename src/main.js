import QRCode from 'qrcode';

const STORE_KEY = 'nazareno_demo_trees_v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sidebar = $('#sidebar');
const mobileMenu = $('#mobileMenu');
const searchInput = $('#treeSearch');
let trees = loadTrees();
let scannerStream = null;

function loadTrees() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch { return []; }
}
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trees));
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
  $('#metricTrees').textContent = trees.length;
  $('#metricSpecies').textContent = new Set(trees.map(t => t.scientific || t.common).filter(Boolean)).size;
  $('#metricLocated').textContent = trees.filter(t => t.latitude && t.longitude).length;
  $('#metricMaintenance').textContent = trees.reduce((sum, t) => sum + (t.maintenance || []).length, 0);
}
function renderInventory() {
  const host = $('#inventoryResults');
  const term = (searchInput?.value || '').trim().toLocaleLowerCase('pt-BR');
  const list = trees.filter(tree => [tree.code, tree.common, tree.scientific, tree.family].join(' ').toLocaleLowerCase('pt-BR').includes(term));
  if (!list.length) {
    host.innerHTML = `<div class="empty-illustration"><svg viewBox="0 0 100 100" fill="none"><path d="M50 13 27 43h13L23 64h54L60 43h13L50 13Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M50 56v30m-12 0h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
      <h3>${term ? 'Nenhum registro encontrado' : 'O inventário está começando'}</h3>
      <p>${term ? 'Não encontramos árvores com esse termo.' : 'Cadastre a primeira árvore para iniciar o inventário real da Praça Central.'}</p>
      <button class="button button-outline" id="emptyNewTree"><span>＋</span> Novo cadastro</button>
      <span class="empty-note">Os registros de demonstração ficam salvos somente neste navegador.</span>`;
    $('#emptyNewTree').addEventListener('click', () => showTreeForm());
  } else {
    host.classList.add('inventory-list');
    host.innerHTML = list.map(tree => `<article class="tree-row">
      <div class="tree-thumb">${tree.photos?.[0] ? `<img src="${tree.photos[0].data}" alt="Foto de ${esc(tree.common || tree.code)}">` : '<span>♧</span>'}</div>
      <div class="tree-row-main"><strong>${esc(tree.code)} · ${esc(tree.common || 'Nome popular não informado')}</strong><span><em>${esc(tree.scientific || 'Identificação botânica pendente')}</em> · ${esc(tree.family || 'Família não informada')}</span><small>CAP: ${esc(tree.cap || '—')} cm · DAP: ${esc(tree.dap || '—')} cm · Altura: ${esc(tree.height || '—')} m</small></div>
      <span class="tree-status">${esc(tree.condition || 'Não avaliada')}</span>
      <button class="button button-outline tree-open" data-open-tree="${tree.id}">Abrir ficha</button>
    </article>`).join('');
    $$('[data-open-tree]', host).forEach(button => button.addEventListener('click', () => showTreeDetails(button.dataset.openTree)));
  }
  updateMetrics();
}
function showTreeForm(tree = null) {
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
      <label>Latitude<input name="latitude" type="number" step="any" value="${esc(tree?.latitude || '')}" placeholder="-21.XXX"></label>
      <label>Longitude<input name="longitude" type="number" step="any" value="${esc(tree?.longitude || '')}" placeholder="-44.XXX"></label>
      <label>Responsável pelo levantamento<input name="responsible" value="${esc(tree?.responsible || '')}"></label>
      <label>Data do levantamento<input name="surveyDate" type="date" value="${esc(tree?.surveyDate || new Date().toISOString().slice(0,10))}"></label>
    </div>
    <label class="full-label">Observações<textarea name="observations" rows="3">${esc(tree?.observations || '')}</textarea></label>
    <div class="photo-actions"><button type="button" class="button button-outline" id="takePhoto">▣ Tirar foto</button><button type="button" class="button button-outline" id="choosePhoto">＋ Enviar foto da galeria</button><input id="cameraInput" type="file" accept="image/*" capture="environment" hidden><input id="galleryInput" type="file" accept="image/*" multiple hidden></div>
    <div id="photoPreview" class="photo-preview">${(tree?.photos || []).map((photo, i) => `<img src="${photo.data}" alt="Foto ${i+1}">`).join('')}</div>
    <p class="storage-warning">Modo de avaliação: os dados e fotos ficam apenas neste navegador. Ainda não são enviados ao banco de dados.</p>
  </form>`;
  const dialog = openModal(editing ? `Editar árvore ${code}` : 'Cadastrar nova árvore', body, '<button type="button" class="button button-outline" data-close>Cancelar</button><button type="submit" form="treeForm" class="button button-primary">Salvar cadastro</button>');
  const form = $('#treeForm', dialog);
  let photos = [...(tree?.photos || [])];
  $('#capInput', form).addEventListener('input', event => { $('#dapInput', form).value = event.target.value ? (Number(event.target.value) / Math.PI).toFixed(1) : ''; });
  $('#takePhoto', form).addEventListener('click', () => $('#cameraInput', form).click());
  $('#choosePhoto', form).addEventListener('click', () => $('#galleryInput', form).click());
  async function addFiles(files) {
    for (const file of [...files]) {
      if (!file.type.startsWith('image/')) continue;
      const data = await compressImage(file);
      photos.push({ name: file.name, data, type: 'other' });
    }
    $('#photoPreview', form).innerHTML = photos.map((photo, i) => `<img src="${photo.data}" alt="Foto ${i+1}">`).join('');
  }
  $('#cameraInput', form).addEventListener('change', event => addFiles(event.target.files));
  $('#galleryInput', form).addEventListener('change', event => addFiles(event.target.files));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.common && !data.scientific) { alert('Informe ao menos o nome popular ou científico.'); return; }
    const number = tree?.number || nextCode().number;
    const saved = { ...tree, ...data, number, id: tree?.id || crypto.randomUUID(), photos, dap: data.cap ? (Number(data.cap) / Math.PI).toFixed(1) : '', maintenance: tree?.maintenance || [], updatedAt: new Date().toISOString() };
    trees = editing ? trees.map(item => item.id === tree.id ? saved : item) : [...trees, saved];
    if (persist()) { closeModal(); renderInventory(); notify(editing ? 'Cadastro atualizado.' : `Árvore ${code} cadastrada neste dispositivo.`); }
  });
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
    <p><strong>Fitossanidade:</strong> ${esc(tree.phytosanitary || 'Não informada')}</p><p><strong>Pragas / doenças:</strong> ${esc([tree.pests, tree.diseases].filter(Boolean).join(' / ') || 'Não informadas')}</p><p><strong>Observações:</strong> ${esc(tree.observations || 'Nenhuma')}</p>
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
  async function saveMorePhotos(files) {
    const updated = [...(tree.photos || [])];
    for (const file of files) if (file.type.startsWith('image/')) updated.push({ name: file.name, data: await compressImage(file), type: 'other' });
    tree.photos = updated; persist(); showTreeDetails(tree.id);
  }
  $('#detailCameraInput', dialog).addEventListener('change', e => saveMorePhotos(e.target.files));
  $('#detailGalleryInput', dialog).addEventListener('change', e => saveMorePhotos(e.target.files));
}
async function showQr(tree) {
  const value = `arvores-de-nazareno://tree/${tree.code}`;
  const image = await QRCode.toDataURL(value, { width: 260, margin: 2, color: { dark: '#173f32', light: '#ffffff' } });
  const dialog = openModal(`QR Code · ${tree.code}`, `<div class="qr-display"><img src="${image}" alt="QR Code de ${esc(tree.code)}"><strong>${esc(tree.common || tree.code)}</strong><span>${esc(tree.code)}</span><p>Este código identifica o registro neste protótipo.</p></div>`, '<button class="button button-outline" data-close>Fechar</button><button class="button button-primary" id="printQr">Imprimir QR Code</button>');
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
  const code = String(value || '').trim().split('/').pop().toUpperCase();
  const tree = trees.find(item => item.code.toUpperCase() === code);
  if (!tree) { alert('Nenhuma árvore com esse código foi encontrada neste dispositivo.'); return; }
  showTreeDetails(tree.id);
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
    const original = trees;
    const filtered = original.filter(t => (!condition || t.condition === condition) && (!identification || t.identification === identification));
    closeModal();
    renderFilteredInventory(filtered);
  });
}
function renderFilteredInventory(list) {
  const original = trees;
  trees = list;
  renderInventory();
  trees = original;
  $('#filterButton span').textContent = list.length === original.length ? '0' : String(original.length - list.length);
}
function showProfile() {
  openModal('Área técnica', '<div class="access-info"><h3>Ambiente de avaliação</h3><p>Este protótipo ainda não possui autenticação real. Os cadastros ficam neste navegador e não são compartilhados com visitantes.</p><p>Na versão conectada ao Supabase, visitantes poderão consultar fichas publicadas e somente usuários autorizados poderão cadastrar, editar ou excluir árvores.</p><span class="storage-warning">Não use dados oficiais nem informações sensíveis nesta etapa de demonstração.</span></div>', '<button class="button button-primary" data-close>Entendi</button>');
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
function showEducation() {
  openModal('Circuito de educação ambiental', '<div class="access-info"><h3>Conheça as árvores da Praça Central</h3><p>O QR Code de cada indivíduo poderá apresentar nome popular, nome científico, família botânica, origem, características e curiosidades ecológicas.</p><p>As informações serão exibidas ao público somente depois da revisão técnica e publicação do cadastro.</p><p>O conteúdo educativo será preenchido com informações botânicas verificadas, sem inventar dados sobre as árvores locais.</p></div>', '<button class="button button-primary" data-close>Fechar</button>');
}
function bindEvents() {
  $('#newTreeButton').addEventListener('click', () => showTreeForm());
  $('#emptyNewTree').addEventListener('click', () => showTreeForm());
  $('#scanQrButton').addEventListener('click', showScanner);
  $('#filterButton').addEventListener('click', showFilters);
  $('#profileButton').addEventListener('click', showProfile);
  $('#openMapButton').addEventListener('click', showMap);
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
