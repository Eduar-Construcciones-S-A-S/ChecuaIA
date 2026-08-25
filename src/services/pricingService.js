import { supabase } from '../lib/supabase'

const getEasterDate = (year) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const moveToNextMonday = (date) => {
  const day = date.getDay()
  if (day === 1) return new Date(date)
  const diff = day === 0 ? 1 : 8 - day
  const nextMonday = new Date(date)
  nextMonday.setDate(date.getDate() + diff)
  return nextMonday
}

// Mantiene la misma lógica de festivos que usa el calendario del formulario.
const getColombianHolidays = (year) => {
  const holidays = []

  const fixedHolidays = [
    [0, 1],  // Año Nuevo
    [4, 1],  // Día del Trabajo
    [6, 20], // Independencia de Colombia
    [7, 7],  // Batalla de Boyacá
    [11, 8], // Inmaculada Concepción
    [11, 25] // Navidad
  ]

  fixedHolidays.forEach(([month, day]) => {
    holidays.push(new Date(year, month, day).toDateString())
  })

  const emilianiHolidays = [
    new Date(year, 0, 6),
    new Date(year, 2, 19),
    new Date(year, 5, 29),
    new Date(year, 7, 15),
    new Date(year, 9, 12),
    new Date(year, 10, 1),
    new Date(year, 10, 11)
  ]

  emilianiHolidays.forEach((date) => {
    holidays.push(moveToNextMonday(date).toDateString())
  })

  const easter = getEasterDate(year)

  const thursday = new Date(easter)
  thursday.setDate(easter.getDate() - 3)
  holidays.push(thursday.toDateString())

  const friday = new Date(easter)
  friday.setDate(easter.getDate() - 2)
  holidays.push(friday.toDateString())

  const ascension = new Date(easter)
  ascension.setDate(easter.getDate() + 39)
  holidays.push(moveToNextMonday(ascension).toDateString())

  const corpus = new Date(easter)
  corpus.setDate(easter.getDate() + 60)
  holidays.push(moveToNextMonday(corpus).toDateString())

  const sacredHeart = new Date(easter)
  sacredHeart.setDate(easter.getDate() + 68)
  holidays.push(moveToNextMonday(sacredHeart).toDateString())

  return holidays
}

const getDateMeta = (date) => {
  const selectedDate = String(date || '').slice(0, 10)
  if (!selectedDate) return null

  // Se usa mediodía local para evitar cambios de día por zona horaria.
  const parsed = new Date(`${selectedDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null

  const weekend = parsed.getDay() === 0 || parsed.getDay() === 6
  const holiday = getColombianHolidays(parsed.getFullYear()).includes(parsed.toDateString())

  return {
    isHoliday: holiday,
    dayType: weekend || holiday ? 'fin_semana' : 'semana'
  }
}

const matchesPeopleRange = (tariff, people) => {
  const min = Number(tariff.personas_min || 0)
  const max = tariff.personas_max == null ? null : Number(tariff.personas_max)
  return people >= min && (max == null || people <= max)
}

const getPricingFromTable = async ({ idPlan, quantity, selectedDate }) => {
  const meta = getDateMeta(selectedDate)
  if (!meta) throw new Error('No fue posible determinar el tipo de día')

  const { data: tariffs, error } = await supabase
    .from('plan_tarifa')
    .select('id_tarifa,id_plan,personas_min,personas_max,precio_persona,tipo_dia,activo')
    .eq('id_plan', idPlan)
    .eq('activo', true)
    .eq('tipo_dia', meta.dayType)
    .order('personas_min', { ascending: true })

  if (error) throw error

  const selectedTariff = (tariffs || []).find((tariff) =>
    matchesPeopleRange(tariff, quantity)
  )

  if (!selectedTariff) {
    throw new Error(`El plan ${idPlan} no tiene una tarifa activa para ${meta.dayType} y ${quantity} persona(s)`)
  }

  const unitPrice = Number(selectedTariff.precio_persona)
  const totalPrice = unitPrice * quantity

  return {
    unitPrice,
    totalPrice,
    tariffId: selectedTariff.id_tarifa,
    dayType: meta.dayType,
    isHoliday: meta.isHoliday
  }
}

export const getAutomaticPlanPricing = async ({ planId, people, date }) => {
  const idPlan = Number(planId)
  const quantity = Number(people)
  const selectedDate = String(date || '').slice(0, 10)
  const meta = getDateMeta(selectedDate)

  if (!idPlan || !quantity || !selectedDate || !meta) {
    return {
      unitPrice: null,
      totalPrice: null,
      error: new Error('Faltan datos para calcular la tarifa del plan')
    }
  }

  try {
    // El calendario del frontend determina si la fecha es festiva.
    // Supabase solo recibe ese dato y decide qué tarifa utilizar.
    const unitResult = await supabase.rpc('obtener_precio_plan', {
      p_id_plan: idPlan,
      p_cantidad_personas: quantity,
      p_fecha: selectedDate,
      p_es_festivo: meta.isHoliday
    })

    if (!unitResult.error) {
      const unitPrice = Number(unitResult.data)
      const totalPrice = unitPrice * quantity

      if (
        Number.isFinite(unitPrice) && unitPrice > 0 &&
        Number.isFinite(totalPrice) && totalPrice > 0
      ) {
        return {
          unitPrice,
          totalPrice,
          dayType: meta.dayType,
          isHoliday: meta.isHoliday,
          error: null
        }
      }
    }

    // Fallback únicamente para proyectos donde plan_tarifa tenga SELECT público.
    const fallback = await getPricingFromTable({ idPlan, quantity, selectedDate })

    if (!Number.isFinite(fallback.unitPrice) || fallback.unitPrice <= 0) {
      throw new Error('Supabase no devolvió una tarifa unitaria válida para este plan')
    }

    if (!Number.isFinite(fallback.totalPrice) || fallback.totalPrice <= 0) {
      throw new Error('No fue posible calcular un total válido para este plan')
    }

    return { ...fallback, error: null }
  } catch (error) {
    console.error('Error al calcular la tarifa automática del plan:', error)
    return { unitPrice: null, totalPrice: null, error }
  }
}
