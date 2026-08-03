export const STATUS_PAST = 'past'
export const STATUS_ACTIVE = 'active'
export const STATUS_UPCOMING = 'upcoming'

export const recentSplatfestWindowMs = 3 * 24 * 60 * 60 * 1000

export function getSplatfestStatus(festival, now) {
  const startTime = Date.parse(festival.startTime)
  const endTime = Date.parse(festival.endTime)

  if (startTime <= now && endTime > now) {
    return STATUS_ACTIVE
  }
  if (startTime > now) {
    return STATUS_UPCOMING
  }
  return STATUS_PAST
}

export function decorateSplatfest(festival, now) {
  const status = getSplatfestStatus(festival, now)
  const hasResults = Boolean(
    status === STATUS_PAST &&
      festival.teams.length > 0 &&
      festival.teams.every((team) => Boolean(team.result))
  )

  return {
    ...festival,
    status,
    hasResults,
    teams: hasResults
      ? festival.teams
      : festival.teams.map(({ result: _result, ...team }) => team),
  }
}

export function selectRelevantSplatfest(festivals, now) {
  const decorated = festivals.map((festival) => decorateSplatfest(festival, now))
  const active = decorated
    .filter(({ status }) => status === STATUS_ACTIVE)
    .sort((left, right) => Date.parse(left.endTime) - Date.parse(right.endTime))[0]
  const upcoming = decorated
    .filter(({ status }) => status === STATUS_UPCOMING)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))[0]
  const recent = decorated
    .filter(
      ({ status, endTime }) =>
        status === STATUS_PAST && now - Date.parse(endTime) < recentSplatfestWindowMs
    )
    .sort((left, right) => Date.parse(right.endTime) - Date.parse(left.endTime))[0]

  return active || upcoming || recent || null
}
