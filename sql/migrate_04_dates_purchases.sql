-- Migración 04: Modelo Dual de Fechas (Gantt Enterprise) y Tarea-Compra

-- 1. Agregar las nuevas columnas a la tabla de tareas
ALTER TABLE tareas 
  ADD COLUMN fecha_fin_proyectada DATE,
  ADD COLUMN fecha_real_iniciada DATE;

-- 2. Inicializar la data legacy para tener Baseline Consistente
--    Si no hay fecha de inicio, no podemos calcular nada.
--    Usar DATE_ADD para simular fecha de fin si no la hay.
UPDATE tareas
SET fecha_inicio_proyectada = fecha_inicio,
    fecha_fin = COALESCE(fecha_fin, DATE_ADD(fecha_inicio, INTERVAL duracion_dias DAY)),
    fecha_fin_proyectada = COALESCE(fecha_fin, DATE_ADD(fecha_inicio, INTERVAL duracion_dias DAY))
WHERE fecha_inicio IS NOT NULL;

-- 3. Para tareas terminadas o iniciadas en legacy (opcional pero correcto)
UPDATE tareas
SET fecha_real_iniciada = fecha_inicio 
WHERE estado IN ('En progreso', 'Finalizada') AND fecha_real_iniciada IS NULL AND fecha_inicio IS NOT NULL;

UPDATE tareas
SET fecha_completada = fecha_fin 
WHERE estado = 'Finalizada' AND fecha_completada IS NULL AND fecha_fin IS NOT NULL;
