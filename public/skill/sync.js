const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ==== 配置(加载优先级: 命令行参数 > skill/config.json > 内置默认) ====
// 新用户只需改 skill 根目录的 config.json(mentionPersonId/cdpPort/userData等), 再 node sync.js 即可。
// main.js 可传参覆盖: node sync.js --user-data <dir> --mention-id <id> --cdp-port <port> --pull-state <f> --today-stat <f> [--dry-run]
function argvVal(name) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : null; // null=未指定
}
// skill 根目录 config.json (唯一配置来源, 不硬编码)
const SKILL_CONFIG_FILE = path.join(__dirname, '..', 'config.json');
let skillCfg = {};
try { skillCfg = JSON.parse(fs.readFileSync(SKILL_CONFIG_FILE, 'utf-8') || '{}'); } catch (e) { skillCfg = {}; }
// 读取配置: 命令行参数 > config.json > fallback(仅技术默认)
// 个人配置(mentionPersonId/userData)绝不硬编码, 缺失则报错提示用户编辑 config.json。
function cfgRead(argvName, cfgKey, fallback) {
  const av = argvVal(argvName);
  if (av !== null) return av;
  if (skillCfg && skillCfg[cfgKey] !== undefined && skillCfg[cfgKey] !== '' && skillCfg[cfgKey] !== null) return String(skillCfg[cfgKey]);
  return fallback;
}
// 以下均为技术默认(端口/系统路径), 非个人配置; 个人配置必须来自 config.json/argv
const CDP_PORT = parseInt(cfgRead('cdp-port', 'cdpPort', '9222') || '9222', 10);
let WFY_ID = cfgRead('mention-id', 'mentionPersonId', '');  // 被@人ID: 配置优先; 留空则运行时自动取登录人(cookie wedoc_openid)  // 被@人 ID: 必须配置, 不硬编码
const USER_DATA_DIR = cfgRead('user-data', 'userData', path.join(os.homedir(), 'AppData', 'Roaming', 'memo')); // 便签数据目录: 有默认值(系统标准目录), 一般不用配
// 若缺关键配置, 明确报错(不静默用默认/硬编码)
const TARGET_NAME = cfgRead('target-name', 'targetName', '目标');
const API_KEY = cfgRead('api-key', 'apiKey', '');
const API_BASE_URL = cfgRead('api-base-url', 'apiBaseUrl', 'https://api.deepseek.com/v1');
const API_MODEL = cfgRead('api-model', 'apiModel', 'deepseek-chat');  // 被@人的显示名(仅用于日志)
const DRY_RUN = process.argv.includes('--dry-run');

// ==== 持久化数据文件(唯一数据源): 放便签数据目录 ====
const PERSIST_DATA = path.join(USER_DATA_DIR, 'userData.json');
const DATA_FILES = [ PERSIST_DATA ];
const DATA_FILE = PERSIST_DATA;
const LEGACY_DATA_FILES = [];
// 状态文件: 优先(命令行/config.json 指定), 否则默认 skill 目录(保持老版便签读正确基线)
const PULL_STATE_FILE = cfgRead('pull-state', 'pullState', path.join(__dirname, 'pull-state.json'));
const TODAY_STAT_FILE = cfgRead('today-stat', 'todayStat', path.join(__dirname, 'sync-stat.json'));

