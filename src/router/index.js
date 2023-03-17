import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../view/home.vue';
import Todo from '../view/todo.vue';
import Done from '../view/done.vue';
const routes = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    component: Home,
    redirect: '/home/todo',
    children: [
      {
        name: 'TODO',
        path: '/home/todo',
        component: Todo,
      },
      {
        name: 'DONE',
        path: '/home/done',
        component: Done,
      },
    ],
  },
];
const router = createRouter({
  routes,
  history: createWebHashHistory(),
});

export default router;
