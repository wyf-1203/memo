---
name: tencent-todo-sync
description: 配合桌面便签，从腾讯文档(微信文档在线表格)拉取 @目标人 的条目，提炼成"清晰可读的需求待办"写入便签并自动刷新。当用户要求同步腾讯文档内容到桌面便签、拉取表格待办、让便签显示腾讯表格里的任务、或补充/更新 @目标人 负责的需求时使用。
---

# 腾讯文档 → 桌面便签 Todo 同步

把腾讯文档（微信文档在线表格）里 **@目标人** 的条目，提炼成**清楚说明"是什么需求"**的待办，写入桌面便签应用（memo）的数据文件并自动刷新显示。

> 核心要求：每条待办的主题（`[...]` 里的内容）必须**写清具体需求是什么**，绝不用 `问题修复(280)`、`网格图元文本颜色` 这类看不懂的编号/简称。

## 红线（务必遵守）

- **只读腾讯文档**：绝不修改表格内容、绝不写回文档。读取用页面已加载的解码器 `SpreadsheetApp.workbook.activeSheet.cellDataGrid.getCellData(r,c)`，只调用 `getCellData`。
- **只写便签数据文件**：`userData.json`，不碰便签其他代码逻辑（除非本次会话明确要求）。

## 数据源

- **调试 Chrome**：端口 `9222`，已登录腾讯文档。
- **在线表格**：`TB项目DCIM系统优化和整改收集-20260825`
  - URL: `https://doc.weixin.qq.com/sheet/e3_AfQAbgbCAKgCNjhEyfqy5Rkmw27G3?...`
  - CDP 页面 WS: `ws://127.0.0.1:9222/devtools/page/AC06D8BFCE2BF6435B46F1B23685B609`
  - **不要硬编码扫描行数！** 用页面解码器 `dg.getLastRow()` **从下往上扫**找到最后一个非空数据行作为表尾，再从上扫。曾因硬编码 `MAX_ROWS=300` 漏掉 row337「总览看板测点告警标红」（表格真实到 362 行）；改 400 仍不够稳，必须动态探测。
- **@目标人 身份（mentionpersonId）**：`被@人ID(由config.json的mentionPersonId提供)`（这才是"@ 了目标人"的唯一判据；富文本段的 `seg.mention.mentionpersonId` 精确等于它才算）。

## @目标人 的判定（重要）

- 条目是否属于目标人，看 **c9 当前责任人列** 或 **c8 进展情况列** 是否真正 @ 了目标人：
  - `hasMention(cell)` = 单元格富文本 `value.r[].mention.mentionpersonId === 被@人ID(由config.json的mentionPersonId提供)`
  - **c9 或 c8 任一 @ 目标人 就算该条是目标人的**（同一项，别漏）。
- **不要**用"单元格文本里出现'目标人'三个字"来判断——那是纯文本（责任人直接填名字，如 `目标人、沈亚舟`），不是 @；会被误判扩进去（如行 66/97/107 其实是已完成/无关的行）。**只认 mentionpersonId 精确匹配。**

## 表格列结构（c1..c10）

| 列 | 含义 | 读取字段 |
|----|------|---------|
| c1 | 项目名称 | cell.value / 富文本拼接 |
| c2 | 整改要求(需求内容) | cell.value / 富文本拼接 |
| c3 | 优先级(高/中/低) | cell.value |
| c4 | 问题状态(open/close) | cell.value |
| c5 | 日期(serial) | cell.value |
| c6 | 需求类型 | cell.value |
| c7 | 阶段 | cell.value |
| c8 | 进展情况(富文本) | cell.formattedValue.value 或富文本拼接 |
| c9 | 当前责任人(@人) | cell.value / value.r[].t 拼接 + value.r[].mention |
| c10 | 空 | - |

## 读取单元格（页面解码器，推荐）