function todayMMDD() {
  const d = new Date();
  const p2 = n => (n < 10 ? '0' + n : '' + n);
  return p2(d.getMonth()+1) + p2(d.getDate());
}
function localToday() {
  const d = new Date();
  const p2 = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate());
}
function loadTodayStat() {
  try { return JSON.parse(fs.readFileSync(TODAY_STAT_FILE, 'utf-8') || '{}'); } catch(e){ return {}; }
}
function saveTodayStat(st) {
  try { fs.writeFileSync(TODAY_STAT_FILE, JSON.stringify(st), 'utf-8'); } catch(e){}
}
// 计算今日新增/今日更新(相对今日首同步基线; 跨天归零)
function computeTodayStats(todos) {
  const today = localToday();
  let st = loadTodayStat();
  // 跨天: 只重置"今日"计数/新增/更新列表, 但保留 baseline(累积记录所有历史见过的主题)。
  if (!st.date || st.date !== today) st = { date: today, baseline: (st.baseline || {}), addedToday: 0, updatedToday: 0, addedContents: [], updatedContents: [] };
  const baseline = st.baseline || {};
  // 同一主题(同一个需求)当天只算一次, 且"性质固定": 一旦定为今日新增就一直是新增(不因内容再变而转更新)。
  // addedTopics/updatedTopics 用 coreTopic 作 key, 值=该主题当天最新内容; 跨天重置, 保证下一天重新统计。
  const addedTopics = (st.addedTopics || {});    // ct -> content (今日定性为"新增"的主题)
  const updatedTopics = (st.updatedTopics || {}); // ct -> content (今日定性为"更新"的主题)
  const TMMDD = todayMMDD();
  for (const t of todos) {
    const ct = coreTopic(t.content);
    if (!ct) continue;
    // 已定性为"新增"的主题: 保持新增(只更新其当天最新内容), 绝不转成"更新"
    if (ct in addedTopics) { addedTopics[ct] = t.content; baseline[ct] = t.content; continue; }
    // 已定性为"更新"的主题: 保持更新(只更新其当天最新内容), 不重复计数
    if (ct in updatedTopics) { updatedTopics[ct] = t.content; baseline[ct] = t.content; continue; }
    // 今日是否真的更新过: 看该条 progress 第一行的日期前缀(MMDD)是否为今天。
    // 只有第一行日期==今天 才算"今日更新"; 否则(如0824)只记 baseline 供下一天对比, 不标色。
    const todayDate = (t.newestDate === TMMDD);
    if (!todayDate) { if (!(ct in baseline)) baseline[ct] = t.content; continue; }
    if (!(ct in baseline)) {            // 今天更新 & 历史从未见过 → 今日新增
      addedTopics[ct] = t.content; baseline[ct] = t.content;
    } else {                             // 今天更新 & 历史已有 → 今日更新
      updatedTopics[ct] = t.content; baseline[ct] = t.content;
    }
  }
  const uniqA = Object.values(addedTopics);
  const uniqU = Object.values(updatedTopics);
  const addedToday = uniqA.length, updatedToday = uniqU.length;
  saveTodayStat({ date: today, baseline: baseline, addedTopics: addedTopics, updatedTopics: updatedTopics, addedToday: addedToday, updatedToday: updatedToday });
  return { addedToday: addedToday, updatedToday: updatedToday, addedContents: uniqA, updatedContents: uniqU };
}

// ==== CDP 工具 ====
function getTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:'+CDP_PORT+'/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalInPage(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const WS = global.WebSocket;
    const ws = new WS(wsUrl);
    let id=0; const pending={};
    const send = (method, params) => new Promise((res) => { const i=++id; pending[i]=res; ws.send(JSON.stringify({id:i,method,params})); });
    ws.onmessage = (ev) => { const m=JSON.parse(ev.data); if(m.id&&pending[m.id]){pending[m.id](m);delete pending[m.id];} };
    ws.onopen = async () => {
      try { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        ws.close();
        if (r.result && r.result.exceptionDetails) return resolve({err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text});
        resolve({ value: r.result?.result?.value });
      } catch(e){ ws.close(); resolve({err:e.message}); }
    };
    ws.onerror = (e) => { try{ws.close();}catch(_){} reject(e); };
  });
}

