import { createRouter, createWebHashHistory } from 'vue-router'
import GalleryPage from './pages/GalleryPage.vue'
import HomePage from './pages/HomePage.vue'
import PeoplePage from './pages/PeoplePage.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/people', name: 'people', component: PeoplePage },
    { path: '/gallery', name: 'gallery', component: GalleryPage },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
