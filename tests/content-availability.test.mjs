import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getTricolorStages,
  hasBattleScheduleContent,
  hasChallengeContent,
  hasDailyDropGearContent,
  hasRegularGearContent,
  hasSalmonRunGearContent,
  hasSalmonRunScheduleContent,
  hasSplatfestContent,
  hasTricolorContent,
} from '../src/common/contentAvailability.mjs'

const timestamp = '2026-08-03T00:00:00Z'

function createImage(name) {
  return { url: `/fixture-assets/${name}.png` }
}

function createStage(id = 'stage-one') {
  return {
    id,
    name: `Stage ${id}`,
    thumbnailImage: createImage(id),
  }
}

function createBattleSchedule() {
  return {
    startTime: timestamp,
    endTime: '2026-08-03T02:00:00Z',
    settings: {
      vsRule: { id: 'rule', name: 'Turf War', rule: 'TURF_WAR' },
      vsStages: [createStage('one'), createStage('two')],
    },
  }
}

function createGearPower(id = 'power') {
  return {
    __splatoon3ink_id: id,
    name: `Power ${id}`,
    image: createImage(id),
  }
}

function createListedGear(id = 'gear') {
  return {
    id: `sale-${id}`,
    saleEndTime: '2026-08-04T00:00:00Z',
    price: 10_000,
    gear: {
      __splatoon3ink_id: id,
      __typename: 'HeadGear',
      name: `Gear ${id}`,
      image: createImage(id),
      primaryGearPower: createGearPower(`${id}-primary`),
      additionalGearPowers: [createGearPower(`${id}-additional`)],
      brand: {
        id: 'brand',
        name: 'Brand',
        image: createImage('brand'),
      },
    },
  }
}

function createFestival() {
  return {
    __splatoon3ink_id: 'festival',
    title: 'Which team?',
    startTime: timestamp,
    endTime: '2026-08-05T00:00:00Z',
    status: 'upcoming',
    hasResults: false,
    image: createImage('festival'),
    teams: Array.from({ length: 3 }, (_, index) => ({
      id: `team-${index}`,
      teamName: `Team ${index}`,
      color: { r: 1, g: 1, b: 1, a: 1 },
      image: createImage(`team-${index}`),
      result: null,
    })),
  }
}

test('content availability accepts complete domain data', () => {
  const battleSchedule = createBattleSchedule()
  const challenge = {
    ...battleSchedule,
    settings: {
      ...battleSchedule.settings,
      leagueMatchEvent: {
        id: 'event',
        name: 'Challenge',
        desc: 'Description',
        regulation: 'Rules',
      },
    },
    timePeriods: [{ startTime: timestamp, endTime: '2026-08-03T02:00:00Z' }],
  }
  const salmonRun = {
    startTime: timestamp,
    endTime: '2026-08-04T00:00:00Z',
    settings: {
      coopStage: createStage('coop'),
      weapons: [{ __splatoon3ink_id: 'weapon', name: 'Weapon', image: createImage('weapon') }],
      boss: { id: 'boss', name: 'Cohozuna' },
    },
  }
  const brand = {
    brand: { id: 'brand', name: 'Brand' },
    image: createImage('pickup-brand'),
    saleEndTime: '2026-08-04T00:00:00Z',
  }
  const listedGear = createListedGear()
  const salmonRunGear = {
    __splatoon3ink_id: 'monthly-gear',
    name: 'Monthly Gear',
    image: createImage('monthly-gear'),
  }

  assert.equal(hasBattleScheduleContent(battleSchedule), true)
  assert.equal(hasChallengeContent(challenge), true)
  assert.equal(hasSalmonRunScheduleContent(salmonRun), true)
  assert.equal(hasDailyDropGearContent(brand, [listedGear]), true)
  assert.equal(hasRegularGearContent([listedGear]), true)
  assert.equal(hasSalmonRunGearContent(salmonRunGear), true)
  assert.equal(hasSplatfestContent(createFestival()), true)
})

