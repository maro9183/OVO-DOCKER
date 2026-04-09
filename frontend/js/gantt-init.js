/* ============================================================
   GANTT INIT — dhtmlx-gantt configuration & events
   ============================================================ */

window.GanttApp = (() => {
  let currentProjectId = null;
  let currentProjectColor = '#6366f1';
  let _ignoreUpdate = false; // evita loop en actualizaciones programáticas
  let _allProjectsMode = false;
  let _projectsMap = {}; // id_proyecto -> { nombre, codigo, color }

  let _colorMode = 'project';
  const _responsableColors = {};
  const _palette = ['#e11d48', '#d946ef', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#22c55e', '#f59e0b', '#f97316'];
  let _paletteIdx = 0;

  function getColorMode() { return _colorMode; }
  function setColorMode(mode) { _colorMode = mode; }
  
  function getResponsableColor(resp) {
    if (!resp) return '#94a3b8'; // gris
    const key = String(resp).split('@')[0];
    if (!_responsableColors[key]) {
      _responsableColors[key] = _palette[_paletteIdx % _palette.length];
      _paletteIdx++;
    }
    return _responsableColors[key];
  }

  function toggleColorMode() {
    _colorMode = (_colorMode === 'project') ? 'responsable' : 'project';
    
    // Actualizar visual del botón
    const btn = document.getElementById('btn-toggle-color');
    if (btn) {
      if (_colorMode === 'responsable') {
        btn.innerHTML = '🎨 Responsables';
        btn.style.backgroundColor = 'var(--indigo)';
        btn.style.color = '#ffffff';
        btn.style.borderColor = 'var(--indigo)';
      } else {
        btn.innerHTML = '🎨 Proyecto';
        btn.style.backgroundColor = '#ffffff';
        btn.style.color = '#000000';
        btn.style.borderColor = '#d1d5db';
      }
    }

    // Refrescar colores de todas las tareas en el gantt en MODO SILENCIOSO 
    _ignoreUpdate = true;  // Apaga temporalmente el DataProcessor
    gantt.eachTask(task => {
      let finalColor;
      if (_colorMode === 'responsable') {
        finalColor = getResponsableColor(task.responsable);
      } else {
        // En modo proyecto, recuperamos el color base
        if (task._es_compra) {
          // Si es compra, chequeamos si estamos en vista combinada o solo compras
          const isCombined = document.getElementById('btn-view-combined')?.classList.contains('active');
          if (isCombined) {
            finalColor = '#ffffff';
          } else {
            finalColor = _projectsMap[task._raw?.id_proyecto]?.color || '#4f8ef7';
          }
        } else {
          finalColor = _projectsMap[task._raw?.id_proyecto]?.color || currentProjectColor;
        }
      }
      task.color = finalColor;
      task.textColor = (finalColor === '#ffffff' || finalColor === '#fff') ? '#0f172a' : undefined;
      gantt.updateTask(task.id);
    });
    gantt.render();
    
    // Devolvemos el control al DataProcessor una vez aplicado el renderizado visual local
    _ignoreUpdate = false;
  }

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
  let currentScale = 'month';

  /* ── Configure gantt ─────────────────────────────────────── */
  function configure() {
    gantt.config.show_grid = false;
    gantt.config.open_tree_initially = false;
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
    gantt.config.grid_width    = 800;
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
    gantt.config.order_branch = true;
    gantt.config.order_branch_free = true;

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

    let   isMobile          = window.innerWidth < 768;
    
    /* ── Columns ──────────────────────────────────────────── */
    gantt.config.columns = [
      {
        name: 'text', label: 'Tarea', tree: true, width: isMobile ? 180 : 250,
        template: t => {
          const today = new Date(); today.setHours(0,0,0,0);
          const tStart = new Date(t.start_date); tStart.setHours(0,0,0,0);
          const isDelayed = (tStart <= today && (t.progress || 0) === 0 && t._estado !== 'Finalizada');
          const color = isDelayed ? 'var(--red)' : 'inherit';
          return `<span style="font-weight:600; color:${color}">${t.text || ''}</span>`;
        }
      },
      {
        name: 'sub_col', label: 'Subs', width: 45, align: 'center', hide: isMobile,
        template: t => {
          const count = gantt.getChildren(t.id).length;
          return count > 0 ? `<span class="badge" style="background:var(--bg-header);color:var(--text-dim);font-size:10px;padding:2px 6px">${count}</span>` : '';
        }
      },
      {
        name: 'project_col', label: 'Proyecto', width: 100, align: 'left', hide: isMobile,
        template: t => `<span style="font-size:10px;font-weight:600;color:var(--text-dim)">${t._projectName || ''}</span>`
      },
      {
        name: 'responsable', label: 'Resp.', width: 80, align: 'left', hide: isMobile,
        template: t => {
          const r = t.responsable || '';
          return `<span style="font-size:11px;color:var(--text-muted)">${r.split('@')[0] || '—'}</span>`;
        }
      },
      {
        name: 'start_date', label: 'Inicio', width: 80, align: 'center', hide: isMobile,
        template: t => t.start_date ? gantt.templates.date_grid(t.start_date) : '—'
      },
      {
        name: 'estado_col', label: 'Estado', width: 90, align: 'center',
        template: t => estadoBadge(t)
      },
      {
        name: 'notes_col', label: 'Notas', width: 45, align: 'center',
        template: t => {
          let html = '';
          // Indicador de Compra
          if (t._es_compra) {
            html += `<div style="display:inline-flex; justify-content:center; align-items:center; width:22px; height:22px; background:var(--cyan, #06b6d4); color:#000; font-weight:900; font-size:12px; border-radius:4px; margin-right:4px;" title="Es una Compra">C</div>`;
          }
          // Ícono de Notas (si tiene)
          if (t.note_count > 0) {
            html += `<div class="note-col-trigger" data-id="${t.id}" style="display:inline-flex; justify-content:center; align-items:center; width:22px; height:22px; background:var(--indigo, #6366f1); color:#fff; border-radius:4px; cursor:pointer;" title="Ver Notas">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>`;
          }
          return `<div style="display:flex; align-items:center; justify-content:center; height:100%;">${html}</div>`;
        }
      }
    ];

    /* ── Templates ────────────────────────────────────────── */
    gantt.templates.date_grid = d =>
      d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

    gantt.templates.task_class = (s, e, t) => {
      let baseClass = t._es_compra ? 'purchase-task' : '';
      if (!t._es_compra) {
        const pct = Math.round((t.progress || 0) * 100);
        if (pct >= 100) baseClass = 'task-done';
        else if (pct > 0) baseClass = 'task-progress';
        else baseClass = 'task-pending';
      }
      if (t._auto_retrasada) baseClass += ' auto-delayed-task';
      return baseClass;
    };

    gantt.templates.task_text = (start, end, task) => {
      const respName = (window.PurchaseModule && window.PurchaseModule.getResponsableName) 
        ? window.PurchaseModule.getResponsableName(task.responsable) : task.responsable;
      const initials = (respName || '').split('@')[0].substring(0, 2).toUpperCase() || '??';
      const tc = task.textColor ? `color:${task.textColor} !important;` : '';
      
      // 1. Texto base original
      let html = `<span class="task-bar-label" style="${tc}">${task.text || ''}</span>
                  <span class="task-bar-resp" title="${respName || ''}" style="${tc}">${initials}</span>`;
                  
      // 2. Función helper para dibujar segmentos
      const drawAbsoluteSegment = (sDateStr, eDateStr, className, topOffset, height, isPoint = false) => {
        if (!sDateStr) return '';
        const sDate = gantt.date.parseDate(sDateStr, "xml_date");
        if (!sDate) return '';
        let width = isPoint ? 10 : 0;
        let left = gantt.posFromDate(sDate) - gantt.posFromDate(task.start_date);
        
        if (!isPoint && eDateStr) {
          const eDate = gantt.date.parseDate(eDateStr, "xml_date");
          if (eDate) {
            eDate.setDate(eDate.getDate() + 1); // Exclusivo
            width = gantt.posFromDate(eDate) - gantt.posFromDate(sDate);
          }
        }
        if (width <= 0 && !isPoint) return ''; // No dibujar si es negativo o cero
        if (width < 5 && !isPoint)  width = 5;  // Seguridad de visibilidad
        
        // Corrección visual si isPoint
        if (isPoint) left -= 5; 
        
        return `<div class="${className}" style="position:absolute; left:${left}px; top:${topOffset}px; width:${width}px; height:${height}px;"></div>`;
      };

      // 3. Capa Baseline
      if (task._f_inicio_base && task._f_fin_base) {
        html += drawAbsoluteSegment(task._f_inicio_base, task._f_fin_base, 'layer-baseline', -2, 24);
      }

      // 4. Capa Real
      if (task._f_real_ini) {
        // Si no terminó, dibujar hasta hoy
        const endRealStr = task._f_real_fin || gantt.date.date_to_str("%Y-%m-%d")(new Date());
        html += drawAbsoluteSegment(task._f_real_ini, endRealStr, 'layer-real', 18, 6);
      }

      // 5. Segmentos de Compra
      if (task._es_compra && task._compra) {
        const c = task._compra;
        html += drawAbsoluteSegment(c.f_solicitud, c.f_arribo_nec, 'purchase-segment purchase-req-arr', 0, 20);
        html += drawAbsoluteSegment(c.f_oc, c.f_comp, 'purchase-segment purchase-oc-comp', 0, 20);
        if (c.f_ent) {
          html += drawAbsoluteSegment(c.f_ent, null, 'purchase-milestone-marker purchase-delivered', 6, 8, true);
        }
      }

      // 6. Líneas divisorias de ciclo de vida (Solo para tareas de obra)
      const drawVerticalDivider = (dateStr, color, label) => {
        if (!dateStr) return '';
        const d = gantt.date.parseDate(dateStr, "xml_date");
        if (!d) return '';
        const left = gantt.posFromDate(d) - gantt.posFromDate(task.start_date);
        return `<div class="task-timeline-divider" style="left:${left}px; background-color:${color};" title="${label}: ${dateStr}"></div>`;
      };

      if (!task._es_compra) {
        if (task._f_inicio_base && task._f_inicio_base !== task._f_inicio_proy) {
          html += drawVerticalDivider(task._f_inicio_base, 'rgba(255,255,255,0.6)', 'Inicio Base');
        }
        if (task._f_inicio_proy) {
          html += drawVerticalDivider(task._f_inicio_proy, 'rgba(14, 165, 233, 0.8)', 'Inicio Proyectado');
        }
        if (task._f_real_ini) {
          html += drawVerticalDivider(task._f_real_ini, 'rgba(34, 197, 94, 0.9)', 'Real Iniciada');
        }
        if (task._f_fin_proy) {
          html += drawVerticalDivider(task._f_fin_proy, 'rgba(245, 158, 11, 0.8)', 'Fin Proyectada');
        }
        if (task._f_real_fin) {
          html += drawVerticalDivider(task._f_real_fin, 'rgba(34, 197, 94, 1)', 'Real Completada');
        }
      }

      return html;
    };

    gantt.templates.tooltip_text = (s, e, t) => {
      return `
      <div style="min-width:180px">
        <strong style="font-size:13px">${t.text || ''}</strong><br>
        <div style="margin-top:6px;line-height:2">
          <span style="color:var(--text-muted)">Proyecto:</span> ${t._projectName || '-'}<br>
          <span style="color:var(--text-muted)">Inicio:</span> ${gantt.templates.date_grid(s)}<br>
          <span style="color:var(--text-muted)">Fin:</span> ${gantt.templates.date_grid(e)}<br>
          <span style="color:var(--text-muted)">Estado:</span> ${estadoBadge(t)}<br>
          <span style="color:var(--text-muted)">Progreso:</span> <span style="color:var(--indigo);font-weight:600">${Math.round((t.progress||0)*100)}%</span><br>
          <span style="color:var(--text-muted)">Días:</span> ${t.duration} (${t._tipo_dias || 'calendario'})<br>
          <span style="color:var(--text-muted)">Avance:</span> ${Math.round((t.progress||0)*100)}%<br>
          <span style="color:var(--text-muted)">Responsable:</span> ${(window.PurchaseModule && window.PurchaseModule.getResponsableName) ? window.PurchaseModule.getResponsableName(t.responsable) : (t.responsable || '-')}
        </div>
      </div>`;
    };

    // ── Mapeado de Salida Centralizado (DataProcessor) ─────────────────────
    // Semáforo de red: clave = "entity_id", valor = timestamp del inicio
    const _savingIds = new Map();
    const SAVE_TIMEOUT_MS = 8000; // Auto-liberar si la promesa muere en silencio

    gantt.createDataProcessor((entity, action, data, id) => {
      if (_ignoreUpdate) return;

      // ── Semáforo anti-multi-fire ─────────────────────────────────
      const lockKey = `${entity}_${id}`;
      const now = Date.now();
      const existingTs = _savingIds.get(lockKey);
      if (existingTs && (now - existingTs) < SAVE_TIMEOUT_MS) {
        console.warn('[DataProcessor] Multi-fire bloqueado:', lockKey, action);
        return Promise.resolve({ tid: id });
      }
      _savingIds.set(lockKey, now);
      const releaseLock = () => _savingIds.delete(lockKey);

      const taskObj = (entity === 'task' && gantt.isTaskExists(id)) ? gantt.getTask(id) : data;
      console.log('[DP]', action, entity, 'id:', id);

      const isPurchase = String(id).startsWith('pur_');
      const cleanId = isPurchase ? String(id).replace('pur_', '') : String(id);
      const fmt = gantt.date.date_to_str('%Y-%m-%d');

      // Sanitizar id_proyecto
      let finalProjectId = taskObj.id_proyecto || currentProjectId;
      if (!finalProjectId || finalProjectId === '__all__') {
        finalProjectId = taskObj._raw?.id_proyecto || (Object.keys(_projectsMap)[0]);
      }
      if (finalProjectId) finalProjectId = parseInt(finalProjectId) || finalProjectId;

      // ── 1. Links (Dependencias) ───────────────────────────────────
      if (entity === 'link') {
        if (action === 'create') {
          return API.createLink(data)
            .then(r => { releaseLock(); UI.toast('Dependencia creada', 'success'); return { tid: id }; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'delete') {
          return API.deleteLink(data)
            .then(() => { releaseLock(); UI.toast('Dependencia eliminada', 'warning'); return { tid: id }; })
            .catch(e => { releaseLock(); throw e; });
        }
        releaseLock();
        return;
      }

      // ── 2. Compras ─────────────────────────────────────────────
      if (isPurchase) {
        const p = taskObj._compra || {};
        const VALID_STATES = ['solicitada','solicitando presupuesto','presupuesto recibido','OC emitida','fecha comprometida','entregado'];
        let finalEstado = taskObj._estado || p.estado || 'solicitada';
        if (!VALID_STATES.includes(finalEstado)) finalEstado = 'solicitada';

        // FUENTE AUTORITATIVA: leer desde _compra cuando está disponible
        // Solo derivar del end_date como fallback
        const fSol = p.f_solicitud || fmt(taskObj.start_date);
        const fArr = p.f_arribo_nec ||
          (taskObj.end_date ? fmt(new Date(taskObj.end_date.getTime() - 86400000)) : null);

        const purchasePayload = {
          producto:              taskObj.text || taskObj.tarea || 'Compra',
          fecha_solicitud:       fSol,
          fecha_arribo_necesaria: fArr,
          id_proyecto:           finalProjectId,
          id_tarea:              p.id_tarea         || null,
          id_solicitante:        p.id_solicitante   || null,
          id_responsable:        p.id_responsable   || null,
          cantidad:              p.cantidad         || 1,
          valor_unitario:        p.valor_unitario   || 0,
          estado:                finalEstado,
          fecha_oc_emitida:      p.fecha_oc_emitida || p.f_oc   || null,
          fecha_comprometida:    p.fecha_comprometida || p.f_comp || null,
          fecha_entregado:       p.fecha_entregado  || p.f_ent  || null,
          notas:                 p.notas            || null,
          dependencias:          data.dependencias || taskObj.dependencias || p.dependencias || null
        };

        // Eliminar campos null (MySQL strict mode)
        Object.keys(purchasePayload).forEach(k => {
          if (purchasePayload[k] === null || purchasePayload[k] === undefined) delete purchasePayload[k];
        });

        if (action === 'update') {
          return API.updatePurchase(cleanId, purchasePayload)
            .then(r => {
              releaseLock();
              if (taskObj._compra) {
                Object.assign(taskObj._compra, { f_solicitud: fSol, f_arribo_nec: fArr });
              }
              UI.toast('Compra guardada ✅', 'success');
              updateSummary();
              return { tid: id };
            })
            .catch(e => { releaseLock(); console.error('[DP] updatePurchase err:', e); throw e; });
        }
        if (action === 'delete') {
          return API.deletePurchase(cleanId)
            .then(() => { releaseLock(); return {}; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'create') {
          // El modal crea compras directamente via API.createPurchase()
          // Si el DP llega aquí es un disparo fantasma de DHTMLX — bloquearlo
          console.warn('[DP] Purchase create bloqueado — el modal usa API directa');
          releaseLock();
          return Promise.resolve({ tid: id });
        }

      } else {
        // ── 3. Tareas de Obra ────────────────────────────────────
        if (action === 'update') {
          let realDur = 0;
          let curr = new Date(taskObj.start_date);
          const end = new Date(taskObj.end_date);
          while (curr < end) {
            if (taskObj._tipo_dias !== 'laboral' || curr.getDay() !== 0) realDur++;
            curr.setDate(curr.getDate() + 1);
          }
          const taskPayload = {
            ...data,
            id_proyecto:   finalProjectId,
            fecha_inicio:  fmt(taskObj.start_date),
            duracion_dias: Math.max(1, realDur),
            avance:        Math.round((taskObj.progress || 0) * 100)
          };
          return API.updateTask(cleanId, taskPayload)
            .then(r => {
              releaseLock();
              _ignoreUpdate = true;
              applyUpdatedTasks(r.updatedTasks, id);
              _ignoreUpdate = false;
              updateSummary();
              return { tid: id };
            })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'delete') {
          return API.deleteTask(cleanId)
            .then(() => { releaseLock(); return {}; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'create') {
          return API.createTask({ ...data, id_proyecto: finalProjectId })
            .then(r => {
              releaseLock();
              UI.toast('Tarea creada', 'success');
              return { tid: r.task.id_tarea || r.task.id };
            })
            .catch(e => { releaseLock(); throw e; });
        }
      }

      releaseLock(); // Fallback
    });

    // UX Inteligente: Invertir Link automáticamente si arrastran Tarea -> Compra
    gantt.attachEvent("onBeforeLinkAdd", (id, link) => {
      if (String(link.target).startsWith('pur_')) {
        // En Gantt, el Target es el que "espera" (Successor). Una Compra no espera a una tarea.
        // Si el usuario intentó Target = Compra, asumimos que quería hacerlo al revés.
        setTimeout(() => {
          gantt.addLink({
            source: link.target,
            target: link.source,
            type: gantt.config.links.finish_to_start
          });
        }, 10);
        if (window.UI && window.UI.toast) {
          window.UI.toast('🪄 Enlace invertido auto: La tarea ahora depende de la compra.', 'info');
        }
        return false; // Bloquear link original
      }
      return true;
    });

    // Identidad proactiva para nuevas tareas (Creación)
    gantt.attachEvent("onTaskCreated", (item) => {
      const isPurchasesView = document.getElementById('btn-view-purchases')?.classList.contains('active');
      if (isPurchasesView) {
        item.es_compra  = 1;
        item._es_compra = 1;
        // Si ya tiene _estado o _compra (viene de gantt.addTask con datos) los respetamos
        item._estado = item._estado || 'solicitada';
        item.text    = item.text   || 'Nueva Compra';
        item.parent  = 0;
        item.color   = 'transparent';
        // MERGE: preservar datos que vengan de newTask._compra (f_arribo_nec, id_solicitante, etc.)
        item._compra = { cantidad: 1, valor_unitario: 0, ...(item._compra || {}) };
      }
      return true;
    });

    // Disable default lightbox → usamos modal propio o modal de compras si es compra
    gantt.showLightbox = id => {
      const task = gantt.isTaskExists(id) ? gantt.getTask(id) : null;
      if (!task) return;
      
      const isPurchase = String(id).startsWith('pur_') || task._es_compra == 1 || task.es_compra == 1;

      if (isPurchase) {
        // Enrutamiento a Modal de Compras
        const purId = String(id).startsWith('pur_') ? parseInt(String(id).replace('pur_', '')) : task._compra?.id_compra;
        
        if (task.$new) {
           // Si es una compra nueva recién "pinchada" en el gantt, la borramos y abrimos el modal vacío
           _ignoreUpdate = true;
           gantt.deleteTask(id);
           _ignoreUpdate = false;
           if (window.UI) UI.openNewPurchaseModal();
        } else if (purId && window.PurchaseModule) {
           window.PurchaseModule.openPurchaseModal(purId);
        } else if (task._es_compra == 1 && task.id_tarea) {
           // Es una tarea-compra (id numérico), abrimos modal de compras con su id_compra si está disponible
           if (window.PurchaseModule && task._compra?.id_compra) {
              window.PurchaseModule.openPurchaseModal(task._compra.id_compra);
           } else {
              // Fallback: si no tenemos ID de compra, tratamos de cargarla o abrimos modal de tarea
              if (window.UI) UI.openTaskModal(task);
           }
        }
      } else {
        // Tarea de obra normal
        if (window.UI) UI.openTaskModal(task);
      }
    };

    /* ── Events ───────────────────────────────────────────── */
    /* ── Events (Manejo de UI local) ─────────────────────── */
    gantt.attachEvent('onAfterTaskDrag', () => {
       // El DataProcessor se encarga de la persistencia
       // Solo forzamos render de markers si cambiaron fechas críticas
       updateSummary();
    });

    gantt.attachEvent('onAfterProgressDrag', () => updateSummary());

    // Pre-autorización de deletes programáticos (desde modales, no desde botón Gantt)
    const _directDeleteIds = new Set();
    window.__ganttDirectDelete = _directDeleteIds; // expuesto para ui.js

    gantt.attachEvent('onBeforeTaskDelete', id => {
      if (_directDeleteIds.has(String(id))) {
        _directDeleteIds.delete(String(id));
        return true; // Autorizado: el DP manejará la petición DELETE al backend
      }
      // Botón delete del Gantt nativo → pedir confirmación
      UI.confirmDelete(id);
      return false;
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function estadoBadge(t) {
    let estado = t._estado || 'No comenzada';
    const p = Math.round((t.progress || 0) * 100);
    const today = new Date(); today.setHours(0,0,0,0);

    if (t._es_compra && t._compra) {
      // Lógica exclusiva para compras
      const arriboNec = t._compra.f_arribo_nec ? new Date(t._compra.f_arribo_nec + 'T00:00:00') : null;
      const entregado = t._compra.f_ent;

      if (!entregado && arriboNec && arriboNec < today) {
        estado = 'Retrasada';
      } else if (entregado) {
        estado = 'Finalizada';
      }
    } else {
      // Lógica normal para tareas de obra
      const tStart = new Date(t.start_date); tStart.setHours(0,0,0,0);
      
      if (tStart <= today && p === 0 && estado !== 'Finalizada') {
        estado = 'Retrasada';
      } else if (p < 100 && estado !== 'Finalizada') {
        // Bloqueadas
        if (t.$target && t.$target.length > 0) {
          for (let linkId of t.$target) {
            if (window.gantt && gantt.isLinkExists && gantt.isLinkExists(linkId)) {
              const link = gantt.getLink(linkId);
              if (gantt.isTaskExists(link.source)) {
                const pred = gantt.getTask(link.source);
                const predP = Math.round((pred.progress || 0) * 100);
                if (predP < 100 && pred._estado !== 'Finalizada') {
                  estado = 'Bloqueada';
                  break;
                }
              }
            }
          }
        }
      }
    }

    const map = {
      'No comenzada': 'badge-no-comenzada',
      'En progreso':  'badge-en-progreso',
      'Finalizada':   'badge-finalizada',
      'Retrasada':    'badge-retrasada',
      'Bloqueada':    'badge-bloqueada'
    };
    
    const cls = map[estado] || 'badge-no-comenzada';
    return `<span class="badge ${cls}">${estado}</span>`;
  }

  function dbTaskToGantt(t, color) {
    let finalColor = color || '#6366f1';
    if (typeof _colorMode !== 'undefined' && _colorMode === 'responsable') {
      finalColor = getResponsableColor(t.responsable);
    }
    
    // El Gantt visual principal se basa en la fecha proyectada (si existe) 
    // o en la fecha de inicio baseline.
    let startStr = t.fecha_inicio_proyectada || t.fecha_inicio;
    let endStr   = undefined;
    const finRef = t.fecha_fin_proyectada || t.fecha_fin;

    if (t.es_compra === 1) {
      // Para compras, el contenedor visual debe abarcar desde la solicitud hasta el último hito
      startStr = t.fecha_solicitud || startStr;
      const hitos = [
        t.fecha_arribo_necesaria, 
        t.fecha_comprometida, 
        t.fecha_entregado
      ].filter(Boolean);
      
      if (hitos.length > 0) {
        const maxHito = new Date(Math.max(...hitos.map(h => new Date(h + 'T00:00:00'))));
        maxHito.setDate(maxHito.getDate() + 1);
        endStr = gantt.date.date_to_str('%Y-%m-%d')(maxHito);
      }
    }

    if (!endStr && finRef) {
      const end = new Date(finRef + 'T00:00:00');
      if (!isNaN(end.getTime())) {
        end.setDate(end.getDate() + 1);
        endStr = gantt.date.date_to_str('%Y-%m-%d')(end);
      }
    }

    const projInfo = _projectsMap[t.id_proyecto] || {};

    const isPurchase = t.es_compra === 1;
    
    // Si es compra, usamos la lógica visual de burbujas (color transparente y objeto _compra)
    const gColor = isPurchase ? 'transparent' : (t.es_compra ? 'rgba(34, 211, 238, 0.1)' : finalColor);
    const gTextColor = isPurchase ? '#ffffff' : (t.es_compra ? 'var(--cyan)' : (finalColor === '#ffffff' ? '#0f172a' : undefined));

    return {
      id:           t.id_tarea,
      parent:       t.id_parent || 0,
      text:         t.descripcion || "Tarea sin nombre",
      start_date:   startStr,
      end_date:     endStr,
      duration:     endStr ? undefined : (t.es_compra ? 3 : (parseInt(t.duracion_dias) || 1)),
      progress:     parseFloat(t.avance || 0) / 100,
      color:        gColor,
      textColor:    gTextColor,
      _tarea_cod:   t.tarea,
      _estado:      t.estado,
      _tipo_dias:   t.tipo_dias,
      _dependencias: t.dependencias || '',
      _costo:       parseFloat(t.costo_tarea) || 0,
      responsable:  (t.id_parent && t.subresponsable_nombre) ? t.subresponsable_nombre : (t.responsable || ''),
      note_count:   t.note_count || 0,
      _projectName: projInfo.nombre || '',
      _projectCode: projInfo.codigo || '',
      _es_compra:   isPurchase ? 1 : (t.es_compra || 0),
      // Fechas para Multi-Capa
      _f_inicio_base: t.fecha_inicio,
      _f_fin_base:    t.fecha_fin,
      _f_inicio_proy: t.fecha_inicio_proyectada,
      _f_fin_proy:    t.fecha_fin_proyectada,
      _f_real_ini:    t.fecha_real_iniciada,
      _f_real_fin:    t.fecha_completada,
      _auto_retrasada: t.auto_retrasada || 0,
      // Datos extra de compra
      _compra: isPurchase ? {
        id_compra: t.id_compra || (t._compra ? t._compra.id_compra : null),
        cantidad: t.cantidad,
        valor_unitario: t.valor_unitario,
        f_solicitud: t.fecha_solicitud,
        f_arribo_nec: t.fecha_arribo_necesaria,
        f_oc: t.fecha_oc_emitida,
        f_comp: t.fecha_comprometida,
        f_ent: t.fecha_entregado
      } : null,
      _raw: t
    };
}

  function buildLinks(tasks) {
    const links = [];
    const seen  = new Set();
    tasks.forEach(t => {
      if (!t.dependencias) return;
      t.dependencias.split(',').map(d => d.trim()).filter(Boolean).forEach(src => {
        const srcId = String(src).startsWith('pur_') ? src : parseInt(src);
        const key = `${srcId}_${t.id_tarea}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ id: key, source: srcId, target: t.id_tarea, type: '0' });
        }
      });
    });
    return links;
  }

  function applyUpdatedTasks(updatedTasks, skipId = null) {
    if (!updatedTasks) return;
    _ignoreUpdate = true;
    updatedTasks.forEach(t => {
      // Intentar encontrar la tarea, ya sea por ID numérico o con prefijo pur_
      let targetId = t.id_tarea;
      if (!gantt.isTaskExists(targetId) && gantt.isTaskExists(`pur_${targetId}`)) {
        targetId = `pur_${targetId}`;
      }

      if (!gantt.isTaskExists(targetId)) return;
      const gt = gantt.getTask(targetId);
      
      const start = t.fecha_inicio_proyectada || t.fecha_inicio;
      const fin = t.fecha_fin_proyectada || t.fecha_fin;
      
      // Actualizar posición visual si no es la tarea que se está arrastrando
      if (skipId != targetId) {
        gt.start_date = gantt.date.parseDate(start, 'xml_date');
        if (fin) {
          const end = new Date(fin + 'T00:00:00');
          end.setDate(end.getDate() + 1);
          gt.end_date = end;
        } else {
          gt.duration = parseInt(t.duracion_dias) || 1;
        }
      }

      gt.progress     = parseFloat(t.avance || 0) / 100;
      gt._estado      = t.estado;
      gt._tipo_dias   = t.tipo_dias;
      gt._dependencias = t.dependencias || '';
      gt._es_compra   = t.es_compra || 0;
      
      // Actualizar meta-fechas para capas
      gt._f_inicio_base = t.fecha_inicio;
      gt._f_fin_base    = t.fecha_fin;
      gt._f_inicio_proy = t.fecha_inicio_proyectada;
      gt._f_fin_proy    = t.fecha_fin_proyectada;
      gt._f_real_ini    = t.fecha_real_iniciada;
      gt._f_real_fin    = t.fecha_completada;
      gt._auto_retrasada = t.auto_retrasada || 0;
      
      // Si es una compra, actualizar también el objeto interno _compra
      if (gt._es_compra && t.compraData) {
        gt._compra = {
          ...gt._compra,
          ...t.compraData,
          f_solicitud: t.fecha_solicitud || t.compraData.fecha_solicitud,
          f_arribo_nec: t.fecha_arribo_necesaria || t.compraData.fecha_arribo_necesaria
        };
      }

      gt._raw = t;
      gantt.updateTask(targetId);
    });
    _ignoreUpdate = false;
    updateSummary();
  }

  /* ── purchase to gantt (va tabla purchases) ────────────────── */
  function dbPurchaseToGantt(p, overrideColor, projectName = '') {
    const startStr = p.fecha_solicitud || p.fecha_creacion?.split('T')[0] || new Date().toISOString().split('T')[0];
    
    // Capturamos explícitamente la fecha de arribo necesaria y otros hitos
    const fNec = p.fecha_arribo_necesaria ? p.fecha_arribo_necesaria.split('T')[0] : null;
    const fOc = p.fecha_oc_emitida ? p.fecha_oc_emitida.split('T')[0] : null;
    const fComp = p.fecha_comprometida ? p.fecha_comprometida.split('T')[0] : null;
    const fEnt = p.fecha_entregado ? p.fecha_entregado.split('T')[0] : null;

    const endDates = [fNec, fOc, fComp, fEnt].filter(Boolean);
    let endStr = startStr; 
    if (endDates.length > 0) {
      const maxDate = new Date(Math.max(...endDates.map(d => new Date(d + 'T00:00:00Z'))));
      maxDate.setUTCDate(maxDate.getUTCDate() + 1); // Exclusivo DHTMLX
      endStr = maxDate.toISOString().split('T')[0];
    }

    return {
      id: `pur_${p.id_compra}`, // Identificador único con prefijo
      parent: 0, // Siempre a la raíz en visualización
      text: p.producto,
      start_date: startStr,
      end_date: endStr,
      color: 'transparent', // Fundamental para ver los segmentos internos
      textColor: '#ffffff',
      _estado: p.estado,
      _es_compra: 1, // Flag para template task_text
      _compra: {
        id_compra: p.id_compra,
        f_solicitud: p.fecha_solicitud,
        f_arribo_nec: fNec, // Campo crítico para persistencia
        f_oc: fOc,
        f_comp: fComp,
        f_ent: fEnt,
        valor_unitario: p.valor_unitario
      },
      responsable: p.responsable_nombre || '', 
      _projectName: projectName || p.proyecto_nombre || '',
      _dependencias: p.dependencias || '',
      type: 'task'
    };
  }
    
    gantt.attachEvent("onTaskClick", function(id, e) {
      if (e.target.closest('.note-col-trigger')) {
        const trueId = e.target.closest('.note-col-trigger').dataset.id;
        if (window.UI && window.UI.openNotesModal) {
          window.UI.openNotesModal(trueId);
        }
        return false;
      }
      return true;
    });

    function updateSummary() {
      try {
        const tasks = gantt.getTaskByTime();
        if (!tasks || tasks.length === 0) return null;

        let totT = 0, doneT = 0, progT = 0, pendT = 0;
        let totS = 0, doneS = 0, progS = 0, pendS = 0;
        let totalCosto = 0, aplicado = 0;
        let minDate = null, maxDate = null;
        let compraAtrasoProc = 0, compraAtrasoEnt = 0;

        // Status Bar & EVM Variables
        let totalProgress = 0, delayed = 0, blocked = 0;
        const upcomingMilestones = [];
        let totalPlannedWeighted = 0;
        let totalRealWeighted = 0;
        let maxBaseDateMs = 0;
        let maxProyDateMs = 0;

        const today = new Date();
        today.setHours(0,0,0,0);

        tasks.forEach(t => {
          const p = Math.round((t.progress || 0) * 100);
          const isSub = t.parent && String(t.parent) !== "0" && gantt.isTaskExists(t.parent);
          const isCompra = t._es_compra;
          const isDone = (p >= 100 || t._estado === 'Finalizada' || t._estado === 'entregado');
          const isProg = (p > 0 || t._estado === 'En progreso');

          // Progress & Task Counts
          totalProgress += p;
          if (isSub) {
            totS++;
            if (isDone) doneS++;
            else if (isProg) progS++;
            else pendS++;
          } else {
            totT++;
            if (isDone) doneT++;
            else if (isProg) progT++;
            else pendT++;
          }

          // Costos
          const costo = parseFloat(t._raw?.costo_tarea || t._costo || t._compra?.valor_unitario || 0);
          totalCosto += costo;
          if (isDone) aplicado += costo;

          const tStart = t.start_date ? new Date(t.start_date) : null;
          if (tStart) tStart.setHours(0,0,0,0);

          // Fechas del proyecto y EVM (Solo tareas de obra)
          if (!isCompra) {
            if (tStart) { if (!minDate || tStart < minDate) minDate = tStart; }
            if (t.end_date) {
              const ed = new Date(t.end_date);
              if (!maxDate || ed > maxDate) maxDate = ed;
            }

            // Lógica EVM
            let bStart = t._f_inicio_base ? new Date(t._f_inicio_base + 'T00:00:00').getTime() : 0;
            let bEnd   = t._f_fin_base    ? new Date(t._f_fin_base + 'T00:00:00').getTime() : 0;
            let pEnd   = t._f_fin_proy    ? new Date(t._f_fin_proy + 'T00:00:00').getTime() : 0;

            if (bEnd > maxBaseDateMs) maxBaseDateMs = bEnd;
            if (pEnd > maxProyDateMs) maxProyDateMs = pEnd;

            if (bStart && bEnd && bEnd > bStart) {
              let durationMs = bEnd - bStart;
              let todayMs = today.getTime();
              let plannedPct = todayMs >= bEnd ? 1 : (todayMs > bStart ? (todayMs - bStart) / durationMs : 0);
              totalPlannedWeighted += (plannedPct * durationMs);
              totalRealWeighted += ((t.progress || 0) * durationMs);
            }

            // Próximos Hitos
            if (tStart) {
              const daysUntil = Math.ceil((tStart - today) / 86400000);
              if (daysUntil > 0 && daysUntil <= 60 && p === 0) {
                upcomingMilestones.push({ name: t.text, date: tStart });
              }
            }
          }

          // Lógica de Estado / Alertas
          if (!isDone) {
            // Riesgos (Atrasos)
            if (isCompra && t._compra) {
              const fNec = t._compra.f_arribo_nec ? new Date(t._compra.f_arribo_nec + 'T00:00:00') : null;
              if (fNec && fNec < today && !t._compra.f_ent) delayed++;
              
              const c = t._compra;
              const fComp = c.f_comp ? new Date(c.f_comp + 'T00:00:00') : null;
              const hasOC = !!c.f_oc;
              if (!hasOC && fNec && fNec < today) compraAtrasoProc++;
              else if (hasOC && fComp && fComp < today) compraAtrasoEnt++;
            } else {
              if (tStart && tStart < today && p === 0) delayed++;
            }

            // Bloqueos
            if (t.$target && t.$target.length > 0) {
               let isBlocked = false;
               for (let linkId of t.$target) {
                 if (window.gantt && gantt.isLinkExists && gantt.isLinkExists(linkId)) {
                   const link = gantt.getLink(linkId);
                   if (gantt.isTaskExists(link.source)) {
                     const pred = gantt.getTask(link.source);
                     const predP = Math.round((pred.progress || 0) * 100);
                     if (predP < 100 && pred._estado !== 'Finalizada' && pred._estado !== 'entregado') {
                       isBlocked = true;
                       break;
                     }
                   }
                 }
               }
               if (isBlocked) blocked++;
            }
          }
        });

        // Helpers DOM
        const setDom = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const getPct = (part, total) => total > 0 ? Math.round((part / total) * 100) + '%' : '0%';
        const fmtCur = n => '$' + n.toLocaleString('es-AR', {maximumFractionDigits:0});
        const fmtDateShort = d => {
          if (!d) return '--';
          const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        };

        // 1. Panel Superior (KPIs)
        setDom('stat-total-t', totT);
        setDom('stat-sub-total', totS);
        setDom('stat-done', doneT);
        setDom('stat-done-pct', getPct(doneT, totT));
        setDom('stat-progress', progT);
        setDom('stat-progress-pct', getPct(progT, totT));
        setDom('stat-pending', pendT);
        setDom('stat-pending-pct', getPct(pendT, totT));

        setDom('stat-costo-total', fmtCur(totalCosto));
        setDom('stat-total-aplicado', fmtCur(aplicado));
        setDom('stat-aplicado-pct', getPct(aplicado, totalCosto));



        setDom('stat-fecha-inicio', fmtDateShort(minDate));
        if (maxDate) {
          const adjustedEnd = new Date(maxDate);
          adjustedEnd.setDate(adjustedEnd.getDate() - 1);
          setDom('stat-fecha-fin', fmtDateShort(adjustedEnd));
        }

        // Render Alertas Compras
        const kpiProc = document.getElementById('kpi-compra-atraso');
        const kpiEnt = document.getElementById('kpi-entrega-atraso');
        if (tasks.some(t => t._es_compra)) {
          if (kpiProc) kpiProc.style.display = 'flex'; 
          if (kpiEnt) kpiEnt.style.display = 'flex';
          setDom('stat-compra-atraso-proc', compraAtrasoProc);
          setDom('stat-compra-atraso-ent', compraAtrasoEnt);
        } else {
          if (kpiProc) kpiProc.style.display = 'none';
          if (kpiEnt) kpiEnt.style.display = 'none';
        }

        // 2. Barra Inferior (Status Bar)
        const totalCount = totT + totS;
        const avgProgress = totalCount > 0 ? Math.round(totalProgress / totalCount) : 0;
        setDom('status-risk-count', delayed);
        setDom('status-blocked-count', blocked);
        setDom('status-avance', avgProgress + '%');
        const avanceBar = document.getElementById('status-avance-bar');
        if (avanceBar) avanceBar.style.width = avgProgress + '%';

        const mList = document.getElementById('status-milestones');
        if (mList) {
          upcomingMilestones.sort((a,b) => a.date - b.date);
          const top = upcomingMilestones.slice(0, 3);
          if (top.length === 0) mList.innerHTML = '<div class="status-milestone-empty">Sin hitos próximos</div>';
          else {
             const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
             mList.innerHTML = top.map(m => `
               <div class="status-milestone-item">
                 <div class="status-milestone-date">
                   <span class="m-day">${m.date.getDate()}</span>
                   <span>${months[m.date.getMonth()]}</span>
                 </div>
                 <span class="status-milestone-name">${m.name}</span>
               </div>`).join('');
          }
        }

        return { minDate, maxDate };
      } catch(e) {
        console.error("Error en updateSummary:", e);
        return null;
      }
    }

  function applyScale(scale) {
    currentScale = scale;
    gantt.config.scales = SCALES[scale];
    gantt.render();
    const scaleEl = document.getElementById('scale-label');
    if (scaleEl) scaleEl.textContent = { day:'Días', week:'Semanas', month:'Meses' }[scale];
    
    // Update zoom buttons visual state
    ['day', 'week', 'month'].forEach(s => {
      const btn = document.getElementById('btn-zoom-' + s);
      if (btn) {
        if (s === scale) {
          btn.classList.add('btn-primary', 'active');
          btn.classList.remove('btn-ghost');
        } else {
          btn.classList.remove('btn-primary', 'active');
          btn.classList.add('btn-ghost');
        }
      }
    });
  }

  /* ── Public API ──────────────────────────────────────────── */
  function init() {
    configure();
    gantt.init('gantt_here');

    // Markers
    addMarkers();

      // Toolbar: zoom
    document.getElementById('btn-zoom-day').addEventListener('click',   () => applyScale('day'));
    document.getElementById('btn-zoom-week').addEventListener('click',  () => applyScale('week'));
    document.getElementById('btn-zoom-month').addEventListener('click', () => applyScale('month'));
    document.getElementById('btn-today').addEventListener('click', () => gantt.showDate(new Date()));
  }

  /* ── Markers helper ───── */
  function addMarkers(startDate = null, endDate = null) {
    const today = new Date();
    gantt.addMarker({
      start_date: today,
      css: 'today-marker',
      text: 'Hoy',
      title: 'Hoy: ' + today.toLocaleDateString('es')
    });

    if (startDate) {
      gantt.addMarker({
        start_date: startDate,
        css: 'project-start-marker',
        text: 'INICIO',
        title: 'Inicia: ' + startDate.toLocaleDateString('es')
      });
    }

    if (endDate) {
      // Adjusted end date (visual fix)
      const d = new Date(endDate);
      d.setDate(d.getDate() - 1);
      gantt.addMarker({
        start_date: d,
        css: 'project-end-marker',
        text: 'FIN',
        title: 'Finaliza: ' + d.toLocaleDateString('es')
      });
    }
  }

  function centerToday() {
    const today     = new Date();
    const x         = gantt.posFromDate(today);
    const container = document.getElementById('gantt_here');
    if (!container) return;
    const containerWidth = container.offsetWidth;
    const gridWidth      = gantt.config.grid_width || 0;
    const viewWidth      = containerWidth - gridWidth;
    const scrollX        = Math.max(0, x - (viewWidth / 2));
    
    gantt.scrollTo(scrollX, null);
    container.style.opacity = '1';
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
    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';

    return Promise.all([
      API.getProjectTasks(projectId),
      API.getPurchases()
    ]).then(([tasks, allPurchases]) => {
      // 1. Mapear tareas de obra
      const gtasks = tasks.map(t => dbTaskToGantt(t, currentProjectColor));
      
      // 2. Inyectar compras al nivel de las tareas para que se mezclen
      const projectPurchases = allPurchases.filter(p => p.id_proyecto == projectId && !p.id_tarea);
      if (projectPurchases.length > 0) {
        projectPurchases.forEach(p => {
          const gp = dbPurchaseToGantt(p, '#ffffff', _projectsMap[projectId]?.nombre || '');
          // Ya no asignamos gp.parent, de modo que caen en la raíz del proyecto
          gtasks.push(gp);
        });
      }

      const allDataForLinks = [...tasks, ...projectPurchases.map(p => ({ 
        id_tarea: `pur_${p.id_compra}`, 
        dependencias: p.dependencias 
      }))];
      const links  = buildLinks(allDataForLinks);
      gantt.clearAll();
      gantt.parse({ data: gtasks, links });
      
      // Ordenamiento cronológico para mezclar obras y compras de forma natural
      gantt.sort("start_date", false);
      addMarkers();
      
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
      
      // Update markers with dates
      const summary = updateSummary();
      if (summary) addMarkers(summary.minDate, summary.maxDate);

      setTimeout(() => {
        centerToday();
      }, 150);
      return tasks;
    });
  }

  async function loadAllProjects() {
    currentProjectId    = '__all__';
    _allProjectsMode    = true;

    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';

    const [allTasks, allPurchases] = await Promise.all([
      API.getTasks(),
      API.getPurchases()
    ]);
    
    // 1. Mapear tareas de obra
    const allGtasks = allTasks.map(t => {
      const projInfo = _projectsMap[t.id_proyecto];
      return dbTaskToGantt(t, projInfo ? projInfo.color : '#6366f1');
    });

    // 2. Inyectar compras globales al nivel raíz para que se mezclen
    const standalonePurchases = allPurchases.filter(p => !p.id_tarea);
    if (standalonePurchases.length > 0) {
      standalonePurchases.forEach(p => {
        const gp = dbPurchaseToGantt(p, '#ffffff', _projectsMap[p.id_proyecto]?.nombre || '');
        // Ya no agrupamos
        allGtasks.push(gp);
      });
    }

    const allDataForLinks = [...allTasks, ...standalonePurchases.map(p => ({ 
      id_tarea: `pur_${p.id_compra}`, 
      dependencias: p.dependencias 
    }))];
    const links = buildLinks(allDataForLinks);
    gantt.clearAll();
    gantt.parse({ data: allGtasks, links });
    
    // Ordenamiento cronológico global
    gantt.sort("start_date", false);
    
    // Summary also gives us dates
    const summary = updateSummary();
    addMarkers(summary?.minDate, summary?.maxDate);

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
    setTimeout(() => {
        centerToday();
    }, 150);
    updateSummary();
    return allTasks;
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

  /* ── Purchases Gantt View ────────────────────────────────── */
  function loadPurchasesView(purchases, allTasks) {
    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';
    configure(); 

    gantt.clearAll();
    const items = purchases.map(p => {
      let pName = '';
      if (p.id_proyecto && _projectsMap[p.id_proyecto]) {
        pName = _projectsMap[p.id_proyecto].nombre;
      } else if (p.id_tarea && allTasks) {
        const t = allTasks.find(x => x.id_tarea == p.id_tarea);
        if (t && _projectsMap[t.id_proyecto]) {
          pName = _projectsMap[t.id_proyecto].nombre;
        }
      }
      return dbPurchaseToGantt(p, '#ffffff', pName);
    });

    // CRÍTICO: links vacíos en vista de compras para evitar crashes por tareas no cargadas
    gantt.parse({ data: items, links: [] }); 
    
    addMarkers();
    gantt.render();
    setTimeout(() => centerToday(), 150);
    updateSummary();
  }

  function centerAndShow(container) {
    const today = new Date();
    const state = gantt.getState();
    if (state.min_date && state.max_date) {
      const es = new Date(Math.min(state.min_date.getTime(), today.getTime()));
      es.setMonth(es.getMonth() - 1);
      const ee = new Date(Math.max(state.max_date.getTime(), today.getTime()));
      ee.setMonth(ee.getMonth() + 3);
      gantt.config.start_date = es; 
      gantt.config.end_date   = ee;
    }

    gantt.render();
    if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
    
    setTimeout(() => {
      if (container) container.style.opacity = '1';
      centerToday();
    }, 150);
  }

  function restoreTasksView() {
    configure();
    if (_allProjectsMode) {
      loadAllProjects();
    } else if (currentProjectId && currentProjectId !== '__all__') {
      loadProject(currentProjectId, currentProjectColor);
    }
  }

  return { 
    init, loadProject, loadAllProjects, setProjectsMap, addTask, refreshTask, applyAllUpdated, removeTask,
    getCurrentProjectId, isAllProjects, updateSummary,
    dbPurchaseToGantt, loadPurchasesView, restoreTasksView,
    getColorMode, setColorMode, toggleColorMode,
    getAllTasks: () => gantt.getTaskByTime(),
    // Elimina una tarea sin pasar por confirm dialog (ya fue confirmado en el modal)
    deleteTaskDirect: (id) => {
      if (gantt.isTaskExists(id)) {
        window.__ganttDirectDelete.add(String(id));
        gantt.deleteTask(id);
      }
    },
    // Actualiza visualmente una compra en el Gantt (post-save del modal) sin disparar el DP
    refreshPurchaseSilently: (cleanId, payload) => {
      const gId = `pur_${cleanId}`;
      if (!gantt.isTaskExists(gId)) return;
      const task = gantt.getTask(gId);
      if (payload.producto)           task.text       = payload.producto;
      if (payload.id_proyecto)        task.id_proyecto = payload.id_proyecto;
      if (payload.estado)             task._estado    = payload.estado;
      if (payload.fecha_solicitud) {
        task.start_date = gantt.date.parseDate(payload.fecha_solicitud, 'xml_date');
      }
      if (payload.fecha_arribo_necesaria) {
        const d = gantt.date.parseDate(payload.fecha_arribo_necesaria, 'xml_date');
        d.setDate(d.getDate() + 1);
        task.end_date = d;
      }
      // Actualizar sub-objeto _compra para mantener el estado interno
      task._compra = {
        ...(task._compra || {}),
        f_solicitud:   payload.fecha_solicitud,
        f_arribo_nec:  payload.fecha_arribo_necesaria,
        id_solicitante: payload.id_solicitante,
        id_responsable: payload.id_responsable,
        cantidad:        payload.cantidad,
        valor_unitario:  payload.valor_unitario
      };
      _ignoreUpdate = true;  // No disparar el DataProcessor
      gantt.updateTask(gId);
      _ignoreUpdate = false;
    }
  };
})();
