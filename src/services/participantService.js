import { supabase } from '../lib/supabase'

/**
 * Inserta múltiples participantes en la tabla 'participante'
 * @param {Array<Object>} participants Lista de participantes formateados para Supabase
 * @returns {Promise<{data: any, error: any}>}
 */
export const createParticipants = async (participants) => {
  try {
    const { data, error } = await supabase
      .from('participante')
      .insert(participants)
      .select()

    return { data, error }
  } catch (err) {
    console.error('Error in createParticipants service:', err)
    return { data: null, error: err }
  }
}

export const saveParticipants = async (participants) => {
  try {
    const results = []

    for (const participant of participants) {
      const { data: updatedData, error: updateError } = await supabase
        .from('participante')
        .update(participant)
        .eq('telefono_cliente', participant.telefono_cliente)
        .eq('numero_documento', participant.numero_documento)
        .select()

      if (updateError) return { data: null, error: updateError }

      if (updatedData && updatedData.length > 0) {
        results.push(...updatedData)
        continue
      }

      const { data: insertedData, error: insertError } = await supabase
        .from('participante')
        .insert(participant)
        .select()

      if (insertError) return { data: null, error: insertError }
      if (insertedData) results.push(...insertedData)
    }

    return { data: results, error: null }
  } catch (err) {
    console.error('Error in saveParticipants service:', err)
    return { data: null, error: err }
  }
}

export const saveParticipantsForReservation = async (participants, reservationId) => {
  try {
    const results = []

    for (const rawParticipant of participants) {
      const participant = {
        ...rawParticipant,
        id_reserva: reservationId
      }

      // No dependemos de una restricción UNIQUE que la tabla actualmente no tiene.
      // Primero buscamos el participante dentro de la misma reserva por documento.
      let existing = null

      if (participant.numero_documento) {
        const { data, error } = await supabase
          .from('participante')
          .select('id_participante')
          .eq('id_reserva', reservationId)
          .eq('numero_documento', participant.numero_documento)
          .limit(1)
          .maybeSingle()

        if (error) return { data: null, error }
        existing = data
      }

      // Respaldo para casos sin documento: teléfono del participante + nombre.
      if (!existing && participant.telefono_participante) {
        let query = supabase
          .from('participante')
          .select('id_participante')
          .eq('id_reserva', reservationId)
          .eq('telefono_participante', participant.telefono_participante)

        if (participant.nombre) query = query.eq('nombre', participant.nombre)

        const { data, error } = await query.limit(1).maybeSingle()
        if (error) return { data: null, error }
        existing = data
      }

      if (existing?.id_participante) {
        const { data, error } = await supabase
          .from('participante')
          .update(participant)
          .eq('id_participante', existing.id_participante)
          .select()
          .single()

        if (error) return { data: null, error }
        if (data) results.push(data)
        continue
      }

      const { data, error } = await supabase
        .from('participante')
        .insert(participant)
        .select()
        .single()

      if (error) return { data: null, error }
      if (data) results.push(data)
    }

    return { data: results, error: null }
  } catch (err) {
    console.error('Error in saveParticipantsForReservation service:', err)
    return { data: null, error: err }
  }
}
