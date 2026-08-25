import { supabase } from '../lib/supabase'
import { getAutomaticPlanPricing } from './pricingService'

const normalizePhone = (phone) => {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  return digits ? `+${digits}` : ''
}

const resolveDateId = async (planId, selectedDate) => {
  if (!planId || !selectedDate) return { id: null, error: null }
  const dateValue = String(selectedDate).slice(0, 10)
  const { data, error } = await supabase.rpc('get_or_create_plan_fecha', {
    p_plan_id: Number(planId),
    p_fecha: dateValue
  })
  return { id: data ?? null, error }
}

const resolveHourId = async (planId, selectedTime) => {
  if (!planId || !selectedTime) return { id: null, error: null }
  const rawTime = String(selectedTime).trim()
  const timeValue = /^\d{1,2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime
  const { data: existingHour, error } = await supabase
    .from('plan_horas')
    .select('id_hora')
    .eq('id_plan', planId)
    .eq('hora', timeValue)
    .maybeSingle()
  return { id: existingHour?.id_hora ?? null, error }
}

const resolveAppliedPricing = async (reservation) => {
  const planId = Number(reservation.id_plan)
  const people = Number(reservation.cantidad_personas || 1)
  const date = String(reservation.fecha_reserva || '').slice(0, 10)

  const { data: plan, error: planError } = await supabase
    .from('plan')
    .select('id_plan,precio_plan,tipo_fecha')
    .eq('id_plan', planId)
    .single()

  if (planError) return { error: planError }

  let unitPrice
  let totalPrice

  if (plan.tipo_fecha === 'cualquier_dia') {
    const automatic = await getAutomaticPlanPricing({ planId, people, date })
    if (automatic.error) return { error: automatic.error }
    unitPrice = Number(automatic.unitPrice)
    totalPrice = Number(automatic.totalPrice)
  } else {
    unitPrice = Number(plan.precio_plan || 0)
    totalPrice = unitPrice * people
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(totalPrice) || totalPrice <= 0) {
    return { error: new Error('No fue posible determinar un precio válido para la reserva') }
  }

  const depositAmount = Math.round(totalPrice * 0.3)
  return {
    unitPrice,
    totalPrice,
    depositAmount,
    error: null
  }
}

export const getReservationsByPhone = async (phone) => {
  try {
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) return { data: [], error: null }

    const { data, error } = await supabase
      .from('reserva')
      .select('id_reserva, codigo_reserva, id_plan, id_fecha, id_hora, cantidad_personas, precio_unitario, valor_total, valor_abonado, valor_saldo_pagado, aprobado, fecha_solicitud, fecha_aprobacion, telefono_cliente')
      .eq('telefono_cliente', normalizedPhone)
      .order('fecha_solicitud', { ascending: false })

    return { data: data || [], error }
  } catch (err) {
    console.error('Error in getReservationsByPhone service:', err)
    return { data: [], error: err }
  }
}

export const createReservation = async (reservation) => {
  try {
    const selectedDate = reservation.fecha_reserva ?? null
    const selectedTime = reservation.hora_reserva ?? null

    if (!selectedDate) {
      return { data: null, error: new Error('La reserva no contiene fecha_reserva') }
    }

    if (!selectedTime) {
      return { data: null, error: new Error('La reserva no contiene hora_reserva') }
    }

    const { id: idFecha, error: dateError } = await resolveDateId(reservation.id_plan, selectedDate)
    if (dateError || !idFecha) {
      const error = dateError || new Error('No se pudo obtener id_fecha para la reserva')
      console.error('Error al resolver la fecha de la reserva:', error)
      return { data: null, error }
    }

    const { id: idHora, error: hourError } = await resolveHourId(reservation.id_plan, selectedTime)
    if (hourError || !idHora) {
      const error = hourError || new Error('No se encontró id_hora para la hora seleccionada')
      console.error('Error al resolver la hora de la reserva:', error)
      return { data: null, error }
    }

    const pricing = await resolveAppliedPricing(reservation)
    if (pricing.error) {
      console.error('Error al resolver el precio aplicado a la reserva:', pricing.error)
      return { data: null, error: pricing.error }
    }

    const payload = {
      id_plan: Number(reservation.id_plan),
      id_fecha: idFecha,
      id_hora: idHora,
      telefono_cliente: normalizePhone(reservation.telefono_cliente),
      cantidad_personas: Number(reservation.cantidad_personas || 1),
      precio_unitario: pricing.unitPrice,
      valor_total: pricing.totalPrice,
      valor_abonado: pricing.depositAmount,
      valor_saldo_pagado: 0,
      aprobado: reservation.aprobado ?? false,
      fecha_solicitud: reservation.fecha_solicitud ?? new Date().toISOString(),
      fecha_aprobacion: reservation.fecha_aprobacion ?? null
    }

    const { data, error } = await supabase
      .from('reserva')
      .insert(payload)
      .select()
      .single()

    return { data, error }
  } catch (err) {
    console.error('Error in createReservation service:', err)
    return { data: null, error: err }
  }
}
