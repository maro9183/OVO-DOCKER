/**
 * Lógica de cálculo de fechas.
 * Modificado para usar ESTRICTAMENTE días naturales corridos (calendario).
 */

function parseDate(d) {
  if (!d) return null;
  let y, m, day;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    y = d.getFullYear();
    m = d.getMonth() + 1;
    day = d.getDate();
  } else {
    const parts = d.toString().split('T')[0].split('-').map(Number);
    y = parts[0]; m = parts[1]; day = parts[2];
  }
  return new Date(Date.UTC(y, m - 1, day));
}

function formatDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt || isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

/**
 * Calcula la fecha de fin sumando la duración (días naturales) a la fecha de inicio.
 * Se resta 1 porque el día de inicio cuenta como el día 1 de ejecución.
 */
function calcFechaFin(startDate, duration) {
  const d = parseDate(startDate);
  if (!d || !duration) return null;

  const days = parseInt(duration, 10);
  
  // Calendario puro: fecha_fin = inicio + (duracion - 1) días
  d.setUTCDate(d.getUTCDate() + days - 1);

  return d;
}

function calcEstado(avance) {
  const a = parseFloat(avance) || 0;
  if (a <= 0)   return 'No comenzada';
  if (a >= 100) return 'Finalizada';
  return 'En progreso';
}

module.exports = { parseDate, formatDate, calcFechaFin, calcEstado };