function bringToFront(wsUrl) {
  return new Promise((resolve) => {
    try {
      const WS = global.WebSocket;
      const ws = new WS(wsUrl);
      ws.onopen = () => { try { ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront' })); } catch(e) {} setTimeout(() => { try{ws.close();}catch(e){} resolve(true); }, 500); };
      ws.onerror = () => { try{ws.close();}catch(e){} resolve(false); };
    } catch (e) { resolve(false); }
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==== 读取单元格 ====
function readExprStr(wfy) {
  const READ_EXPR = `(function(){
  try {
    // 不使用 cellDataGrid：它只有当前可见视口的几行，后台标签常为空。
    // getCellDataAtPosition 可读取整张表的已解码数据，不需要激活浏览器窗口。
    var sheet = SpreadsheetApp.workbook.activeSheet;
    var WFY = '${wfy}';
    var cellText = function(cell){
      if(!cell) return '';
      if(cell.value && typeof cell.value === 'string') return cell.value;
      if(cell.value && cell.value.r) return cell.value.r.map(function(s){return s.t||'';}).join('');
      if(cell.formattedValue && cell.formattedValue.value) return cell.formattedValue.value;
      return '';
    };
    var hasWFYMention = function(cell){
      if(!cell) return false;
      if(cell.value && cell.value.r){
        if(cell.value.r.some(function(seg){ return seg.mention && seg.mention.mentionpersonId===WFY; })) return true;
      }
      return JSON.stringify(cell).indexOf(WFY)>=0;
    };
    // 第0行是表头。完整行数不受虚拟视口影响。
    var endRow = sheet.getRowCount ? sheet.getRowCount()-1 : 0;
    var rows = [];
    for(var r=1;r<=endRow;r++){
      try {
        // 实际表列：c10=进展情况、c11=当前责任人（c0 是序号列）。
        var c10 = sheet.getCellDataAtPosition(r,10);
        var c11 = sheet.getCellDataAtPosition(r,11);
        if(hasWFYMention(c11) || hasWFYMention(c10)){
          rows.push({
            row:r,
            project: cellText(sheet.getCellDataAtPosition(r,1)),
            req: cellText(sheet.getCellDataAtPosition(r,2)),
            prio: cellText(sheet.getCellDataAtPosition(r,3)),
            status: cellText(sheet.getCellDataAtPosition(r,4)),
            type: cellText(sheet.getCellDataAtPosition(r,9)),
            phase: cellText(sheet.getCellDataAtPosition(r,7)),
            progress: cellText(c10),
            owner: cellText(c11),
            c11At: hasWFYMention(c11), c10At: hasWFYMention(c10)
          });
        }
      } catch(e){}
    }
    return rows;
  } catch(e){ return {err:e.message}; }
})()`;
  return READ_EXPR;
}


// ==== 提炼待办 ====
// 判断是否已完成(应排除, 不写入便签)。以 status 列为第一判据, 关键词为辅。
// close=已完成; open/空=未完成; "待现场验证/待配置/开发中"等含"待/验证/开发中"=未完成。
function isDone(item) {
  const st = (item.status||'').trim().toLowerCase();
  if (st === 'close') return true;              // 明确关闭/完成
  if (!st) return false;                         // 无状态 → 按未完成处理
  // 状态明确是"未完成"类
  if (/待|验证|开发中|进行中|open|未|确认/.test(st)) return false;
  // 剩下的状态若含"完成/已解决/已关闭/上线"则视为完成
  if (/完成|解决|关闭|上线|部署|恢复/.test(st)) return true;
  // 进展里出现"已解决/已完成/已关闭/已上线" 且 不含任何"待/开发中/确认/验证/预计"等未完成词 → 完成
  const pr = item.progress||'';
  const doneRe = /已解决|已完成|已关闭|已上线|已部署|已恢复|完成/;
  const undoneRe = /待|开发中|调整中|确认|未|进行中|绑定|测试|验证|预计|计划/;
  return doneRe.test(pr) && !undoneRe.test(pr);
}
// 提炼主题: 取需求原文, 尽量保留完整核心需求语义, 让便签看懂"是什么需求"。
// 只有非常长(>28字)才在逗号/顿号处截断; 通常保留到语义断点(句号/分号)。
function topicOf(item) {
  let raw = (item.req||'').trim();
  // 按行拆, 取第一个"标题"行(跳过纯序号子项行如"(1)xxx")
  const lines = raw.split(/\n/).map(l=>l.trim()).filter(Boolean);
  let t = '';
  for (const ln of lines) {
    if (/^[（(]?\s*[0-9]{1,2}\s*[）).、-]/.test(ln)) continue; // 跳过编号子项
    t = ln; break;
  }
  if (!t) t = lines[0] || '';
  // 只保留第一句(句号/分号前), 保证语义完整且不太长
  t = t.split(/[。；;]/)[0];
  // 去掉括号及内容 (如 (图1))
  t = t.replace(/[（(][^）)]*[）)]/g,'');
  // 去掉 @人名 (如 @徐伟)
  t = t.replace(/@[\u4e00-\u9fa5A-Za-z0-9_]+/g,'');
  // 去掉结尾多余标点
  t = t.trim().replace(/[，,、：:；;。.]+$/,'');
  // 若仍非常长(>28字), 在逗号/顿号处截断
  if (t.length > 28) t = t.split(/[，,、]/)[0];
  return t;
}
// 提炼最新进展: 取 progress 最后一行，去掉日期前缀
// 进展按"从新到旧"排列(如 0831 在上, 0811 在下), 所以取第一行=最新
function latestProgress(item) {
  const p = (item.progress||'').trim();
  if(!p) return '';
  const lines = p.split(/\n/).filter(Boolean);
  const newest = lines[0]; // 第一行是最新
  return newest.replace(/^\d{4}[:：]\s*/,'').trim();
}

// 提取主题: content 里的 "[xxx]" 或前10字
function topicOfContent(content) {
  var m = content.match(/^\[([^\]]+)\]/);
  return m ? m[1].trim() : (content || '').slice(0, 10);
}
// 判断是否为"旧格式"的腾讯同步待办。
// 只清理真正的旧格式: 嵌套方括号 [[...]]。绝不要用"含[已解决/待验证]等关键词"来判——那会误删清晰的 "[需求] 已修复，待现场验证" 这类合法的清晰待办。
function isLegacySynced(content) {
  // 旧格式: 以 [[ 开头 (嵌套方括号, 之前的同步曾错误地产生过)
  return /^\[\[/.test(content);
}

// ==== 状态(时间对比): 记录上次拉取时每行的最新进展日期 ====
let pullState = {};
function loadPullState() {
  try { pullState = JSON.parse(fs.readFileSync(PULL_STATE_FILE, 'utf-8')); } catch(e){ pullState = {}; }
  return pullState;
}
function savePullState() {
  try { fs.writeFileSync(PULL_STATE_FILE, JSON.stringify(pullState), 'utf-8'); } catch(e){}
}
// 判断该行是否"新"(比上次拉取有更新进展, 或本次新出现的行)
function isNewRow(item) {
  if (!item || !item.newestDate) return false;
  const prev = pullState[String(item.row)];
  if (!prev) return true;                 // 上次没记录 → 新出现的行
  return item.newestDate > prev;          // 日期更大 → 有更新进展
}

// 提取该行最新进展日期(进展第一行 MMDD 前缀, 如 "0901")
function rowNewestDate(item) {
  const p = (item.progress || '').trim();
  if (!p) return '';
  const first = p.split(/\n/).filter(Boolean)[0] || '';
  const m = first.match(/^(\d{4})[:：]/);
  return m ? m[1] : '';
}

// 生成待办: "[主题] 需求一句话 | 最新进展" —— 让便签一眼看懂是什么问题、做到哪了

// ==== AI 智能总结(可选) ====

// 决定使用的模型: 配置了 apiModel 用配置; 否则自动从中转站 /models 拉取可用模型, 挑一个 deepseek。
let _cachedModel = null;
async function resolveModel() {
  if (_cachedModel) return _cachedModel;
  if (API_MODEL) { _cachedModel = API_MODEL; return API_MODEL; }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(API_BASE_URL + '/models', { headers: { 'Authorization': 'Bearer ' + API_KEY }, signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const ids = (j && j.data || []).map(m => m && m.id).filter(Boolean);
      if (ids.length) {
        // 优先挑名字含 deepseek 的; 再优先 chat/v3 这类通用对话模型
        const ds = ids.filter(x => /deepseek/i.test(x));
        const pick = [ 'deepseek-chat', 'DeepSeek-V3', 'deepseek-v3', 'DeepSeek-V2.5' ].find(p => ds.includes(p)) || ds[0];
        if (pick) { _cachedModel = pick; console.log('已从中转站自动选用模型: ' + pick); return pick; }
      }
    }
  } catch (e) { /* 忽略, 用默认 */ }
  _cachedModel = 'deepseek-chat'; return 'deepseek-chat';
}

async function summarizeWithAI(todos) {
  if (!API_KEY) return null;
  const input = todos.map((t, idx) => {
    const m = t.content.match(/^\[([^\]]+)\]\s*(.*)$/);
    return (idx + 1) + '. [' + (m ? m[1] : '') + '] ' + (m ? m[2] : '');
  }).join('\n');
  const sys = '你是需求整理助手。下面是一批腾讯文档里的需求待办，每行格式【[主题] 进展】。请把每一行整理成更清晰的一句话待办。要求：1) 每行只输出一条，开头保留【[主题]】且主题必须和输入完全一致；2) 方括号后写一句最通顺、聚焦最新状态或下一步的话；3) 不要编号、不要解释、不要多余文字、不要空行；4) 输出条数必须与输入完全相同、顺序一致。';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const MODEL = await resolveModel();
    const res = await fetch(API_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: input }], temperature: 0.2 }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*\d+[.、)）]\s*/, '').trim()).filter(Boolean);
    if (lines.length !== todos.length) return null;
    if (!lines.every(l => /^\[[^\]]+\]/.test(l))) return null;
    return todos.map((t, idx) => {
      const m = t.content.match(/^\[([^\]]+)\]\s*(.*)$/);
      const origTopic = m ? m[1] : '';
      const ai = lines[idx].match(/^\[[^\]]+\]\s*(.+)$/);
      return '[' + origTopic + '] ' + (ai ? ai[1] : (m ? m[2] : ''));
    });
  } catch (e) { return null; }
}

