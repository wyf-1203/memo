<script setup>
  import {
    ref,
    reactive,
    watch,
    computed,
    onMounted,
    onBeforeMount,
    onUpdated,
  } from 'vue'
  import router from '../router/index'
  import useUserDataStore from '../store/userDataStore'
  import { storeToRefs } from 'pinia'
  const btn = ref('TODO')
  const radio1 = ref('TODO')
  const UserDataStore = useUserDataStore()
  const { userData } = storeToRefs(UserDataStore)
  const loadData = UserDataStore.loadData
  loadData()
  let overheadFlag = ref(false)
  const minimize = () => {
    window.myApi.minimize()
  }
  let nowTime = ref('0:00:00')

  const computedTime = () => {
    setInterval(() => {
      let time = new Date()
      nowTime.value = timestampToTime(time)
    }, 500)
  }
  computedTime()

  const timestampToTime = (timestamp) => {
    // 时间戳为10位需*1000，时间戳为13位不需乘1000
    // var date = new Date(timestamp * 1000);
    // var date = new Date(timestamp)
    var date = timestamp
    // var Y = date.getFullYear() + '-'
    // var M =
    //   (date.getMonth() + 1 < 10
    //     ? '0' + (date.getMonth() + 1)
    //     : date.getMonth() + 1) + '-'
    // var D = (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) + ' '
    var h = date.getHours() + ':'
    var m =
      date.getMinutes() < 10
        ? '0' + date.getMinutes() + ':'
        : date.getMinutes() + ':'
    var s = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds()
    // return Y + M + D + h + m + s;
    return h + m + s
  }

  const overhead = () => {
    overheadFlag.value = !overheadFlag.value
    if (overheadFlag.value) {
      document.querySelector('body').style.backgroundColor =
        'rgba(12, 12, 12, 0.405)'
    } else {
      document.querySelector('body').style.backgroundColor =
        'rgba(12, 12, 12, 0.705)'
    }
    window.myApi.overhead(overheadFlag.value)
  }
  const dragend = () => {
    console.log('dragend');
  }
  const mouseenter = () => {
    if (overheadFlag.value) {
      window.myApi.Ignore(false)
    }
  }
  const mouseleave = () => {
    if (overheadFlag.value) {
      window.myApi.Ignore(true)
    } else {
      window.myApi.Ignore(false)
    }
  }

  const clickHandle = (text) => {
    btn.value = text
    radio1.value = text
  }
  watch(radio1, (newValue, oldValue) => {
    // console.log(newValue);
    if (newValue == 'TODO') {
      router.replace('/home/todo')
    } else if (newValue == 'DONE') {
      router.replace('/home/done')
    }
  })
  onBeforeMount(() => {
    console.log(window.screenX)
    console.log(window.screenY)
  })

  window.addEventListener('resize', () => {
    console.log(window.screenX);
  });
// onUpdated(() => {
//   computedTime() 
// })
</script>



<template>
  <div>

    <div class="tab">
      <div class="drag">
        <!-- <div style="-webkit-app-region: no-drag; z-index: 999; position: relative;width: 100%;height: 100%"> -->
        <span> 桌面便签</span>
        <span style="color: rgba(136, 139, 143, 0.342);">author: 阿飞</span>
        <span> {{nowTime}}</span>
        <!-- </div> -->

      </div>
      <div class="flex">
        <div class="flex">
          <button :class="['noDarg',overheadFlag?'':'btn', btn == 'TODO' ? 'clicked' : '']"
            @click="clickHandle('TODO')">Todo</button>

          <span style="color: #fff; display: inline-block">||</span>

          <button :class="['noDarg',overheadFlag?'':'btn', btn == 'DONE' ? 'clicked' : '']"
            @click="clickHandle('DONE')">Done</button>
        </div>

        <div class="flex" style="margin-top:15px;width:100px;color: rgb(136, 139, 143); ">
          <button style="fontSize:22px"
            :class="['iconfont',overheadFlag?'icon-yincangbukejian':'btn icon-yincangbukejian']"
            @click="minimize"></button>
          <button :class="['btn','iconfont',overheadFlag?'icon-suoding':'icon-jiesuo']" @mouseenter="mouseenter"
            @mouseleave="mouseleave" @click="overhead"></button>
        </div>
      </div>
    </div>
  </div>
  <router-view style="overflow: hidden;"></router-view>
</template>
<style scoped>
  .flex {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tab {
    position: relative;
    top: 0;
    right: 0;
    /* user-select: none; */
  }

  .drag {
    width: 100%;
    margin: 0;
    padding: 0;
    position: relative;
    -webkit-app-region: drag;
    background-color: rgba(132, 143, 142, 0.322);
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

  .btn {
    /* font-size: 20px; */
  }

  button {
    padding: 0;
  }

  .btn:hover {
    color: rgb(255, 255, 255);
    cursor: pointer;
  }

  .overhead:hover {
    /* color: rgb(136, 139, 143); */
    cursor: pointer;
  }
</style>