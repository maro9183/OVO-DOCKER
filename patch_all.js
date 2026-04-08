const fs = require('fs');
let content = fs.readFileSync('frontend/js/ui.js', 'utf8');

// Normalize line endings for replacement
let text = content.replace(/\r\n/g, '\n');

// 1. Export getProjects & getSubresponsables
const old_export = `    getResponsables: () => responsables,
    getAllTasks: () => allTasks
  };
})();`;
const new_export = `    getResponsables: () => responsables,
    getSubresponsables: () => subresponsables,
    getProjects: () => projects,
    getAllTasks: () => allTasks
  };
})();`;
text = text.replace(old_export, new_export);

// 2. PurchaseModule variables definition
const old_vars = `  let _allTasks         = [];
  let _responsables     = [];
  let _currentView      = 'tasks';`;
const new_vars = `  let _allTasks         = [];
  let _responsables     = [];
  let _subresponsables  = [];
  let _projects         = [];
  let _currentView      = 'tasks';`;
text = text.replace(old_vars, new_vars);

// 3. fillResponsablesSelects inside PurchaseModule
const old_fill_resp = `  /* ── Poblar selects de responsables ────────────────────────── */
  function fillResponsablesSelects() {
    const resps = _responsables;
    ['field-pur-solicitante', 'field-pur-responsable'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
        resps.map(r => \`<option value="\${r.id_resp}">\${r.nombre}</option>\`).join('');
      if (cur) sel.value = cur;
    });
  }`;
const new_fill_resp = `  /* ── Poblar selects de responsables ────────────────────────── */
  function fillResponsablesSelects() {
    const combined = [
      ..._responsables.map(r => ({ id: 'R-'+r.id_resp, name: '[Resp] '+r.nombre, old: r.id_resp })),
      ..._subresponsables.map(s => ({ id: 'S-'+s.id_subresp, name: '[Sub] '+s.nombre, old: s.id_subresp }))
    ];
    ['field-pur-solicitante', 'field-pur-responsable'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      let html = '<option value="">-- Seleccionar --</option>';
      for (const c of combined) {
        html += \`<option value="\${c.id}">\${c.name}</option>\`;
      }
      sel.innerHTML = html;
      
      if (cur) {
        if (!cur.startsWith('R-') && !cur.startsWith('S-')) {
          const match = combined.find(x => x.old == cur);
          if (match) sel.value = match.id;
        } else {
          sel.value = cur;
        }
      }
    });
  }`;
text = text.replace(old_fill_resp, new_fill_resp);

// 4. fillTareasSelect & new fillProjectsSelect
const old_fill_tareas = `  /* ── Poblar select de tareas ────────────────────────────────── */
  function fillTareasSelect(presetTaskId = null) {
    const sel = document.getElementById('field-pur-tarea');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Sin tarea asociada --</option>' +
      _allTasks.map(t => {
        const label = \`[\${t.tarea || t.id_tarea}] \${t.descripcion || ''}\`;
        return \`<option value="\${t.id_tarea}"\${t.id_tarea == presetTaskId ? ' selected' : ''}>\${label}</option>\`;
      }).join('');
    if (presetTaskId) sel.value = presetTaskId;
  }`;
const new_fill_tareas = `  /* ── Poblar select de tareas y proyectos ────────────────────── */
  function fillProjectsSelect(presetProjectId = null) {
    const sel = document.getElementById('field-pur-proyecto');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>' +
      _projects.map(p => \`<option value="\${p.id_proyecto}"\${p.id_proyecto == presetProjectId ? ' selected' : ''}>\${p.nombre_proyecto}</option>\`).join('');
    if (presetProjectId) sel.value = presetProjectId;
  }

  function fillTareasSelect(presetTaskId = null) {
    const sel = document.getElementById('field-pur-tarea');
    const projSel = document.getElementById('field-pur-proyecto');
    if (!sel) return;
    
    // Si hay un proyecto seleccionado, filtramos
    const projId = projSel ? projSel.value : null;
    const filteredTasks = projId ? _allTasks.filter(t => t.id_proyecto == projId) : _allTasks;

    sel.innerHTML = '<option value="">-- Sin tarea asociada --</option>' +
      filteredTasks.map(t => {
        const label = \`[\${t.tarea || t.id_tarea}] \${t.descripcion || ''}\`;
        return \`<option value="\${t.id_tarea}"\${t.id_tarea == presetTaskId ? ' selected' : ''}>\${label}</option>\`;
      }).join('');
    if (presetTaskId) sel.value = presetTaskId;
  }`;
text = text.replace(old_fill_tareas, new_fill_tareas);

// 4.1 Edit OpenPurchaseModal - Editing existing purchase
const old_open_1 = `    fillTareasSelect(purchaseToEdit.id_tarea);`;
const new_open_1 = `    if (purchaseToEdit.id_tarea) {
      const linkedTask = _allTasks.find(t => t.id_tarea == purchaseToEdit.id_tarea);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(purchaseToEdit.id_tarea);`;
text = text.replace(old_open_1, new_open_1);

// 4.2 Edit OpenPurchaseModal - New purchase
const old_open_2 = `    fillTareasSelect(presetTaskId);`;
const new_open_2 = `    if (presetTaskId) {
      const linkedTask = _allTasks.find(t => t.id_tarea == presetTaskId);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(presetTaskId);`;
text = text.replace(old_open_2, new_open_2);

// 5. Fix purchases View visibility
const old_view = `    } else if (view === 'purchases') {
      ganttHere.style.display = 'none';
      purView.style.display   = 'flex';`;
const new_view = `    } else if (view === 'purchases') {
      ganttHere.style.display = '';
      purView.style.display   = 'flex';`;
text = text.replace(old_view, new_view);

// 6. Init Function Signature inside PurchaseModule
const old_init = `  /* ── Init ───────────────────────────────────────────────────── */
  async function init(tasks, responsables) {
    _allTasks      = tasks;
    _responsables  = responsables;`;
const new_init = `  /* ── Init ───────────────────────────────────────────────────── */
  async function init(tasks, responsables, subresps, projects) {
    _allTasks        = tasks || [];
    _responsables    = responsables || [];
    _subresponsables = subresps || [];
    _projects        = projects || [];`;
text = text.replace(old_init, new_init);

// 7. Add field-pur-proyecto listener
const old_listener = `    // Listeners del modal de compra
    initEstadoDropdown();

    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`;
const new_listener = `    // Listeners del modal de compra
    initEstadoDropdown();

    document.getElementById('field-pur-proyecto')?.addEventListener('change', () => fillTareasSelect());
    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`;
text = text.replace(old_listener, new_listener);

// 8. Bootstrap Init call
const old_boot = `await PurchaseModule.init(UI.getAllTasks(), UI.getResponsables());`;
const new_boot = `await PurchaseModule.init(
    UI.getAllTasks(),
    UI.getResponsables(),
    UI.getSubresponsables(),
    UI.getProjects()
  );`;
text = text.split(old_boot).join(new_boot);

// Write back with CRLF
fs.writeFileSync('frontend/js/ui.js', text.replace(/\n/g, '\r\n'), 'utf8');
console.log('Script completed.');