function buildTodos(items) {
  return items.filter(it => !isDone(it)).map(it => {
    const nd = rowNewestDate(it);
    return {
      content: '[' + topicOf(it) + '] ' + (latestProgress(it) || '待处理'),
      source: { row: it.row, project: it.project, status: it.status },
      newestDate: nd,
      isNew: isNewRow(Object.assign({}, it, { newestDate: nd }))
    };
  });
}

// 提炼"已完成"(close)的 @目标人 需求 → 移入 DONE 归档
function buildDoneTodos(items) {
  return items.filter(it => isDone(it)).map(it => ({
    content: '[' + topicOf(it) + '] ' + (latestProgress(it) || '已关闭'),
    source: { row: it.row, status: it.status }
  }));
}

// ==== 写入便签 ====
// 判断是否为"腾讯同步待办"形如 "[需求] 进展"。用户自己加的条目(如"单击创建任务")不含 [..] 前缀, 会保留。
function isSyncTodo(content) {
  return /^\[[^\]]+\]/.test(content);
}

// 收集 DONE 里用户已完成的同步主题, 避免 sync 把它们又写回 TODO。
// 用户手动完成并移到 DONE 的项, 即使表格里还没 close, 也不该再回 TODO。
function doneTopics(data) {
  const set = new Set();
  for (const d of (data.DONE||[])) {
    for (const item of (d.contents||[])) {
      const t = topicOfContent(item.content);
      if (t) set.add(t);
    }
  }
  return set;
}

