import { createRouter, createWebHashHistory } from 'vue-router'
import SalmonRunView from '../views/SalmonRunView.vue'
import RegularView from '../views/RegularView.vue'
import AnarchyOpenView from '../views/AnarchyOpenView.vue'
import AnarchySeriesView from '../views/AnarchySeriesView.vue'
import GearView from '../views/GearView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/salmon-run',
      name: 'salmon-run',
      component: SalmonRunView,
    },
    {
      path: '/regular',
      name: 'regular',
      component: RegularView,
    },
    {
      path: '/anarchy-open',
      name: 'anarchy-open',
      component: AnarchyOpenView,
    },
    {
      path: '/anarchy-series',
      name: 'anarchy-series',
      component: AnarchySeriesView,
    },
    {
      path: '/gear',
      name: 'gear',
      component: GearView,
    },
  ],
})

export default router
