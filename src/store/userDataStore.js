import { defineStore } from 'pinia';

const useUserDataStore = defineStore('UserDataStore', {
  state() {
    return {
      userData: [],
    };
  },
  actions: {
    async loadData() {
      let data = await window.myApi.loadData();
      // console.log(data);
      this.userData = JSON.parse(data);
    },
    async writeFileTodo(arr) {
      let arrs = JSON.parse(JSON.stringify(this.userData));
      arrs.TODO = arr;
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
    async writeFileDone(arr) {
      let arrs = JSON.parse(JSON.stringify(this.userData));
      arrs.DONE = arr;
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
    async updateData(todo, done) {
      let arrs = JSON.parse(JSON.stringify(this.userData));
      arrs.TODO = todo;
      arrs.DONE = done;
      await window.myApi.writeFile(arrs);
      this.loadData();
    },
  },
});

export default useUserDataStore;
