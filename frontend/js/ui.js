/* ============================================================
   UI — Modals, toasts, sidebar, app state
   ============================================================ */
window.UI = (() => {
  let projects       = [];
  let responsables   = [];
  let subresponsables = [];
  let recursos       = [];
  let allTasks       = []; // tareas del proyecto activo
  let editingTaskId  = null;
  let editingProjectId = null;
  let editingResponsableId = null;
  let editingSubrespId = null;
  let editingRecursoId = null;
  let notesTaskId    = null;

  /* ── Toast ─────────────────────────────────────────────── */
  function toast(msg, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove());
    }, 3500);
  }

  /* ── Sidebar & Projects ─────────────────────────────────── */
  async function loadProjects() {
    try {
      projects = await API.getProjects();
      GanttApp.setProjectsMap(projects);
      renderProjectList();
      if (projects.length > 0) {
        await selectAllProjects();
      }
    } catch (e) { toast('Error al cargar proyectos', 'error'); }
  }

  function renderProjectList() {
    const list = document.getElementById('project-list');
    if (!projects.length) {
      list.innerHTML = `<div style="padding:12px 10px;color:var(--text-dim);font-size:11px">Sin proyectos. Creá uno ↓</div>`;
      return;
    }
    const active = GanttApp.getCurrentProjectId();
    const isAll = active === '__all__';

    // "Todos los proyectos" item
    let html = `
      <div class="all-projects-item ${isAll ? 'active' : ''}" id="btn-all-projects">
        <span class="all-projects-dot"></span>
        <span class="project-name">MENÚ</span>
      </div>`;

    html += projects.map(p => `
      <div class="project-item ${!isAll && p.id_proyecto == active ? 'active' : ''}"
           data-id="${p.id_proyecto}" data-color="${p.color}"
           style="--active-color:${p.color}">
        <span class="project-dot" style="background:${p.color}"></span>
        <span class="project-name" title="${p.nombre_proyecto}">${p.nombre_proyecto}</span>
        <div class="project-actions">
          <button class="btn-project-action btn-edit-proj" title="Editar proyecto">✏️</button>
          <button class="btn-project-action delete btn-delete-proj" title="Eliminar proyecto">🗑</button>
        </div>
      </div>
    `).join('');

    list.innerHTML = html;

    list.querySelectorAll('.project-item').forEach(el => {
      // Click en el item (seleccionar)
      el.addEventListener('click', (e) => {
        // Evitar que el click en los botones dispare el selectProject
        if (e.target.closest('.project-actions')) return;
        selectProject(+el.dataset.id, el.dataset.color);
      });

      // Click en Editar
      const btnEdit = el.querySelector('.btn-edit-proj');
      if (btnEdit) btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openProjectModal(+el.dataset.id);
      });

      // Click en Borrar
      const btnDel = el.querySelector('.btn-delete-proj');
      if (btnDel) btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteProject(+el.dataset.id);
      });
    });
    const btnAll = document.getElementById('btn-all-projects');
    if (btnAll) btnAll.addEventListener('click', selectAllProjects);
  }

  async function selectAllProjects() {
    document.getElementById('project-title').textContent = 'Cargando...';
    try {
      allTasks = await GanttApp.loadAllProjects();
      document.getElementById('project-title').textContent = 'MENÚ';
      document.getElementById('project-badge').textContent = '';
      document.getElementById('project-badge').style.display = 'none';
      renderProjectList();
      showMainUI();
    } catch (e) { toast('Error al cargar proyectos', 'error'); console.error(e); }
  }

  async function selectProject(id, color) {
    document.getElementById('project-title').textContent = 'Cargando...';
    try {
      await GanttApp.loadProject(id, color);
      const p = projects.find(x => x.id_proyecto == id);
      document.getElementById('project-title').textContent = p ? p.nombre_proyecto : 'Proyecto';
      document.getElementById('project-badge').textContent = p ? p.proyecto : '';
      document.getElementById('project-badge').style.display = '';
      document.getElementById('project-badge').style.color = color;
      document.getElementById('project-badge').style.background = color + '22';

      // Tarea: recargar lista para el modal de dependencias
      allTasks = await API.getProjectTasks(id);
      renderProjectList();
      showMainUI();
    } catch (e) { toast('Error al cargar tareas', 'error'); }
  }

  function showMainUI() {
    document.getElementById('toolbar-actions').style.display = 'flex';
    const fb = document.getElementById('filter-bar');
    if (fb) fb.style.display = 'flex';
    const sb = document.getElementById('status-bar');
    if (sb) sb.style.display = 'flex';
    populateFilterDropdowns();
  }

  function populateFilterDropdowns() {
    // Responsable
    const fResp = document.getElementById('filter-responsable');
    if (fResp) {
      const current = fResp.value;
      fResp.innerHTML = '<option value="">Responsable \u25bc</option>';
      responsables.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.correo;
        opt.textContent = r.nombre;
        fResp.appendChild(opt);
      });
      fResp.value = current;
    }
    // Proyecto
    const fProj = document.getElementById('filter-proyecto');
    if (fProj) {
      const current = fProj.value;
      fProj.innerHTML = '<option value="">Proyecto \u25bc</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nombre_proyecto;
        opt.textContent = p.nombre_proyecto;
        fProj.appendChild(opt);
      });
      fProj.value = current;
    }
  }

  /* ── Task Modal ─────────────────────────────────────────── */
  function openTaskModal(param) {
    // param puede ser id (number) o ganttTask (object del dhtmlx)
    let task_id = null;
    let ganttTask = null;
    if (param && typeof param === 'object') {
       ganttTask = param;
       task_id = ganttTask.id;
    } else {
       task_id = param;
    }

    editingTaskId = task_id;
    const raw = editingTaskId ? allTasks.find(t => t.id_tarea == editingTaskId) : null;
    
    document.getElementById('modal-task-title').textContent = editingTaskId ? 'Editar Tarea' : 'Nueva Tarea';
    document.getElementById('btn-delete-task').style.display = editingTaskId ? 'block' : 'none';

    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    f('field-tarea',       raw?.tarea        || '');
    f('field-descripcion', raw?.descripcion  || '');
    f('field-costo',       raw?.costo_tarea  || 0);

    // Fecha inicio: priorizar drag del gantt si existe
    let startVal = raw?.fecha_inicio || today();
    if (ganttTask && ganttTask.start_date) {
      startVal = gantt.date.date_to_str('%Y-%m-%d')(ganttTask.start_date);
    }
    f('field-fecha-inicio', startVal);

    // Duración: priorizar drag del gantt
    let durVal = raw?.duracion_dias || 1;
    if (ganttTask && ganttTask.start_date && ganttTask.end_date) {
      let bDays = 0;
      let cd = new Date(ganttTask.start_date);
      let ed = new Date(ganttTask.end_date);
      while (cd < ed) {
        if (raw?.tipo_dias !== 'laboral' || cd.getDay() !== 0) bDays++;
        cd.setDate(cd.getDate() + 1);
      }
      durVal = Math.max(1, bDays);
    }
    f('field-duracion', durVal);

    // Avance
    const avance = parseFloat(raw?.avance || 0);
    f('field-avance', avance);
    document.getElementById('label-avance').textContent = `${Math.round(avance)}%`;
    document.getElementById('label-avance-r').textContent = `${Math.round(avance)}%`;

    // Proyecto
    const projSel = document.getElementById('field-proyecto');
    projSel.innerHTML = projects.map(p =>
      `<option value="${p.id_proyecto}" ${raw?.id_proyecto == p.id_proyecto ? 'selected' : ''}>${p.nombre_proyecto}</option>`
    ).join('');
    if (!editingTaskId) projSel.value = GanttApp.getCurrentProjectId() || projects[0]?.id_proyecto || '';

    // Tarea Padre (Filtrada por proyecto)
    function updateParentSelect(projectId, selectedParentId = null) {
      const parentSel = document.getElementById('field-parent');
      parentSel.innerHTML = '<option value="">-- Tarea principal (sin padre) --</option>';
      allTasks.forEach(t => {
        if (editingTaskId && t.id_tarea == editingTaskId) return;
        if (t.id_proyecto != projectId) return; // SOLO TAREAS DEL MISMO PROYECTO
        
        const opt = document.createElement('option');
        opt.value = t.id_tarea;
        opt.textContent = t.descripcion || "(Sin nombre)";
        parentSel.appendChild(opt);
      });
      parentSel.value = selectedParentId || '';
    }

    const currentProjId = raw?.id_proyecto || projSel.value;
    updateParentSelect(currentProjId, raw?.id_parent);

    const parentSel = document.getElementById('field-parent');
    parentSel.onchange = () => {
      const pId = parentSel.value;
      renderDependenciasSelect('', projSel.value, pId);
      
      // Herencia de responsable y equipo desde el padre
      if (pId) {
        const parentTask = allTasks.find(t => t.id_tarea == pId);
        if (parentTask && parentTask.responsable) {
          const respSel = document.getElementById('field-responsable');
          respSel.value = parentTask.responsable;
          const selectedOpt = respSel.options[respSel.selectedIndex];
          const leadId = selectedOpt ? selectedOpt.dataset.id : null;
          updateSubrespSelect(leadId, parentTask.id_subresp);
        }
      }
    };

    // Responsable y Equipo
    const respSel = document.getElementById('field-responsable');
    respSel.innerHTML = '<option value="">Seleccionar responsable...</option>';
    responsables.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.correo;
      opt.dataset.id = r.id_resp;
      opt.textContent = `${r.nombre} (${r.correo})`;
      respSel.appendChild(opt);
    });
    respSel.value = raw?.responsable || '';

    respSel.onchange = () => {
      const selectedOpt = respSel.options[respSel.selectedIndex];
      const leadId = selectedOpt ? selectedOpt.dataset.id : null;
      updateSubrespSelect(leadId);
    };
    
    // Poblar subresponsable
    const lead = responsables.find(r => r.correo === raw?.responsable);
    updateSubrespSelect(lead ? lead.id_resp : null, raw?.id_subresp);

    // Tipo días
    const tipo = raw?.tipo_dias || 'calendario';
    document.querySelectorAll('input[name="tipo_dias"]').forEach(r => { r.checked = r.value === tipo; });

    renderRecursosSelect(raw?.recursos || '');
    renderDependenciasSelect(raw?.dependencias || '', projSel.value, raw?.id_parent || '');
    
    projSel.onchange = () => {
      renderDependenciasSelect('', projSel.value, '');
      updateParentSelect(projSel.value, ''); // Actualizar padres al cambiar proyecto
    };

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('field-tarea').focus();

    // Mostrar/ocultar la sección de compras y cargarlas si hay tarea existente
    const purGroup = document.getElementById('group-task-purchases');
    if (purGroup) {
      purGroup.style.display = editingTaskId ? 'block' : 'none';
      if (editingTaskId) {
        const purBtn = document.getElementById('btn-new-purchase-from-task');
        if (purBtn) purBtn.dataset.taskId = editingTaskId;
        PurchaseModule.renderTaskPurchases(editingTaskId);
      }
    }
  }

  function updateSubrespSelect(leadId, selectedId = null) {
    const sel = document.getElementById('field-subresp');
    const team = subresponsables.filter(s => s.id_lead == leadId);
    sel.innerHTML = '<option value="">-- Sin subresponsable --</option>' +
      team.map(s => `<option value="${s.id_subresp}" ${s.id_subresp == selectedId ? 'selected' : ''}>${s.nombre}</option>`).join('');
  }

  function renderRecursosSelect(selected) {
    const wrap = document.getElementById('recursos-wrap');
    if (!wrap) return;
    const selIds = (selected || '').split(',').map(d => d.trim()).filter(Boolean);
    if (!recursos.length) {
      wrap.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No hay recursos cargados</span>';
      return;
    }
    wrap.innerHTML = recursos.map(r => `
      <label class="radio-option" style="margin-bottom:4px;cursor:pointer;font-size:11px">
        <input type="checkbox" name="rec_check" value="${r.id_recurso}" ${selIds.includes(String(r.id_recurso)) ? 'checked' : ''}>
        <span>${r.nombre}</span>
      </label>`).join('');
  }

  function renderDependenciasSelect(selected, projectId, parentId) {
    const wrap = document.getElementById('deps-wrap');
    const selIds = (selected || '').split(',').map(d => d.trim()).filter(Boolean);
    const pId = parentId ? parseInt(parentId) : null;
    
    const available = allTasks.filter(t => 
      t.id_tarea != editingTaskId && 
      t.id_proyecto == projectId &&
      (t.id_parent == pId || (!t.id_parent && !pId))
    );
    if (!available.length) {
      wrap.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No hay otras tareas en este nivel</span>';
      return;
    }
    wrap.innerHTML = available.map(t => `
      <label class="radio-option" style="margin-bottom:4px;cursor:pointer">
        <input type="checkbox" name="dep_check" value="${t.id_tarea}" ${selIds.includes(String(t.id_tarea)) ? 'checked' : ''}>
        <span>${t.descripcion || t.tarea}</span>
      </label>`).join('');
  }

  function getFormData() {
    const tipoDias = document.querySelector('input[name="tipo_dias"]:checked')?.value || 'calendario';
    const depIds   = [...document.querySelectorAll('input[name="dep_check"]:checked')].map(c => c.value);
    const recIds   = [...document.querySelectorAll('input[name="rec_check"]:checked')].map(c => c.value);
    return {
      id_proyecto:   +document.getElementById('field-proyecto').value,
      id_parent:     document.getElementById('field-parent').value ? +document.getElementById('field-parent').value : null,
      id_subresp:    document.getElementById('field-subresp').value ? +document.getElementById('field-subresp').value : null,
      tarea:          document.getElementById('field-tarea').value.trim() || document.getElementById('field-descripcion').value.trim().substring(0, 50),
      descripcion:    document.getElementById('field-descripcion').value.trim() || null,
      fecha_inicio:   document.getElementById('field-fecha-inicio').value,
      duracion_dias:  +document.getElementById('field-duracion').value || 1,
      costo_tarea:    +document.getElementById('field-costo').value || 0,
      responsable:    document.getElementById('field-responsable').value.trim() || null,
      recursos:       recIds.join(',') || null,
      tipo_dias:      tipoDias,
      avance:         +document.getElementById('field-avance').value,
      dependencias:   depIds.join(',') || null
    };
  }

  async function saveTask() {
    const data = getFormData();
    if (!data.descripcion) { toast('El nombre de la tarea es requerido', 'error'); return; }

    const btn = document.getElementById('btn-save-task');
    btn.disabled = true;
    try {
      if (editingTaskId) {
        const r = await API.updateTask(editingTaskId, data);
        allTasks = allTasks.map(t => t.id_tarea == editingTaskId ? r.task : t);
        GanttApp.applyAllUpdated(r.updatedTasks);
        toast('Tarea actualizada', 'success');
      } else {
        const r = await API.createTask(data);
        allTasks.push(r.task);
        if (r.task.id_proyecto == GanttApp.getCurrentProjectId()) GanttApp.addTask(r.task);
        toast('Tarea creada', 'success');
      }
      closeTaskModal();
    } catch (e) {
      toast(e.error || 'Error al guardar', 'error');
    } finally { btn.disabled = false; }
  }

  function closeTaskModal() {
    document.getElementById('modal-task').classList.add('hidden');
    editingTaskId = null;
  }

  /* ── Confirm Modal ─────────────────────────────────────── */
  function showConfirm(title, msg, btnText) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-confirm');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent = msg;
      
      const btnYes = document.getElementById('btn-confirm-yes');
      btnYes.textContent = btnText;
      
      btnYes.onclick = () => { overlay.classList.add('hidden'); resolve(true); };
      document.getElementById('btn-confirm-no').onclick = () => { overlay.classList.add('hidden'); resolve(false); };
      
      overlay.classList.remove('hidden');
    });
  }

  /* ── Delete confirmation ────────────────────────────────── */
  async function confirmDelete(taskId) {
    const agreed = await showConfirm('Eliminar Tarea', '¿Eliminar esta tarea? Esta acción no se puede deshacer.', 'Sí, eliminar');
    if (!agreed) return;
    deleteTask(taskId);
  }

  async function deleteTask(taskId) {
    try {
      await API.deleteTask(taskId);
      allTasks = allTasks.filter(t => t.id_tarea != taskId);
      GanttApp.removeTask(taskId);
      closeTaskModal();
      toast('Tarea eliminada', 'warning');
    } catch (e) { toast(e.error || 'Error al eliminar', 'error'); }
  }

  /* ── Notes Modal ────────────────────────────────────────── */
  async function openNotesModal(taskId) {
    editingNotesTaskId = taskId;
    const t = allTasks.find(x => x.id_tarea == taskId);
    document.getElementById('notes-task-name').textContent = t ? (t.descripcion || t.tarea) : 'Tarea';
    
    // Auto-completar autor con usuario logueado
    const user = Auth.getUser();
    if (user) {
      document.getElementById('field-nota-autor').value = user.nombre || '';
      document.getElementById('field-nota-autor').readOnly = true;
    }

    document.getElementById('modal-notes').classList.remove('hidden');
    await refreshNotes();
  }

  async function refreshNotes() {
    const list = document.getElementById('notes-list');
    list.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Cargando...</div>';
    try {
      const notes = await API.getNotes(editingNotesTaskId);
      if (!notes.length) {
        list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center;">Sin notas todavía.</div>';
        return;
      }
      list.innerHTML = notes.map(n => `
        <div class="note-item" data-id="${n.id_nota}">
          <div class="note-meta">
            <span class="note-author">${escHtml(n.autor || 'Anónimo')}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span>${fmtDate(n.fecha_hora)}</span>
              <button class="note-delete" onclick="UI.deleteNote(${n.id_nota})" title="Eliminar nota">×</button>
            </div>
          </div>
          <div class="note-text">${escHtml(n.nota || '')}</div>
          ${n.link ? `<div style="margin-top:8px"><a href="${n.link}" target="_blank" style="font-size:11px;color:var(--cyan);text-decoration:none;display:flex;align-items:center;gap:4px;"><span>🔗</span> ${n.link}</a></div>` : ''}
        </div>`).join('');
    } catch (e) { list.innerHTML = '<div style="color:var(--red)">Error al cargar notas</div>'; }
  }

  async function saveNote() {
    const nota   = document.getElementById('field-nota').value.trim();
    const autor  = document.getElementById('field-nota-autor').value.trim();
    const link   = document.getElementById('field-nota-link').value.trim();
    if (!nota) { toast('Escribí una nota primero', 'error'); return; }
    try {
      await API.createNote({ tarea: editingNotesTaskId, nota, autor: autor || null, link: link || null });
      document.getElementById('field-nota').value = '';
      document.getElementById('field-nota-link').value = '';
      
      const tid = editingNotesTaskId;
      document.getElementById('modal-notes').classList.add('hidden');
      openTaskModal(tid);
      
      toast('Nota guardada', 'success');
    } catch (e) { toast(e.error || 'Error al guardar nota', 'error'); }
  }

  async function deleteNote(noteId) {
    try {
      await API.deleteNote(noteId);
      await refreshNotes();
    } catch (e) { toast('Error al eliminar nota', 'error'); }
  }

  /* ── Project Modal ──────────────────────────────────────── */
  function openProjectModal(id = null) {
    editingProjectId = id;
    const raw = editingProjectId ? projects.find(p => p.id_proyecto == editingProjectId) : null;

    document.getElementById('modal-project-title').textContent = editingProjectId ? 'Editar Proyecto' : 'Nuevo Proyecto';
    document.getElementById('btn-delete-project').style.display = editingProjectId ? 'block' : 'none';

    document.getElementById('field-proj-codigo').value = raw?.proyecto || '';
    document.getElementById('field-proj-nombre').value = raw?.nombre_proyecto || '';
    document.getElementById('field-proj-desc').value   = raw?.descripcion || '';
    document.getElementById('field-proj-color').value  = raw?.color || '#6366f1';
    
    document.getElementById('modal-project').classList.remove('hidden');
    document.getElementById('field-proj-codigo').focus();
  }

  async function saveProject() {
    const data = {
      proyecto:        document.getElementById('field-proj-codigo').value.trim().toUpperCase(),
      nombre_proyecto: document.getElementById('field-proj-nombre').value.trim(),
      descripcion:     document.getElementById('field-proj-desc').value.trim() || null,
      color:           document.getElementById('field-proj-color').value
    };
    if (!data.proyecto || !data.nombre_proyecto) { toast('Código y nombre requeridos', 'error'); return; }
    const btn = document.getElementById('btn-save-project');
    btn.disabled = true;
    try {
      if (editingProjectId) {
        const p = await API.updateProject(editingProjectId, data);
        projects = projects.map(x => x.id_proyecto == editingProjectId ? p : x);
        toast(`Proyecto "${p.nombre_proyecto}" actualizado`, 'success');
        // Si es el proyecto activo, refrescar título y badge
        if (GanttApp.getCurrentProjectId() == editingProjectId) {
          document.getElementById('project-title').textContent = p.nombre_proyecto;
          document.getElementById('project-badge').textContent = p.proyecto;
          document.getElementById('project-badge').style.color = p.color;
          document.getElementById('project-badge').style.background = p.color + '22';
        }
      } else {
        const p = await API.createProject(data);
        projects.push(p);
        toast(`Proyecto "${p.nombre_proyecto}" creado`, 'success');
        await selectProject(p.id_proyecto, p.color);
      }
      renderProjectList();
      document.getElementById('modal-project').classList.add('hidden');
    } catch (e) { toast(e.error || 'Error al guardar proyecto', 'error'); }
    finally { btn.disabled = false; editingProjectId = null; }
  }

  /* ── Project Delete ─────────────────────────────────────── */
  async function confirmDeleteProject(id) {
    const p = projects.find(x => x.id_proyecto == id);
    if (!p) return;
    
    const agreed = await showConfirm(
      'Eliminar Proyecto', 
      `¿Eliminar el proyecto "${p.nombre_proyecto}"? Esta acción borrará todas sus tareas asociadas y no se puede deshacer.`, 
      'Sí, eliminar todo'
    );
    if (!agreed) return;
    
    try {
      await API.deleteProject(id);
      projects = projects.filter(x => x.id_proyecto != id);
      renderProjectList();
      toast('Proyecto eliminado', 'warning');
      
      // Si el proyecto borrado era el activo, volver al menú
      if (GanttApp.getCurrentProjectId() == id) {
        selectAllProjects();
      }
    } catch (e) { toast(e.error || 'Error al eliminar proyecto', 'error'); }
  }

  /* ── Modals Responsable & Recurso ───────────────────────── */
  function openResponsableModal() {
    editingResponsableId = null;
    document.getElementById('field-resp-nombre').value = '';
    document.getElementById('field-resp-correo').value = '';
    document.getElementById('field-resp-rol').value = '';
    document.getElementById('field-resp-equipo').value = '';
    document.getElementById('modal-responsable').classList.remove('hidden');
    document.getElementById('field-resp-nombre').focus();
  }

  async function saveResponsable() {
    const nombre = document.getElementById('field-resp-nombre').value.trim();
    const correo = document.getElementById('field-resp-correo').value.trim();
    const rol = document.getElementById('field-resp-rol').value.trim() || null;
    const equipo = document.getElementById('field-resp-equipo').value.trim() || null;
    if (!nombre || !correo) { toast('Nombre y correo requeridos', 'error'); return; }
    
    try {
      let r;
      if (editingResponsableId) {
        r = await API.updateResponsable(parseInt(editingResponsableId), { nombre, correo, rol, equipo });
        responsables = responsables.map(x => x.id_resp == editingResponsableId ? r : x);
        toast('Responsable actualizado', 'success');
      } else {
        r = await API.createResponsable({ nombre, correo, rol, equipo });
        responsables.push(r);
        toast('Responsable creado', 'success');
      }
      document.getElementById('modal-responsable').classList.add('hidden');
      // Volver al panel de ajustes actualizado
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');

      if (editingTaskId !== null || !document.getElementById('modal-task').classList.contains('hidden')) {
        const respSel = document.getElementById('field-responsable');
        if (!editingResponsableId) {
          const opt = document.createElement('option');
          opt.value = r.correo;
          opt.textContent = `${r.nombre} (${r.correo})`;
          respSel.appendChild(opt);
        } else {
          for(let opt of respSel.options) {
            if(opt.value === r.correo) opt.textContent = `${r.nombre} (${r.correo})`;
          }
        }
        respSel.value = r.correo;
      }
    } catch (e) { toast(e.error || 'Error al guardar', 'error'); }
  }

  function openRecursoModal() {
    editingRecursoId = null;
    document.getElementById('field-rec-nombre').value = '';
    document.getElementById('field-rec-area').value = '';
    document.getElementById('field-rec-rol').value = '';
    document.getElementById('field-rec-valor').value = '';
    document.getElementById('modal-recurso').classList.remove('hidden');
    document.getElementById('field-rec-nombre').focus();
  }

  async function saveRecurso() {
    const nombre = document.getElementById('field-rec-nombre').value.trim();
    const area = document.getElementById('field-rec-area').value.trim() || null;
    const rol = document.getElementById('field-rec-rol').value.trim() || null;
    const valor_hora = document.getElementById('field-rec-valor').value ? parseFloat(document.getElementById('field-rec-valor').value) : 0;
    if (!nombre) { toast('Nombre requerido', 'error'); return; }
    
    try {
      let r;
      if(editingRecursoId) {
        r = await API.updateRecurso(parseInt(editingRecursoId), { nombre, area, rol, valor_hora });
        recursos = recursos.map(x => x.id_recurso == editingRecursoId ? r : x);
        toast('Recurso actualizado', 'success');
      } else {
        r = await API.createRecurso({ nombre, area, rol, valor_hora });
        recursos.push(r);
        toast('Recurso creado', 'success');
      }
      document.getElementById('modal-recurso').classList.remove('hidden');
      // Volver al panel de ajustes actualizado
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');

      if (editingTaskId !== null || !document.getElementById('modal-task').classList.contains('hidden')) {
        const selIds = [...document.querySelectorAll('input[name="rec_check"]:checked')].map(c => c.value);
        if(!editingRecursoId && !selIds.includes(String(r.id_recurso))) {
          selIds.push(String(r.id_recurso));
        }
        renderRecursosSelect(selIds.join(','));
      }
    } catch (e) { toast(e.error || 'Error al guardar', 'error'); }
  }

  /* ── Config Modal ────────────────────────────────────────── */
  function openConfigModal() {
    document.getElementById('modal-config').classList.remove('hidden');
    renderConfigLists();
  }

  function renderConfigLists() {
    const listResp = document.getElementById('config-responsables-list');
    listResp.innerHTML = responsables.length === 0 
      ? '<div style="color:var(--text-dim);font-size:11px">Sin responsables</div>'
      : responsables.map(r => {
        const team = subresponsables.filter(s => s.id_lead == r.id_resp);
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-header);border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px;color:var(--primary-light)">${escHtml(r.nombre)} (Líder)</div>
              <div style="font-size:10px;color:var(--text-muted)">${escHtml(r.correo)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="UI.openSubrespModal(${r.id_resp})" title="Agregar miembro al equipo">＋ Equipo</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.editResponsable(${r.id_resp})">✏️</button>
            <button class="btn btn-ghost btn-danger btn-sm" onclick="UI.deleteResponsable(${r.id_resp})">🗑</button>
          </div>
          <div style="padding:8px 12px;background:var(--bg)">
            ${team.length === 0 
              ? '<div style="font-size:10px;color:var(--text-dim);font-style:italic">Equipo sin miembros</div>' 
              : team.map(m => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
                  <div style="font-size:11px">• ${escHtml(m.nombre)} <span style="color:var(--text-dim)">(${escHtml(m.correo)})</span></div>
                  <div>
                    <button class="btn btn-ghost btn-sm" style="padding:0 4px" onclick="UI.editSubresp(${m.id_subresp})">✏️</button>
                    <button class="btn btn-ghost btn-danger btn-sm" style="padding:0 4px" onclick="UI.deleteSubresp(${m.id_subresp})">🗑</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>`;
      }).join('');

    const listRec = document.getElementById('config-recursos-list');
    listRec.innerHTML = recursos.length === 0 
      ? '<div style="color:var(--text-dim);font-size:11px">Sin recursos</div>'
      : recursos.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">
          <div style="flex:1">
            <div style="font-weight:600;font-size:12px">${escHtml(r.nombre)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); UI.editRecurso(${r.id_recurso})">✏️</button>
          <button class="btn btn-ghost btn-danger btn-sm" onclick="event.stopPropagation(); UI.deleteRecurso(${r.id_recurso})">🗑</button>
        </div>`).join('');
  }

  function editResponsable(id) {
    const r = responsables.find(x => x.id_resp == id);
    if (!r) return;
    editingResponsableId = id;
    document.getElementById('field-resp-nombre').value = r.nombre || '';
    document.getElementById('field-resp-correo').value = r.correo || '';
    document.getElementById('field-resp-rol').value = r.rol || '';
    document.getElementById('field-resp-equipo').value = r.equipo || '';
    // Ocultar config para que no tape el formulario
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-responsable').classList.remove('hidden');
    document.getElementById('field-resp-nombre').focus();
  }

  async function reqDeleteResponsable(id) {
    const agreed = await showConfirm('Eliminar Responsable', '¿Eliminar este responsable?', 'Eliminar');
    if(!agreed) return;
    try {
      await API.deleteResponsable(id);
      responsables = responsables.filter(x => x.id_resp !== id);
      renderConfigLists();
      toast('Responsable eliminado', 'warning');
    } catch(e) { toast('Error al eliminar', 'error'); }
  }

  function editRecurso(id) {
    const r = recursos.find(x => x.id_recurso == id);
    if (!r) return;
    editingRecursoId = id;
    document.getElementById('field-rec-nombre').value = r.nombre || '';
    document.getElementById('field-rec-area').value = r.area || '';
    document.getElementById('field-rec-rol').value = r.rol || '';
    document.getElementById('field-rec-valor').value = r.valor_hora || '';
    // Ocultar config para que no tape el formulario
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-recurso').classList.remove('hidden');
    document.getElementById('field-rec-nombre').focus();
  }

  async function reqDeleteRecurso(id) {
    const agreed = await showConfirm('Eliminar Recurso', '¿Eliminar este recurso?', 'Eliminar');
    if(!agreed) return;
    try {
      await API.deleteRecurso(id);
      recursos = recursos.filter(x => x.id_recurso !== id);
      renderConfigLists();
      toast('Recurso eliminado', 'warning');
    } catch(e) { toast('Error al eliminar', 'error'); }
  }

  function openSubrespModal(leadId, subId = null) {
    editingSubrespId = subId;
    document.getElementById('field-sub-lead-id').value = leadId;
    
    if (subId) {
      const s = subresponsables.find(x => x.id_subresp == subId);
      document.getElementById('field-sub-nombre').value = s.nombre;
      document.getElementById('field-sub-correo').value = s.correo;
    } else {
      document.getElementById('field-sub-nombre').value = '';
      document.getElementById('field-sub-correo').value = '';
    }
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-subresp').classList.remove('hidden');
  }

  async function saveSubresp() {
    const leadId = document.getElementById('field-sub-lead-id').value;
    const data = {
      id_lead: parseInt(leadId),
      nombre: document.getElementById('field-sub-nombre').value.trim(),
      correo: document.getElementById('field-sub-correo').value.trim()
    };
    
    if (!data.nombre || !data.correo) { toast('Campos requeridos', 'error'); return; }

    try {
      if (editingSubrespId) {
        const r = await API.updateSubresp(editingSubrespId, data);
        subresponsables = subresponsables.map(x => x.id_subresp == editingSubrespId ? r : x);
      } else {
        const r = await API.createSubresp(data);
        subresponsables.push(r);
      }
      document.getElementById('modal-subresp').classList.add('hidden');
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');
      toast('Miembro guardado', 'success');
    } catch (e) { toast('Error al guardar', 'error'); }
  }

  async function reqDeleteSubresp(id) {
    const agreed = await showConfirm('Eliminar Miembro', '¿Eliminar este miembro?', 'Eliminar');
    if (!agreed) return;
    try {
      await API.deleteSubresp(id);
      subresponsables = subresponsables.filter(x => x.id_subresp != id);
      renderConfigLists();
    } catch (e) { toast('Error al eliminar', 'error'); }
  }

  function updateSubrespSelect(leadId, selectedSubId = null) {
    const wrap = document.getElementById('group-subresponsable');
    const sel = document.getElementById('field-subresp');
    
    if (!leadId) {
      wrap.style.display = 'none';
      sel.innerHTML = '<option value="">Seleccionar miembro...</option>';
      return;
    }

    const members = subresponsables.filter(s => s.id_lead == leadId);
    if (members.length === 0) {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = 'block';
      sel.innerHTML = '<option value="">-- Responsable Líder únicamente --</option>';
      members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id_subresp;
        opt.textContent = m.nombre;
        sel.appendChild(opt);
      });
      if (selectedSubId) sel.value = selectedSubId;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function today() {
    return new Date().toISOString().split('T')[0];
  }
  function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  }
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Init ───────────────────────────────────────────────── */
  async function init() {
    // Cargar responsables, subresponsables y recursos
    try { 
      responsables = await API.getResponsables();
      subresponsables = await API.getSubresponsables(); // Nueva llamada API
      recursos = await API.getResources();
    } catch(_) {}

    // Wiring modal cerrar
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(el =>
      el.addEventListener('click', () => {
        const modal = el.closest('.modal-overlay');
        if (modal) {
          modal.classList.add('hidden');
          if (modal.id === 'modal-task') editingTaskId = null;
          // Si se cancela subresp, volver a config
          if (modal.id === 'modal-subresp') {
            document.getElementById('modal-config').classList.remove('hidden');
          }
        }
      })
    );

    document.getElementById('btn-save-subresp').addEventListener('click', saveSubresp);

    // Progress slider
    document.getElementById('field-avance').addEventListener('input', e => {
      document.getElementById('label-avance').textContent = `${Math.round(+e.target.value)}%`;
    });

    // Botones toolbar y dropdown "Nuevo"
    const btnNewDropdown = document.getElementById('btn-new-dropdown');
    const newDropdownMenu = document.getElementById('new-dropdown-menu');
    if (btnNewDropdown && newDropdownMenu) {
      btnNewDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        newDropdownMenu.style.display = newDropdownMenu.style.display === 'none' ? 'flex' : 'none';
      });
      document.addEventListener('click', () => {
        newDropdownMenu.style.display = 'none';
      });
    }

    const btnNewTaskDropdown = document.getElementById('btn-new-task-dropdown');
    if (btnNewTaskDropdown) {
      btnNewTaskDropdown.addEventListener('click', () => {
        if(newDropdownMenu) newDropdownMenu.style.display = 'none';
        openTaskModal(null);
      });
    }

    const btnNewTaskTb = document.getElementById('btn-new-task');
    if (btnNewTaskTb) btnNewTaskTb.addEventListener('click', () => openTaskModal(null));

    const btnNewProject = document.getElementById('btn-new-project');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => {
        if(newDropdownMenu) newDropdownMenu.style.display = 'none';
        openProjectModal();
      });
    }

    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    if (btnToggleGrid) {
      btnToggleGrid.addEventListener('click', () => {
        const cs = gantt.config.show_grid;
        gantt.config.show_grid = !cs;
        btnToggleGrid.textContent = !cs ? 'Ocultar Tareas' : '≡ Tareas';
        
        if (!cs) {
          btnToggleGrid.classList.add('btn-primary', 'active');
          btnToggleGrid.classList.remove('btn-ghost');
        } else {
          btnToggleGrid.classList.remove('btn-primary', 'active');
          btnToggleGrid.classList.add('btn-ghost');
        }
        gantt.render();
      });
    }

    const btnToggleKpi = document.getElementById('btn-toggle-kpi');
    if (btnToggleKpi) {
      btnToggleKpi.addEventListener('click', () => {
        const strip = document.querySelector('.summary-strip');
        const sbar  = document.getElementById('status-bar');
        const isHidden = strip.classList.toggle('hidden-summary');
        if (sbar) sbar.classList.toggle('hidden-summary', isHidden);
        btnToggleKpi.classList.toggle('active', !isHidden);
        // Ajustar altura gantt (CSS detectará el cambio de espacio si usamos calc adecuadamente, pero renderizamos para seguridad)
        setTimeout(() => { if (window.gantt) gantt.render(); }, 100);
      });
    }

    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        if (window.innerWidth < 768) {
          if (!collapsed) {
             overlay.classList.add('active');
          } else {
             overlay.classList.remove('active');
          }
        }
        // Redimensionar gantt tras la animación
        setTimeout(() => { if (window.gantt) gantt.render(); }, 250);
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        overlay.classList.remove('active');
        setTimeout(() => { if (window.gantt) gantt.render(); }, 250);
      });
    }

    // Auto-colapsar sidebar en móviles al inicio
    if (window.innerWidth < 768) {
      sidebar.classList.add('collapsed');
    }

    // Cerrar sidebar al hacer clic en el contenido principal si estamos en móvil
    document.querySelector('.main-content').addEventListener('click', (e) => {
      // Si el clic viene del botón de menú, no hacer nada aquí (ya se maneja en su listener)
      if (e.target.closest('#btn-toggle-sidebar')) return;
      
      if (window.innerWidth < 768 && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        if(overlay) overlay.classList.remove('active');
      }
    });

    // Guardar tarea
    document.getElementById('btn-save-task').addEventListener('click', saveTask);
    
    // Abrir notas rápidamente desde el modal de tarea
    document.getElementById('btn-open-notes-quick').addEventListener('click', (e) => {
      e.preventDefault();
      if (!editingTaskId) {
        toast('Guardá la tarea primero para añadir notas detalladas', 'warning');
        return;
      }
      const tid = editingTaskId;
      closeTaskModal();
      openNotesModal(tid);
    });

    // Eliminar tarea (desde modal)
    const btnDelTask = document.getElementById('btn-delete-task');
    if (btnDelTask) btnDelTask.addEventListener('click', () => {
      if (editingTaskId) confirmDelete(editingTaskId);
    });

    // Eliminar proyecto (desde modal)
    const btnDelProj = document.getElementById('btn-delete-project');
    if (btnDelProj) btnDelProj.addEventListener('click', () => {
      if (editingProjectId) confirmDeleteProject(editingProjectId);
    });

    // Export buttons
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', e => { e.stopPropagation(); Exports.toggleMenu(); });
    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) btnExportPdf.addEventListener('click', () => { Exports.exportPDF(); document.getElementById('export-menu')?.classList.remove('open'); });
    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', () => { Exports.exportExcel(); document.getElementById('export-menu')?.classList.remove('open'); });
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', () => { Exports.exportCSV(); document.getElementById('export-menu')?.classList.remove('open'); });

    // Filter bar
    const applyFilters = () => { if (window.gantt) gantt.render(); };
    const fSearch = document.getElementById('filter-search');
    const fEstado = document.getElementById('filter-estado'); // this is now a hidden input
    const fResp   = document.getElementById('filter-responsable');
    const fProj   = document.getElementById('filter-proyecto');
    
    // Custom dropdown for Estado
    const btnFilterEstado = document.getElementById('btn-filter-estado');
    const menuFilterEstado = document.getElementById('menu-filter-estado');
    if (btnFilterEstado && menuFilterEstado && fEstado) {
      btnFilterEstado.addEventListener('click', (e) => {
        e.stopPropagation();
        menuFilterEstado.style.display = menuFilterEstado.style.display === 'none' ? 'flex' : 'none';
      });
      document.addEventListener('click', () => {
        menuFilterEstado.style.display = 'none';
      });
      menuFilterEstado.querySelectorAll('.fd-item').forEach(el => {
         el.addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-value');
            fEstado.value = val;
            btnFilterEstado.innerHTML = val ? e.currentTarget.innerHTML : 'Estado';
            applyFilters();
         });
      });
    }

    if (fSearch) fSearch.addEventListener('input', applyFilters);
    if (fResp)   fResp.addEventListener('change', applyFilters);
    if (fProj)   fProj.addEventListener('change', applyFilters);
    
    const btnClears = document.querySelectorAll('.btn-filter-clear');
    btnClears.forEach(btnClear => {
      btnClear.addEventListener('click', () => {
        if (fSearch) fSearch.value = '';
        if (fEstado) fEstado.value = '';
        if (btnFilterEstado) btnFilterEstado.innerHTML = 'Estado';
        if (fResp) fResp.value = '';
        if (fProj) fProj.value = '';
        applyFilters();
      });
    });

    const setEstado = (val, html) => {
      if (fEstado) fEstado.value = val;
      if (btnFilterEstado) btnFilterEstado.innerHTML = html || val;
      applyFilters();
      window.scrollTo({top:0, behavior:'smooth'});
    };

    const statusRisk = document.getElementById('status-click-risk');
    if (statusRisk) statusRisk.addEventListener('click', () => {
      setEstado('Retrasada', '<span class="badge badge-retrasada" style="transform:scale(0.85); transform-origin:left; pointer-events:none;">Retrasada</span>');
    });
    
    const statusBlocked = document.getElementById('status-click-blocked');
    if (statusBlocked) statusBlocked.addEventListener('click', () => {
      setEstado('Bloqueada', '<span class="badge badge-bloqueada" style="transform:scale(0.85); transform-origin:left; pointer-events:none;">Bloqueada</span>');
    });

    // Gantt filter hook
    if (window.gantt) {
      gantt.attachEvent('onBeforeTaskDisplay', (id, task) => {
        const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
        const estado = document.getElementById('filter-estado')?.value || '';
        const resp   = document.getElementById('filter-responsable')?.value || '';
        const proj   = document.getElementById('filter-proyecto')?.value || '';

        if (search && !(task.text || '').toLowerCase().includes(search)) return false;

        // Estado filter: "Retrasada" is a calculated state (start <= today, 0% progress)
        if (estado) {
          const p = Math.round((task.progress || 0) * 100);
          if (estado === 'Retrasada') {
            const today = new Date(); today.setHours(0,0,0,0);
            const tStart = new Date(task.start_date); tStart.setHours(0,0,0,0);
            const isDelayed = (tStart <= today && p === 0 && task._estado !== 'Finalizada');
            if (!isDelayed) return false;
          } else if (estado === 'Bloqueada') {
            let isBlocked = false;
            if (p < 100 && task._estado !== 'Finalizada') {
              if (task.$target && task.$target.length > 0) {
                for (let linkId of task.$target) {
                  if (gantt.isLinkExists(linkId)) {
                    const link = gantt.getLink(linkId);
                    if (gantt.isTaskExists(link.source)) {
                      const pred = gantt.getTask(link.source);
                      const predP = Math.round((pred.progress || 0) * 100);
                      if (predP < 100 && pred._estado !== 'Finalizada') {
                        isBlocked = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
            if (!isBlocked) return false;
          } else if (task._estado !== estado) {
            return false;
          }
        }

        if (resp && task.responsable !== resp) return false;
        if (proj && (task._projectName || '') !== proj) return false;

        return true;
      });
    }

    // Guardar proyecto
    document.getElementById('btn-save-project').addEventListener('click', saveProject);

    // Guardar nota
    document.getElementById('btn-save-note').addEventListener('click', saveNote);

    // Cerrar modal al click fuera
    document.querySelectorAll('.modal-overlay').forEach(overlay =>
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
          if (overlay.id === 'modal-task') editingTaskId = null;
          // Si se cierra haciendo click fuera de un sub-modal de edición desde Ajustes
          if ((overlay.id === 'modal-responsable' && editingResponsableId) ||
              (overlay.id === 'modal-recurso'     && editingRecursoId)) {
            document.getElementById('modal-config').classList.remove('hidden');
          }
          if (overlay.id === 'modal-responsable') editingResponsableId = null;
          if (overlay.id === 'modal-recurso')     editingRecursoId = null;
        }
      })
    );

    // Guardar Responsable / Recurso
    const btnAddResp = document.getElementById('btn-add-responsable');
    if (btnAddResp) btnAddResp.addEventListener('click', (e) => { e.preventDefault(); openResponsableModal(); });
    const btnSaveResp = document.getElementById('btn-save-responsable');
    if (btnSaveResp) btnSaveResp.addEventListener('click', saveResponsable);

    const btnAddRec = document.getElementById('btn-add-recurso');
    if (btnAddRec) btnAddRec.addEventListener('click', (e) => { e.preventDefault(); openRecursoModal(); });
    const btnSaveRec = document.getElementById('btn-save-recurso');
    if (btnSaveRec) btnSaveRec.addEventListener('click', saveRecurso);

    const btnConfig = document.getElementById('btn-config');
    if (btnConfig) btnConfig.addEventListener('click', openConfigModal);

    // Bootstrap config add buttons
    const btnAddRespConf = document.getElementById('btn-add-responsable-config');
    if (btnAddRespConf) btnAddRespConf.addEventListener('click', () => {
      openResponsableModal();
    });

    const btnAddRecConf = document.getElementById('btn-add-recurso-config');
    if (btnAddRecConf) btnAddRecConf.addEventListener('click', () => {
      openRecursoModal();
    });

    // Config Tabs
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.config-tab').forEach(t => {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
        });
        document.querySelectorAll('.config-tab-content').forEach(c => c.classList.add('hidden'));
        
        tab.classList.add('active');
        tab.style.borderBottomColor = 'var(--indigo)';
        document.getElementById(tab.dataset.tab).classList.remove('hidden');
      });
    });

    await loadProjects();
    setupPermissions();
    setupUsersAdmin();
  }

  function setupPermissions() {
    const user = Auth.getUser();
    if (!user) return;

    // Poblar información de usuario en la barra lateral
    const elName = document.getElementById('sidebar-user-name');
    if (elName) elName.textContent = user.nombre || 'Usuario';

    console.log("[Auth] Session User:", user.nombre, "| Admin:", user.es_admin);
    
    // Usar clase en body para control de visibilidad robusto vía CSS
    if (user.es_admin) {
      document.body.classList.add('is-admin');
    } else {
      document.body.classList.remove('is-admin');
      
      if (!Auth.hasPerm('CREATE')) {
        const btnNewProj = document.getElementById('btn-new-project');
        const btnNewTask = document.getElementById('btn-new-task');
        if (btnNewProj) btnNewProj.style.display = 'none';
        if (btnNewTask) btnNewTask.style.display = 'none';
        // También ocultar el botón general de "Nuevo" en el sidebar si no tiene permisos
        const btnNewGroup = document.getElementById('btn-new-dropdown');
        if (btnNewGroup) btnNewGroup.style.display = 'none';
      }
    }
  }

  function setupUsersAdmin() {
    document.getElementById('btn-logout').addEventListener('click', async () => {
      const agreed = await showConfirm('Cerrar Sesión', '¿Estás seguro que deseas desconectarte?', 'Cerrar sesión');
      if (agreed) Auth.logout();
    });

    const btnAdminUsers = document.getElementById('btn-admin-users');
    const modalUsers = document.getElementById('modal-users');
    const modalUserForm = document.getElementById('modal-user-form');
    const formUser = document.getElementById('form-user');

    if (!btnAdminUsers) return;

    btnAdminUsers.addEventListener('click', async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      modalUsers.classList.remove('hidden');
      await loadUsersTable();
    });

    document.getElementById('btn-close-users').addEventListener('click', () => modalUsers.classList.add('hidden'));
    document.getElementById('btn-close-user-form').addEventListener('click', () => modalUserForm.classList.add('hidden'));
    document.getElementById('btn-cancel-user').addEventListener('click', () => modalUserForm.classList.add('hidden'));

    document.getElementById('btn-new-user').addEventListener('click', () => {
      formUser.reset();
      document.getElementById('user-id').value = '';
      document.getElementById('user-is-admin').checked = false;
      document.getElementById('user-form-title').textContent = 'Nuevo Usuario';
      document.querySelectorAll('.user-perm').forEach(c => c.checked = false);
      renderUserProjectsChecks('');
      modalUserForm.classList.remove('hidden');
    });

    formUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('user-id').value;
      const data = {
        nombre: document.getElementById('user-nombre').value,
        email: document.getElementById('user-email').value,
        password: document.getElementById('user-password').value,
        es_admin: document.getElementById('user-is-admin').checked,
        permisos: Array.from(document.querySelectorAll('.user-perm:checked')).map(c => c.value).join(','),
        proyectos: document.getElementById('user-proj-all').checked ? 'ALL' : Array.from(document.querySelectorAll('.user-proj-chk:checked')).map(c => c.value).join(','),
        activo: true
      };
      
      try {
        if (id) await API.updateUser(id, data);
        else await API.createUser(data);
        
        toast('Usuario guardado', 'success');
        modalUserForm.classList.add('hidden');
        await loadUsersTable();
      } catch (err) {
        toast(err.error || 'Error al guardar usuario', 'error');
      }
    });
  }

  async function loadUsersTable() {
    try {
      const users = await API.getUsers();
      const tbody = document.getElementById('users-tbody');
      tbody.innerHTML = users.map(u => `
        <tr style="border-bottom:1px solid var(--border)">
          <td>${u.nombre} ${u.es_admin ? '👑' : ''}</td>
          <td>${u.email}</td>
          <td><span style="font-size:10px; padding:2px 6px; background:var(--bg-dark); border-radius:4px">${u.permisos}</span></td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-sm" onclick="UI.editUser(${u.id_usuario})" style="padding:2px 6px">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.deleteUser(${u.id_usuario})" style="padding:2px 6px;color:var(--danger)">🗑️</button>
          </td>
        </tr>
      `).join('');
      
      // Adjuntamos globalmente para poder llamarlos desde el inline onclick
      window.loadedUsers = users;
    } catch (e) {
      toast('Error al cargar usuarios', 'error');
    }
  }

  function editUser(id) {
    const u = window.loadedUsers.find(x => x.id_usuario == id);
    if (!u) return;
    
    document.getElementById('form-user').reset();
    document.getElementById('user-id').value = u.id_usuario;
    document.getElementById('user-nombre').value = u.nombre;
    document.getElementById('user-email').value = u.email;
    document.getElementById('user-password').value = '';
    document.getElementById('user-is-admin').checked = !!u.es_admin;
    document.getElementById('user-form-title').textContent = 'Editar Usuario';
    
    const pUser = (u.permisos || '').split(',');
    document.querySelectorAll('.user-perm').forEach(c => c.checked = pUser.includes(c.value));
    
    renderUserProjectsChecks(u.proyectos || '');
    
    document.getElementById('modal-user-form').classList.remove('hidden');
  }

  async function deleteUser(id) {
    const agreed = await showConfirm('Eliminar Usuario', '¿Estás seguro de eliminar este usuario?', 'Eliminar cuenta');
    if (!agreed) return;
    try {
      await API.deleteUser(id);
      toast('Usuario eliminado', 'success');
      await loadUsersTable();
    } catch (e) {
      toast(e.error || 'Error al eliminar usuario', 'error');
    }
  }

  function renderUserProjectsChecks(selected) {
    const list = document.getElementById('user-proj-checks');
    const chkAll = document.getElementById('user-proj-all');
    
    if (selected === 'ALL') {
      chkAll.checked = true;
    } else {
      chkAll.checked = false;
    }
    
    const selIds = (selected || '').split(',').map(Number);
    list.innerHTML = projects.map(p => `
      <label style="display:block; margin-left:15px; font-size:12px;">
        <input type="checkbox" class="user-proj-chk" value="${p.id_proyecto}" ${selIds.includes(p.id_proyecto) ? 'checked' : ''} ${selected === 'ALL' ? 'disabled' : ''}>
        ${p.nombre_proyecto}
      </label>
    `).join('');
    
    chkAll.onchange = (e) => {
      document.querySelectorAll('.user-proj-chk').forEach(c => {
        c.disabled = e.target.checked;
        if(e.target.checked) c.checked = false;
      });
    };
  }

  return {
    init, toast, openTaskModal, confirmDelete, deleteTask,
    openNotesModal, deleteNote, selectProject, renderProjectList,
    editResponsable, deleteResponsable: reqDeleteResponsable,
    editRecurso, deleteRecurso: reqDeleteRecurso,
    openSubrespModal,
    saveSubresp,
    editSubresp: (id) => {
      const s = subresponsables.find(x => x.id_subresp == id);
      if (s) openSubrespModal(s.id_lead, id);
    },
    deleteSubresp: reqDeleteSubresp,
    editUser, deleteUser,
    getResponsables: () => responsables,
    getSubresponsables: () => subresponsables,
    getProjects: () => projects,
    getAllTasks: () => allTasks
  };
})();