```js
var dg = SpreadsheetApp.workbook.activeSheet.cellDataGrid;
var cell = dg.getCellData(r, c);
// 读任意单元格文本(兼容 string / 富文本 r[] / formattedValue):
function cellText(cell){
  if(!cell) return '';
  if(cell.value && typeof cell.value==='string') return cell.value;
  if(cell.value && cell.value.r) return cell.value.r.map(function(s){return s.t||'';}).join('');
  if(cell.formattedValue && cell.formattedValue.value) return cell.formattedValue.value;
  return '';
}
// 判断单元格是否 @ 了目标人(only mentionpersonId 精确匹配):
function hasWFYMention(cell){
  if(!cell) return false;
  if(cell.value && cell.value.r){
    if(cell.value.r.some(function(seg){ return seg.mention && seg.mention.mentionpersonId==='被@人ID(由config.json的mentionPersonId提供)'; })) return true;
  }
  return JSON.stringify(cell).indexOf('被@人ID(由config.json的mentionPersonId提供)')>=0;
}
```

## 运行脚本

```bash
node scripts/sync.js            # 正式写入便签
node scripts/sync.js --dry-run  # 预览，不写入
```

脚本执行逻辑：
1. 连 CDP 9222，定位表格页（`t.type==='page' && t.url.includes('sheet')`）
2. **动态探测表尾**：`dg.getLastRow()` 从下往上扫找到最后一个非空数据行 `endRow`，再扫 **1..endRow**。对每行同时查 c9(c负责人) 与 c8(进展)，**任一 `hasWFYMention` 为 true 就记录**该行
3. 记录该行的 project/req/status/type/phase/progress/owner，以及 c9At/c8At
4. 过滤已完成 —— **以 status 列为第一判据**（`close`=已完成；`open`/空=未完成；`待现场验证`/含"待/验证/开发中"=未完成；只有状态明确含"完成/解决/关闭/上线"才算完成）。**绝不能只靠进展关键词**——否则 `计划9/4完成`(未来时,未完成) 会被误判成已完成而漏掉。
5. **全量同步**：便签里 `[需求] 进展` 格式的同步待办 = 本次提取的**未完成**需求；**已完成的直接从 TODO 移除**（只保留未完成的 + 用户自己加的非 `[..]` 条目 + DONE）。

## 待办条目格式（关键：需求要清晰）

```json
{"id":N,"date":<ms>,"content":"[完整清晰的需求描述] 最新进展"}
```

- **主题（`[]` 内）**：取需求原文（c2）的**标题行**（第一段核心描述，跳过 `(1)确认数据` 这类编号子项），只保留到句号/分号前，去掉括号/@人名/结尾标点；**保留完整需求语义**（超过 28 字才在逗号/顿号处截断）。务必写清"是什么需求"，不要用编号/简称。
  - ✅ `[添加漏水绳，显示漏水米数]`、`[ECC动环首页未去除页面修改组件]`、`[告警屏蔽，在用户勾选了新的内容之后，原先的内容丢失了]`
  - ❌ `[问题修复(280)]`、`[网格图元文本颜色]`、`[告警屏蔽]`（编号/简称/太短，看不出是什么）
- **进展**：取 c8 进展的**第一行**（进展按"从新到旧"排列，0831 在上、0811 在下，第一行=最新），去掉日期前缀。
- content 用 `[需求主题] 进展`，让便签一眼看懂"是什么问题 + 做到哪了"。

## 便签数据文件（单一定制：AppData 持久路径，重装/重打包/换版本都不丢）

**数据唯一存放在 Electron 标准 userData 目录**，不跟随 exe / 打包目录，因此重启、重打包、移动 exe、装不同版本，数据都不会丢。

- **唯一数据文件**：`app.getPath('userData')`（name='memo' → `C:/Users/<user>/AppData/Roaming/memo/userData.json`）
- 定义位置三处一致：`main.js` 的 `filePath = path.join(app.getPath('userData'),'userData.json')`；`sync.js` 的 `PERSIST_DATA`（= 同一路径）；`userDataStore` 走 IPC `main.js` 的 `loadData/writeFile` 读写它。
- **别再改 exe 目录/多副本**：`electron-builder.json` 的 extraResources 仍会拷 `dist/userData` 到 `resources/userData`（是残留，便签不读了）；改数据只需改动 AppData 那份。

