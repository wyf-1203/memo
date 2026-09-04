const path = require('path');
const { app, Menu, Tray, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
// ==== 持久化数据文件: 放 Electron 标准 userData 目录, 不管哪个版本(安装版/绿版/重打包)都读同一文件, 重启/重装不丢 ====
const filePath = path.join(app.getPath('userData'), 'userData.json');
// ==== 日志: 记录启动/同步/退出/异常到 userData 目录, 方便排查"便签为何没了/自动关闭" ====
const LOG_FILE = path.join(app.getPath('userData'), 'app.log');
function log(msg) {
  try {
    const t = new Date().toLocaleString();
    fs.appendFileSync(LOG_FILE, '[' + t + '] ' + msg + '\n', 'utf-8');
  } catch(e) {}
  try { console.log(msg); } catch(e) {}
}
log('=== 便签启动 ===  exe=' + process.execPath + '  userData=' + app.getPath('userData') + '  filePath=' + filePath);
const iconPath = app.isPackaged
  ? path.resolve(__dirname, 'dist', 'memo.ico')
  : path.resolve(__dirname, 'public', 'memo.ico');
const configPath = app.isPackaged
  ? path.resolve(path.dirname(app.getPath('exe')), 'resources', 'configSetting', 'config.json')
  : path.resolve(__dirname, 'public', 'configSetting', 'config.json');
// 腾讯文档待办同步脚本 (定时拉取) —— 打进 exe 资源(skill), 用相对路径定位, 便于多用户分发
// 打包版: <exe>/resources/skill/sync.js ; 开发版: <memo>/public/skill/sync.js
const SYNC_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'skill', 'sync.js')
  : path.join(__dirname, 'public', 'skill', 'sync.js');
const SYNC_DEFAULT_INTERVAL = 3 * 60 * 1000; // 默认3分钟


const WinState = require('electron-win-state').default;
const winState = new WinState({
  defaultWidth: 400,
  defaultHeight: 350,
});

const additionalData = { myKey: 'myValue' }
const gotTheLock = app.requestSingleInstanceLock(additionalData)

let win = null
let tray = null;
let config = null
let lastSyncResult = null; // 最近一次定时拉取结果 { time, added }

// 从 sync.js 写入的同一份状态文件恢复当天统计，避免重启或下一次无变化同步把“今日新增/更新”显示清零。
function restoreTodaySyncResult() {
  try {
    const statPath = path.join(app.getPath('userData'), 'sync-stat.json');
    const stat = JSON.parse(fs.readFileSync(statPath, 'utf-8') || '{}');
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (stat.date !== today) return null;
    const mtime = fs.statSync(statPath).mtimeMs;
    return {
      time: mtime,
      added: Number(stat.addedToday || 0),
      updated: Number(stat.updatedToday || 0),
      addedContents: Array.isArray(stat.addedContents) ? stat.addedContents : Object.values(stat.addedTopics || {}),
      updatedContents: Array.isArray(stat.updatedContents) ? stat.updatedContents : Object.values(stat.updatedTopics || {}),
    };
  } catch (e) { return null; }
}


const createWindow = () => {
  const win = new BrowserWindow({
    alwaysOnTop: true,
    ...winState.winOptions,
    // width: 400,
    // height: 350,
    minWidth: 350,
    minHeight: 300,
    // frame: false,
    // backgroundColor: 'rgba(40, 37, 45, 0.4)',
    // backgroundColor: 'rgba(12, 12, 12,.5)',
    transparent: true,
    titleBarStyle: 'hidden', // true win 直接就是不起作用  mac才起作用
    webPreferences: {
      // // 隔离nodejs 解除
      // contextIsolation: false,
      // 启用nodejs语法
      nodeIntegration: true,
      // 预加载
      preload: path.resolve(__dirname, 'preload.js'),

    },
    alwaysOnTop: true,
  });
  win.setSkipTaskbar(true)
  // win.webContents.openDevTools();

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, './dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173/');
  }

  win.on('closed', () => {
    log('[window] 窗口已关闭 (closed)');
  });
  win.on('unresponsive', () => { log('[window] 窗口无响应 (unresponsive)'); });
  win.on('ready-to-show', () => {
    // 确保窗口一直置顶(用户要求)
    try { win.setAlwaysOnTop(true); } catch(e){}
    // win.show();
    winState.manage(win);
  });
  return win
};