// ── PurchaseModule ─────────────────────────────────────────────
const PurchaseModule = (() => {
  let editingPurchaseId = null;
  let _allPurchases     = [];
  let _allTasks         = [];
  let _responsables     = [];
  let _subresponsables  = [];
  let _projects         = [];
  let _currentView      = 'tasks'; // 'tasks' | 'purchases' | 'combined'
  let _chartsInitialized = false;
  let _chartExpense = null, _chartCount = null;

  /* ── Fecha helper ──────────────────────────────────────────── */
  function addDays(dateStr, days) {
    if (!dateStr || !days) return '';
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().split('T')[0];
  }

  function purStateBadge(estado) {
    const map = {
      'solicitada':              'badge-pur-sol',
      'solicitando presupuesto': 'badge-pur-pres',
      'presupuesto recibido':    'badge-pur-prec',
      'OC emitida':              'badge-pur-oc',
      'fecha comprometida':      'badge-pur-comp',
      'entregado':               'badge-pur-ent'
    };
    const cls = map[estado] || 'badge-pur-sol';
    return `<span class="badge ${cls}">${estado||'—'}</span>`;
  }

  /* ── Poblar selects de responsables ────────────────────────── */
  function fillResponsablesSelects() {
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
        html += `<option value="${c.id}">${c.name}</option>`;
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

  /* ── Helper de búsqueda de nombre ── */
  function getResponsableName(id) {
    if (!id) return '';
    if (id.startsWith('R-')) {
      const rid = id.replace('R-', '');
      const r = _responsables.find(x => String(x.id_resp) === rid);
      return r ? r.nombre : id;
    }
    if (id.startsWith('S-')) {
      const sid = id.replace('S-', '');
      const s = _subresponsables.find(x => String(x.id_subresp) === sid);
      return s ? s.nombre : id;
    }
    return id;
  }

  /* ── Poblar select de proyectos ────────────────────────────────── */
  function fillProjectsSelect(presetProjectId = null) {
    const sel = document.getElementById('field-pur-proyecto');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>' +
      _projects.map(p => `<option value="${p.id_proyecto}"${p.id_proyecto == presetProjectId ? ' selected' : ''}>${p.nombre_proyecto}</option>`).join('');
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
        const label = `[${t.tarea || t.id_tarea}] ${t.descripcion || ''}`;
        return `<option value="${t.id_tarea}"${t.id_tarea == presetTaskId ? ' selected' : ''}>${label}</option>`;
      }).join('');
    if (presetTaskId) sel.value = presetTaskId;
  }

  /* ── Abrir modal de compra ──────────────────────────────────── */
  function openPurchaseModal(purchaseId = null, presetTaskId = null) {
    editingPurchaseId = purchaseId;
    const modal = document.getElementById('modal-purchase');
    const title = document.getElementById('modal-purchase-title');
    const delBtn = document.getElementById('btn-delete-purchase');
    if (!modal) return;

    title.textContent = purchaseId ? 'Editar Compra' : 'Nueva Compra';
    delBtn.style.display = purchaseId ? 'inline-flex' : 'none';

    fillResponsablesSelects();
    // Pre-seleccionar proyecto si viene de una tarea
    if (presetTaskId) {
      const linkedTask = _allTasks.find(t => t.id_tarea == presetTaskId);
      if (linkedTask) fillProjectsSelect(linkedTask.id_proyecto);
      else fillProjectsSelect();
    } else {
      fillProjectsSelect();
    }
    fillTareasSelect(presetTaskId);

    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    if (purchaseId) {
      const p = _allPurchases.find(x => x.id_compra == purchaseId);
      if (p) {
        // Pre-seleccionar proyecto para filtrar tareas
        if (p.id_proyecto) {
          fillProjectsSelect(p.id_proyecto);
          fillTareasSelect(p.id_tarea);
        } else if (p.id_tarea) {
          const linkedTask = _allTasks.find(t => t.id_tarea == p.id_tarea);
          if (linkedTask) { fillProjectsSelect(linkedTask.id_proyecto); fillTareasSelect(p.id_tarea); }
          else fillTareasSelect(p.id_tarea);
        }
        f('field-pur-producto',   p.producto || '');
        f('field-pur-desc',       p.descripcion || '');
        f('field-pur-cantidad',   p.cantidad || 1);
        f('field-pur-vunit',      p.valor_unitario || 0);
        f('field-pur-solicitante',p.id_solicitante || '');
        f('field-pur-responsable',p.id_responsable || '');
        f('field-pur-dias',       p.dias_arribo || 0);
        f('field-pur-arribo-nec', p.fecha_arribo_necesaria || '');
        f('field-pur-arribo-est', p.fecha_arribo_estimada || '');
        f('field-pur-notas',      p.notas || '');
        f('field-pur-links',      p.links_facturas || '');
        // Timestamps
        f('field-pur-f-sol',  p.fecha_solicitud || '');
        f('field-pur-f-psol', p.fecha_presupuesto_solic || '');
        f('field-pur-f-prec', p.fecha_presupuesto_recib || '');
        f('field-pur-f-oc',   p.fecha_oc_emitida || '');
        f('field-pur-f-comp', p.fecha_comprometida || '');
        f('field-pur-f-ent',  p.fecha_entregado || '');
        // Estado
        setEstadoUI(p.estado || 'solicitada');
        updateTotal();
        updateArriboEstimado();
      }
    } else {
      // Nueva compra: resetear
      ['field-pur-producto','field-pur-desc','field-pur-notas','field-pur-links',
       'field-pur-arribo-nec','field-pur-arribo-est',
       'field-pur-f-sol','field-pur-f-psol','field-pur-f-prec',
       'field-pur-f-oc','field-pur-f-comp','field-pur-f-ent'].forEach(id => f(id, ''));
      f('field-pur-cantidad', 1);
      f('field-pur-vunit', 0);
      f('field-pur-dias', 0);
      document.getElementById('field-pur-vtotal').value = '$0.00';
      setEstadoUI('solicitada');

      // Si viene de una tarea, prellenar solicitante
      if (presetTaskId) {
        const task = _allTasks.find(t => t.id_tarea == presetTaskId);
        if (task) {
          const resp = _responsables.find(r => r.correo === task.responsable || r.nombre === task.responsable);
          if (resp) f('field-pur-solicitante', resp.id_resp);
        }
      }
    }

    modal.classList.remove('hidden');
  }

  /* ── Estado custom dropdown ─────────────────────────────────── */
  function setEstadoUI(val) {
    document.getElementById('field-pur-estado').value = val;
    const labels = {
      'solicitada': '<span class="badge badge-pur-sol">Solicitada</span>',
      'solicitando presupuesto': '<span class="badge badge-pur-pres">Solicitando Presupuesto</span>',
      'presupuesto recibido': '<span class="badge badge-pur-prec">Presupuesto Recibido</span>',
      'OC emitida': '<span class="badge badge-pur-oc">OC Emitida</span>',
      'fecha comprometida': '<span class="badge badge-pur-comp">Fecha Comprometida</span>',
      'entregado': '<span class="badge badge-pur-ent">Entregado</span>'
    };
    const lbl = document.getElementById('pur-estado-label');
    if (lbl) lbl.innerHTML = labels[val] || val;
  }

  function initEstadoDropdown() {
    const btn  = document.getElementById('btn-pur-estado');
    const menu = document.getElementById('menu-pur-estado');
    if (!btn || !menu) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
      menu.style.flexDirection = 'column';
    });
    document.querySelectorAll('.pur-estado-item').forEach(item => {
      item.addEventListener('click', () => {
        setEstadoUI(item.dataset.value);
        menu.style.display = 'none';
      });
    });
    document.addEventListener('click', () => { if (menu) menu.style.display = 'none'; });
  }

  /* ── Cálculos inline ────────────────────────────────────────── */
  function updateTotal() {
    const cant = parseFloat(document.getElementById('field-pur-cantidad')?.value || 0);
    const vunit = parseFloat(document.getElementById('field-pur-vunit')?.value || 0);
    const total = cant * vunit;
    const el = document.getElementById('field-pur-vtotal');
    if (el) el.value = '$' + total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function updateArriboEstimado() {
    const oc   = document.getElementById('field-pur-f-oc')?.value;
    const dias = parseInt(document.getElementById('field-pur-dias')?.value || 0);
    const est  = document.getElementById('field-pur-arribo-est');
    if (!est) return;
    if (oc && dias > 0) {
      est.value = addDays(oc, dias);
    } else {
      est.value = '';
    }
  }

  /* ── Guardar compra ─────────────────────────────────────────── */
  async function savePurchase() {
    const get = id => document.getElementById(id)?.value?.trim() ?? '';
    const producto = get('field-pur-producto');
    if (!producto) { UI.toast('El campo Producto es requerido', 'error'); return; }

    const data = {
      producto,
      descripcion:            get('field-pur-desc')       || null,
      id_proyecto:            get('field-pur-proyecto')   || null,
      id_tarea:               get('field-pur-tarea')      || null,
      cantidad:               parseFloat(get('field-pur-cantidad')) || 1,
      valor_unitario:         parseFloat(get('field-pur-vunit'))    || 0,
      id_solicitante:         get('field-pur-solicitante') || null,
      id_responsable:         get('field-pur-responsable') || null,
      estado:                 get('field-pur-estado')      || 'solicitada',
      dias_arribo:            parseInt(get('field-pur-dias'))        || 0,
      fecha_arribo_necesaria: get('field-pur-arribo-nec') || null,
      notas:                  get('field-pur-notas')       || null,
      links_facturas:         get('field-pur-links')       || null,
      fecha_solicitud:        get('field-pur-f-sol')  || null,
      fecha_presupuesto_solic:get('field-pur-f-psol') || null,
      fecha_presupuesto_recib:get('field-pur-f-prec') || null,
      fecha_oc_emitida:       get('field-pur-f-oc')   || null,
      fecha_comprometida:     get('field-pur-f-comp') || null,
      fecha_entregado:        get('field-pur-f-ent')  || null,
    };

    try {
      let saved;
      if (editingPurchaseId) {
        saved = await API.updatePurchase(editingPurchaseId, data);
        _allPurchases = _allPurchases.map(p => p.id_compra == editingPurchaseId ? saved : p);
        UI.toast('Compra actualizada', 'success');
      } else {
        saved = await API.createPurchase(data);
        _allPurchases.push(saved);
        UI.toast('Compra creada', 'success');
      }
      document.getElementById('modal-purchase').classList.add('hidden');
      updatePurchaseKPIs();
      // Si la compra tiene tarea, actualizar la lista del modal-task si está abierto
      if (saved.id_tarea && !document.getElementById('modal-task').classList.contains('hidden')) {
        renderTaskPurchases(saved.id_tarea);
      }
      // Refrescar vista si estamos en purchases o combined
      if (_currentView === 'purchases') GanttApp.loadPurchasesView(_allPurchases, _allTasks);
      if (_currentView === 'combined')  refreshCombinedView();
    } catch(e) { UI.toast(e.error || 'Error al guardar compra', 'error'); }
  }

  /* ── Eliminar compra ─────────────────────────────────────────── */
  async function deletePurchase() {
    if (!editingPurchaseId) return;
    UI.confirmDelete = null; // override temporal
    const yes = await new Promise(resolve => {
      UI.toast('¿Eliminar esta compra?', 'warning');
      const btn = document.getElementById('btn-delete-purchase');
      const handler = async () => {
        btn.removeEventListener('click', handler);
        try {
          await API.deletePurchase(editingPurchaseId);
          _allPurchases = _allPurchases.filter(p => p.id_compra != editingPurchaseId);
          document.getElementById('modal-purchase').classList.add('hidden');
          updatePurchaseKPIs();
          if (_currentView === 'purchases') GanttApp.loadPurchasesView(_allPurchases, _allTasks);
          UI.toast('Compra eliminada', 'warning');
        } catch(e) { UI.toast(e.error || 'Error al eliminar', 'error'); }
        resolve(true);
      };
      // Simple confirm:
      if (confirm('¿Seguro que deseas eliminar esta compra?')) handler();
    });
  }

  /* ── Renderizar compras en modal-task ───────────────────────── */
  async function renderTaskPurchases(taskId) {
    const list = document.getElementById('task-purchases-list');
    if (!list) return;
    list.innerHTML = '<span style="color:var(--text-dim);font-size:11px">Cargando...</span>';
    try {
      const purchases = await API.getPurchasesByTask(taskId);
      // Actualizar cache local
      _allPurchases = _allPurchases.filter(p => p.id_tarea != taskId);
      _allPurchases.push(...purchases);

      if (purchases.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:11px">Sin compras asociadas.</span>';
        return;
      }
      list.innerHTML = purchases.map(p => `
        <div class="purchase-card" data-id="${p.id_compra}">
          <div style="flex:1;min-width:0">
            <div class="pc-name">${p.producto}</div>
            <div class="pc-meta">${purStateBadge(p.estado)} ${p.fecha_arribo_necesaria ? '· Nec: ' + p.fecha_arribo_necesaria : ''}</div>
          </div>
          <span class="pc-value">${p.valor_total > 0 ? '$'+parseFloat(p.valor_total).toLocaleString('es-AR',{maximumFractionDigits:0}) : '—'}</span>
          <button class="btn btn-ghost btn-sm pc-edit" data-id="${p.id_compra}">✏️</button>
        </div>
      `).join('');
      list.querySelectorAll('.pc-edit').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          openPurchaseModal(parseInt(btn.dataset.id));
        });
      });
      list.querySelectorAll('.purchase-card').forEach(card => {
        card.addEventListener('click', e => {
          if (!e.target.closest('.pc-edit')) openPurchaseModal(parseInt(card.dataset.id));
        });
      });
    } catch(e) {
      list.innerHTML = '<span style="color:var(--red);font-size:11px">Error al cargar compras.</span>';
    }
  }

  /* ── KPIs de compras ─────────────────────────────────────────── */
  function updatePurchaseKPIs() {
    const today = new Date(); today.setHours(0,0,0,0);
    let atrasoCompra = 0, atrasoEntrega = 0;
    const ocStates = ['OC emitida','fecha comprometida','entregado'];

    _allPurchases.forEach(p => {
      if (p.estado === 'entregado') return;
      const necesaria = p.fecha_arribo_necesaria ? new Date(p.fecha_arribo_necesaria + 'T00:00:00') : null;
      const estimada  = p.fecha_arribo_estimada  ? new Date(p.fecha_arribo_estimada  + 'T00:00:00') : null;
      if (necesaria) necesaria.setHours(0,0,0,0);
      if (estimada)  estimada.setHours(0,0,0,0);

      if (ocStates.includes(p.estado)) {
        if (estimada && estimada < today) atrasoEntrega++;
      } else {
        if (necesaria) {
          const deadline = new Date(necesaria);
          deadline.setDate(deadline.getDate() - parseInt(p.dias_arribo || 0));
          deadline.setHours(0,0,0,0);
          if (deadline <= today) atrasoCompra++;
        }
      }
    });

    const eAtr = document.getElementById('stat-compra-atraso-proc');
    const eEnt = document.getElementById('stat-compra-atraso-ent');
    const kAtr = document.getElementById('kpi-compra-atraso');
    const kEnt = document.getElementById('kpi-entrega-atraso');

    if (eAtr) eAtr.textContent = atrasoCompra;
    if (eEnt) eEnt.textContent = atrasoEntrega;
    if (kAtr) kAtr.style.display = _allPurchases.length > 0 ? '' : 'none';
    if (kEnt) kEnt.style.display = _allPurchases.length > 0 ? '' : 'none';
    return { atrasoCompra, atrasoEntrega };
  }

  /* ── Toggle de Vista (Tasks / Purchases / Combined) ─────────── */
  function setView(view) {
    _currentView = view;
    const ganttHere   = document.getElementById('gantt_here');
    const purView     = document.getElementById('purchases-view');
    const viewToggle  = document.getElementById('view-toggle-group');
    const filterBar   = document.querySelector('.filter-bar');

    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.id === `btn-view-${view}`);
    });

    if (view === 'tasks') {
      ganttHere.style.display = '';
      purView.style.display   = 'none';
      if (filterBar) filterBar.style.display = '';
      if (window.GanttApp && GanttApp.restoreTasksView) GanttApp.restoreTasksView();
    } else if (view === 'purchases') {
      ganttHere.style.display = '';
      purView.style.display   = 'flex';
      if (filterBar) filterBar.style.display = 'none';
      GanttApp.loadPurchasesView(_allPurchases, _allTasks);
    } else if (view === 'combined') {
      ganttHere.style.display = '';
      purView.style.display   = 'none';
      if (filterBar) filterBar.style.display = 'none';
      refreshCombinedView();
    }

    const colorToggleGroup = document.getElementById('btn-toggle-color-group');
    if (colorToggleGroup) {
      colorToggleGroup.style.display = '';
    }
  }

  async function refreshCombinedView() {
    try {
      const tasks = await API.getTasks();
      GanttApp.loadCombinedView(tasks, _allPurchases);
    } catch(e) { UI.toast('Error al cargar vista consolidada', 'error'); }
  }

  /* ── Gráficos de Compras ────────────────────────────────────── */
  function openChartsModal() {
    const modal = document.getElementById('modal-charts');
    if (modal) modal.classList.remove('hidden');
    renderCharts();
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;
    const estados = ['solicitada','solicitando presupuesto','presupuesto recibido','OC emitida','fecha comprometida','entregado'];
    const labels  = ['Solicitada','Sol. Presupuesto','Pres. Recibido','OC Emitida','Fecha Comp.','Entregado'];
    const colors  = ['#94a3b8','#fbbf24','#818cf8','#22d3ee','#c084fc','#34d399'];

    const countByState   = estados.map(e => _allPurchases.filter(p => p.estado === e).length);
    const expenseByState = estados.map(e =>
      _allPurchases.filter(p => p.estado === e).reduce((s, p) => s + parseFloat(p.valor_total || 0), 0)
    );

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e2e5f0', font: { family: 'Inter', size: 11 } } }
      }
    };

    // Chart 1: Gasto por estado (Donut)
    const ctxExp = document.getElementById('chart-expense-by-state');
    if (ctxExp) {
      if (_chartExpense) _chartExpense.destroy();
      _chartExpense = new Chart(ctxExp, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: expenseByState, backgroundColor: colors, borderWidth: 0 }] },
        options: { ...opts }
      });
    }

    // Chart 2: Cantidad por estado (Bar)
    const ctxCnt = document.getElementById('chart-count-by-state');
    if (ctxCnt) {
      if (_chartCount) _chartCount.destroy();
      _chartCount = new Chart(ctxCnt, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Compras', data: countByState, backgroundColor: colors, borderRadius: 6 }] },
        options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#3a3a55' } },
            y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: '#3a3a55' } }
          }
        }
      });
    }

    // KPI summary en el modal
    const kpiDiv = document.getElementById('chart-kpi-summary');
    if (kpiDiv) {
      const { atrasoCompra, atrasoEntrega } = updatePurchaseKPIs();
      kpiDiv.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius);padding:14px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">🚨</span>
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Atraso Compra</div>
            <div style="font-size:28px;font-weight:700;color:var(--red);line-height:1">${atrasoCompra}</div>
            <div style="font-size:10px;color:var(--text-dim)">Sin OC, fuera de plazo</div>
          </div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius);padding:14px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">📦</span>
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Atraso Entrega</div>
            <div style="font-size:28px;font-weight:700;color:var(--amber);line-height:1">${atrasoEntrega}</div>
            <div style="font-size:10px;color:var(--text-dim)">OC emitida, estimada vencida</div>
          </div>
        </div>
      `;
    }
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init(tasks, responsables, subresps, projects) {
    _allTasks        = tasks || [];
    _responsables    = responsables || [];
    _subresponsables = subresps || [];
    _projects        = projects || [];

    // Cargar todas las compras
    try {
      _allPurchases = await API.getPurchases();
    } catch(e) { _allPurchases = []; }

    updatePurchaseKPIs();

    // Mostrar toggle de vista si hay proyecto seleccionado
    const vtg = document.getElementById('view-toggle-group');
    if (vtg) vtg.style.display = 'flex';

    // Listeners del modal de compra
    initEstadoDropdown();

    document.getElementById('field-pur-proyecto')?.addEventListener('change', () => fillTareasSelect());
    document.getElementById('field-pur-cantidad')?.addEventListener('input', updateTotal);
    document.getElementById('field-pur-vunit')?.addEventListener('input', updateTotal);
    document.getElementById('field-pur-dias')?.addEventListener('input', updateArriboEstimado);
    document.getElementById('field-pur-f-oc')?.addEventListener('input', updateArriboEstimado);

    document.getElementById('btn-save-purchase')?.addEventListener('click', savePurchase);
    document.getElementById('btn-delete-purchase')?.addEventListener('click', deletePurchase);

    // Nueva compra desde sidebar
    document.getElementById('btn-new-purchase')?.addEventListener('click', () => {
      document.getElementById('new-dropdown-menu').style.display = 'none';
      openPurchaseModal();
    });

    // Nueva compra desde modal-task
    document.getElementById('btn-new-purchase-from-task')?.addEventListener('click', e => {
      const taskId = e.currentTarget.dataset.taskId;
      openPurchaseModal(null, taskId ? parseInt(taskId) : null);
    });

    // Toggle de vista
    document.getElementById('btn-view-tasks')?.addEventListener('click',     () => setView('tasks'));
    document.getElementById('btn-view-purchases')?.addEventListener('click', () => setView('purchases'));
    document.getElementById('btn-view-combined')?.addEventListener('click',  () => setView('combined'));

    // Color toggle
    document.getElementById('btn-toggle-color')?.addEventListener('click', () => {
      if (typeof GanttApp.getColorMode !== 'function') return;
      const current = GanttApp.getColorMode();
      const next = current === 'project' ? 'responsable' : 'project';
      GanttApp.setColorMode(next);
      const btn = document.getElementById('btn-toggle-color');
      if (btn) btn.innerHTML = next === 'project' ? '🎨 Proyecto' : '👤 Responsable';
      
      if (_currentView === 'combined') {
        refreshCombinedView();
      } else if (_currentView === 'purchases') {
        GanttApp.loadPurchasesView(_allPurchases, _allTasks);
      } else {
        if (GanttApp.isAllProjects()) {
           GanttApp.loadAllProjects();
        } else {
           const pid = GanttApp.getCurrentProjectId();
           if (pid) GanttApp.loadProject(pid, null); // Color null uses default logic
        }
      }
    });

    // Gráficos
    document.getElementById('btn-open-charts')?.addEventListener('click', openChartsModal);
  }

  return { init, openPurchaseModal, renderTaskPurchases, updatePurchaseKPIs, setView, getResponsableName };
})();
window.PurchaseModule = PurchaseModule;

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loggedIn = await Auth.init();
  if (!loggedIn) return;

  GanttApp.init();
  await UI.init();

  // Inicializar modulo de compras
  await PurchaseModule.init(
    UI.getAllTasks(),
    UI.getResponsables(),
    UI.getSubresponsables(),
    UI.getProjects()
  );

  // Interceptar la carga de proyectos para actualizar las tareas del módulo de compras
  const origSelectProject = UI.selectProject;
  UI.selectProject = async (id, color) => {
    await origSelectProject(id, color);
    PurchaseModule.init(
      UI.getAllTasks(),
      UI.getResponsables(),
      UI.getSubresponsables(),
      UI.getProjects()
    );
  };
});
