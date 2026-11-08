import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

const toLocal = async row => {
  const photos = await Promise.all((row.tree_photos || []).map(async p => {
    const { data } = await supabase.storage.from('tree-photos').createSignedUrl(p.storage_path, 3600);
    return { id:p.id, category:p.photo_type, caption:p.caption || '', url:data?.signedUrl || '', storagePath:p.storage_path };
  }));
  return {
    id:row.id, number:row.tree_number, code:row.code, common:row.common_name || '',
    scientific:row.scientific_name || '', family:row.botanical_family || '', origin:row.origin,
    identification:row.identification_status, height:row.estimated_height_m || '',
    cap:row.cap_cm || '', dap:row.dap_cm || '', condition:row.general_condition || '',
    phytosanitary:row.phytosanitary_status || '', pests:row.pests || '', diseases:row.diseases || '',
    pruningNeeded:row.pruning_needed, wireConflict:row.wire_conflict, sidewalkConflict:row.sidewalk_conflict,
    latitude:row.latitude ?? '', longitude:row.longitude ?? '', surveyDate:row.survey_date || '',
    responsible:row.responsible || '', observations:row.observations || '',
    environmentalImportance:row.environmental_importance || '', educationalFact:row.educational_fact || '',
    publicationStatus:row.publication_status, plateStatus:row.plate_status || 'not_installed', updatedAt:row.updated_at,
    photos, maintenance:(row.tree_maintenance || []).map(m => ({
      id:m.id, date:m.event_date, type:({inspection:'Inspeção',pruning:'Poda',pest_control:'Controle de pragas',disease_treatment:'Tratamento de doença',risk_assessment:'Avaliação de risco',planting:'Plantio',removal:'Remoção',other:'Outro'})[m.event_type] || m.event_type, description:m.description, responsible:m.performed_by || ''
    }))
  };
};

export async function loadCloudTrees() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('trees')
    .select('*,tree_photos(*),tree_maintenance(*)')
    .order('tree_number', { ascending:true });
  if (error) throw error;
  return Promise.all((data || []).map(toLocal));
}

export async function saveCloudTree(tree, userId) {
  if (!supabase) throw new Error('Banco de dados não configurado.');
  const { data:area, error:areaError } = await supabase.from('areas').select('id').eq('code_prefix','PRA').single();
  if (areaError) throw areaError;
  const row = {
    ...(tree.id && tree.id.length === 36 ? {id:tree.id} : {}),
    area_id:area.id, tree_number:Number(tree.number), code:tree.code,
    common_name:tree.common || null, scientific_name:tree.scientific || null,
    botanical_family:tree.family || null, origin:tree.origin || 'unknown',
    identification_status:tree.identification || 'pending',
    estimated_height_m:tree.height ? Number(tree.height) : null,
    cap_cm:tree.cap ? Number(tree.cap) : null, general_condition:tree.condition || null,
    phytosanitary_status:tree.phytosanitary || null, pests:tree.pests || null, diseases:tree.diseases || null,
    pruning_needed:tree.pruningNeeded === '' ? null : tree.pruningNeeded === true || tree.pruningNeeded === 'true',
    wire_conflict:tree.wireConflict === '' ? null : tree.wireConflict === true || tree.wireConflict === 'true',
    sidewalk_conflict:tree.sidewalkConflict === '' ? null : tree.sidewalkConflict === true || tree.sidewalkConflict === 'true',
    latitude:tree.latitude === '' ? null : Number(tree.latitude),
    longitude:tree.longitude === '' ? null : Number(tree.longitude),
    survey_date:tree.surveyDate || null, responsible:tree.responsible || null,
    observations:tree.observations || null, environmental_importance:tree.environmentalImportance || null,
    educational_fact:tree.educationalFact || null, publication_status:tree.publicationStatus || 'draft', plate_status:tree.plateStatus || 'not_installed',
    updated_by:userId
  };
  const { data:saved, error } = await supabase.from('trees').upsert(row,{onConflict:'code'}).select('id').single();
  if (error) throw error;
  for (const item of (tree.maintenance || [])) {
    if (item.id) continue;
    const eventType=({'Inspeção':'inspection','Poda':'pruning','Controle de pragas':'pest_control','Tratamento de doença':'disease_treatment','Avaliação de risco':'risk_assessment','Plantio':'planting','Remoção':'removal','Outro':'other'})[item.type] || 'other';
    const inserted=await supabase.from('tree_maintenance').insert({tree_id:saved.id,event_type:eventType,event_date:item.date,description:item.description,performed_by:item.responsible || null,created_by:userId});
    if(inserted.error) throw inserted.error;
  }
  for (const photo of (tree.photos || [])) {
    if (photo.storagePath || !photo.data) continue;
    const blob = await (await fetch(photo.data)).blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const path = `${saved.id}/${photo.category || 'other'}-${crypto.randomUUID()}.${ext}`;
    const upload = await supabase.storage.from('tree-photos').upload(path,blob,{contentType:blob.type,upsert:false});
    if (upload.error) throw upload.error;
    const inserted = await supabase.from('tree_photos').insert({
      tree_id:saved.id, photo_type:photo.category || 'other', storage_path:path,
      caption:photo.caption || null, created_by:userId
    });
    if (inserted.error) throw inserted.error;
  }
  return saved.id;
}

export async function deleteCloudTree(id) {
  if (!supabase) return;
  const { error } = await supabase.from('trees').delete().eq('id',id);
  if (error) throw error;
}
