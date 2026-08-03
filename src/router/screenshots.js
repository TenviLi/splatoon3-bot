import { createRouter, createWebHashHistory } from 'vue-router'
import { screenshotRouteDefinitions } from '@/common/screenshotRoutes.mjs'

const screenshotComponents = Object.freeze({
  countdown: () => import('@/views/screenshots/CountdownView.vue'),
  schedules: () => import('@/views/screenshots/SchedulesView.vue'),
  'schedules-regular': () => import('@/views/screenshots/SchedulesRegularView.vue'),
  'schedules-anarchy': () => import('@/views/screenshots/SchedulesAnarchyView.vue'),
  'schedules-x': () => import('@/views/screenshots/SchedulesXView.vue'),
  challenges: () => import('@/views/screenshots/ChallengesView.vue'),
  'salmon-run': () => import('@/views/screenshots/SalmonRunView.vue'),
  'gear-regular': () => import('@/views/screenshots/RegularGearView.vue'),
  'gear-dailydrop': () => import('@/views/screenshots/DailyDropGearView.vue'),
  'gear-salmon-run': () => import('@/views/screenshots/SalmonRunGearView.vue'),
  'splatfest-na': () => import('@/views/screenshots/SplatfestView.vue'),
  'splatfest-eu': () => import('@/views/screenshots/SplatfestView.vue'),
  'splatfest-jp': () => import('@/views/screenshots/SplatfestView.vue'),
  'splatfest-ap': () => import('@/views/screenshots/SplatfestView.vue'),
})

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL + 'screenshots.html'),
  routes: [
    {
      path: '/',
      component: () => import('@/views/screenshots/ScreenshotsHomeView.vue'),
    },
    ...screenshotRouteDefinitions.map(({ name, path, region }) => ({
      name,
      path,
      component: screenshotComponents[name],
      ...(region ? { props: { region } } : {}),
    })),
  ],
})

export default router
