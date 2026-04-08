const fs = require('fs');
const content = fs.readFileSync('frontend/js/ui.js', 'utf8');
// Normalize to LF only
let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

let changed = 0;

// Helper to check and replace
function rep(label, from, to) {
  if (text.includes(from)) {
    text = text.replace(from, to);
    changed++;
    console.log(label + ' OK');
  } else {
    console.log(label + ' NOT FOUND');
  }
}

// 1. Replace fillResponsablesSelects + fillTareasSelect together
// Use string literals carefully - the target has template literals with backticks
// We need to search for partial content without template issues
const idx1 = text.indexOf('function fillResponsablesSelects() {\n    const resps = _responsables;');
const idx2 = text.indexOf('if (presetTaskId) sel.value = presetTaskId;\n  }', idx1);
if (idx1 > 0 && idx2 > 0) {
  const endIdx = idx2 + 'if (presetTaskId) sel.value = presetTaskId;\n  }'.length;
  const oldSlice = text.substring(idx1 - 2, endIdx); // include 2 spaces indent
  const newSlice = `function fillResponsablesSelects() {
    const combined = [
      ..._responsables.map(r => ({ id: 'R-'+r.id_resp, name: '[Resp] '+r.nombre, old: String(r.id_resp) })),
      ..._subresponsables.map(s => ({ id: 'S-'+s.id_subresp, name: '[Sub] '+s.nombre, old: String(s.id_subresp) }))
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
        if (cur.startsWith('R-') || cur.startsWith('S-')) {
          sel.value = cur;
        } else {
          const match = combined.find(x => x.old === cur);
          if (match) sel.value = match.id;
        }
      }
    });
  }

  /* ── Poblar select de proyectos ────────────────────────────────── */
  function fillProjectsSelect(presetProjectId = null) {
    const sel = document.getElementById('field-pur-proyecto');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>' +
      _projects.map(p => \`<option value="\${p.id_proyecto}"\${p.id_proyecto == presetProjectId ? ' selected' : ''}>\${p.nombre_proyecto}</option>\`).join('');
    if (presetProjectId) sel.value = presetProjectId;
  }

  /* ── Poblar select de tareas (filtrado por proyecto) ─────────── */
  function fillTareasSelect(presetTaskId = null) {
    const sel = document.getElementById('field-pur-tarea');
    const projSel = document.getElementById('field-pur-proyecto');
    if (!sel) return;
    const projId = projSel ? projSel.value : null;
    const filteredTasks = projId ? _allTasks.filter(t => String(t.id_proyecto) === String(projId)) : _allTasks;
    sel.innerHTML = '<option value="">-- Sin tarea asociada --</option>' +
      filteredTasks.map(t => {
        const label = \`[\${t.tarea || t.id_tarea}] \${t.descripcion || ''}\`;
        return \`<option value="\${t.id_tarea}"\${t.id_tarea == presetTaskId ? ' selected' : ''}>\${label}</option>\`;
      }).join('');
    if (presetTaskId) sel.value = presetTaskId;
  }`;
  text = text.substring(0, idx1 - 2) + '  ' + newSlice + text.substring(endIdx);
  changed++;
  console.log('1. fillBoth replaced OK');
} else {
  console.log('1. fillBoth NOT FOUND idx1=' + idx1 + ' idx2=' + idx2);
}

// 2. Fix new purchase: add fillProjectsSelect call
rep('2. openPurchaseModal new purchase',
  '    fillResponsablesSelects();\n    fillTareasSelect(presetTaskId);',
  `    fillResponsablesSelects();
    // Pre-seleccionar proyecto si viene de una tarea
    if (presetTaskId) {
      const linkedTask = _allTasks.find(t => t.id_tarea == presetTaskId);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(presetTaskId);`
);

// 3. Fix edit purchase: load project before tarea
const markerEdit = "        f('field-pur-producto',   p.producto || '');";
const markerEditEnd = "        f('field-pur-desc',       p.descripcion || '');";
const idxEdit = text.indexOf(markerEdit);
if (idxEdit > 0) {
  const prefix = `        // Pre-seleccionar proyecto para filtrar tareas
        if (p.id_tarea) {
          const linkedTask = _allTasks.find(t => t.id_tarea == p.id_tarea);
          if (linkedTask) { fillProjectsSelect(linkedTask.id_proyecto); fillTareasSelect(p.id_tarea); }
          else fillTareasSelect(p.id_tarea);
        }
`;
  text = text.substring(0, idxEdit) + prefix + text.substring(idxEdit);
  // Also remove the old f('field-pur-tarea', ...) line
  text = text.replace("        f('field-pur-tarea',      p.id_tarea || '');\n", '');
  changed++;
  console.log('3. edit purchase project select added OK');
} else {
  console.log('3. edit purchase NOT FOUND');
}

// 4. Fix purchases view: ganttHere must stay visible
rep('4. view purchases display',
  "    } else if (view === 'purchases') {\n      ganttHere.style.display = 'none';\n      purView.style.display   = 'flex';",
  "    } else if (view === 'purchases') {\n      ganttHere.style.display = '';\n      purView.style.display   = 'flex';"
);

// 5. Init signature and vars
rep('5. init signature',
  '  async function init(tasks, responsables) {\n    _allTasks      = tasks;\n    _responsables  = responsables;',
  `  async function init(tasks, responsables, subresps, projects) {
    _allTasks        = tasks || [];
    _responsables    = responsables || [];
    _subresponsables = subresps || [];
    _projects        = projects || [];`
);

// 6. Add proyecto listener in init
rep('6. field-pur-proyecto listener',
  "    // Listeners del modal de compra\n    initEstadoDropdown();\n\n    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);",
  `    // Listeners del modal de compra
    initEstadoDropdown();

    document.getElementById('field-pur-proyecto')?.addEventListener('change', () => fillTareasSelect());
    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);`
);

// 7. Bootstrap: single-line init call
rep('7. bootstrap PurchaseModule.init',
  "  await PurchaseModule.init(UI.getAllTasks(), UI.getResponsables());",
  `  await PurchaseModule.init(
    UI.getAllTasks(),
    UI.getResponsables(),
    UI.getSubresponsables(),
    UI.getProjects()
  );`
);

// 8. Bootstrap: selectProject wrapper
rep('8. bootstrap wrapper',
  "    PurchaseModule.init(UI.getAllTasks(), UI.getResponsables());",
  `    PurchaseModule.init(
      UI.getAllTasks(),
      UI.getResponsables(),
      UI.getSubresponsables(),
      UI.getProjects()
    );`
);

console.log('Total changed: ' + changed + '/8');
fs.writeFileSync('frontend/js/ui.js', text.replace(/\n/g, '\r\n'), 'utf8');
console.log('Done.');
