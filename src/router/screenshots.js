import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL + 'screenshots.html'),
  routes: [
    {
      path: '/',
      component: () => import('@/views/screenshots/ScreenshotsHomeView.vue'),
    },
    {
      path: '/countdown',
      component: () => import('@/views/screenshots/CountdownView.vue'),
    },
    {
      path: '/schedules',
      component: () => import('@/views/screenshots/SchedulesView.vue'),
    },
    {
      path: '/salmon-run',
      component: () => import('@/views/screenshots/SalmonRunView.vue'),
    },
    {
      path: '/gear-regular',
      component: () => import('@/views/screenshots/RegularGearView.vue'),
    },
    {
      path: '/gear-dailydrop',
      component: () => import('@/views/screenshots/DailyDropGearView.vue'),
    },
    {
      path: '/splatfest',
      component: () => import('@/views/screenshots/SplatfestView.vue'),
    },
  ],
})

export default router
