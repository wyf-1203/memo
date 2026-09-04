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
  import { Setting } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import useUserDataStore from '../store/userDataStore'
  import { storeToRefs } from 'pinia'
  const btn = ref('TODO')
  const radio1 = ref('TODO')
  const UserDataStore = useUserDataStore()
  const { userData } = storeToRefs(UserDataStore)
  const loadData = UserDataStore.loadData
  loadData()
  // 监听主进程同步完成(腾讯文档待办写入)后自动刷新
  UserDataStore.listenSync()
  // 定时拉取状态: 上次同步时间 + 新增几条
  const syncStatus = ref(null) // { time, added }
  window.myApi.onSyncStatus((info) => {
    syncStatus.value = info
  })
  // 主动获取上次同步状态(避免首次 sync-status 事件在 renderer 注册前错过)
  if (window.myApi.getLastSync) {
    window.myApi.getLastSync().then((info) => {
      if (info) syncStatus.value = info
    })
  }
  const fmtTime = (ts) => {
    if (!ts) return '--:--'
    const d = new Date(ts)
    const p = (n) => (n < 10 ? '0' + n : '' + n)
    return p(d.getHours()) + ':' + p(d.getMinutes())
  }
  let overheadFlag = ref(false)
  const minimize = () => {
    window.myApi.minimize()
  }
  const openConfig = () => {
    window.myApi.openConfig()
  }
  // ===== 设置弹窗: 配置 腾讯文档链接 / 中转站API / key / 模型 =====
  const settingDialog = ref(false)
  const cfg = reactive({
    docUrl: '',
    apiBaseUrl: '',
    apiKey: '',
    apiModel: '',
  })
  const modelOptions = ref([])
  const loadingModels = ref(false)
  const openSetting = async () => {
    try {
      const c = await window.myApi.getConfig()
      if (c) {
        cfg.docUrl = c.docUrl || ''
        cfg.apiBaseUrl = c.apiBaseUrl || ''
        cfg.apiKey = c.apiKey || ''
        cfg.apiModel = c.apiModel || ''
      }
    } catch (e) { cfg.docUrl = ''; cfg.apiBaseUrl = ''; cfg.apiKey = ''; cfg.apiModel = '' }
    settingDialog.value = true
  }
  const closeSetting = () => { settingDialog.value = false }
  const doFetchModels = async () => {
    if (!cfg.apiBaseUrl) { ElMessage.error('请先填写中转站地址(apiBaseUrl)'); return }
    loadingModels.value = true
    try {
      const r = await window.myApi.fetchModels(cfg.apiBaseUrl, cfg.apiKey)
      if (r && r.ok) {
        modelOptions.value = r.models || []
        if (modelOptions.value.length) {
          if (!modelOptions.value.includes(cfg.apiModel)) cfg.apiModel = ''
          ElMessage.success('已获取模型 ' + modelOptions.value.length + ' 个')
        } else {
          ElMessage.warning('中转站未返回可用模型')
        }
      } else {
        ElMessage.error((r && r.err) || '获取模型失败, 请检查地址和key')
      }
    } catch (e) { ElMessage.error('获取模型失败: ' + e.message) }
    finally { loadingModels.value = false }
  }
  const openDocNow = async () => {
    if (!cfg.docUrl) { ElMessage.error('请先填写腾讯文档链接(docUrl)'); return }
    const r = await window.myApi.openDoc(cfg.docUrl)
    if (!(r && r.ok)) ElMessage.error((r && r.err) || '打开表格失败')
    else ElMessage.success('已打开调试Chrome, 请扫码登录')
  }
  const saveSetting = async () => {
    try {
      const r = await window.myApi.saveConfig({
        docUrl: cfg.docUrl, apiBaseUrl: cfg.apiBaseUrl, apiKey: cfg.apiKey, apiModel: cfg.apiModel,
      })
      if (r && r.ok) {
        ElMessage.success(r.openedDoc ? '配置已保存，正在立即同步；表格加载后会再同步一次' : '配置已保存，正在立即同步')
        settingDialog.value = false
      }
      else ElMessage.error((r && r.err) || '保存失败')
    } catch (e) { ElMessage.error('保存失败: ' + e.message) }
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

  // 锁定时: 鼠标移入锁图标 -> 取消穿透(可点解锁); 移出 -> 恢复穿透
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
  <div class="home-root">
    <div class="tab">
      <div class="drag">
        <span> 桌面便签</span>
        <span style="color: rgba(136, 139, 143, 0.342);">author: 阿飞</span>
        <span> {{nowTime}}</span>
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
          <button :class="['btn','iconfont',overheadFlag?'icon-suoding':'icon-jiesuo']"
            @mouseenter="mouseenter" @mouseleave="mouseleave" @click="overhead"></button>
          <button class="btn setbtn" title="设置" @click="openSetting"><Setting /></button>
        </div>
      </div>
    </div>
    <main class="page-view"><router-view></router-view></main>
    <div class="sync-status" v-if="syncStatus">
      上次同步 {{ fmtTime(syncStatus.time) }} ·
      <template v-if="syncStatus.added > 0 || syncStatus.updated > 0">
        <span v-if="syncStatus.added > 0" class="st-add">今日新增 {{ syncStatus.added }} 条</span>
        <span v-if="syncStatus.added > 0 && syncStatus.updated > 0"> · </span>
        <span v-if="syncStatus.updated > 0" class="st-upd">今日更新 {{ syncStatus.updated }} 条</span>
      </template>
      <span v-else>今日无变化</span>
    </div>

    <el-dialog v-model="settingDialog" title="设置" width="400px" :close-on-click-modal="false"
      append-to-body class="cfg-dialog">
      <el-form label-position="top">
        <el-form-item label="腾讯文档链接（docUrl，方便自动打开并扫码）">
          <el-input v-model="cfg.docUrl" placeholder="如 https://doc.weixin.qq.com/sheet/xxxx" clearable />
        </el-form-item>
        <el-form-item label="中转站地址（apiBaseUrl）">
          <el-input v-model="cfg.apiBaseUrl" placeholder="如 http://10.213.196.114:3000/v1" clearable />
        </el-form-item>
        <el-form-item label="中转站API Key（apiKey）">
          <el-input v-model="cfg.apiKey" type="password" show-password placeholder="sk-..." clearable />
        </el-form-item>
        <el-form-item label="模型（apiModel）">
          <div style="display:flex; gap:8px; width:100%">
            <el-select v-model="cfg.apiModel" placeholder="留空=自动选用" clearable style="flex:1" :loading="loadingModels">
              <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-button type="primary" :loading="loadingModels" @click="doFetchModels">获取模型</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeSetting">取消</el-button>
        <el-button @click="openDocNow">打开表格(扫码)</el-button>
        <el-button type="primary" @click="saveSetting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<style scoped>
.setbtn {
  font-size: 20px;
  color: rgb(136, 139, 143);
  cursor: pointer;
}
.setbtn:hover {
  color: #409eff;
}
.setbtn svg {
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
}

  .home-root {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .page-view {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .page-view > * {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }
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
  button:focus,
  button:active {
    outline: none;
    border: none;
    box-shadow: none;
  }

  .btn:hover {
    color: rgb(255, 255, 255);
    cursor: pointer;
  }

  .overhead:hover {
    /* color: rgb(136, 139, 143); */
    cursor: pointer;
  }
  .sync-status {
    position: fixed;
    left: 8px;
    top: 68px;
    z-index: 9999;
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(25, 25, 25, 0.75);
    padding: 3px 10px;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(255, 213, 74, 0.3);
    pointer-events: none;
    user-select: none;
  }
  .st-add {
    color: #ffab40;
    text-shadow: 0 0 6px rgba(255, 165, 0, 0.6);
  }
  .st-upd {
    color: #8ee0ff;
    text-shadow: 0 0 6px rgba(77, 184, 255, 0.6);
  }


  /* 设置弹窗: 深色半透明, 与便签风格一致 */
  .cfg-dialog {
    background: rgba(30, 34, 36, 0.96) !important;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  .cfg-dialog .el-dialog__title { color: #fff; font-weight: 700; }
  .cfg-dialog .el-dialog__headerbtn .el-dialog__close { color: #cfd3d6; }
  .cfg-dialog .el-form-item__label { color: #c9ced1; }
  .cfg-dialog .el-input__wrapper, .cfg-dialog .el-select__wrapper {
    background: rgba(255, 255, 255, 0.06) !important;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset !important;
  }
  .cfg-dialog .el-input__inner, .cfg-dialog .el-select__placeholder { color: #e8eaec !important; }
</style>