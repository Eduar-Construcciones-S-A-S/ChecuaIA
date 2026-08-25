import { supabase } from '../lib/supabase'

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

    if (unitResult.error) throw unitResult.error
    if (totalResult.error) throw totalResult.error

    const unitPrice = Number(unitResult.data)
    const totalPrice = Number(totalResult.data)

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Supabase no devolvió una tarifa unitaria válida para este plan')
    }

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      throw new Error('Supabase no devolvió un total válido para este plan')
    }

    return { unitPrice, totalPrice, error: null }
  } catch (error) {
    console.error('Error al calcular la tarifa automática del plan:', error)
    return { unitPrice: null, totalPrice: null, error }
  }
}