> **关键教训**：早期数据放在 `dist_electron/win-unpacked/resources/userData`，重新打包会覆盖、移动/重装会丢。改为 AppData 持久路径后彻底解决。分发给别人时，路径里含**用户名**（如 kf0093），所以给别人用要把路径动态化（见"分发"一节）。

## 自动刷新机制（重要）

便签 `main.js` 有文件监视器（每 3s 查 userData.json 的 mtime），变化时向 renderer 发 `todos-synced`，renderer 的 `userDataStore.listenSync()` 触发 `loadData()` 刷新。写入 userData.json 后稍等即可自动刷新显示。

> **注意 — store 回写竞态**：便签渲染进程的 Pinia store 是数据权威，运行时用户操作会回写覆盖 userData.json。**直接改 userData.json 后，最好让便签 store 重新 loadData（等 `todos-synced` 触发）以覆盖旧缓存**；若 store 已缓存旧数据导致被回写污染，需重启便签让 store 从干净文件重新初始化，数据才会稳定。

## 今日新增/更新 双色高亮 + 去重 + close→DONE（当前实现）

### 今日新增/更新（"新增"橙 / "更新"蓝，内容与状态条颜色对上）
- sync.js 的 `computeTodayStats(todos)`（在 `mergeIntoUserData` 之后调用）用 `sync-stat.json` 的 `baseline`(累积记录所有历史见过的 coreTopic→content) 判断：
  - 某个 coreTopic **从未在 baseline**（今天真正新出现）→ 记入 `addedToday` + `addedContents[]`
  - coreTopic 在 baseline 但 **content 变了**（进展更新）→ 记入 `updatedToday` + `updatedContents[]`
  - **跨天只重置当日计数/列表，保留 baseline**——所以"昨天见到的内容"今天不会误判为新增（只有今天真正新出现的才算）。曾因"跨天清空 baseline"导致昨天内容又算新增，用户不满；已修复为保留 baseline。
- **输出给 main.js**：sync.js 末尾打印 `今日新增内容: c1;c2` 和 `今日更新内容: c1;c2`（用 ; 分隔）。
- **main.js `runSync`**：正则解析 `今日新增 N 条`/`今日更新 N 条`/`今日新增内容:`/`今日更新内容:`，组装 `info={time, added, updated, addedContents[], updatedContents[]}`，存 `lastSyncResult`，发 `sync-status` 事件，`getLastSync` 返回它。
- **todo.vue 内容高亮**：维护 `addedSet`(橙) + `updatedSet`(蓝)，`onSyncStatus`/`getLastSync` 填充；模板 `:class="{'hl-new':addedSet.has(item.content), 'hl-update':updatedSet.has(item.content)}"`。`.hl-new`=橙（橙背景+金字+橙左边框），`.hl-update`=蓝（蓝背景+亮蓝字+蓝左边框，与状态条 `.st-add`/`.st-upd` 颜色一致）。
- **home.vue 状态条**：`上次同步 时 · 今日新增 N 条(橙 .st-add) · 今日更新 M 条(浅蓝 .st-upd)`，颜色与内容高亮对上。

### 去重 + 唯一 date
- `mergeIntoUserData(newTodos, doneTodos)`：`userOwn`(非 `[..]` 用户自建) 保留；`keptSync`(现有TODO中表格仍未完成的同步待办) 保留、内容若更新则同步为最新(计 `updated`)；`toAdd` 真正新增(现有TODO里没有的)。**同一 coreTopic 不重复**。
- **每条新待办用唯一 date**：`toAdd.push({date: Date.now() + toAdd.length})`——避免同毫秒多条 date 相同。
- `coreTopic(content)`：取 `[..]` 内**完整标题**，去空白/末尾标点，`slice(0,40)`。**绝不要用"按冒号/逗号分割前段"**——那会把 `ECC：平台...` 和 `ECC：动环...` 都退化成 `ECC` 导致 key 冲突误判（已踩坑修过）。