if (!gotTheLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    log('[ready] app.whenReady 触发');
    tray = new Tray(iconPath);
    try {
      config = await loadConfig()
    } catch (err) {
      console.error('loadConfig error, using defaults:', err);
      config = { AutoRunstart: false, item1: false, item2: false, cdpPort: 9222 };
    }
    // 启动时先恢复当天累计统计；后续 runSync 会用同一 sync-stat.json 更新它。
    lastSyncResult = restoreTodaySyncResult();
    console.log(config.AutoRunstart);
    app.setLoginItemSettings({
      openAtLogin: config.AutoRunstart, //获取当前自启动状态
      path: process.execPath,
    });
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: () => {
          // 点击事件：切换自启动
          // console.log(app.getLoginItemSettings().openAtLogin);
          if (!app.isPackaged) {
            app.setLoginItemSettings({
              openAtLogin: !app.getLoginItemSettings().openAtLogin, //获取当前自启动状态
              path: process.execPath,
            });
            config.AutoRunstart = app.getLoginItemSettings().openAtLogin
          } else {
            app.setLoginItemSettings({
              openAtLogin: !app.getLoginItemSettings().openAtLogin,
            });
            config.AutoRunstart = app.getLoginItemSettings().openAtLogin

          }
          console.log('开机状态:', config.AutoRunstart);
          writeConfig(config)
        },
      },
      {
        label: '预留1', type: 'checkbox', checked: config.item1, click: () => {
          config.item1 = !config.item1
          writeConfig(config)

        }
      },
      {
        label: '预留2', type: 'checkbox', checked: config.item2, click: () => {
          config.item2 = !config.item2
          writeConfig(config)
        }
      },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setToolTip('桌面便签');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      win.show();
    });
    // 开机自启动

    win = createWindow();

    // console.log(winState); 
    // console.info(winState);
    // console.dir(winState.store);
    let timer = null
    win.addListener('move', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        console.log('move');
        winState.saveState(win)
      }, 1000);
    })
    win.addListener('resize', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        console.log('resize');
        winState.saveState(win)
      }, 1000);
    })
    // setInterval(() => {
    //   winState.saveState(win)
    // }, 2000)

    // ==== 定时拉取腾讯文档待办 (默认3分钟, 可配置) ====
    const runSync = () => {
      try {
        // 执行 sync.js, 同步等待输出
        // 从 config 读动态配置(被@人/端口), 数据/状态文件路径由运行时 app.getPath('userData') 计算
        const userDataDir = app.getPath('userData');
        const mentionId = (config && config.mentionPersonId) || '';
        const cdpPort = (config && config.cdpPort) || 9222;
        const syncArgs = [
          SYNC_SCRIPT,
          '--user-data', userDataDir,
          '--mention-id', mentionId,
          '--cdp-port', String(cdpPort),
          '--pull-state', path.join(userDataDir, 'pull-state.json'),
          '--today-stat', path.join(userDataDir, 'sync-stat.json'),
  '--api-key', (config && config.apiKey) || '',
  '--api-base-url', (config && config.apiBaseUrl) || 'https://api.deepseek.com/v1',
  '--api-model', (config && config.apiModel) || '',
        ];
        const out = execFileSync('node', syncArgs, { encoding: 'utf-8', timeout: 60000 });
        // 解析输出: 今日新增 + 今日更新 条数 + 今日新增的具体内容(用于便签高亮)
        let added = 0, updated = 0;
        let addedContents = [], updatedContents = [];
        const ma = out.match(/今日新增\s+(\d+)\s+条/);
        if (ma) added = parseInt(ma[1], 10);
        const mu = out.match(/今日更新\s+(\d+)\s+条/);
        if (mu) updated = parseInt(mu[1], 10);
        const mcA = out.match(/今日新增内容:\s*(.+)/);
        if (mcA) addedContents = mcA[1].split(';').map(x => x.trim()).filter(Boolean);
        const mcU = out.match(/今日更新内容:\s*(.+)/);
        if (mcU) updatedContents = mcU[1].split(';').map(x => x.trim()).filter(Boolean);
        const info = { time: Date.now(), added: added, updated: updated, addedContents: addedContents, updatedContents: updatedContents };
        lastSyncResult = info;
        log('[sync] 定时拉取成功: 新增=' + added + ' 更新=' + updated + ' | ' + (out.split('\n').filter(Boolean).pop() || ''));
        if (win && !win.isDestroyed()) {
          win.webContents.send('sync-status', info);
        }
      } catch (err) {
        log('[sync] 定时拉取失败: ' + (err.message || err));
        // 临时连接失败不能抹掉当天已累计的新增/更新统计。
        const savedToday = restoreTodaySyncResult();
        const previous = savedToday || lastSyncResult || { added: 0, updated: 0, addedContents: [], updatedContents: [] };
        lastSyncResult = { ...previous, time: Date.now(), error: String(err.message || err) };
        if (win && !win.isDestroyed()) {
          win.webContents.send('sync-status', lastSyncResult);
        }
      }
    };
    // 首次立即拉取, 然后按配置间隔定时
    runSync();
    const syncInterval = (config && config.syncIntervalMs) || SYNC_DEFAULT_INTERVAL;
    log('[sync] 定时拉取已启动, 间隔=' + Math.round(syncInterval/1000) + '秒');
    setInterval(runSync, syncInterval);

    // ==== 腾讯文档待办同步: 监视 userData.json, 变化时通知 renderer 刷新 ====
    let lastMtime = 0;
    try { lastMtime = fs.statSync(filePath).mtimeMs; } catch(e) {}
    setInterval(() => {
      try {
        const m = fs.statSync(filePath).mtimeMs;
        if (m !== lastMtime) {
          lastMtime = m;
          console.log('[sync] userData.json 已更新, 通知 renderer');
          if (win && !win.isDestroyed()) {
            win.webContents.send('todos-synced');
          }
        }
      } catch(e) {}
    }, 3000);

  });

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    log('[second-instance] 检测到第二实例, 聚焦已有窗口');
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      win.show()
    }
  })

}

