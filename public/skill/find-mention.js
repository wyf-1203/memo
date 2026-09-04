#!/usr/bin/env node
// find-mention.js —— 列出腾讯表格里所有"被@的人"(名字 + mentionpersonId)。
// 用途: 新用户想同步"某个人的条目"时, 运行本脚本, 从打印结果里挑出目标人,
//       把他的 mentionpersonId 填进 便签 config.json 的 mentionPersonId 字段。
// 前提: 用带 --remote-debugging-port=9222 的 Chrome 打开并登录腾讯文档表格(页面须为 active tab)。
// 用法: node find-mention.js   (可选 --cdp-port <port>)
const http = require('http');
const fs = require('fs');
const path = require('path');

// 端口: 命令行 --cdp-port > skill 根 config.json 的 cdpPort > 默认 9222(Chrome 调试技术默认)。
const SKILL_CONFIG_FILE = path.join(__dirname, '..', 'config.json');
let skillCfg = {};
try { skillCfg = JSON.parse(fs.readFileSync(SKILL_CONFIG_FILE, 'utf-8') || '{}'); } catch (e) { skillCfg = {}; }
const CDP_PORT = parseInt((process.argv.find((v,i)=>v==='--cdp-port'&&process.argv[i+1])
  ? process.argv[process.argv.indexOf('--cdp-port')+1]
  : (skillCfg && skillCfg.cdpPort != null ? String(skillCfg.cdpPort) : '9222')), 10);

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
    if (!WS) { reject(new Error('无 WebSocket')); return; }
    const ws = new WS(wsUrl);
    let id=0; const pending={};
    const send = (method, params) => new Promise((res, rej) => { const i=++id; pending[i]={res,rej}; ws.send(JSON.stringify({id:i,method,params})); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { const p=pending[m.id]; delete pending[m.id]; m.error?p.rej(new Error(m.error.message)):p.res(m.result); } };
    ws.onopen = async () => {
      try {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        ws.close();
        resolve({ value: r.result && r.result.value, err: r.exceptionDetails && r.exceptionDetails.text });
      } catch(e){ ws.close(); reject(e); }
    };
    ws.onerror = reject;
  });
}

// 读取表达式: 收集所有行 c8/c9 里的 @mention(名字+id), 去重
const READ_EXPR = `(function(){
  try {
    var dg = SpreadsheetApp.workbook.activeSheet.cellDataGrid;
    var endRow = dg.getLastRow();
    var colText = function(cell){
      if(!cell) return '';
      if(cell.value && typeof cell.value==='string') return cell.value;
      if(cell.value && cell.value.r) return cell.value.r.map(function(s){return s.t||'';}).join('');
      if(cell.formattedValue && cell.formattedValue.value) return cell.formattedValue.value;
      return '';
    };
    for(var rr=endRow; rr>=1; rr--){
      try {
        var hasData=false;
        for(var cc=1; cc<=9; cc++){ if(colText(dg.getCellData(rr,cc)).trim()){ hasData=true; break; } }
        if(hasData){ endRow=rr; break; }
      } catch(e){}
    }
    var people = {};  // id -> name
    function scanMentions(cell){
      if(!cell || !cell.value || !cell.value.r) return;
      cell.value.r.forEach(function(seg){
        if(seg.mention && seg.mention.mentionpersonId){
          people[seg.mention.mentionpersonId] = seg.mention.name || seg.mention.title || '';
        }
      });
    }
    for(var r=1;r<=endRow;r++){
      try {
        scanMentions(dg.getCellData(r,8));
        scanMentions(dg.getCellData(r,9));
      } catch(e){}
    }
    var arr = [];
    for(var id in people){ arr.push({ id: id, name: people[id] }); }
    return arr;
  } catch(e){ return {err:e.message}; }
})()`;

(async () => {
  try {
    const tabs = await getTabs();
    const sheet = tabs.find(t => t.type==='page' && t.url.includes('sheet'));
    if (!sheet) { console.log('ERROR: 未找到腾讯文档表格页, 检查 CDP 端口 ' + CDP_PORT + ' 且文档已打开。'); process.exit(1); }
    const res = await evalInPage(sheet.webSocketDebuggerUrl, READ_EXPR);
    if (res && res.err) { console.log('ERROR:', res.err); process.exit(1); }
    const list = res.value;
    if (!Array.isArray(list) || list.length===0) { console.log('未发现任何 @ 的人。请确认已打开腾讯文档表格, 且表格里有 @ 了同事的行。'); process.exit(0); }
    console.log('');
    console.log('=== 表格里被 @ 到的人 (名字 + mentionpersonId) ===');
    console.log('把"要同步谁"那一行的 id 填进 config.json 的 mentionPersonId 字段。');
    console.log('');
    list.forEach((p, i) => { console.log('  ' + (i+1) + '. [' + (p.name || '(无名字)') + ']  ' + p.id); });
    console.log('');
    console.log('配置方法: 打开便签 exe 所在目录 resources/configSetting/config.json,');
    console.log('  把 "mentionPersonId": "..." 换成上面目标人的 id, 然后重启便签。');
  } catch(e) {
    console.log('ERROR:', e.message || e);
    console.log('提示: 请确认 Chrome 以 --remote-debugging-port=' + CDP_PORT + ' 启动, 并已登录腾讯文档。');
    process.exit(1);
  }
})();