// 全量同步: 便签里的腾讯同步待办 = 当前未完成的 @目标人 需求。
// 但尊重用户已完成的(DONE) —— 已在 DONE 的主题不再写回 TODO; 只保留未完成+未完成的同步+用户自己条目。
function mergeIntoUserData(newTodos, doneTodos) {
  // 首次运行 / userData.json 不存在 → 初始化空数据(新用户/换电脑场景)
  if (!fs.existsSync(DATA_FILE)) {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify({ TODO: [], DONE: [], version: 1 }, null, 2), 'utf-8');
      console.log('[init] userData.json 不存在, 已初始化空数据');
    } catch(e) { console.log('[init] 初始化 userData.json 失败: '+(e.message||e)); }
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  const existing = data.TODO || [];

  // 1. 用户自己的条目(非 [..] 同步格式) + 旧格式 → 保留
  const userOwn = existing.filter(t => !isSyncTodo(t.content) && !isLegacySynced(t.content));

  // 2. 提取的未完成需求按核心主题组织: { ct -> newest content }
  const unfinishedCoreTopics = new Set();  // sync 判定未完成的核心主题 → 从 DONE 剔除
  const newestByTopic = new Map();          // ct -> this pull's content (最新内容)
  const statusByTopic = new Map();            // ct -> status (本次拉取的状态, 用于便签显示)
  for (const nt of newTodos) {
    const ct = coreTopic(nt.content);
    if (!ct) continue;
    unfinishedCoreTopics.add(ct);
    newestByTopic.set(ct, nt.content);       // 用本次拉取的最新内容(进展可能更新)
    statusByTopic.set(ct, (nt.source && nt.source.status) || '');
  }

  // 3. 现有 TODO 里的同步待办([..]): 表格里仍未完成 → 保留(内容若有更新则同步为最新); 已 close(不在newTodos) → 移除
  const keptSync = [];
  const seenCore = new Set();
  let updated = 0; // 内容有变化的条数(进展更新了)
  for (const t of existing) {
    if (!isSyncTodo(t.content) || isLegacySynced(t.content)) continue; // 非同步的已在上一步
    const ct = coreTopic(t.content);
    if (!unfinishedCoreTopics.has(ct)) continue; // 表格里已 close/完成 → 从 TODO 移除(它该进 DONE)
    seenCore.add(ct);
    // 内容若更新了(进展变了)则覆盖成最新; 否则保留原 id/date
    const newContent = newestByTopic.get(ct);
    if (newContent && newContent !== t.content) updated++;  // 内容有变化 → 计为"更新"
    keptSync.push({ id: t.id, date: t.date, content: newContent || t.content, status: statusByTopic.get(ct) || '' });
  }

  // 4. 真正新增的未完成需求(现有 TODO 里没有)
  const toAdd = [];
  for (const nt of newTodos) {
    const ct = coreTopic(nt.content);
    if (!ct || seenCore.has(ct)) continue;
    seenCore.add(ct);
    toAdd.push({ id: 0, date: Date.now() + toAdd.length, content: nt.content, status: (nt.source && nt.source.status) || '' });
  }

  // 5. 编号: 用户条目在前, 保留的同步待办, 新增在后
  let nextId = 1;
  const finalTodo = userOwn.map(t => ({ id: nextId++, date: t.date, content: t.content }));
  keptSync.forEach(t => { t.id = nextId++; finalTodo.push(t); });
  toAdd.forEach(t => { t.id = nextId++; finalTodo.push(t); });

  if (DRY_RUN) return { dry: true, newTodos, toAdd, added: toAdd.length, updated: updated, synced: newTodos.length, total: finalTodo.length, removeFromDone: unfinishedCoreTopics.size };

  // 写入所有副本: TODO 用统一的未完成集合; 每份的 DONE 保留(合并用户完成状态)
  data.TODO = finalTodo;
  for (const f of DATA_FILES) {
    try {
      let d;
      try { d = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch(e){ d = { TODO: [], DONE: [] }; }
      // 保留已有 DONE + 剔除未完成的 + 归档本次 close 的 @目标人 需求到 DONE
      let mergedDone = mergeDone(d.DONE || [], unfinishedCoreTopics);
      mergedDone = archiveDone(mergedDone, doneTodos);
      const out = { TODO: finalTodo, DONE: mergedDone };
      fs.writeFileSync(f, JSON.stringify(out), 'utf-8');
    } catch(e){ console.log('  写 '+f+' 失败: '+e.message); }
  }
  return { dry: false, added: toAdd.length, updated: updated, synced: newTodos.length, total: finalTodo.length, removeFromDone: unfinishedCoreTopics.size };
}

