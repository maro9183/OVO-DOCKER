const fs = require('fs');
let content = fs.readFileSync('frontend/js/ui.js', 'utf8');

// The place where the truncation happened:
const searchString = `      // Refrescar vista si estamos en purchases o combined\n    document.getElementById('btn-new-purchase')?.addEventListener('click', () => {`;
const insertion = `      // Refrescar vista si estamos en purchases o combined
      if (_currentView === 'purchases') GanttApp.loadPurchasesView(_allPurchases);
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
          if (_currentView === 'purchases') GanttApp.loadPurchasesView(_allPurchases);
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
      list.innerHTML = purchases.map(p => \`
        <div class="purchase-card" data-id="\${p.id_compra}">
          <div style="flex:1;min-width:0">
            <div class="pc-name">\${p.producto}</div>
            <div class="pc-meta">\${purStateBadge(p.estado)} \${p.fecha_arribo_necesaria ? '· Nec: ' + p.fecha_arribo_necesaria : ''}</div>
          </div>
          <span class="pc-value">\${p.valor_total > 0 ? '$'+parseFloat(p.valor_total).toLocaleString('es-AR',{maximumFractionDigits:0}) : '—'}</span>
          <button class="btn btn-ghost btn-sm pc-edit" data-id="\${p.id_compra}">✏️</button>
        </div>
      \`).join('');
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
      btn.classList.toggle('active', btn.id === \`btn-view-\${view}\`);
    });

    if (view === 'tasks') {
      ganttHere.style.display = '';
      purView.style.display   = 'none';
      if (filterBar) filterBar.style.display = '';
    } else if (view === 'purchases') {
      ganttHere.style.display = '';
      purView.style.display   = 'flex';
      if (filterBar) filterBar.style.display = 'none';
      GanttApp.loadPurchasesView(_allPurchases);
    } else if (view === 'combined') {
      ganttHere.style.display = '';
      purView.style.display   = 'none';
      if (filterBar) filterBar.style.display = 'none';
      refreshCombinedView();
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
      kpiDiv.innerHTML = \`
        <div style="background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius);padding:14px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">🚨</span>
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Atraso Compra</div>
            <div style="font-size:28px;font-weight:700;color:var(--red);line-height:1">\${atrasoCompra}</div>
            <div style="font-size:10px;color:var(--text-dim)">Sin OC, fuera de plazo</div>
          </div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius);padding:14px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">📦</span>
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Atraso Entrega</div>
            <div style="font-size:28px;font-weight:700;color:var(--amber);line-height:1">\${atrasoEntrega}</div>
            <div style="font-size:10px;color:var(--text-dim)">OC emitida, estimada vencida</div>
          </div>
        </div>
      \`;
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
    document.getElementById('btn-new-purchase')?.addEventListener('click', () => {`;

// Replace everything from searchString to the end of file with insertion + the rest of the file
const parts = content.split(searchString);
if (parts.length === 2) {
  content = parts[0] + insertion + "\n      document.getElementById('new-dropdown-menu').style.display = 'none';\n      openPurchaseModal();\n    });" + parts[1].split(`      openPurchaseModal();\n    });`)[1];
  fs.writeFileSync('frontend/js/ui.js', content, 'utf8');
  console.log('Successfully patched ui.js');
} else {
  console.log('Failed to find split point.');
}
