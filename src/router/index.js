import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/salmon-run',
      name: 'salmon-run',
      component: () => import('../views/SalmonRunView.vue'),
    },
    {
      path: '/regular',
      name: 'regular',
      component: () => import('../views/RegularView.vue'),
    },
    {
      path: '/anarchy-open',
      name: 'anarchy-open',
      component: () => import('../views/AnarchyOpenView.vue'),
    },
    {
      path: '/anarchy-series',
      name: 'anarchy-series',
      component: () => import('../views/AnarchySeriesView.vue'),
    },
    {
      path: '/gear',
      name: 'gear',
      component: () => import('../views/GearView.vue'),
    },
  ],
})

export default router