test('content availability rejects partial structures before rendering or notification composition', () => {
  const battleSchedule = createBattleSchedule()
  const challenge = {
    ...battleSchedule,
    settings: {
      ...battleSchedule.settings,
      leagueMatchEvent: { id: 'event', name: 'Challenge', desc: 'Description' },
    },
    timePeriods: [{ startTime: timestamp, endTime: '2026-08-03T02:00:00Z' }],
  }
  const salmonRun = {
    startTime: timestamp,
    endTime: '2026-08-04T00:00:00Z',
    settings: {
      coopStage: createStage('coop'),
      weapons: [{ __splatoon3ink_id: 'weapon', name: 'Weapon' }],
    },
  }
  const brand = {
    brand: { id: 'brand', name: 'Brand' },
    image: createImage('pickup-brand'),
    saleEndTime: '2026-08-04T00:00:00Z',
  }

  assert.equal(
    hasBattleScheduleContent({
      ...battleSchedule,
      settings: { ...battleSchedule.settings, vsStages: [{ id: 'one' }, createStage('two')] },
    }),
    false
  )
  assert.equal(
    hasBattleScheduleContent({
      ...battleSchedule,
      settings: { ...battleSchedule.settings, vsStages: [...battleSchedule.settings.vsStages, { id: 'three' }] },
    }),
    false
  )
  assert.equal(hasChallengeContent(challenge), false)
  assert.equal(hasSalmonRunScheduleContent(salmonRun), false)
  assert.equal(hasDailyDropGearContent(brand, [{}]), false)
  assert.equal(hasRegularGearContent([{}]), false)
  assert.equal(hasSalmonRunGearContent({ name: 'Monthly Gear', image: createImage('gear') }), false)
  assert.equal(hasSplatfestContent({ ...createFestival(), startTime: 'not-a-timestamp' }), false)
})

test('Splatfest content rejects partial result sets and malformed result values', () => {
  const festival = createFestival()
  festival.teams[0].result = { isWinner: true, voteRatio: 0.4, totalPoint: 100 }
  festival.hasResults = true
  assert.equal(hasSplatfestContent(festival), false, 'partial results must not render as a complete result card')

  const completeResults = festival.teams.map((team, index) => ({
    ...team,
    result: {
      isWinner: index === 0,
      horagaiRatio: 0.3 + index / 100,
      isHoragaiRatioTop: index === 0,
      voteRatio: 0.3 + index / 100,
      isVoteRatioTop: index === 0,
      regularContributionRatio: 0.3 + index / 100,
      isRegularContributionRatioTop: index === 0,
      challengeContributionRatio: 0.3 + index / 100,
      isChallengeContributionRatioTop: index === 0,
      tricolorContributionRatio: 0.3 + index / 100,
      isTricolorContributionRatioTop: index === 0,
      totalPoint: 100 - index,
    },
  }))
  const completedFestival = { ...festival, status: 'past', hasResults: true, teams: completeResults }
  assert.equal(hasSplatfestContent(completedFestival), true)
  assert.equal(
    hasSplatfestContent({
      ...completedFestival,
      teams: completeResults.map((team, index) =>
        index === 1 ? { ...team, result: { ...team.result, horagaiRatio: '33%' } } : team
      ),
    }),
    false
  )
  assert.equal(
    hasSplatfestContent({
      ...completedFestival,
      teams: completeResults.map((team, index) =>
        index === 1 ? { ...team, result: { ...team.result, isVoteRatioTop: 'yes' } } : team
      ),
    }),
    false
  )
  assert.equal(hasSplatfestContent({ ...completedFestival, hasResults: false }), false)
  assert.equal(hasSplatfestContent({ ...completedFestival, status: 'unknown' }), false)
  assert.equal(
    hasSplatfestContent({
      ...completedFestival,
      teams: completeResults.map((team) => ({
        ...team,
        result: { ...team.result, isWinner: false },
      })),
    }),
    false
  )
  assert.equal(
    hasSplatfestContent({
      ...completedFestival,
      teams: completeResults.map((team, index) => ({
        ...team,
        result: { ...team.result, isWinner: index < 2 },
      })),
    }),
    false
  )
})

test('Tricolor content supports current single-stage and multi-stage API shapes', () => {
  const repeatedStage = createStage('stage-one')
  const tricolor = {
    teams: Array.from({ length: 3 }, () => ({ color: { r: 1, g: 1, b: 1, a: 1 } })),
    tricolorStage: repeatedStage,
    tricolorStages: [repeatedStage, createStage('stage-two')],
  }

  assert.deepEqual(getTricolorStages(tricolor).map(({ id }) => id), ['stage-one', 'stage-two'])
  assert.equal(hasTricolorContent(tricolor), true)
  assert.equal(hasTricolorContent({ ...tricolor, teams: [{}, {}, {}] }), false)
  assert.equal(hasTricolorContent({ ...tricolor, tricolorStage: null, tricolorStages: [] }), false)
})