// 合并 DONE: 保留原有的完成记录(演示数据/用户完成), 确保用户已完成的同步主题在 DONE 里不会丢失
// 从 DONE 里移除那些 sync 判定为"未完成"的需求(避免 DONE 和 TODO 重复)。
// 核心主题匹配(宽松): 提取关键短语(如"告警屏蔽"/"漏水绳"/"网格图元")比对, 表述详略不影响。
// 提取唯一核心主题: 取 [..] 内完整标题(去空格/末尾标点), 作为去重整条目的唯一 key。
// 不要用"冒号/逗号分割前段"——那会让 "ECC：平台..." 和 "ECC：动环..." 都退化成 "ECC", 造成 key 冲突误判。
function coreTopic(content) {
  var m = content.match(/^\[([^\]]+)\]/);
  var s = m ? m[1] : content;
  s = s.replace(/\s+/g, '').replace(/[，、,：:；;。.！!？?]+$/g, '').trim();
  return s.slice(0, 40);
}
// 把本次 close 的 @目标人 需求归档进 DONE (同 coreTopic 已存在则更新内容/日期, 否则新增一条)
function archiveDone(existingDone, closeTodos) {
  if (!closeTodos || closeTodos.length === 0) return existingDone;
  const today = new Date();
  const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  const arr = existingDone.slice();
  // 每条 close 待办: 找到已存在的同 coreTopic 完成记录 → 更新; 否则加到今天的完成组
  for (const ct of closeTodos) {
    const core = coreTopic(ct.content);
    let found = false;
    for (const d of arr) {
      const idx = d.contents.findIndex(item => coreTopic(item.content) === core);
      if (idx >= 0) { d.contents[idx] = { id: d.contents[idx].id, date: Date.now(), content: ct.content }; found = true; }
    }
    if (!found) {
      // 找到今天的完成组, 没有则新建
      let todayGroup = arr.find(d => d.date === dateStr);
      if (!todayGroup) { todayGroup = { date: dateStr, contents: [] }; arr.unshift(todayGroup); }
      todayGroup.contents.push({ id: todayGroup.contents.length + 1, date: Date.now(), content: ct.content });
    }
  }
  return arr;
}

