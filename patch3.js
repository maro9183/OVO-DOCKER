const fs = require('fs');
let content = fs.readFileSync('frontend/js/ui.js', 'utf8');

// CHANGE 1: Export subresponsables & projects from UI
content = content.replace(
  `    getResponsables: () => responsables,\n    getAllTasks: () => allTasks\n  };\n})();`,
  `    getResponsables: () => responsables,\n    getSubresponsables: () => subresponsables,\n    getProjects: () => projects,\n    getAllTasks: () => allTasks\n  };\n})();`
);

// CHANGE 2: Add variables and fill logic to PurchaseModule
const origFillResps = `  /* ── Poblar selects de responsables ────────────────────────── */
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
const newFillResps = `  let _subresponsables  = [];
  let _projects         = [];

  /* ── Poblar selects de responsables ────────────────────────── */
  function fillResponsablesSelects() {
    const combined = [
      ..._responsables.map(r => ({ id: \`R-\${r.id_resp}\`, temp_id: r.id_resp, name: \`[Resp] \${r.nombre}\` })),
      ..._subresponsables.map(s => ({ id: \`S-\${s.id_subresp}\`, temp_id: s.id_subresp, name: \`[Sub] \${s.nombre}\` }))
    ];
    ['field-pur-solicitante', 'field-pur-responsable'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      let html = '<option value="">-- Seleccionar --</option>';
      for (const r of combined) {
        html += \`<option value="\${r.id}">\${r.name}</option>\`;
      }
      sel.innerHTML = html;
      
      // Intentar auto-seleccionar el mismo (si es un id viejo o si ya tiene formato)
      if (cur) {
        if (!cur.startsWith('R-') && !cur.startsWith('S-')) {
          // Compatibility mode for existing integer values
          const old = combined.find(c => c.temp_id == cur);
          if (old) sel.value = old.id;
        } else {
          sel.value = cur;
        }
      }
    });
  }`;
content = content.replace(origFillResps, newFillResps);

// CHANGE 3: Projects + Tareas selects
const origFillTareas = `  /* ── Poblar select de tareas ────────────────────────────────── */
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

const newFillTareas = `  /* ── Poblar select de tareas y proyectos ────────────────────── */
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
content = content.replace(origFillTareas, newFillTareas);


// CHANGE 4: Add project to editing purchase
const origOpenPurchaseModal = `    fillTareasSelect(purchaseToEdit.id_tarea);`;
const newOpenPurchaseModal  = `    if (purchaseToEdit.id_tarea) {
      const linkedTask = _allTasks.find(t => t.id_tarea == purchaseToEdit.id_tarea);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(purchaseToEdit.id_tarea);`;
content = content.replace(origOpenPurchaseModal, newOpenPurchaseModal);

// CHANGE 4.1: New Purchase Branch
const origOpenPurchaseNew = `    fillTareasSelect(presetTaskId);`;
const newOpenPurchaseNew = `    if (presetTaskId) {
      const linkedTask = _allTasks.find(t => t.id_tarea == presetTaskId);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(presetTaskId);`;
content = content.replace(origOpenPurchaseNew, newOpenPurchaseNew);


// CHANGE 5: Make sure view=purchases uses gantt_here correctly
const origViewPurchases = `    } else if (view === 'purchases') {
      ganttHere.style.display = 'none';
      purView.style.display   = 'flex';`;
const newViewPurchases = `    } else if (view === 'purchases') {
      ganttHere.style.display = '';
      purView.style.display   = 'flex';`;
content = content.replace(origViewPurchases, newViewPurchases);

// CHANGE 6: Update INIT signature inside PurchaseModule
content = content.replace(
  `async function init(tasks, responsables) {`,
  `async function init(tasks, responsables, subresps, projects) {`
);

content = content.replace(
  `    _allTasks      = tasks;\n    _responsables  = responsables;`,
  `    _allTasks        = tasks || [];\n    _responsables    = responsables || [];\n    _subresponsables = subresps || [];\n    _projects        = projects || [];`
);

// CHANGE 7: Add listener for field-pur-proyecto inside INIT
const origInitEvent = `document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`;
const newInitEvent = `document.getElementById('field-pur-proyecto')?.addEventListener('change', () => fillTareasSelect());\n    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`;
content = content.replace(origInitEvent, newInitEvent);

// CHANGE 8: Bootstrap update
const origBootstrap1 = `await PurchaseModule.init(UI.getAllTasks(), UI.getResponsables());`;
const newBootstrap1 = `await PurchaseModule.init(UI.getAllTasks(), UI.getResponsables(), UI.getSubresponsables(), UI.getProjects());`;
content = content.replaceAll(origBootstrap1, newBootstrap1);

fs.writeFileSync('frontend/js/ui.js', content, 'utf8');
console.log('Patch complete.');