ipcMain.handle('overhead', (e, flag) => {
  // 置顶始终存在(用户要求): 不管 lock 图标/穿透状态如何, 窗口永远在最上面
  win.setAlwaysOnTop(true);
});

ipcMain.handle('Ignore', (e, flag) => {
  // forward: 穿透时鼠标事件仍转发到窗口, 使 mouseenter/mouseleave 能触发(hover到锁图标即可解锁)
  win.setIgnoreMouseEvents(flag, { forward: flag });
});

ipcMain.handle('minimize', () => {
  win.hide();
});

ipcMain.handle('openConfig', () => { shell.openPath(configPath); });

// ===== 设置弹窗相关 ipc: 读配置/存配置/打开腾讯文档(扫码)/拉取模型 =====
ipcMain.handle('getConfig', () => {
  return config;
});
ipcMain.handle('saveConfig', (e, newCfg) => {
  try {
    const previousDocUrl = (config && config.docUrl) || '';
    config = { ...(config || {}), ...(newCfg || {}) };
    writeConfig(config);
    // 首次设置/更换表格链接：先打开专用调试 Chrome 到该表格，等页面加载后再同步。
    // 这只发生在 docUrl 改变时；常规定时同步不聚焦或移动 Chrome。
    const docChanged = !!config.docUrl && config.docUrl !== previousDocUrl;
    if (docChanged) {
      const chromeCandidates = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
      ];
      const chrome = chromeCandidates.find(p => p && fs.existsSync(p));
      if (chrome) {
        const debugProfile = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Google', 'Chrome', 'DebugProfile9222');
        const args = ['--remote-debugging-port=9222', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', '--user-data-dir=' + debugProfile, config.docUrl];
        spawn(chrome, args, { detached: true, stdio: 'ignore' }).unref();
      }
      // 用户点击保存必须立刻尝试同步；若表格刚启动尚未载入，8 秒后自动补一次。
      try { runSync(); } catch (err) { log('[sync] 保存后立即同步失败: ' + (err.message || err)); }
      setTimeout(() => { try { runSync(); } catch (err) { log('[sync] 表格加载后补充同步失败: ' + (err.message || err)); } }, 8000);
      return { ok: true, openedDoc: true, syncDelayed: true };
    }
    // 只修改 API/模型等配置时，表格已存在，直接立即同步。
    try { runSync(); } catch (err) { log('[sync] 保存后同步失败: ' + (err.message || err)); }
    return { ok: true };
  } catch (err) { return { ok: false, err: String(err) }; }
});
ipcMain.handle('openDoc', (e, url) => {
  try {
    const chromeCandidates = [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
    ];
    const chrome = chromeCandidates.find(p => p && fs.existsSync(p));
    const debugProfile = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Google', 'Chrome', 'DebugProfile9222');
    if (chrome) {
      // Keep the sheet rendering while its tab is in the background. This does not focus or move Chrome.
      const args = ['--remote-debugging-port=9222', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', '--user-data-dir=' + debugProfile];
      if (url) args.push(url);
      spawn(chrome, args, { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, via: 'chrome' };
    }
    if (url) { shell.openExternal(url); return { ok: true, via: 'external' }; }
    return { ok: false, err: '未找到 Chrome, 请手动打开调试Chrome' };
  } catch (err) { return { ok: false, err: String(err) }; }
});
ipcMain.handle('fetchModels', async (e, apiBase, apiKey) => {
  try {
    if (!apiBase) return { ok: false, err: '请先填写中转站地址(apiBaseUrl)' };
    const base = String(apiBase).replace(/\/+$/, '');
    const res = await fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + (apiKey || '') } });
    if (!res.ok) return { ok: false, err: '获取模型失败: HTTP ' + res.status };
    const j = await res.json();
    const ids = ((j && j.data) || []).map(m => m && m.id).filter(Boolean);
    return { ok: true, models: ids };
  } catch (err) { return { ok: false, err: String(err.message || err) }; }
});

ipcMain.handle('loadData', async () => {
  try {
    const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
    // console.log(data);
    // console.log(app.isPackaged);    
    return { data, filePath };
  } catch (err) {
    console.error('loadData error:', err);
    // 返回默认空数据，避免渲染进程崩溃
    return { data: JSON.stringify({ TODO: [], DONE: [] }), filePath };
  }
});

ipcMain.handle('getLastSync', async () => {
  return lastSyncResult;
});

ipcMain.handle('writeFile', async (e, arr) => {
  try {
    // console.log(e);
    const arrs = JSON.stringify(arr);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, arrs, { encoding: 'utf-8' });
    console.log(arrs);
    return { ok: true };
  } catch (err) {
    console.error('writeFile error:', err);
    return { ok: false, error: String(err) };
  }
});

const loadConfig = async () => {
  const data = fs.readFileSync(configPath, { encoding: 'utf-8' });
  return JSON.parse(data)
}
const writeConfig = async (data) => {
  try {
    const config = JSON.stringify(data)
    console.log(config);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, config, { encoding: 'utf-8' });
  } catch (err) {
    console.error('writeConfig error:', err);
  }
}

app.commandLine.appendSwitch('wm-window-animations-disabled');