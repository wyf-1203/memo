<script setup>
  import { ref, reactive, watch, onMounted, onUpdated, nextTick } from 'vue'
  import { storeToRefs } from 'pinia'
  import useUserDataStore from '../store/userDataStore'
  import CursorSpecialEffects from '../utils/fireworks'

  const UserDataStore = useUserDataStore()
  const { userData } = storeToRefs(UserDataStore)
  const sortArrFlag = ref(false)
  const loadData = UserDataStore.loadData
  const writeFile = UserDataStore.writeFileTodo
  const updateData = UserDataStore.updateData
  // updateData
  const scrollbar = ref(null)

  let clickTimer = null
  let dragItem = reactive({})
  let dragenterItem = reactive({})
  let arr = ref([])
  let uidSeed = 1000
  // 今日新增的条目内容集合(用于高亮显示)
  const addedSet = reactive(new Set())
  const updatedSet = reactive(new Set())  // 稳定唯一 key 生成: 拖拽/重排全程不变, 避免 :key 变化触发动画

  const timestampToTime = (timestamp) => {
    // 时间戳为10位需*1000，时间戳为13位不需乘1000
    // var date = new Date(timestamp * 1000);
    var date = new Date(timestamp)
    var Y = date.getFullYear() + '-'
    var M =
      (date.getMonth() + 1 < 10
        ? '0' + (date.getMonth() + 1)
        : date.getMonth() + 1) + '-'
    var D = (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) + ' '
    var h = date.getHours() + ':'
    var m = date.getMinutes() + ':'
    var s = date.getSeconds()
    // return Y + M + D + h + m + s;
    return Y + M + D
  }

  const add = (content) => {
    if (content !== '' && content.length > 0) {
      // console.log(content.length);
      let arrs = JSON.parse(JSON.stringify(arr.value))
      const date = new Date().valueOf()
      let obj = {
        id: arrs.length + 1,
        date: date,
        content: content,
      }
      // console.log(111);
      arrs.push(obj)
      // console.log(arrs);

      writeFile(arrs)
    }
  }
  const contentClick = () => {
    const content = document.querySelector('#content')
    content.addEventListener('click', () => {
      let id = document.querySelector('#input')
      if (id) {
        console.log('已经存在input')
        return
      }
      const ul = document.querySelector('ul')
      const input = document.createElement('input')
      const tfbox = document.createElement('div')
      const boxDiv = document.createElement('div')
      const trueDiv = document.createElement('div')
      const falseDiv = document.createElement('div')

      tfbox.appendChild(trueDiv)
      tfbox.appendChild(falseDiv)
      boxDiv.appendChild(input)
      boxDiv.appendChild(tfbox)
      boxDiv.classList.add('box')
      tfbox.classList.add('float')
      trueDiv.classList.add('flag', 'iconfont', 'icon-duigou')
      falseDiv.classList.add('flag', 'iconfont', 'icon-guanbi')
      input.setAttribute('id', 'input')
      input.setAttribute('spellcheck', false)
      ul.appendChild(boxDiv)
      input.focus()

      let done = false
      const commit = () => {
        if (done) return
        done = true
        add(input.value)
        const box = document.querySelector('.box')
        if (box) ul.removeChild(box)
      }
      const cancel = () => {
        if (done) return
        done = true
        const box = document.querySelector('.box')
        if (box) ul.removeChild(box)
      }

      input.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      input.addEventListener('keydown', (e) => {
        if (e.key == 'Enter') {
          e.preventDefault()
          commit()
        }
      })
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (!done) commit()
        }, 200)
      })
      trueDiv.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        commit()
      })
      falseDiv.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      })
    })
  }

  const dblclick = (e, item) => {
    clearTimeout(clickTimer)
    // 正在编辑任何条目(编辑框存在/编辑对象非空)时, 双击不触发"移入 DONE"。
    // 只有退出编辑(提交/取消)后再双击, 才真正移入 DONE。
    if (editingLi.value || document.querySelector('#input')) return
    let lookfor = false
    let doneItem = null
    let arrs = JSON.parse(JSON.stringify(arr.value))
    let arrDone = JSON.parse(JSON.stringify(userData.value.DONE))
    let time = new Date().valueOf()
    let now = null
    const index1 = arrs.findIndex((i) => i.id == item.id)
    if (index1 === -1) return
    doneItem = arrs.splice(index1, 1)[0]
    arrs.forEach((i, index) => {
      i.id = index + 1
    })
    console.log(doneItem)
    // writeFileDONE

    now = timestampToTime(time)

    for (let done of arrDone) {
      if (done.date == now) {
        doneItem.id = done.contents.length + 1
        done.contents.push(doneItem)
        lookfor = true
      }
    }
    if (lookfor == false) {
      doneItem.id = 1
      let obj = {
        contents: [doneItem],
        date: now,
      }
      arrDone.unshift(obj)
    }

    // console.log(arrs, arrDone)
    updateData(arrs, arrDone)
    // console.log(arrDone)
    CursorSpecialEffects.handleMouseDown(e)
  }

  // 当前正在编辑的项(全局状态)
  // 响应式编辑锁：编辑中，列表完全禁用拖拽排序。
  const editingLi = ref(null)

  const clickLi = (e, item) => {
    e.stopPropagation()
    e.preventDefault()
    clearTimeout(clickTimer)

    // 如果正在编辑其他项, 先提交它; 本次点击不进入编辑(需再点一次目标项)
    const input = document.querySelector('#input')
    if (input) {
      const editingItem = editingLi.value
      if (editingItem && editingItem !== item) {
        input.blur() // 触发 blur -> commit
        editingLi.value = null
        return
      }
    }

    clickTimer = setTimeout(() => {
      let id = document.querySelector('#input')

      if (id) {
        // 已经在编辑同一项, 忽略
        console.log('已经存在input')
      } else {
        let li = e.target
        let parent = e.target.parentNode
        parent.removeAttribute('draggable')
        let input = document.createElement('input')
        let tfbox = document.createElement('div')
        let boxDiv = document.createElement('div')
        let trueDiv = document.createElement('div')
        let falseDiv = document.createElement('div')

        tfbox.appendChild(trueDiv)
        tfbox.appendChild(falseDiv)
        boxDiv.appendChild(input)
        boxDiv.appendChild(tfbox)
        boxDiv.classList.add('box')
        tfbox.classList.add('float')
        trueDiv.classList.add('flag', 'iconfont', 'icon-duigou')
        falseDiv.classList.add('flag', 'iconfont', 'icon-guanbi')
        input.setAttribute('id', 'input')
        input.setAttribute('spellcheck', false)
        // 编辑框始终按当前便签行的可用宽度展开，右侧固定预留确认/取消按钮。
        const rowWidth = e.currentTarget && e.currentTarget.clientWidth ? e.currentTarget.clientWidth : parent.clientWidth
        const controlsWidth = 56
        const inputWidth = Math.max(120, rowWidth - controlsWidth - 14)
        boxDiv.style.width = Math.max(176, rowWidth - 8) + 'px'
        input.style.width = inputWidth + 'px'
        e.target.parentNode.replaceChild(boxDiv, e.target)
        input.value = item.content
        input.focus()
        editingLi.value = item

        let done = false
        const restoreLi = () => {
          if (boxDiv.parentNode) {
            boxDiv.parentNode.replaceChild(li, boxDiv)
          }
          parent.setAttribute('draggable', true)
        }
        const commit = () => {
          if (done) return
          done = true
          editingLi.value = null
          let arrs = JSON.parse(JSON.stringify(arr.value)) //深拷贝
          let index = null
          let writeFlag = false
          arrs.forEach((i, index1) => {
            if (i.id == item.id) {
              i.content = input.value
              if (i.content == '') {
                writeFlag = true
                index = index1
              } else {
                if (arr.value[index1] && arr.value[index1].content !== i.content) {
                  writeFlag = true
                }
              }
            }
          })
          if (index != null) {
            arrs.splice(index, 1)
            arrs.forEach((i, index) => {
              i.id = index + 1
            })
          }
          if (writeFlag) {
            writeFile(arrs)
          }
          arr.value = [...arrs]
          setTimeout(() => {
            //放到宏任务里会先更新 arr 再恢复 li 否则会闪动
            restoreLi()
          })
        }
        const cancel = () => {
          if (done) return
          done = true
          editingLi.value = null
          restoreLi()
        }

        trueDiv.addEventListener('click', (e) => {
          e.stopPropagation()
          e.preventDefault()
          commit()
        })
        falseDiv.addEventListener('click', (e) => {
          e.stopPropagation()
          e.preventDefault()
          cancel()
        })
        input.addEventListener('click', (e) => {
          e.stopPropagation()
          e.preventDefault()
        })
        input.addEventListener('keydown', (e) => {
          if (e.key == 'Enter') {
            e.preventDefault()
            commit()
          }
        })
        input.addEventListener('blur', () => {
          setTimeout(() => {
            if (!done) commit()
          }, 200)
        })
      }
    }, 200)
  }

  const dragstart = (e, item) => {
    if (editingLi.value) {
      e.preventDefault()
      return
    }
    e.target.classList.add('drag1')
    dragItem.value = item
  }

  const liDragEnd = (e) => {
    e.target.classList.remove('drag1')
    if (editingLi.value) {
      dragItem.value = null
      dragenterItem.value = null
      return
    }
    const dragged = dragItem.value
    const target = dragenterItem.value
    dragItem.value = null
    dragenterItem.value = null
    // 松手时不重新赋值 arr.value —— 那会触发 flip-list 动画(松手瞬间再跳一次)。
    // 顺序已在拖动过程中实时排好, 这里只把 id 原地更新(不换数组引用), 并把纯JSON副本写盘。
    let arrs = JSON.parse(JSON.stringify(arr.value))
    arrs.forEach((i, idx) => { i.id = idx + 1 })
    // 原地更新视图里的 id, 不替换数组 → 松手瞬间无动画
    arr.value.forEach((i, idx) => { i.id = idx + 1 })
    writeFile(arrs)
  }

  const dragenter = (item) => {
    if (editingLi.value) return
    dragenterItem.value = item
  }

  const mousedown = (e) => {
    console.log(e)
  }

  // 排序: dragstart 记录的是"对象引用", 用引用在当前数组定位(不用 id, 因 id 会被重排导致错位),
  // 这样拖动滑过每个目标时实时移动(保持动画)且不会覆盖/重复。
  // 排序: 保持对象引用不变, 只移动位置。用"引用"在当前 arr.value 定位(而非 id, 因 id 会变/重复)。
  // 直接在同一数组上 splice 移动, 再整体赋值给 arr.value 触发 Vue 更新(flip-list 产生移动动画)。
  const sortArr = () => {
    if (editingLi.value || sortArrFlag.value) return
    const dragged = dragItem.value
    const target = dragenterItem.value
    if (!dragged || !target) return
    if (dragged.id === target.id) return
    const fromI = arr.value.findIndex(i => i === dragged)
    const toI = arr.value.findIndex(i => i === target)
    if (fromI === -1 || toI === -1 || fromI === toI) return
    sortArrFlag.value = true
    setTimeout(() => { sortArrFlag.value = false }, 40)
    // 移动: 先删被拖对象, 再插到目标位置(同一数组, 引用不变)
    const moved = arr.value.splice(fromI, 1)[0]
    arr.value.splice(toI, 0, moved)
    arr.value = [...arr.value]
  }
  // 填充今日新增集合(用于内容高亮)
  const fillSyncState = (s) => {
    addedSet.clear(); updatedSet.clear()
    ;(s && s.addedContents || []).forEach(c => { if (c) addedSet.add(c) })
    ;(s && s.updatedContents || []).forEach(c => { if (c) updatedSet.add(c) })
  }
  onMounted(() => {
    contentClick()
    loadData()
    if (userData.value.TODO) {
      arr.value = [...userData.value.TODO].map(i => {
        if (!i._uid) { i._uid = ++uidSeed }
        return i
      })
    }
    // 订阅同步状态: 每次同步完成把"今日新增内容"填进 addedSet, 便签里高亮显示
    if (window.myApi && window.myApi.onSyncStatus) {
      window.myApi.onSyncStatus((s) => { if (s) fillSyncState(s) })
    }
    // 启动时主动获取一次最新同步状态
    if (window.myApi && window.myApi.getLastSync) {
      window.myApi.getLastSync().then((s) => { if (s) fillSyncState(s) }).catch(() => {})
    }
  })
  // 同步刷新防抖: 内容无实质变化则不重建 arr, 避免 transition-group 触发 flip-list 动画(闪一下)。
  // 重建时按 id 匹配既有的 _uid(保持 :key 稳定), 避免 key 变化导致整列重新做滑动动画。
  const syncArrFromStore = () => {
    const newTodos = (userData.value && userData.value.TODO) || []
    const old = arr.value || []
    // 内容无变化(条数/每条 id/content/status 都相同) → 不重建, 不触发动画
    const changed = old.length !== newTodos.length || newTodos.some((n, idx) => {
      const o = old[idx]
      if (!o) return true
      return o.id !== n.id || o.content !== n.content || (o.status || '') !== (n.status || '')
    })
    if (!changed) return
    // 按 id 逆推旧的 _uid, 保持列表渲染 key 稳定
    const uidById = new Map()
    old.forEach(i => { if (i && i.id !== undefined) uidById.set(i.id, i._uid) })
    arr.value = newTodos.map(i => {
      const u = uidById.get(i.id)
      i._uid = u || ++uidSeed
      return i
    })
    setTimeout(() => {
      if (scrollbar.value) scrollbar.value.update()
    }, 50)
  }
  watch(userData, () => { syncArrFromStore() }, { deep: true })
  watch(
    dragenterItem,
    () => {
      sortArr()
    },
    { deep: true }
  )
  onUpdated(() => { })

  onMounted(() => { })
