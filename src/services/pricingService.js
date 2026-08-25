import { supabase } from '../lib/supabase'

const getDayType = (date) => {
  const selectedDate = String(date || '').slice(0, 10)
  if (!selectedDate) return null

  const parsed = new Date(`${selectedDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null

  const day = parsed.getUTCDay()
  return day === 0 || day === 6 ? 'fin_semana' : 'semana'
}

const matchesPeopleRange = (tariff, people) => {
  const min = Number(tariff.personas_min || 0)
  const max = tariff.personas_max == null ? null : Number(tariff.personas_max)
  return people >= min && (max == null || people <= max)
}

const getPricingFromTable = async ({ idPlan, quantity, selectedDate }) => {
  const dayType = getDayType(selectedDate)
  if (!dayType) throw new Error('No fue posible determinar el tipo de día')

  const { data: tariffs, error } = await supabase
    .from('plan_tarifa')
    .select('id_tarifa,id_plan,personas_min,personas_max,precio_persona,tipo_dia,activo')
    .eq('id_plan', idPlan)
    .eq('activo', true)
    .eq('tipo_dia', dayType)
    .order('personas_min', { ascending: true })

  if (error) throw error

  const selectedTariff = (tariffs || []).find((tariff) =>
    matchesPeopleRange(tariff, quantity)
  )

  if (!selectedTariff) {
    throw new Error(`El plan ${idPlan} no tiene una tarifa activa para ${dayType} y ${quantity} persona(s)`)
  }

  const unitPrice = Number(selectedTariff.precio_persona)
  const totalPrice = unitPrice * quantity

  return {
    unitPrice,
    totalPrice,
    tariffId: selectedTariff.id_tarifa,
    dayType
  }
}

export const getAutomaticPlanPricing = async ({ planId, people, date }) => {
  const idPlan = Number(planId)
  const quantity = Number(people)
  const selectedDate = String(date || '').slice(0, 10)

  if (!idPlan || !quantity || !selectedDate) {
    return {
      unitPrice: null,
      totalPrice: null,
      error: new Error('Faltan datos para calcular la tarifa del plan')
    }
  }

  try {
    // Fuente principal: funciones SQL utilizadas por el backend.
    // Evita que RLS de plan_tarifa impida el cálculo en el navegador.
    const [unitResult, totalResult] = await Promise.all([
      supabase.rpc('obtener_precio_plan', {
        p_id_plan: idPlan,
        p_cantidad_personas: quantity,
        p_fecha: selectedDate
      }),
      supabase.rpc('calcular_total_plan', {
        p_id_plan: idPlan,
        p_cantidad_personas: quantity,
        p_fecha: selectedDate
      })
    ])

    if (!unitResult.error && !totalResult.error) {
      const unitPrice = Number(unitResult.data)
      const totalPrice = Number(totalResult.data)

      if (
        Number.isFinite(unitPrice) && unitPrice > 0 &&
        Number.isFinite(totalPrice) && totalPrice > 0
      ) {
        return { unitPrice, totalPrice, error: null }
      }
    }

    // Fallback para proyectos donde plan_tarifa tenga SELECT público.
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
