function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasString(value) {
  return typeof value === 'string'
}

function hasTimestamp(value) {
  return hasText(value) && Number.isFinite(Date.parse(value))
}

function hasImage(image) {
  return hasText(image?.url)
}

function hasColor(color) {
  return ['r', 'g', 'b', 'a'].every(
    (channel) => Number.isFinite(color?.[channel]) && color[channel] >= 0 && color[channel] <= 1
  )
}

function hasStage(stage) {
  return Boolean(
    hasText(stage?.id) &&
      hasText(stage.name) &&
      hasImage(stage.thumbnailImage)
  )
}

function hasRule(rule) {
  return Boolean(hasText(rule?.id) && hasText(rule.name) && hasText(rule.rule))
}

function hasGearPower(power) {
  return Boolean(
    hasText(power?.__splatoon3ink_id) &&
      hasText(power.name) &&
      hasImage(power.image)
  )
}

function hasListedGear(entry) {
  const gear = entry?.gear
  return Boolean(
    hasText(entry?.id) &&
      hasTimestamp(entry.saleEndTime) &&
      Number.isFinite(entry.price) &&
      hasText(gear?.__splatoon3ink_id) &&
      hasText(gear.__typename) &&
      hasText(gear.name) &&
      hasImage(gear.image) &&
      hasGearPower(gear.primaryGearPower) &&
      Array.isArray(gear.additionalGearPowers) &&
      gear.additionalGearPowers.every(hasGearPower) &&
      hasText(gear.brand?.id) &&
      hasText(gear.brand.name) &&
      hasImage(gear.brand.image)
  )
}

const splatfestRatioKeys = Object.freeze([
  'horagaiRatio',
  'voteRatio',
  'regularContributionRatio',
  'challengeContributionRatio',
  'tricolorContributionRatio',
])
const splatfestTopKeys = Object.freeze([
  'isHoragaiRatioTop',
  'isVoteRatioTop',
  'isRegularContributionRatioTop',
  'isChallengeContributionRatioTop',
  'isTricolorContributionRatioTop',
])

function hasSplatfestResult(result) {
  return Boolean(
    result &&
      typeof result.isWinner === 'boolean' &&
      splatfestRatioKeys.every((key) => result[key] == null || Number.isFinite(result[key])) &&
      splatfestTopKeys.every((key) => result[key] == null || typeof result[key] === 'boolean') &&
      (result.totalPoint == null || Number.isFinite(result.totalPoint))
  )
}

export function hasBattleScheduleContent(schedule) {
  return Boolean(
    hasTimestamp(schedule?.startTime) &&
      hasTimestamp(schedule.endTime) &&
      hasRule(schedule.settings?.vsRule) &&
      Array.isArray(schedule.settings.vsStages) &&
      schedule.settings.vsStages.length === 2 &&
      schedule.settings.vsStages.every(hasStage)
  )
}

export function hasChallengeContent(challenge) {
  return Boolean(
    hasBattleScheduleContent(challenge) &&
      hasText(challenge.settings.leagueMatchEvent?.id) &&
      hasText(challenge.settings.leagueMatchEvent.name) &&
      hasString(challenge.settings.leagueMatchEvent.desc) &&
      hasString(challenge.settings.leagueMatchEvent.regulation) &&
      Array.isArray(challenge.timePeriods) &&
      challenge.timePeriods.length > 0 &&
      challenge.timePeriods.every(
        (period) => hasTimestamp(period?.startTime) && hasTimestamp(period.endTime)
      )
  )
}

export function hasSalmonRunScheduleContent(schedule) {
  return Boolean(
    hasTimestamp(schedule?.startTime) &&
      hasTimestamp(schedule.endTime) &&
      hasStage(schedule.settings?.coopStage) &&
      Array.isArray(schedule.settings.weapons) &&
      schedule.settings.weapons.length > 0 &&
      schedule.settings.weapons.every(
        (weapon) =>
          hasText(weapon?.__splatoon3ink_id) &&
          hasText(weapon.name) &&
          hasImage(weapon.image)
      ) &&
      (
        !schedule.settings.boss ||
        (hasText(schedule.settings.boss.id) && hasText(schedule.settings.boss.name))
      )
  )
}

export function hasDailyDropGearContent(brand, gears) {
  return Boolean(
    hasText(brand?.brand?.id) &&
      hasText(brand.brand.name) &&
      hasImage(brand.image) &&
      hasTimestamp(brand.saleEndTime) &&
      Array.isArray(gears) &&
      gears.length > 0 &&
      gears.every(hasListedGear)
  )
}

export function hasRegularGearContent(gears) {
  return Array.isArray(gears) && gears.length > 0 && gears.every(hasListedGear)
}

export function hasSalmonRunGearContent(gear) {
  return Boolean(
    hasText(gear?.__splatoon3ink_id) &&
      hasText(gear.name) &&
      hasImage(gear.image)
  )
}

export function getTricolorStages(tricolor) {
  const stages = [
    ...(tricolor?.tricolorStage ? [tricolor.tricolorStage] : []),
    ...(Array.isArray(tricolor?.tricolorStages) ? tricolor.tricolorStages : []),
  ]

  return stages.filter((stage, index) =>
    hasText(stage?.id) && stages.findIndex((candidate) => candidate?.id === stage.id) === index
  )
}

export function hasTricolorContent(tricolor) {
  const stages = getTricolorStages(tricolor)
  return Boolean(
    Array.isArray(tricolor?.teams) &&
      tricolor.teams.length >= 3 &&
      tricolor.teams.slice(0, 3).every((team) => hasColor(team?.color)) &&
      stages.length > 0 &&
      stages.every(hasStage)
  )
}

export function hasSplatfestContent(festival) {
  if (
    !hasText(festival?.__splatoon3ink_id) ||
    !hasText(festival.title) ||
    !hasTimestamp(festival.startTime) ||
    !hasTimestamp(festival.endTime) ||
    !['active', 'upcoming', 'past'].includes(festival.status) ||
    typeof festival.hasResults !== 'boolean' ||
    !hasImage(festival.image) ||
    !Array.isArray(festival.teams) ||
    festival.teams.length < 3
  ) {
    return false
  }

  const hasCompleteTeams = festival.teams.every(
    (team) => hasText(team?.id) && hasText(team.teamName) && hasColor(team.color)
  )
  const resultCount = festival.teams.filter((team) => Boolean(team.result)).length
  const hasNoResults = resultCount === 0 && festival.hasResults === false
  const hasCompleteResults = Boolean(
    resultCount === festival.teams.length &&
      festival.hasResults === true &&
      festival.teams.every((team) => hasImage(team.image) && hasSplatfestResult(team.result)) &&
      festival.teams.filter((team) => team.result.isWinner).length === 1
  )
  return hasCompleteTeams && (hasNoResults || hasCompleteResults)
}
