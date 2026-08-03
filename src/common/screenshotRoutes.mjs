import { splatfestRegions } from './splatfestRegions.mjs'

function defineRoute(name, path, label, region) {
  return Object.freeze({ name, path, label, ...(region ? { region } : {}) })
}

export const screenshotNavigationGroups = Object.freeze([
  Object.freeze({
    label: null,
    routes: Object.freeze([
      defineRoute('countdown', '/countdown', 'Countdown'),
      defineRoute('schedules', '/schedules', 'Schedules'),
      defineRoute('schedules-regular', '/schedules-regular', 'Regular Battle Card'),
      defineRoute('schedules-anarchy', '/schedules-anarchy', 'Anarchy Battle Cards'),
      defineRoute('schedules-x', '/schedules-x', 'X Battle Card'),
      defineRoute('challenges', '/challenges', 'Challenges'),
      defineRoute('salmon-run', '/salmon-run', 'Salmon Run'),
    ]),
  }),
  Object.freeze({
    label: 'Gear',
    routes: Object.freeze([
      defineRoute('gear-regular', '/gear-regular', 'Regular'),
      defineRoute('gear-dailydrop', '/gear-dailydrop', 'Daily Drop'),
      defineRoute('gear-salmon-run', '/gear-salmon-run', 'Salmon Run'),
    ]),
  }),
  Object.freeze({
    label: 'Splatfest',
    routes: Object.freeze(
      splatfestRegions.map(({ name: region, slug }) =>
        defineRoute(`splatfest-${slug}`, `/splatfest/${region}`, region, region)
      )
    ),
  }),
])

export const screenshotRouteDefinitions = Object.freeze(
  screenshotNavigationGroups.flatMap(({ routes }) => routes)
)

export function getScreenshotRouteDefinition(name) {
  const definition = screenshotRouteDefinitions.find((candidate) => candidate.name === name)
  if (!definition) {
    throw new Error(`Unknown screenshot route: ${name}`)
  }
  return definition
}
