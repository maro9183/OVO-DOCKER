/* ============================================================
   UI — Modals, toasts, sidebar, app state
   ============================================================ */
window.UI = (() => {
  let projects       = [];
  let responsables   = [];
  let recursos       = [];
  let allTasks       = []; // tareas del proyecto activo
  let editingTaskId  = null;
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
        <span class="project-name">Todos los Proyectos</span>
      </div>`;

    html += projects.map(p => `
      <div class="project-item ${!isAll && p.id_proyecto == active ? 'active' : ''}"
           data-id="${p.id_proyecto}" data-color="${p.color}"
           style="--active-color:${p.color}">
        <span class="project-dot" style="background:${p.color}"></span>
        <span class="project-name" title="${p.nombre_proyecto}">${p.nombre_proyecto}</span>
      </div>
    `).join('');

    list.innerHTML = html;

    list.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', () => selectProject(+el.dataset.id, el.dataset.color));
    });
    const btnAll = document.getElementById('btn-all-projects');
    if (btnAll) btnAll.addEventListener('click', selectAllProjects);
  }

  async function selectAllProjects() {
    document.getElementById('project-title').textContent = 'Cargando...';
    try {
      allTasks = await GanttApp.loadAllProjects();
      document.getElementById('project-title').textContent = 'Todos los Proyectos';
      document.getElementById('project-badge').textContent = '';
      document.getElementById('project-badge').style.display = 'none';
      renderProjectList();
      document.getElementById('toolbar-actions').style.display = 'flex';
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
      document.getElementById('toolbar-actions').style.display = 'flex';
    } catch (e) { toast('Error al cargar tareas', 'error'); }
  }

  /* ── Task Modal ─────────────────────────────────────────── */
  function openTaskModal(ganttTask) {
    // ganttTask puede ser objeto del gantt (edición) o null (nueva tarea)
    editingTaskId = ganttTask ? ganttTask.id : null;
    const raw     = ganttTask ? ganttTask._raw : null;

    document.getElementById('modal-task-title').textContent = editingTaskId ? 'Editar Tarea' : 'Nueva Tarea';
    document.getElementById('btn-delete-task').style.display = editingTaskId ? 'block' : 'none';

    // Rellenar campos
    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    f('field-tarea',       raw?.tarea        || '');
    f('field-descripcion', raw?.descripcion  || '');
    // Para fecha y duración usamos el estado actual del gantt (post-drag) en lugar del _raw
    // El ganttTask.start_date y ganttTask.end_date nos dan el ancho real. Calculamos días lógicos.
    const fmt = ganttTask ? gantt.date.date_to_str('%Y-%m-%d') : null;
    f('field-fecha-inicio', ganttTask ? fmt(ganttTask.start_date) : (raw?.fecha_inicio || today()));
    
    let dVal = raw?.duracion_dias || 1;
    if (ganttTask && ganttTask.start_date && ganttTask.end_date) {
      let bDays = 0;
      let cd = new Date(ganttTask.start_date);
      let ed = new Date(ganttTask.end_date);
      while (cd < ed) {
        if (raw?.tipo_dias !== 'laboral' || cd.getDay() !== 0) bDays++;
        cd.setDate(cd.getDate() + 1);
      }
      dVal = Math.max(1, bDays);
    }
    f('field-duracion', dVal);
    f('field-costo', raw?.costo_tarea || 0);

    // responsable
    const respSel = document.getElementById('field-responsable');
    if (respSel) {
      respSel.innerHTML = '<option value="">Seleccionar responsable...</option>' + 
        responsables.map(r => `<option value="${r.correo}" ${raw?.responsable === r.correo ? 'selected' : ''}>${r.nombre} (${r.correo})</option>`).join('');
    }

    // recursos
    renderRecursosSelect(raw?.recursos || '');

    // tipo_dias
    const tipo = raw?.tipo_dias || 'calendario';
    document.querySelectorAll('input[name="tipo_dias"]').forEach(r => { r.checked = r.value === tipo; });

    // avance
    const avance = parseFloat(raw?.avance || 0);
    document.getElementById('field-avance').value = avance;
    document.getElementById('label-avance').textContent = `${Math.round(avance)}%`;

    // proyecto
    const projSel = document.getElementById('field-proyecto');
    projSel.innerHTML = projects.map(p =>
      `<option value="${p.id_proyecto}" ${raw?.id_proyecto == p.id_proyecto ? 'selected' : ''}>${p.nombre_proyecto}</option>`
    ).join('');
    if (!editingTaskId) projSel.value = GanttApp.getCurrentProjectId() || projects[0]?.id_proyecto || '';

    // dependencias
    renderDependenciasSelect(raw?.dependencias || '', projSel.value);
    
    // Al cambiar proyecto, actualizar lista de dependencias (se borra la selección previa)
    projSel.onchange = () => {
      renderDependenciasSelect('', projSel.value);
    };

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('field-tarea').focus();
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

  function renderDependenciasSelect(selected, projectId) {
    const wrap = document.getElementById('deps-wrap');
    const selIds = (selected || '').split(',').map(d => d.trim()).filter(Boolean);
    const available = allTasks.filter(t => t.id_tarea != editingTaskId && t.id_proyecto == projectId);
    if (!available.length) {
      wrap.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No hay otras tareas</span>';
      return;
    }
    wrap.innerHTML = available.map(t => `
      <label class="radio-option" style="margin-bottom:4px;cursor:pointer">
        <input type="checkbox" name="dep_check" value="${t.id_tarea}" ${selIds.includes(String(t.id_tarea)) ? 'checked' : ''}>
        <span>${t.tarea}</span>
      </label>`).join('');
  }

  function getFormData() {
    const tipoDias = document.querySelector('input[name="tipo_dias"]:checked')?.value || 'calendario';
    const depIds   = [...document.querySelectorAll('input[name="dep_check"]:checked')].map(c => c.value);
    const recIds   = [...document.querySelectorAll('input[name="rec_check"]:checked')].map(c => c.value);
    return {
      id_proyecto:   +document.getElementById('field-proyecto').value,
      tarea:          document.getElementById('field-tarea').value.trim(),
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
    if (!data.tarea) { toast('El nombre de la tarea es requerido', 'error'); return; }

    const btn = document.getElementById('btn-save-task');
    btn.disabled = true;
    try {
      if (editingTaskId) {
        const r = await API.updateTask(editingTaskId, data);
        allTasks = allTasks.map(t => t.id_tarea == editingTaskId ? r.task : t);
        // Actualizar la barra principal y todas las tareas propagadas
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

  /* ── Delete confirmation ────────────────────────────────── */
  function confirmDelete(taskId) {
    if (!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
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
    notesTaskId = taskId;
    const task = allTasks.find(t => t.id_tarea == taskId) || {};
    document.getElementById('notes-task-name').textContent = task.tarea || `Tarea #${taskId}`;
    document.getElementById('modal-notes').classList.remove('hidden');
    await refreshNotes();
  }

  async function refreshNotes() {
    const list = document.getElementById('notes-list');
    list.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Cargando...</div>';
    try {
      const notes = await API.getNotes(notesTaskId);
      if (!notes.length) {
        list.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Sin notas todavía.</div>';
        return;
      }
      list.innerHTML = notes.map(n => `
        <div class="note-item" data-id="${n.id_nota}">
          <div class="note-meta">
            ${n.autor || 'Sin autor'} — ${fmtDate(n.fecha_hora)}
            <button class="note-delete" onclick="UI.deleteNote(${n.id_nota})">×</button>
          </div>
          <div class="note-text">${escHtml(n.nota || '')}</div>
          ${n.link ? `<a href="${n.link}" target="_blank" style="font-size:10px;color:var(--cyan)">🔗 ${n.link}</a>` : ''}
        </div>`).join('');
    } catch (e) { list.innerHTML = '<div style="color:var(--red)">Error al cargar notas</div>'; }
  }

  async function saveNote() {
    const nota   = document.getElementById('field-nota').value.trim();
    const autor  = document.getElementById('field-nota-autor').value.trim();
    const link   = document.getElementById('field-nota-link').value.trim();
    if (!nota) { toast('Escribí una nota primero', 'error'); return; }
    try {
      await API.createNote({ tarea: notesTaskId, nota, autor: autor || null, link: link || null });
      document.getElementById('field-nota').value = '';
      document.getElementById('field-nota-link').value = '';
      await refreshNotes();
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
  function openProjectModal() {
    document.getElementById('field-proj-codigo').value = '';
    document.getElementById('field-proj-nombre').value = '';
    document.getElementById('field-proj-desc').value   = '';
    document.getElementById('field-proj-color').value  = '#6366f1';
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
      const p = await API.createProject(data);
      projects.push(p);
      renderProjectList();
      document.getElementById('modal-project').classList.add('hidden');
      toast(`Proyecto "${p.nombre_proyecto}" creado`, 'success');
      await selectProject(p.id_proyecto, p.color);
    } catch (e) { toast(e.error || 'Error al crear proyecto', 'error'); }
    finally { btn.disabled = false; }
  }

  /* ── Modals Responsable & Recurso ───────────────────────── */
  let editingResponsableId = null;
  let editingRecursoId = null;

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
      document.getElementById('modal-recurso').classList.add('hidden');
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
      : responsables.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">
          <div style="flex:1">
            <div style="font-weight:600;font-size:12px">${escHtml(r.nombre)}</div>
            <div style="font-size:10px;color:var(--text-muted)">${escHtml(r.correo)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); UI.editResponsable(${r.id_resp})">✏️</button>
          <button class="btn btn-ghost btn-danger btn-sm" onclick="event.stopPropagation(); UI.deleteResponsable(${r.id_resp})">🗑</button>
        </div>`).join('');

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
    if(!confirm('¿Eliminar este responsable?')) return;
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
    if(!confirm('¿Eliminar este recurso?')) return;
    try {
      await API.deleteRecurso(id);
      recursos = recursos.filter(x => x.id_recurso !== id);
      renderConfigLists();
      toast('Recurso eliminado', 'warning');
    } catch(e) { toast('Error al eliminar', 'error'); }
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
    // Cargar responsables y recursos para autocompletado
    try { 
      responsables = await API.getResponsables();
      recursos = await API.getResources();
    } catch(_) {}

    // Wiring modal cerrar — cada botón cierra SU propio modal, no todos
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(el =>
      el.addEventListener('click', () => {
        const modal = el.closest('.modal-overlay');
        if (modal) {
          modal.classList.add('hidden');
          if (modal.id === 'modal-task') editingTaskId = null;
          // Si se cancela la edición de un responsable/recurso que venía de Ajustes
          if ((modal.id === 'modal-responsable' && editingResponsableId) ||
              (modal.id === 'modal-recurso'     && editingRecursoId)) {
            document.getElementById('modal-config').classList.remove('hidden');
          }
          if (modal.id === 'modal-responsable') editingResponsableId = null;
          if (modal.id === 'modal-recurso')     editingRecursoId = null;
        }
      })
    );

    // Progress slider
    document.getElementById('field-avance').addEventListener('input', e => {
      document.getElementById('label-avance').textContent = `${Math.round(+e.target.value)}%`;
    });

    // Botones toolbar
    document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(null));
    document.getElementById('btn-new-project').addEventListener('click', openProjectModal);

    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        setTimeout(() => { if (window.gantt) gantt.render(); }, 250);
      });
    }

    // Guardar tarea
    document.getElementById('btn-save-task').addEventListener('click', saveTask);
    document.getElementById('field-tarea').addEventListener('keyup', e => { if (e.key === 'Enter') saveTask(); });

    // Eliminar tarea (desde modal)
    document.getElementById('btn-delete-task').addEventListener('click', () => {
      if (editingTaskId) confirmDelete(editingTaskId);
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
    if (!Auth.hasPerm('ALL')) {
      document.getElementById('btn-admin-users').style.display = 'none';
      if (!Auth.hasPerm('CREATE')) {
        document.getElementById('btn-new-project').style.display = 'none';
        document.getElementById('btn-new-task').style.display = 'none';
      }
    } else {
      document.getElementById('btn-admin-users').style.display = 'block';
    }
  }

  function setupUsersAdmin() {
    document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());

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
          <td style="padding:8px">${u.nombre}</td>
          <td style="padding:8px">${u.email}</td>
          <td style="padding:8px"><span style="font-size:10px;background:var(--bg-lighter);padding:2px 4px;border-radius:4px">${u.permisos}</span></td>
          <td style="padding:8px;text-align:right">
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
    document.getElementById('user-form-title').textContent = 'Editar Usuario';
    
    const pms = (u.permisos || '').split(',');
    document.querySelectorAll('.user-perm').forEach(c => c.checked = pms.includes(c.value));
    
    renderUserProjectsChecks(u.proyectos || '');
    
    document.getElementById('modal-user-form').classList.remove('hidden');
  }

  async function deleteUser(id) {
    if(!confirm('¿Estás seguro de eliminar este usuario?')) return;
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
    editUser, deleteUser
  };
})();

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loggedIn = await Auth.init();
  if (!loggedIn) return; // Se bloquea y se muestra Auth modal
  
  GanttApp.init();
  await UI.init();
});
