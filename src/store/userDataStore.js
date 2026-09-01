import { defineStore } from 'pinia';

const useUserDataStore = defineStore('UserDataStore', {
  state() {
    return {
      userData: { TODO: [], DONE: [] },
    };
  },
  actions: {
    async loadData() {
      try {
        const data = await window.myApi.loadData();
        const parsed = JSON.parse(data);
        this.userData = {
          TODO: Array.isArray(parsed.TODO) ? parsed.TODO : [],
          DONE: Array.isArray(parsed.DONE) ? parsed.DONE : [],
        };
      } catch (err) {
        console.error('loadData failed:', err);
        this.userData = { TODO: [], DONE: [] };
      }
    },
    // 保证写入前一定有完整的 TODO/DONE 结构，避免覆盖丢失。
    // 注意：必须深拷贝为纯 JSON —— userData 是 Pinia 响应式状态，
    // 直接把 Proxy 引用传给 IPC（ipcRenderer.invoke）会因无法结构化克隆而静默失败。
    _base() {
      const u = this.userData || {};
      const clone = (x) => JSON.parse(JSON.stringify(x));
      return {
        TODO: Array.isArray(u.TODO) ? clone(u.TODO) : [],
        DONE: Array.isArray(u.DONE) ? clone(u.DONE) : [],
      };
    },
    async writeFileTodo(arr) {
      const arrs = this._base();
      arrs.TODO = arr || [];
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
    async writeFileDone(arr) {
      const arrs = this._base();
      arrs.DONE = arr || [];
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
    async updateData(todo, done) {
      const arrs = this._base();
      arrs.TODO = todo || [];
      arrs.DONE = done || [];
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
  },
});

export default useUserDataStore;