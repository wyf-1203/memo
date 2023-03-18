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
  content.addEventListener('click', (e) => {
    let id = document.querySelector('#input')
    if (id) {
      // console.log(id);
      console.log('已经存在input')
      return
    } else {
      const ul = document.querySelector('ul')
      // console.log(ul);
      let input = document.createElement('input')
      let tfbox = document.createElement('div')
      let boxDiv = document.createElement('div')
      let trueDiv = document.createElement('div')
      let falseDiv = document.createElement('div')
      let rFlag = true

      // iconfont icon-xxx
      // falseDiv.innerHTML = 'X';
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
      input.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      input.addEventListener('keydown', (e) => {
        console.log(e)
        if (e.key == 'Enter') {
          console.log('Enter')
          input.blur()
        }
      })
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (rFlag) {
            console.log(e)
            const ul = document.querySelector('ul')
            const box = document.querySelector('.box')
            add(input.value)
            // setTimeout(() => {
            ul.removeChild(box)
            // }, 100);
            rFlag = true
          }
        }, 200)
      })
      trueDiv.addEventListener('click', (e) => {
        // console.log(e);
        e.preventDefault()
        e.stopPropagation()
        // add(input.value);
        const ul = document.querySelector('ul')
        const box = document.querySelector('.box')
        ul.removeChild(box)
      })
      falseDiv.addEventListener('click', (e) => {
        console.log('false', e)
        // e.preventDefault();
        e.stopPropagation()
        console.log(input.value)
        if (input.value == '') {
          rFlag = true
          input.blur()
        } else {
          rFlag = false
          input.focus()
          input.value = ''
        }
      })
    }
  })
}

const dblclick = (e, item) => {
  clearTimeout(clickTimer)
  let lookfor = false
  let index1 = null
  let doneItem = null
  let arrs = JSON.parse(JSON.stringify(arr.value))
  let arrDone = JSON.parse(JSON.stringify(userData.value.DONE))
  let time = new Date().valueOf()
  let now = null
  // console.log(userData);
  // console.log(e.target);
  arrs.forEach((i) => {
    if (i.id == item.id) {
      index1 = i.id - 1
    }
  })
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

const clickLi = (e, item) => {
  e.stopPropagation()
  e.preventDefault()
  clearTimeout(clickTimer)

  clickTimer = setTimeout(() => {
    let rFlag = true
    let id = document.querySelector('#input')

    if (id) {
      // console.log(id);
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

      // iconfont icon-xxx
      // falseDiv.innerHTML = 'X';
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
      e.target.parentNode.replaceChild(boxDiv, e.target)
      // console.log(e.target.parentElement);
      input.value = item.content
      input.focus()
      falseDiv.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        console.log(e)
        if (input.value == '') {
          input.blur()
          // rFlag = false;
        } else {
          rFlag = false
          input.focus()
          input.value = ''
        }
      })
      input.addEventListener('keydown', (e) => {
        console.log(e)
        if (e.key == 'Enter') {
          console.log('Enter')
          input.blur()
        }
      })
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (rFlag) {
            let arrs = JSON.parse(JSON.stringify(arr.value)) //深拷贝
            let index = null
            let writeFlag = false
            // console.log(arrs);
            arrs.forEach((i, index1) => {
              if (i.id == item.id) {
                i.content = input.value
                if (i.content == '') {
                  writeFlag = true
                  index = index1
                } else {
                  // console.log(arr.value[index1]);
                  if (arr.value[index1].content !== i.content) {
                    // console.log('变了!');
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
              //放到宏任务里会先更新 arr 再取消li 否则会闪动
              boxDiv.parentNode.replaceChild(li, boxDiv)
            })
            // window.myApi.writeFile(1);
          } else {
            rFlag = true
            return
          }
          parent.setAttribute('draggable', true)
        }, 200)
      })
    }
  }, 200)
}

const dragstart = (e, item) => {
  e.target.classList.add('drag1')
  dragItem.value = item
}

const liDragEnd = (e) => {
  // console.log('------', e.target);
  e.target.classList.remove('drag1')
  let arrs = JSON.parse(JSON.stringify(arr.value))
  arrs.forEach((i, index) => {
    i.id = index + 1
  })
  writeFile(arrs)

  arr.value = [...arrs]
}

const dragenter = (item) => {
  // console.log(111);
  // console.log(item);
  dragenterItem.value = item
}

const mousedown = (e) => {
  console.log(e)
}

const sortArr = () => {
  //拖拽后排序
  // console.log('被点住拖拽的是' + dragItem.value.id);
  // console.log('另一个是' + dragenterItem.value.id);
  let index0 = ref(null)
  let index1 = ref(null)
  if (dragenterItem.value.id != dragItem.value.id && !sortArrFlag.value) {
    sortArrFlag.value = true //防抖
    setTimeout(() => {
      sortArrFlag.value = false
    }, 50) //防抖
    arr.value.forEach((item, index) => {
      if (
        item.id == dragenterItem.value.id &&
        dragenterItem.value.id != dragItem.value.id
      ) {
        index0.value = index
      } else if (item.id == dragItem.value.id) {
        index1.value = index
      }
    })
    // console.log(index0, index1);

    let arrs = JSON.parse(JSON.stringify(arr.value))
    // console.log(arrs.);
    // console.log('换位置了 --------');
    arrs.splice(index1.value, 1)
    arrs.splice(index0.value, 0, dragItem.value)

    arr.value = [...arrs]
  }
}
onMounted(() => {
  contentClick()
  loadData()
  if (userData.value.TODO) {
    arr.value = [...userData.value.TODO]
  }
})
watch(
  userData,
  () => {
    arr.value = [...userData.value.TODO]
    // console.log('123');

    setTimeout(() => {
      scrollbar.value.update()
    }, 50)
  },
  { deep: true }
)
watch(
  dragenterItem,
  () => {
    sortArr()

    // console.log(arrs);
  },
  { deep: true }
)
onUpdated(() => {})
watch()
onMounted(() => {})
</script>
<template>
  <el-scrollbar ref="scrollbar" height="100%">
    <div id="content">
      <transition-group name="flip-list" tag="ul" class="items">
        <li
          :key="item.date"
          v-for="item in arr"
          draggable="true"
          @dragstart="dragstart($event, item)"
          @dragenter="dragenter(item)"
          @dragend="liDragEnd($event, item)"
          @click="clickLi($event, item)"
          @dblclick="dblclick($event, item)"
          style="width: 100%"
        >
          <div
            style="
              width: 100%;
              height: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
          >{{ item.id + ' , ' + item.content }}</div>
        </li>
      </transition-group>
    </div>
  </el-scrollbar>
  <canvas width="100%" height="100%" style="position:fixed; left:0px; top:0px; z-index: 99999; pointer-events: none;"></canvas>
</template>
<style scoped>
.flip-list-move {
  transition: transform 0.15s;
}

::v-deep(#input) {
  height: 38px;
  width: calc(100% - 50px);
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
}
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
.el-scrollbar {
  height: calc(100% - 30px);
}
::v-deep(.el-scrollbar__view) {
  height: calc(100% - 30px) !important;
}
.items {
  padding-bottom: 70px;
}
</style>