### close→DONE（表格里 close 的需求自动归档）
- `buildDoneTodos(items)` 提取 **close 行的 @目标人 需求**；`archiveDone(existingDone, doneTodos)` 把它们归档进 DONE（同 coreTopic 已存在则更新内容/日期，否则新增到今天的完成组）。
- 效果：**未完成 → TODO；close → DONE**。未完成的同步待办会从 DONE 移除（`mergeDone` 用 unfinishedCoreTopics 剔除），避免 DONE/TODO 重复。

## 定时拉取 + 时间对比 + 同步状态显示

- **定时拉取**：`main.js` 主进程里用 `setInterval` 定时执行 `SYNC_SCRIPT`（`node sync.js`）。间隔从 `config.syncIntervalMs` 读，默认 `SYNC_DEFAULT_INTERVAL = 3*60*1000`（3分钟，可配置）。首次启动立即拉一次，之后按间隔。
- **时间对比（关键）**：`sync.js` 用状态文件 `pull-state.json` 记录**上次拉取时每行 @目标人 的最新进展日期**（进展第一行 MMDD，如 `{"104":"0831","337":"0902"}`）。本次拉取：某行最新日期`>`上次记录 → 视为有更新(`isNew`) → **即使 DONE 里也重新放回 TODO**；日期没变 → 尊重 DONE 不打扰。这样"表格有新进展才提醒，你已完成的别重复拉回"。
- **同步状态显示**：`main.js` 解析 `sync.js` 输出的"今日新增 N 条 / 今日更新 M 条 / 今日新增内容 / 今日更新内容 "，发 `sync-status`(`{time, added, updated, addedContents[], updatedContents[]}`) 给 renderer；`home.vue` 状态条显示 `上次同步 HH:mm · 今日新增 N 条(橙 .st-add) · 今日更新 M 条(浅蓝 .st-upd)`（无变化时显示"今日无变化"）。状态条位置左上、按钮下方（top:68px，不遮 Todo/Done）。`getLastSync` 返回 `lastSyncResult`（含 addedContents/updatedContents）。
- **IPC 链**：`main.js` 发 `sync-status`(`{time, added, updated, addedContents, updatedContents}`) → `preload.onSyncStatus` → `home.vue`(状态条) + `todo.vue`(内容高亮) 监听。`todos-synced` 仍负责文件变化后的数据刷新。

### 相关代码改动
- `main.js`：`child_process.execFileSync('node',[SYNC_SCRIPT])` 定时拉取；`runSync()` 解析"今日新增/今日更新 条数 + 今日新增内容/今日更新内容"；发 `sync-status`(`{time,added,updated,addedContents,updatedContents}`)；`SYNC_SCRIPT`/`SYNC_PULL_STATE` 用**绝对路径**指向 skill 脚本（x 下发需动态化，见"分发"）。
- `preload.js`：新增 `onSyncStatus(callback)`（监听 `sync-status`）。
- `home.vue`：新增 `syncStatus` ref + `window.myApi.onSyncStatus`；模板右下角 `<div class="sync-status">上次同步 {{time}} · 新增 {{added}} 条</div>`；样式 fixed right/bottom。
- `sync.js`：`pull-state.json` 状态对比；`isNewRow()`；`rowNewestDate()`（外层 JS 提取进展第一行 MMDD，**不要在 READ_EXPR 模板串里做 split**——会因模板转义报正则错）。

## 便签自动刷新相关代码（已改）

- `main.js`：whenReady 块内新增文件监视器（`setInterval 3000` 查 `fs.statSync(filePath).mtimeMs`，变化时 `win.webContents.send('todos-synced')`）
- `preload.js`：新增 `onTodosSynced(callback)`（`ipcRenderer.on('todos-synced')`）
- `src/store/userDataStore.js`：新增 `listenSync()`（订阅 `onTodosSynced` → `loadData()`）
- `src/view/home.vue`：setup 中调用 `UserDataStore.listenSync()`

