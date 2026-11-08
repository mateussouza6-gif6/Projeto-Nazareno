import * as XLSX from 'xlsx';
const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL;
const publicBaseUrl = configuredPublicUrl ? (configuredPublicUrl.endsWith('/') ? configuredPublicUrl : configuredPublicUrl + '/') : new URL(import.meta.env.BASE_URL, window.location.href).href;

const blank = value => value === undefined || value === null ? '' : value;
export function exportInventoryWorkbook(trees) {
  const inventory = trees.map(t => ({
    Código: blank(t.code), Número: blank(t.number), 'Nome popular': blank(t.common),
    'Nome científico': blank(t.scientific), Família: blank(t.family), Origem: blank(t.origin),
    'CAP (cm)': blank(t.cap), 'DAP (cm)': blank(t.dap), 'Altura (m)': blank(t.height),
    'Estado geral': blank(t.condition), 'Estado fitossanitário': blank(t.phytosanitary),
    Pragas: blank(t.pests), Doenças: blank(t.diseases), 'Necessidade de poda': blank(t.pruningNeeded),
    'Conflito com fiação': blank(t.wireConflict), 'Conflito com calçada': blank(t.sidewalkConflict),
    Latitude: blank(t.latitude), Longitude: blank(t.longitude), 'Data do levantamento': blank(t.surveyDate),
    Responsável: blank(t.responsible), 'Status de publicação': blank(t.publicationStatus),
    'Atualizado em': blank(t.updatedAt)
  }));
  const maintenance = trees.flatMap(t => (t.maintenance || []).map(m => ({
    Código: t.code, 'Nome popular': t.common || '', Data: m.date || '',
    Tipo: m.type || '', Descrição: m.description || '', Responsável: m.responsible || ''
  })));
  const photos = trees.flatMap(t => (t.photos || []).map(p => ({
    Código: t.code, 'Nome popular': t.common || '', Categoria: p.category || p.type || '',
    Legenda: p.caption || p.name || '', 'Arquivo/URL': p.url || p.storagePath || p.data || ''
  })));
  const qrs = trees.map(t => ({
    Código: t.code, Número: t.number, 'Link da ficha': t.publicUrl || `${publicBaseUrl}?tree=${encodeURIComponent(t.code)}`,
    'QR Code (endereço codificado)': `${publicBaseUrl}?tree=${encodeURIComponent(t.code)}`, 'Situação da placa': t.plateStatus || 'not_installed',
    'Status da ficha': t.publicationStatus || 'Rascunho'
  }));
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of [['Inventário', inventory], ['Manejo', maintenance], ['Fotografias', photos], ['QR Codes', qrs]]) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
  }
  XLSX.writeFile(wb, `inventario-arboreo-nazareno-${new Date().toISOString().slice(0,10)}.xlsx`);
}