</script>
<template>

  <el-scrollbar ref="scrollbar" class="todo-scrollbar">
    <div id="content">
      <transition-group name="flip-list" tag="ul" class="items">
        <li :key="item._uid" v-for="item in arr" :draggable="!editingLi" :class="{'hl-new': addedSet.has(item.content), 'hl-update': updatedSet.has(item.content)}"
          @dragstart="dragstart($event, item)"
          @dragenter="dragenter(item)" @dragend="liDragEnd($event, item)" @click="clickLi($event, item)"
          @dblclick="dblclick($event, item)" style="width: 100%">
          <div class="todo-line">
            <span class="todo-text">{{ item.id + ' , ' + item.content }}</span>
            <span v-if="item.status" :class="['status-tag', item.status === 'open' ? 'st-open' : 'st-pending']">{{ item.status === '待现场验证' ? '待验证' : item.status }}</span>
          </div>
        </li>
      </transition-group>
    </div>
  </el-scrollbar>
  <canvas width="100%" height="100%"
    style="position:fixed; left:0px; top:0px; z-index: 99999; pointer-events: none;"></canvas>

</template>
<style scoped>
  .flip-list-move {
    transition: transform 0.15s;
  }

  ::v-deep(#input) {
    height: 38px;
    min-width: 0;
    box-sizing: border-box;
    border: none;
    font-size: 16px;
    margin: 0;
    padding: 0;
    outline: none;
    color: rgb(240, 209, 56);
    background: rgba(240, 209, 56, 0);
  }

  ::v-deep(.box) {
    position: relative;
    display: flex;
    align-items: center;
    max-width: calc(100% - 8px);
    height: 38px;
  }

  ::v-deep(.float) {
    flex: 0 0 56px;
    height: 100%;
    display: flex;
    justify-content: space-around;
    align-items: center;
  }

  ::v-deep(.flag) {
    font-size: 22px;
    color: aliceblue;
  }

  ::v-deep(.flag:hover) {
    color: rgb(183, 245, 101);
  }

  #content {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .drag1 {
    color: rgba(158, 157, 157) !important;
  }

  .todo-scrollbar {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  ::v-deep(.todo-scrollbar .el-scrollbar__wrap) {
    overflow-x: hidden;
  }
  ::v-deep(.todo-scrollbar .el-scrollbar__view) {
    min-height: 100%;
    width: 100%;
  }
  /* 正文缩小时显示 ...；标签占自身宽度并紧跟省略后的正文。 */
  .todo-line {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
  .todo-text {
    display: block;
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 42px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .items {
    padding-bottom: 12px;
  }
  .hl-new {
    background: rgba(255, 165, 0, 0.28) !important;
    color: #ffd54a !important;
    border-left: 3px solid #ff9500;
    text-shadow: 0 0 6px rgba(255, 165, 0, 0.6);
  }
  .hl-update {
    background: rgba(120, 200, 255, 0.24) !important;
    color: #8ee0ff !important;
    border-left: 3px solid #4db8ff;
    text-shadow: 0 0 6px rgba(77, 184, 255, 0.6);
  }
  /* 保持旧版截图的扁平文字标签：无胶囊背景、无边框。 */
  .status-tag {
    flex: 0 0 auto;
    display: inline-block;
    margin-left: 2px;
    padding: 0;
    font-size: 11px;
    line-height: 38px;
    font-weight: 700;
    white-space: nowrap;
    background: transparent;
    border: 0;
  }
  .st-pending {
    color: #4da3ff;
    text-shadow: 0 0 5px rgba(77, 163, 255, 0.5);
  }
  .st-open {
    color: #ff6b6b;
    text-shadow: 0 0 5px rgba(255, 107, 107, 0.6);
  }
</style>