/** Recargo informado por la Mina de Sal: COP 14.000 por visitante extranjero. */
export const RECARGO_MINA_EXTRANJERO = 14000;

const normalizar = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const esNacionalidadExtranjera = nacionalidad => {
  const value = normalizar(nacionalidad);
  return Boolean(value) && !['colombia', 'colombiano', 'colombiana', 'col', 'co'].includes(value);
};

/** La mención publicitaria de la Mina no basta: debe formar parte del recorrido. */
export const planIncluyeMina = plan => {
  if (!plan) return false;
  if (plan.mina === true || plan.incluye_mina === true) return true;
  const title = normalizar(plan.tour_reserva ?? plan.name ?? plan.nombre_plan);
  const detail = normalizar(plan.descripcion_detallada ?? plan.detail ?? '');
  const summary = normalizar(plan.descripcion_basica ?? plan.description ?? '');
  return /\bmina\b/.test(title) ||
    /\b(ingreso|visita|acceso|entrada|recorrido)\b[^\n.]{0,65}\bmina\b/.test(detail) ||
    /\b(ingreso|visita|acceso|entrada|recorrido)\b[^\n.]{0,65}\bmina\b/.test(summary);
};

export const calcularRecargoMina = (plan, nacionalidades = []) => {
  const incluyeMina = planIncluyeMina(plan);
  const extranjeros = incluyeMina ? nacionalidades.filter(esNacionalidadExtranjera).length : 0;
  return {
    incluyeMina,
    extranjeros,
    valor: extranjeros * RECARGO_MINA_EXTRANJERO,
  };
};
