<script setup>
import { ref, reactive, watch } from 'vue';
import router from '../router/index';
import useUserDataStore from '../store/userDataStore';
import { storeToRefs } from 'pinia';
const btn = ref('TODO');

const radio1 = ref('TODO');
const UserDataStore = useUserDataStore();
const { userData } = storeToRefs(UserDataStore);
const loadData = UserDataStore.loadData;
loadData();

watch(radio1, (newValue, oldValue) => {
  // console.log(newValue);
  if (newValue == 'TODO') {
    router.replace('/home/todo');
  } else if (newValue == 'DONE') {
    router.replace('/home/done');
  }
});
const clickHandle = (text) => {
  btn.value = text;
  radio1.value = text;
};
</script>
<template>
  <div class="tab">
    <div class="drag">
      <span>作者: 阿飞五五开</span>
      <span> 桌面便签 </span>
      <span>傻鸟: 吴旗</span>
    </div>
    <div>
      <div class="flex">
        <button
          :class="['noDarg', btn == 'TODO' ? 'clicked' : '']"
          @click="clickHandle('TODO')"
        >
          Todo
        </button>

        <span style="color: #fff; display: inline-block">||</span>

        <button
          :class="['noDarg', btn == 'DONE' ? 'clicked' : '']"
          @click="clickHandle('DONE')"
        >
          Done
        </button>
      </div>
      <div></div>
    </div>
  </div>
  <router-view></router-view>
</template>
<style scoped>
.flex {
  width: 200px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tab {
  /* user-select: none; */
}
.drag {
  position: relative;
  -webkit-app-region: drag;
  background-color: rgb(243, 0, 0);
  color: azure;
  display: flex;
  justify-content: space-between;
}
span {
  margin: 5px 10px;
}
.clicked {
  width: 100px;
  font-weight: 900;
  font-size: 1.2em;
  /* color: aliceblue; */
  color: rgb(243, 243, 243);
}
</style>