## 常见问题

- **CDP 9222 连不上**：Chrome 未以调试模式启动，或调试端口变了。用 `http://127.0.0.1:9222/json` 检查。
- **读不到数据**：确认表格页是 active tab，且文档已打开。`SpreadsheetApp.workbook` 需在文档页面上下文执行。
- **提取行数偏多/少**：
  - 偏多：误用了"文本含目标人"判断（把 `目标人、沈亚舟` 这种纯文本也算进来）。应只认 `mentionpersonId` 精确匹配。
  - 偏少：**硬编码扫描行数**（曾用 300 漏掉 row337）；应改用 `dg.getLastRow()` 动态探测表尾（从下往上扫）。或漏查了 c8 进展里的 @。
- **主题看不清**：主题用了编号/简称（如 `问题修复(280)`）。应取需求原文的标题行，写清具体需求。
- **已完成混进来**：`isDone` 只靠进展关键词会误判（如 `计划9/4完成` 是未完成但含"完成"）。应**以 status 列为主**判据；且写入时做**全量同步**——已完成的不在提取结果里就应从 TODO 移除，而不是一直留着。
- **改了数据但便签没变**：多半是改错了副本——用户运行的是打包版 exe（读 `dist_electron/win-unpacked/resources/userData/userData.json`），你只改了 dev 的 `public/...`。要改用户运行的那份（或全部副本）。
- **改了数据便签不自动刷新**：即使源码有监视器，**打包版 exe 的 app.asar 可能是旧代码**（不含监视器）。改完源码后必须**重新打包**（`npm run builder`）才能让 exe 具备自动刷新。验证：`npx @electron/asar extract-file app.asar main.js` 检查是否含 `todos-synced`/`setInterval`/`mtimeMs`。
- **便签显示旧数据但有新数据**：先看文件 mtime 是否变化；若文件已新但 exe 显示旧，是 asar 旧代码没监视器 → 重新打包。


## 打包 / 启动 / 验证（跑 exe 的踩血经验）

- **用户跑的是打包版 exe**：`dist_electron/win-unpacked/桌面便签.exe`（不是 dev）。改 `main.js`/`home.vue`/`todo.vue`/`store` 后必须**重新打包**（`npm.cmd run builder`）才能进 app.asar 生效。skill 的 `sync.js` 走绝对路径由 `node` 执行，改它**不需要**重新打包。
- **打包前先同步数据**：把 `AppData/Roaming/memo/userData.json` copy 到 `<memo>/dist/userData/userData.json`（electron-builder extraResources 源），否则打包出来的 `resources/userData` 是旧的。
- **启动用 `Start-Process`**（后台，成功即返）；**绝不要前台 `& exe`**——PowerShell 会等 GUI 进程，命令结束就被杀掉，窗口消失。
- **清进程用 `Stop-Process -Force` 后必须等 1-2s 再启动**，否则遗留单实例锁导致新实例起不来或旧实例仍占数据。
- **验证打包内容**：`npx @electron/asar extract-file app.asar main.js` 查看是否含最新逻辑（如 `addedContents`/`updatedContents`/`_uid`）。

## data 持久化（已改 AppData，重装/重打包不丢）

- 数据唯一存 `app.getPath(`+'`userData`'+`)`（base `%APPDATA%/memo/userData.json`），与 exe 位置/版本/打包目录无关。**用户所有版本都读同一文件**——数据持久、升级不丢。
- 三处一致定义：`main.js` 的 `filePath`、`sync.js` 的 `PERSIST_DATA`、`userDataStore` 走 IPC 读写。

## CDP + 扫码登录（新增看表格的前提）

- 调试 Chrome：`--remote-debugging-port=9222 --user-data-dir=`+DebugProfile9222 目录。**这是独立 profile**，需首次扫码登录腾讯文档（企业微信）。
- **别误关这个 Chrome**——用户扫码登录后关掉就丢登录态，下次 sync 因 `SpreadsheetApp` 未就绪失败。登录态在这个 profile 里持久。
- 判断就绪：sync.js 打印 `SpreadsheetApp 就绪: true`。

