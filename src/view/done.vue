<script setup>
  import { ref, reactive, watch } from 'vue';

  import { storeToRefs } from 'pinia';
  import useUserDataStore from '../store/userDataStore';
  const UserDataStore = useUserDataStore();
  const { userData } = storeToRefs(UserDataStore);

  const writeFileDONE = UserDataStore.writeFileDone;
  const updateData = UserDataStore.updateData;

  const scrollbar = ref(null);

  const enter = (e, item) => {
    let handelItem = null;
    let id = document.querySelector('#tfbox');
    if (id) {
      console.log('已经有tfbox了');
      return;
    }
    let tfbox = document.createElement('div');
    let resetDiv = document.createElement('div');
    let deleteDiv = document.createElement('div');
    tfbox.setAttribute('id', 'tfbox');
    tfbox.classList.add('float');
    resetDiv.classList.add('flag', 'iconfont', 'icon-chexiao');
    deleteDiv.classList.add('flag', 'iconfont', 'icon-shanchu');
    tfbox.appendChild(resetDiv);
    tfbox.appendChild(deleteDiv);
    e.target.appendChild(tfbox);

    resetDiv.addEventListener('click', (e) => {
      console.log(1111111);
      let arrTodo = JSON.parse(JSON.stringify(userData.value.TODO));
      let arrDone = JSON.parse(JSON.stringify(userData.value.DONE));
      let index = 0;
      for (let i of arrDone) {
        for (let idone of i.contents) {
          if (idone.date == item.date) {
            handelItem = i.contents.splice(item.id - 1, 1)[0];
            if (i.contents.length == 0) {
              arrDone.splice(index, 1);
            } else {
              i.contents.forEach((element, eindex) => {
                element.id = eindex + 1;
              });
            }
            handelItem.id = arrTodo.length + 1;
            arrTodo.push(handelItem);

            updateData(arrTodo, arrDone);
            return;
          }
        }
        index++;
      }
    });
    deleteDiv.addEventListener('click', (e) => {
      let arrDone = JSON.parse(JSON.stringify(userData.value.DONE));
      for (let i of arrDone) {
        let index = 0;
        for (let idone of i.contents) {
          if (idone.date == item.date) {
            handelItem = i.contents.splice(item.id - 1, 1)[0];
            if (i.contents.length == 0) {
              arrDone.splice(index, 1);
            } else {
              i.contents.forEach((element, eindex) => {
                element.id = eindex + 1;
              });
            }
          }
        }
        index++;
      }
      console.log(item);
      writeFileDONE(arrDone);
    });
  };
  const leave = (e, item) => {
    let id = document.querySelector('#tfbox');
    e.target.removeChild(id);
  };
  watch(userData, () => {
    console.log(userData.value);
    setTimeout(() => {
      scrollbar.value.update();
    }, 50);
  });
// console.log(userData.value);
</script>
<template>
  <el-scrollbar ref="scrollbar" height="100%">
    <div id="contentdone">
      <ul class="contents" :key="item.date" v-for="item in userData.DONE">
        <span style="color: #fff"> -------- {{ item.date }} --------</span>
        <li @mouseenter="enter($event, items)" @mouseleave="leave($event, items)" :key="items.date"
          v-for="items in item.contents" style="position: relative;">
          <div style="width: 80%;overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">

            {{ items.id + ' , ' + items.content }}
          </div>

        </li>
      </ul>
    </div>
  </el-scrollbar>
</template>
<style scoped>
  ::v-deep(.float) {
    height: 100%;
    width: 50px;
    position: absolute;
    right: 20px;
    top: 0;
    display: flex;
    justify-content: space-around;
    align-items: center;
  }

  ::v-deep(.flag) {
    font-size: 24px;
    color: aliceblue;
  }

  ::v-deep(.flag:hover) {
    color: rgb(183, 245, 101);
  }

  /* #tfbox {
  position: absolute;
  display: flex;
  justify-content: space-around;

  right: 0;
  top: 0;
} */
  #contentdone {
    position: relative;
    width: 100%;
    height: 100%;
    padding-bottom: 50px;
  }

  /* .el-scrollbar {
  height: calc(100% - 30px);
}
::v-deep(.el-scrollbar__view) {
  height: calc(100% - 30px) !important;
} */

  .el-scrollbar {
    height: calc(100% - 70px);
  }
</style>