import { createApp } from 'vue';
import { createPinia } from 'pinia';

import './style.css';
import App from './App.vue';
import router from './router/index';

import '../iconfont/iconfont.css';
const app = createApp(App);
app
  .use(router)
  // .use(ElementPlus)
  .use(createPinia())
  .mount('#app');
