const fs = require('fs');
let content = fs.readFileSync('frontend/js/ui.js', 'utf8');

// Normalize line endings
let text = content.replace(/\r\n/g, '\n');

text = text.replace(
  `    getResponsables: () => responsables,\n    getAllTasks: () => allTasks\n  };\n})();`,
  `    getResponsables: () => responsables,\n    getSubresponsables: () => subresponsables,\n    getProjects: () => projects,\n    getAllTasks: () => allTasks\n  };\n})();`
);

text = text.replace(
  `  let _allTasks         = [];\n  let _responsables     = [];\n  let _currentView      = 'tasks';`,
  `  let _allTasks         = [];\n  let _responsables     = [];\n  let _subresponsables  = [];\n  let _projects         = [];\n  let _currentView      = 'tasks';`
);

let parts = text.split(`  function fillResponsablesSelects() {\n    const resps = _responsables;\n    ['field-pur-solicitante', 'field-pur-responsable'].forEach(id => {\n      const sel = document.getElementById(id);\n      if (!sel) return;\n      const cur = sel.value;\n      sel.innerHTML = '<option value="">-- Seleccionar --</option>' +\n        resps.map(r => \`<option value="\${r.id_resp}">\${r.nombre}</option>\`).join('');\n      if (cur) sel.value = cur;\n    });\n  }`);
if (parts.length === 2) {
  text = parts[0] + `  function fillResponsablesSelects() {
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
  }` + parts[1];
} else { console.log('fillResponsablesSelects failed'); }

parts = text.split(`  function fillTareasSelect(presetTaskId = null) {\n    const sel = document.getElementById('field-pur-tarea');\n    if (!sel) return;\n    sel.innerHTML = '<option value="">-- Sin tarea asociada --</option>' +\n      _allTasks.map(t => {\n        const label = \`[\${t.tarea || t.id_tarea}] \${t.descripcion || ''}\`;\n        return \`<option value="\${t.id_tarea}"\${t.id_tarea == presetTaskId ? ' selected' : ''}>\${label}</option>\`;\n      }).join('');\n    if (presetTaskId) sel.value = presetTaskId;\n  }`);
if (parts.length === 2) {
  text = parts[0] + `  function fillProjectsSelect(presetProjectId = null) {
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
  }` + parts[1];
} else { console.log('fillTareasSelect failed'); }

text = text.replace(`    fillTareasSelect(purchaseToEdit.id_tarea);`, `    if (purchaseToEdit.id_tarea) {
      const linkedTask = _allTasks.find(t => t.id_tarea == purchaseToEdit.id_tarea);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(purchaseToEdit.id_tarea);`);

text = text.replace(`    fillTareasSelect(presetTaskId);`, `    if (presetTaskId) {
      const linkedTask = _allTasks.find(t => t.id_tarea == presetTaskId);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(presetTaskId);`);

text = text.replace(`    } else if (view === 'purchases') {\n      ganttHere.style.display = 'none';\n      purView.style.display   = 'flex';`, `    } else if (view === 'purchases') {\n      ganttHere.style.display = '';\n      purView.style.display   = 'flex';`);

text = text.replace(`  async function init(tasks, responsables) {\n    _allTasks      = tasks;\n    _responsables  = responsables;`, `  async function init(tasks, responsables, subresps, projects) {\n    _allTasks        = tasks || [];\n    _responsables    = responsables || [];\n    _subresponsables = subresps || [];\n    _projects        = projects || [];`);

text = text.replace(`    // Listeners del modal de compra\n    initEstadoDropdown();\n\n    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`, `    // Listeners del modal de compra\n    initEstadoDropdown();\n\n    document.getElementById('field-pur-proyecto')?.addEventListener('change', () => fillTareasSelect());\n    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`);

text = text.split(`await PurchaseModule.init(UI.getAllTasks(), UI.getResponsables());`).join(`await PurchaseModule.init(
    UI.getAllTasks(),
    UI.getResponsables(),
    UI.getSubresponsables(),
    UI.getProjects()
  );`);

fs.writeFileSync('frontend/js/ui.js', text.replace(/\n/g, '\r\n'), 'utf8');
console.log('Script without comments executed.');
