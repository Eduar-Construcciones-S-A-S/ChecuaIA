import { getAutomaticPlanPricing } from './pricingService'

export const getBuggyShape = (people, requestedBuggyCount) => {
  const totalPeople = Math.max(1, Number(people || 1))
  const minBuggies = Math.ceil(totalPeople / 2)
  const maxBuggies = totalPeople
  const buggyCount = Math.min(
    maxBuggies,
    Math.max(minBuggies, Number(requestedBuggyCount || minBuggies))
  )

  const doubleBuggies = totalPeople - buggyCount
  const singleBuggies = buggyCount - doubleBuggies

  return {
    people: totalPeople,
    minBuggies,
    maxBuggies,
    buggyCount,
    singleBuggies,
    doubleBuggies,
  }
}

export const buildDefaultBuggyAssignments = (participantKeys = [], requestedBuggyCount) => {
  const keys = [...participantKeys]
  if (!keys.length) return []

  const shape = getBuggyShape(keys.length, requestedBuggyCount)
  const assignments = []
  let cursor = 0

  for (let index = 0; index < shape.buggyCount; index += 1) {
    const hasPassenger = index < shape.doubleBuggies
    assignments.push({
      buggy: index + 1,
      driver: keys[cursor] || null,
      passenger: hasPassenger ? (keys[cursor + 1] || null) : null,
    })
    cursor += hasPassenger ? 2 : 1
  }

  return assignments
}

export const calculateBuggyPricing = async ({ planId, date, people, buggyCount }) => {
  const shape = getBuggyShape(people, buggyCount)

  let singlePrice = 0
  let doublePrice = 0

  if (shape.singleBuggies > 0) {
    const single = await getAutomaticPlanPricing({
      planId,
      people: 1,
      date,
    })
    if (single.error) return { ...shape, error: single.error }
    singlePrice = Number(single.totalPrice || 0)
  }

  if (shape.doubleBuggies > 0) {
    const double = await getAutomaticPlanPricing({
      planId,
      people: 2,
      date,
    })
    if (double.error) return { ...shape, error: double.error }
    doublePrice = Number(double.totalPrice || 0)
  }

  if (
    (shape.singleBuggies > 0 && singlePrice <= 0) ||
    (shape.doubleBuggies > 0 && doublePrice <= 0)
  ) {
    return {
      ...shape,
      error: new Error('No fue posible obtener las tarifas de ocupación del Buggy'),
    }
  }

  const totalPrice =
    (shape.singleBuggies * singlePrice) +
    (shape.doubleBuggies * doublePrice)

  return {
    ...shape,
    singlePrice,
    doublePrice,
    totalPrice,
    averageUnitPrice: totalPrice / shape.people,
    error: null,
  }
}

export const buildBuggyObservation = ({ configuration, pricing }) => {
  if (!configuration || !pricing) return null

  return JSON.stringify({
    tipo: 'configuracion_buggy',
    version: 1,
    ruta: configuration.routeName || null,
    grupo: configuration.groupName || 'Buggys',
    cantidad_buggies: pricing.buggyCount,
    cantidad_personas: pricing.people,
    buggies_individuales: pricing.singleBuggies,
    buggies_dobles: pricing.doubleBuggies,
    tarifa_buggy_individual: pricing.singlePrice,
    tarifa_buggy_doble: pricing.doublePrice,
    total_aplicado: pricing.totalPrice,
    asignacion: configuration.assignments || [],
    participantes: configuration.participants || [],
  })
}