## 拖拽排序（todo.vue，防重复/防覆盖/防松手动画）

- **`:key` 用稳定 `_uid`**（首次加载时 `i._uid=++uidSeed`，之后不变），**不要用 `id`/`date`**：`id` 会被重编号、`date` 可能同毫秒重复，都导致 key 变化 → 松手就触发 flip-list 动画、或 duplicate/覆盖。
- **移动用对象引用**：`findIndex(i => i === dragged)`，`dragItem`/`dragenterItem` 存的是**对象引用**（`reactive({})`），不是 id。数组 splice + `arr.value=[...arr.value]` 只移动引用，`_uid` 不变 → 拖动实时动画，松手无动画。
- **松手只原地改 id + 写盘**：`liDragEnd` 里 `arr.value.forEach((i,idx)=>i.id=idx+1)`（**不重新赋值数组**，否则 key 触发松手动画），再把干净 JSON 副本 `arrs` 写盘。
- **实时动画**：`watch(dragenterItem, ()=>sortArr(), {deep:true})` 驱动拖动中的 move 动画；`sortArrFlag` 加 40ms 防抖避免抖动。

## 分发给别人（多用户注意 —— 当前绑本机，未做可移植）

> **现状：skill 已参数化+配置从 config.json 读取，不硬编码任何机器/个人配置。
- **要发给独立使用者**：需做可移植版——① `SYNC_SCRIPT`/`PERSIST_DATA` 改为动态（`app.getPath('userData')` 或相对 `__dirname`/配置）；② 把 skill scripts 打进 exe resources 而非指向本机目录；③ `WFY_ID`/表格 URL 做成配置；④ 让对方扫码登录表格。
- 用户指示**先别改，别影响现有使用**，故保持现状（本机跑得好好的），可移植版待用户需要时再做。

## 新用户配置引导（给拿到本 skill 压缩包的人）

本 skill **可移植、可配置**，新用户只需改根目录的 `config.json`，无需改代码、无需 exe 传参。

### 配置项（skill 根目录 `config.json`）
```json
{
  "mentionPersonId": "被@人的 mentionpersonId",   // 必填, 逻辑匹配仅凭这个 ID
  "targetName": "被@人的名字",                    // 可选, 仅用于日志/说明显示
  "cdpPort": 9222,                               // Chrome 调试端口(一般默认)
  "userData": "本机便签数据目录",                  // 便签 userData.json 所在目录
  "syncIntervalMs": 180000                       // 同步间隔(毫秒), 默认3分钟
}
```

### 配置步骤
1. **打开腾讯文档表格并登录**：用带调试端口的 Chrome（`--remote-debugging-port=9222`）打开你的腾讯表格，弹出的窗口**扫码登录**(企业微信)。
2. **找到"被@的人"的 ID**：运行 `node scripts/find-mention.js`，会扫描表格里所有被@的人，打印【名字 + ID】。记下你要同步的那个人的 ID。
3. **填进 config.json**：把 `mention-person-id` 的值换成第2步记下的 ID（保留双引号）。保存。
4. **运行同步**：`node scripts/sync.js`（正式写入）或 `node scripts/sync.js --dry-run`（预览不写）。

### 优先级（sync.js 加载配置）
`命令行参数 > skill 根目录 config.json > 内置默认值`。
- 便签 exe（新版 main.js）通过命令行参数传 `--mention-id` 等，覆盖 config.json。
- 单独用 skill（无 exe、无参数）时读 config.json。
- 两者都没有时用内置默认（本机=目标人）。

### 说明
- 只能读腾讯文档（只读），写的是本机便签 userData.json。
- 表格页必须是 Chrome 当前激活 tab 且已登录。
- find-mention.js、sync.js 都在 scripts/ 下；SKILL.md 即本说明。
