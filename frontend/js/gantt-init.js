/* ============================================================
   GANTT INIT — dhtmlx-gantt configuration & events
   ============================================================ */

window.GanttApp = (() => {
  let currentProjectId = null;
  let currentProjectColor = '#6366f1';
  let _ignoreUpdate = false; // evita loop en actualizaciones programáticas
  let _allProjectsMode = false;
  let _projectsMap = {}; // id_proyecto -> { nombre, codigo, color }

  /* ── Scales ─────────────────────────────────────────────── */
  const SCALES = {
    day: [
      { unit: 'month', step: 1, format: '%F %Y' },  // Enero 2026
      { unit: 'day',   step: 1,
        format: (d) => {
          const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
          // DHTMLX recorta si usamos <br> sin ajustar scale_height, mejor "Lun 13"
          return `${dias[d.getDay()]} ${d.getDate()}`;
        },
        css: d => d.getDay() === 0 ? 'weekend' : (d.getDay() === 6 ? 'saturday' : '')
      }
    ],
    week: [
      { unit: 'month', step: 1, format: '%F %Y' },  // Enero 2026
      { unit: 'week',  step: 1,
        format: (d) => {
          const end = new Date(d); end.setDate(d.getDate() + 6);
          const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          return `${d.getDate()} ${meses[d.getMonth()]} – ${end.getDate()} ${meses[end.getMonth()]}`;
        }
      }
    ],
    month: [
      { unit: 'year',  step: 1, format: '%Y' },
      { unit: 'month', step: 1, format: '%F' }       // Enero, Febrero...
    ]
  };
  let currentScale = 'week';

  /* ── Configure gantt ─────────────────────────────────────── */
  function configure() {
    gantt.plugins({ tooltip: true, marker: true });

    gantt.config.date_format  = '%Y-%m-%d';
    gantt.config.xml_date     = '%Y-%m-%d';
    gantt.config.duration_unit = 'day';
    gantt.config.duration_step = 1;
    gantt.config.scale_height  = 50; // Más espacio para mes y días
    gantt.config.row_height    = 42;
    gantt.config.task_height   = 26;
    gantt.config.bar_height    = 20;
    gantt.config.link_radius   = 6;
    gantt.config.grid_width    = 590;
    gantt.config.min_duration  = 86400000; // 1 day in ms
    gantt.config.drag_links    = true;
    gantt.config.drag_progress = true;
    gantt.config.drag_resize   = true;
    gantt.config.drag_move     = true;
    gantt.config.show_errors   = false;
    gantt.config.autosize      = false;
    gantt.config.fit_tasks     = false;
    gantt.config.open_tree_initially = true;
    gantt.config.show_markers  = true;

    // Idioma español simplificado
    gantt.locale.labels.section_description = 'Descripción';
    gantt.locale.date = {
      month_full: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
      month_short: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
      day_full: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
      day_short: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
    };

    applyScale(currentScale);

    /* ── Columns ──────────────────────────────────────────── */
    gantt.config.columns = [
      {
        name: 'text', label: 'Tarea', tree: true, width: 160,
        template: t => `<span title="${t.text || ''}">${t.text || ''}</span>`
      },
      {
        name: 'project_col', label: 'Proyecto', width: 120, align: 'left',
        template: t => {
          const name = t._projectName || '';
          const color = t.color || '#6366f1';
          if (!name) return '';
          return `<span style="font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">
            <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
            ${name}
          </span>`;
        }
      },
      {
        name: 'responsable', label: 'Responsable', width: 100, align: 'left',
        template: t => {
          const r = t.responsable || '';
          const name = r.includes('@') ? r.split('@')[0] : r;
          return `<span style="font-size:11px;color:var(--text-muted)" title="${r}">${name || '—'}</span>`;
        }
      },
      {
        name: 'start_date', label: 'Inicio', width: 80, align: 'center',
        template: t => t.start_date ? gantt.templates.date_grid(t.start_date) : '—'
      },
      {
        name: 'duration_col', label: 'Días', width: 45, align: 'center',
        template: t => t._raw?.duracion_dias || parseInt(t.duration) || 1
      },
      {
        name: 'costo_col', label: 'Costo', width: 65, align: 'right',
        template: t => {
          const v = parseFloat(t._raw?.costo_tarea || t._costo || 0);
          return v > 0 ? `<span style="font-size:11px;color:var(--text-muted)">$${v.toLocaleString('es-AR',{maximumFractionDigits:0})}</span>` : '';
        }
      },
      {
        name: 'avance_col', label: '%', width: 42, align: 'center',
        template: t => `<span style="font-size:11px;color:var(--indigo)">${Math.round((t.progress||0)*100)}%</span>`
      },
      {
        name: 'tipo_dias', label: '📅', width: 34, align: 'center',
        template: t => t._tipo_dias === 'laboral'
          ? '<span title="Días laborales (Lun-Sáb)">🗓</span>'
          : '<span title="Días calendario">📅</span>'
      },
      {
        name: 'estado_col', label: 'Estado', width: 100, align: 'center',
        template: t => estadoBadge(t._estado)
      },
      { name: 'add', label: '', width: 38 }
    ];

    /* ── Templates ────────────────────────────────────────── */
    gantt.templates.date_grid = d =>
      d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

    gantt.templates.task_class = (s, e, t) => {
      const pct = Math.round((t.progress || 0) * 100);
      if (pct >= 100) return 'task-done';
      if (pct > 0)    return 'task-progress';
      return 'task-pending';
    };

    gantt.templates.task_text = (s, e, t) => {
      const initials = (t.responsable || '')
        .split('@')[0].substring(0, 2).toUpperCase() || '??';
      return `<span class="task-bar-label">${t.text || ''}</span>
              <span class="task-bar-resp" title="${t.responsable || ''}">${initials}</span>`;
    };

    gantt.templates.tooltip_text = (s, e, t) => `
      <div style="min-width:180px">
        <strong style="font-size:13px">${t.text || ''}</strong><br>
        <div style="margin-top:6px;line-height:2">
          <span style="color:var(--text-muted)">Proyecto:</span> ${t._projectName || '—'}<br>
          <span style="color:var(--text-muted)">Inicio:</span> ${gantt.templates.date_grid(s)}<br>
          <span style="color:var(--text-muted)">Fin:</span> ${gantt.templates.date_grid(e)}<br>
          <span style="color:var(--text-muted)">Días:</span> ${t.duration} (${t._tipo_dias || 'calendario'})<br>
          <span style="color:var(--text-muted)">Avance:</span> ${Math.round((t.progress||0)*100)}%<br>
          <span style="color:var(--text-muted)">Responsable:</span> ${t.responsable || '—'}
        </div>
      </div>`;

    gantt.templates.link_class = () => 'gantt-link';

    // Disable default lightbox → usamos modal propio
    gantt.showLightbox = id => UI.openTaskModal(gantt.getTask(id));

    gantt.attachEvent('onTaskCreated', (task) => {
      UI.openTaskModal(null);
      return false; // bloquea la creación nativa de dhtmlx
    });

    /* ── Events ───────────────────────────────────────────── */
    gantt.attachEvent('onAfterTaskDrag', (id, mode, e) => {
      if (_ignoreUpdate) return;
      const t = gantt.getTask(id);
      const fmt = gantt.date.date_to_str('%Y-%m-%d');
      const newStart = fmt(t.start_date);
      
      // Convertir la duración visual (calendar days) a días lógicos según tipo_dias
      let realDur = 0;
      let curr = new Date(t.start_date);
      const end = new Date(t.end_date);
      while (curr < end) {
        if (t._tipo_dias !== 'laboral' || curr.getDay() !== 0) realDur++;
        curr.setDate(curr.getDate() + 1);
      }
      const newDur = Math.max(1, realDur);

      API.updateTask(id, {
        fecha_inicio:  newStart,
        duracion_dias: newDur
      }).then(r => {
        // Actualizar el _raw para que la edición desde modal muestre l os datos correctos
        if (gantt.isTaskExists(id)) {
          const gt = gantt.getTask(id);
          gt._raw = r.task;
          // NO tocar start_date/duration del task draggeado (ya está bien en pantalla)
        }
        // Propagar cambios a dependientes
        const dependientes = r.updatedTasks.filter(t2 => t2.id_tarea != id);
        if (dependientes.length) applyUpdatedTasks(dependientes, null);
        updateSummary();
      }).catch(e => UI.toast(e.error || 'Error al actualizar', 'error'));
    });

    gantt.attachEvent('onAfterProgressDrag', id => {
      if (_ignoreUpdate) return;
      const t = gantt.getTask(id);
      const avance = Math.round(t.progress * 100);
      API.updateTask(id, { avance })
        .then(r => applyUpdatedTasks(r.updatedTasks, id))
        .catch(e => UI.toast(e.error || 'Error al actualizar', 'error'));
    });

    // Link creado → agregar dependencia
    gantt.attachEvent('onAfterLinkAdd', (id, link) => {
      if (_ignoreUpdate) return;
      const targetTask = gantt.getTask(link.target);
      const existing = (targetTask._dependencias || '').split(',').map(d => d.trim()).filter(Boolean);
      if (!existing.includes(String(link.source))) {
        existing.push(String(link.source));
      }
      const newDeps = existing.join(',');
      API.updateTask(link.target, { dependencias: newDeps })
        .then(r => {
          targetTask._dependencias = newDeps;
          applyUpdatedTasks(r.updatedTasks, link.target);
          UI.toast('Dependencia creada', 'success');
        })
        .catch(e => {
          UI.toast(e.error || 'Error al crear dependencia', 'error');
          _ignoreUpdate = true;
          gantt.deleteLink(id);
          _ignoreUpdate = false;
        });
    });

    // Link eliminado → quitar dependencia
    gantt.attachEvent('onAfterLinkDelete', (id, link) => {
      if (_ignoreUpdate) return;
      const targetTask = gantt.getTask(link.target);
      const existing = (targetTask._dependencias || '').split(',').map(d => d.trim()).filter(d => d && d !== String(link.source));
      const newDeps = existing.join(',') || null;
      API.updateTask(link.target, { dependencias: newDeps })
        .then(r => {
          targetTask._dependencias = newDeps || '';
          applyUpdatedTasks(r.updatedTasks, link.target);
          UI.toast('Dependencia eliminada', 'warning');
        })
        .catch(e => UI.toast(e.error || 'Error al eliminar dependencia', 'error'));
    });

    // Task eliminada (botón del gantt)
    gantt.attachEvent('onBeforeTaskDelete', id => {
      UI.confirmDelete(id);
      return false; // bloqueamos el borrado nativo, lo hacemos vía API
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function estadoBadge(estado) {
    const map = {
      'No comenzada': 'badge-no-comenzada',
      'En progreso':  'badge-en-progreso',
      'Finalizada':   'badge-finalizada'
    };
    const cls = map[estado] || 'badge-no-comenzada';
    return `<span class="badge ${cls}">${estado || '—'}</span>`;
  }

  function dbTaskToGantt(t, color) {
    const startStr = t.dependencias && t.fecha_inicio_proyectada
      ? t.fecha_inicio_proyectada
      : t.fecha_inicio;
      
    let endStr = undefined;
    if (t.fecha_fin) {
      // Para que el Gantt dibuje visualmente hasta el día correcto,
      // end_date debe ser el día posterior a fecha_fin (es exclusivo).
      const end = new Date(t.fecha_fin + 'T00:00:00');
      if (!isNaN(end.getTime())) {
        end.setDate(end.getDate() + 1);
        endStr = gantt.date.date_to_str('%Y-%m-%d')(end);
      }
    }

    // Resolve project info
    const projInfo = _projectsMap[t.id_proyecto] || {};

    return {
      id:           t.id_tarea,
      text:         t.tarea,
      start_date:   startStr || t.fecha_inicio,
      end_date:     endStr,
      duration:     endStr ? undefined : (parseInt(t.duracion_dias) || 1),
      progress:     parseFloat(t.avance || 0) / 100,
      color:        color || '#6366f1',
      // extra campos para templates y edición
      _estado:      t.estado,
      _tipo_dias:   t.tipo_dias,
      _dependencias: t.dependencias || '',
      _costo:       parseFloat(t.costo_tarea) || 0,
      responsable:  t.responsable,
      // project info for exports
      _projectName: projInfo.nombre || '',
      _projectCode: projInfo.codigo || '',
      // DB raw
      _raw: t
    };
  }

  function buildLinks(tasks) {
    const links = [];
    const seen  = new Set();
    tasks.forEach(t => {
      if (!t.dependencias) return;
      t.dependencias.split(',').map(d => d.trim()).filter(Boolean).forEach(src => {
        const key = `${src}_${t.id_tarea}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ id: key, source: parseInt(src), target: t.id_tarea, type: '0' });
        }
      });
    });
    return links;
  }

  function applyUpdatedTasks(updatedTasks, skipId) {
    if (!updatedTasks) return;
    _ignoreUpdate = true;
    updatedTasks.forEach(t => {
      if (!gantt.isTaskExists(t.id_tarea)) return;
      // Si el usuario acabó de arrastrar esta tarea, no pisar su posición
      // (sólo actualizamos las tareas dependientes propagadas)
      if (skipId !== null && skipId !== undefined && t.id_tarea == skipId) {
        // Sólo actualizamos metadatos, la posición ya la tiene el gantt correcta
        const gt = gantt.getTask(t.id_tarea);
        gt._estado      = t.estado;
        gt._tipo_dias   = t.tipo_dias;
        gt._dependencias = t.dependencias || '';
        gt._raw         = t;
        gantt.updateTask(t.id_tarea);
        return;
      }
      const gt = gantt.getTask(t.id_tarea);
      const start = t.dependencias && t.fecha_inicio_proyectada
        ? t.fecha_inicio_proyectada
        : t.fecha_inicio;
      gt.start_date   = gantt.date.parseDate(start, 'xml_date');
      gt.duration     = parseInt(t.duracion_dias) || 1;
      gt.progress     = parseFloat(t.avance || 0) / 100;
      gt._estado      = t.estado;
      gt._tipo_dias   = t.tipo_dias;
      gt._dependencias = t.dependencias || '';
      gt._raw         = t;
      gantt.updateTask(t.id_tarea);
    });
    _ignoreUpdate = false;
    updateSummary();
  }

  function updateSummary() {
    try {
      const tasks = gantt.getTaskByTime();
      const ids = tasks.map(t => t.id);
      const total = ids.length;
      let done = 0, inProg = 0, totalCosto = 0, aplicado = 0;
      let minDate = null, maxDate = null;

      ids.forEach(id => {
        const t = gantt.getTask(id);
        const p = Math.round(t.progress * 100);
        if (p >= 100) done++;
        else if (p > 0) inProg++;

        const costo = parseFloat(t._raw?.costo_tarea || t._costo || 0);
        totalCosto += costo;
        if (t._estado === 'Finalizada' || p >= 100) {
          aplicado += costo;
        }

        // Track min start and max end dates
        if (t.start_date) {
          const sd = new Date(t.start_date);
          if (!minDate || sd < minDate) minDate = sd;
        }
        if (t.end_date) {
          const ed = new Date(t.end_date);
          if (!maxDate || ed > maxDate) maxDate = ed;
        }
      });
      const notStart = total - done - inProg;

      const fmtCur = n => '$' + n.toLocaleString('es-AR', {maximumFractionDigits:0});
      const fmtDateShort = d => {
        if (!d) return '--';
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      };
      const el = id => document.getElementById(id);
      if(el('stat-total'))    el('stat-total').textContent    = total;
      if(el('stat-done'))     el('stat-done').textContent     = done;
      if(el('stat-progress')) el('stat-progress').textContent = inProg;
      if(el('stat-pending'))  el('stat-pending').textContent  = notStart;
      if(el('stat-costo-total'))    el('stat-costo-total').textContent    = fmtCur(totalCosto);
      if(el('stat-total-aplicado')) el('stat-total-aplicado').textContent = fmtCur(aplicado);

      // Project dates
      if(el('stat-fecha-inicio')) el('stat-fecha-inicio').textContent = fmtDateShort(minDate);
      // maxDate from Gantt is exclusive (day after last), so subtract 1 day
      if(el('stat-fecha-fin')) {
        if (maxDate) {
          const adjustedEnd = new Date(maxDate);
          adjustedEnd.setDate(adjustedEnd.getDate() - 1);
          el('stat-fecha-fin').textContent = fmtDateShort(adjustedEnd);
        } else {
          el('stat-fecha-fin').textContent = '--';
        }
      }
    } catch(_) {}
  }

  function applyScale(scale) {
    currentScale = scale;
    gantt.config.scales = SCALES[scale];
    gantt.render();
    document.getElementById('scale-label').textContent = { day:'Días', week:'Semanas', month:'Meses' }[scale];
  }

  /* ── Public API ──────────────────────────────────────────── */
  function init() {
    configure();
    gantt.init('gantt_here');

    // Marker de hoy
    addTodayMarker();

    // Toolbar: zoom
    document.getElementById('btn-zoom-day').addEventListener('click',   () => applyScale('day'));
    document.getElementById('btn-zoom-week').addEventListener('click',  () => applyScale('week'));
    document.getElementById('btn-zoom-month').addEventListener('click', () => applyScale('month'));
    document.getElementById('btn-today').addEventListener('click', () => gantt.showDate(new Date()));

    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    if (btnToggleGrid) {
      btnToggleGrid.addEventListener('click', () => {
        gantt.config.show_grid = !gantt.config.show_grid;
        gantt.render();
      });
    }
  }

  /* ── Today marker helper (clearAll removes markers) ───── */
  function addTodayMarker() {
    gantt.addMarker({
      start_date: new Date(),
      css: 'today-marker',
      text: 'Hoy',
      title: new Date().toLocaleDateString('es')
    });
  }

  function setProjectsMap(projects) {
    _projectsMap = {};
    projects.forEach(p => {
      _projectsMap[p.id_proyecto] = {
        nombre: p.nombre_proyecto,
        codigo: p.proyecto,
        color:  p.color
      };
    });
  }

  function loadProject(projectId, color) {
    currentProjectId    = projectId;
    currentProjectColor = color || '#6366f1';
    _allProjectsMode    = false;
    return API.getProjectTasks(projectId).then(tasks => {
      const gtasks = tasks.map(t => dbTaskToGantt(t, currentProjectColor));
      const links  = buildLinks(tasks);
      gantt.clearAll();
      gantt.parse({ data: gtasks, links });
      addTodayMarker();
      
      // Ampliar la linea de tiempo para poder navegar hacia fechas vacías
      const state = gantt.getState();
      const today = new Date();
      if (state.min_date && state.max_date) {
        const expandStart = new Date(Math.min(state.min_date.getTime(), today.getTime()));
        expandStart.setMonth(expandStart.getMonth() - 2);
        const expandEnd = new Date(Math.max(state.max_date.getTime(), today.getTime()));
        expandEnd.setMonth(expandEnd.getMonth() + 4);
        gantt.config.start_date = expandStart;
        gantt.config.end_date   = expandEnd;
      }

      gantt.render();
      if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
      if (state.min_date) gantt.showDate(state.min_date);
      updateSummary();
    });
  }

  async function loadAllProjects() {
    currentProjectId    = '__all__';
    _allProjectsMode    = true;

    const allTasks = await API.getTasks();
    const allGtasks = [];
    const allRawTasks = [];

    allTasks.forEach(t => {
      const projInfo = _projectsMap[t.id_proyecto];
      const color = projInfo ? projInfo.color : '#6366f1';
      allGtasks.push(dbTaskToGantt(t, color));
      allRawTasks.push(t);
    });

    const links = buildLinks(allTasks);
    gantt.clearAll();
    gantt.parse({ data: allGtasks, links });
    addTodayMarker();

    const state = gantt.getState();
    const today = new Date();
    if (state.min_date && state.max_date) {
      const expandStart = new Date(Math.min(state.min_date.getTime(), today.getTime()));
      expandStart.setMonth(expandStart.getMonth() - 2);
      const expandEnd = new Date(Math.max(state.max_date.getTime(), today.getTime()));
      expandEnd.setMonth(expandEnd.getMonth() + 4);
      gantt.config.start_date = expandStart;
      gantt.config.end_date   = expandEnd;
    }

    gantt.render();
    if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
    if (state.min_date) gantt.showDate(state.min_date);
    updateSummary();
    return allRawTasks;
  }

  function addTask(dbTask) {
    _ignoreUpdate = true;
    gantt.addTask(dbTaskToGantt(dbTask, currentProjectColor));
    _ignoreUpdate = false;
    updateSummary();
  }

  function refreshTask(dbTask) {
    applyUpdatedTasks([dbTask], null);
  }

  function applyAllUpdated(updatedTasks) {
    applyUpdatedTasks(updatedTasks, null);
  }

  function removeTask(id) {
    _ignoreUpdate = true;
    if (gantt.isTaskExists(id)) gantt.deleteTask(id);
    _ignoreUpdate = false;
    updateSummary();
  }

  function getCurrentProjectId() { return currentProjectId; }
  function isAllProjects() { return _allProjectsMode; }

  return { init, loadProject, loadAllProjects, setProjectsMap, addTask, refreshTask, applyAllUpdated, removeTask, getCurrentProjectId, isAllProjects, updateSummary };
})();