function mergeDone(existingDone, newTodoTopics, DONE_DIR) {
  // newTodoTopics: Set of coreTopic of unfinished sync todos → 这些要从 DONE 移除
  return existingDone.map(function(d){
    var contents = (d.contents||[]).filter(function(item){
      var ct = coreTopic(item.content);
      return !newTodoTopics.has(ct) && !newTodoTopics.has(item.content);
    });
    return { date: d.date, contents: contents };
  }).filter(function(d){ return (d.contents||[]).length > 0; });
}

// ==== 主流程 ====
(async () => {
  try {
    const tabs = await getTabs();
    const sheet = tabs.find(t => t.type==='page' && t.url.includes('sheet'));
    if (!sheet) { console.log('ERROR: 未找到腾讯文档表格页，检查 CDP '+CDP_PORT); process.exit(1); }
    // 被@人 ID: 配置未指定时, 自动取"当前登录人自己"(cookie 的 wedoc_openid)。
    // 这样用户登录腾讯文档后无需配置 mentionPersonId, 同步的就是登录人被@的条目。
    if (!WFY_ID) {
      try {
        const ck = await evalInPage(sheet.webSocketDebuggerUrl, 'document.cookie');
        const ckStr = (ck && ck.value) || '';
        const m = /wedoc_openid=([^;\s]+)/.exec(String(ckStr));
        WFY_ID = m ? m[1] : '';
        if (WFY_ID) console.log('未配置 mentionPersonId, 已自动取登录人 ID: ' + WFY_ID);
      } catch (e) { WFY_ID = ''; }
    }
    if (!WFY_ID) { console.error('[配置] 未指定 mentionPersonId 且读不到登录人ID, 请确认已登录腾讯文档(或改 config.json 的 mentionPersonId)'); process.exit(1); }
    const READ_EXPR = readExprStr(WFY_ID);
    const res = await evalInPage(sheet.webSocketDebuggerUrl, READ_EXPR);
    if (res.err) { console.log('ERROR: 读取失败', res.err); process.exit(1); }
    const items = res.value;
    if (!Array.isArray(items)) { console.log('ERROR: 返回非数组', JSON.stringify(items)); process.exit(1); }
    console.log('发现 @'+TARGET_NAME+' 相关行: '+items.length);
    loadPullState();  // 加载上次拉取状态(用于时间对比)
    let todos = buildTodos(items);
    if (API_KEY) { const aiTodos = await summarizeWithAI(todos); if (aiTodos) { todos = aiTodos; console.log('已用 AI 总结 '+todos.length+' 条待办(apiKey 模式)'); } else { console.log('AI 总结不可用(apiKey 无/失败), 退回规则提取'); } }
    console.log('提炼待办(未完成): '+todos.length);
    todos.forEach(t => console.log('  - '+t.content));
    const doneTodos = buildDoneTodos(items);
    console.log('提炼已完成(close, 移入DONE): '+doneTodos.length);
    doneTodos.forEach(t => console.log('  ↳ '+t.content));
    const result = mergeIntoUserData(todos, doneTodos);
    // 今日基线: 计算今日新增/今日更新(相对今天首次同步; 跨天归零)
    const todayStat = computeTodayStats(todos);
    result.addedToday = todayStat.addedToday;
    result.updatedToday = todayStat.updatedToday;
    // 输出当天累计的新增/更新内容，避免下一次自动同步清空高亮。
    result.addedContents = todayStat.addedContents || [];
    result.updatedContents = todayStat.updatedContents || [];
    // 供 main.js 解析: 今日新增的具体条目内容(用于便签里高亮显示), 用 ; 分隔
    if (result.addedContents.length) {
      console.log('今日新增内容: ' + result.addedContents.join(';'));
    }
    // 供 main.js 解析: 今日更新的具体条目内容(用于便签里另一种颜色高亮), 用 ; 分隔
    if (result.updatedContents.length) {
      console.log('今日更新内容: ' + result.updatedContents.join(';'));
    }
    // 更新状态: 记录本次所有 @目标人 未完成行的最新进展日期, 供下次对比
    if (!result.dry) {
      todos.forEach(t => { if (t.newestDate) pullState[String(t.source.row)] = t.newestDate; });
      savePullState();
    }
    if (result.dry) {
      console.log('[DRY RUN] 未写入便签，预计: 本次同步 '+result.synced+' 条(未完成), 今日新增 '+result.addedToday+' 条, 今日更新 '+result.updatedToday+' 条, 从DONE移除 '+result.removeFromDone+' 条(避免重复), 便签TODO共 '+result.total+' 条');
    } else {
      console.log('[写入] 本次同步 '+result.synced+' 条(未完成), 今日新增 '+result.addedToday+' 条, 今日更新 '+result.updatedToday+' 条, 从DONE移除 '+result.removeFromDone+' 条(避免重复), 便签TODO共 '+result.total+' 条');
    }
  } catch(e){
    console.log('ERROR:', e.message);
    process.exit(1);
  }
})();
