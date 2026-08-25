import { supabase } from '../lib/supabase'

const BUGGY_FALLBACK_TOTALS = {
  'mirador del desierto': { 1: 76000, 2: 95000 },
  'mirador de suesca': { 1: 164000, 2: 205000 },
  'travesía cordillera oriental': { 1: 240000, 2: 300000 },
  'travesia cordillera oriental': { 1: 240000, 2: 300000 },
  'travesía la pared': { 1: 315000, 2: 394000 },
  'travesia la pared': { 1: 315000, 2: 394000 },
  'expedición off road': { 1: 395000, 2: 494000 },
  'expedicion off road': { 1: 395000, 2: 494000 }
}

const mapPlan = (item) => ({
  id: item.id_plan,
  name: item.nombre_plan,
  price: item.precio_plan,
  description: item.descripcion_basica,
  tipo_fecha: item.tipo_fecha,
  tipo_hora: item.tipo_hora,
  imagen_url: item.imagen_url,
  numero_plan: item.numero_plan,
  activo: item.activo,
  es_grupo: item.es_grupo,
  id_plan_padre: item.id_plan_padre
})

const normalizeName = (name = '') => name.toLowerCase().trim()

const ensureBuggyTariffs = (plan, tariffs = []) => {
  const fallback = BUGGY_FALLBACK_TOTALS[normalizeName(plan?.name)]
  if (!fallback) return tariffs

  const result = [...tariffs]
  const hasOne = result.some((tariff) => Number(tariff.peopleMin) === 1)
  const hasTwo = result.some((tariff) => Number(tariff.peopleMin) === 2)

  if (!hasOne) {
    result.push({
      peopleMin: 1,
      peopleMax: 1,
      unitPrice: fallback[1],
      totalPrice: fallback[1],
      dayType: 'todos',
      source: 'fallback'
    })
  }

  if (!hasTwo) {
    result.push({
      peopleMin: 2,
      peopleMax: 2,
      unitPrice: fallback[2] / 2,
      totalPrice: fallback[2],
      dayType: 'todos',
      source: 'fallback'
    })
  }

  return result.sort((a, b) => Number(a.peopleMin) - Number(b.peopleMin))
}

export const getTours = async () => {
  try {
    const { data, error } = await supabase
      .from('plan')
      .select('id_plan, nombre_plan, precio_plan, descripcion_basica, tipo_fecha, tipo_hora, imagen_url, numero_plan, activo, es_grupo, id_plan_padre')
      .eq('activo', true)
      .is('id_plan_padre', null)
      .order('id_plan', { ascending: true })

    if (error) {
      console.error('--- ERROR DE SUPABASE ---', error.message)
      return []
    }

    return (data ?? []).map(mapPlan)
  } catch (err) {
    console.error('--- ERROR INESPERADO ---', err)
    return []
  }
}

export const getSubplans = async (parentPlanId) => {
  if (!parentPlanId) return []

  try {
    const { data, error } = await supabase
      .from('plan')
      .select('id_plan, nombre_plan, precio_plan, descripcion_basica, tipo_fecha, tipo_hora, imagen_url, numero_plan, activo, es_grupo, id_plan_padre')
      .eq('activo', true)
      .eq('es_grupo', false)
      .eq('id_plan_padre', parentPlanId)
      .order('id_plan', { ascending: true })

    if (error) {
      console.error('--- ERROR AL CARGAR SUBPLANES ---', error.message)
      return []
    }

    const plans = (data ?? []).map(mapPlan)
    if (!plans.length) return []

    const planIds = plans.map(plan => plan.id)
    const { data: tariffData, error: tariffError } = await supabase
      .from('plan_tarifa')
      .select('id_plan, personas_min, personas_max, precio_persona, tipo_dia, activo')
      .in('id_plan', planIds)
      .eq('activo', true)
      .order('personas_min', { ascending: true })

    if (tariffError) {
      console.warn('--- NO SE PUDIERON CARGAR TARIFAS DE SUBPLANES ---', tariffError.message)
      return plans.map(plan => ({
        ...plan,
        tariffs: ensureBuggyTariffs(plan, [])
      }))
    }

    const tariffsByPlan = (tariffData ?? []).reduce((acc, tariff) => {
      const key = String(tariff.id_plan)
      if (!acc[key]) acc[key] = []
      const people = Number(tariff.personas_min || 1)
      acc[key].push({
        peopleMin: people,
        peopleMax: Number(tariff.personas_max || people),
        unitPrice: Number(tariff.precio_persona || 0),
        totalPrice: Number(tariff.precio_persona || 0) * people,
        dayType: tariff.tipo_dia,
        source: 'database'
      })
      return acc
    }, {})

    return plans.map(plan => ({
      ...plan,
      tariffs: ensureBuggyTariffs(plan, tariffsByPlan[String(plan.id)] || [])
    }))
  } catch (err) {
    console.error('--- ERROR INESPERADO EN SUBPLANES ---', err)
    return []
  }
}

export const getPlanDates = async (planId) => {
  try {
    const { data, error } = await supabase
      .from('plan_fechas')
      .select('fecha')
      .eq('id_plan', planId)

    if (error) throw error
    return data.map(d => d.fecha)
  } catch (err) {
    console.error('Error al cargar fechas del plan:', err)
    return []
  }
}

export const getPlanHours = async (planId) => {
  try {
    const { data, error } = await supabase
      .from('plan_horas')
      .select('id_hora, hora')
      .eq('id_plan', planId)

    if (error) throw error
    return data.map(item => {
      const hourPart = item.hora.split(':')[0]
      const hour = parseInt(hourPart)
      return {
        id: item.id_hora,
        value: item.hora,
        label: item.hora,
        period: hour >= 12 ? 'tarde' : 'mañana'
      }
    })
  } catch (err) {
    console.error('Error al cargar horas del plan:', err)
    return []
  }
}

export const getSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('horario')
      .select('id_horario, hora, periodo')
      .order('hora', { ascending: true })

    if (error) {
      console.error('--- ERROR AL CARGAR HORARIOS ---', error.message)
      return []
    }

    return data.map(item => ({
      id: item.id_horario,
      label: item.hora,
      value: item.hora,
      period: item.periodo
    }))
  } catch (err) {
    console.error('--- ERROR INESPERADO EN HORARIOS ---', err)
    return []
  }
}
