import { supabase } from '../lib/supabase'

const getDayType = (date) => {
  const selectedDate = String(date || '').slice(0, 10)
  if (!selectedDate) return null

  // Se fuerza UTC para evitar que el navegador cambie el día por zona horaria.
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

export const getAutomaticPlanPricing = async ({ planId, people, date }) => {
  const idPlan = Number(planId)
  const quantity = Number(people)
  const selectedDate = String(date || '').slice(0, 10)
  const dayType = getDayType(selectedDate)

  if (!idPlan || !quantity || !selectedDate || !dayType) {
    return {
      unitPrice: null,
      totalPrice: null,
      error: new Error('Faltan datos para calcular la tarifa del plan')
    }
  }

  try {
    // La fuente de verdad es plan_tarifa, que es la misma estructura que
    // administra la pantalla "Tarifas automáticas por cantidad".
    const { data: tariffs, error: tariffsError } = await supabase
      .from('plan_tarifa')
      .select('id_tarifa,id_plan,personas_min,personas_max,precio_persona,tipo_dia,activo')
      .eq('id_plan', idPlan)
      .eq('activo', true)
      .eq('tipo_dia', dayType)
      .order('personas_min', { ascending: true })

    if (tariffsError) throw tariffsError

    const selectedTariff = (tariffs || []).find((tariff) =>
      matchesPeopleRange(tariff, quantity)
    )

    if (!selectedTariff) {
      throw new Error(
        `El plan ${idPlan} no tiene una tarifa activa para ${dayType} y ${quantity} persona(s)`
      )
    }

    const unitPrice = Number(selectedTariff.precio_persona)
    const totalPrice = unitPrice * quantity

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Supabase no devolvió una tarifa unitaria válida para este plan')
    }

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      throw new Error('No fue posible calcular un total válido para este plan')
    }

    return {
      unitPrice,
      totalPrice,
      tariffId: selectedTariff.id_tarifa,
      dayType,
      error: null
    }
  } catch (error) {
    console.error('Error al calcular la tarifa automática del plan:', error)
    return { unitPrice: null, totalPrice: null, error }
  }
}
