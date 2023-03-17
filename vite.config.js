import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  base: './', //配合打包使用
  manifest: true, //配置后才能让编译后的vue路径被正确识别
  // optimizeDeps: {
  //   exclude: ['electron'], // 告诉 Vite 排除预构建 electron，不然会出现 __diranme is not defined
  // },
});
