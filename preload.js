const { contextBridge, ipcRenderer } = require('electron');

const loadData = async () => {
  let { data, filePath } = await ipcRenderer.invoke('loadData');
  // console.log(filePath);
  return data;
};
const writeFile = async (arr) => {
  return ipcRenderer.invoke('writeFile', arr);
};
const minimize = () => {
  ipcRenderer.invoke('minimize');
};

const overhead = (flag) => {
  // console.log(flag);
  ipcRenderer.invoke('overhead', flag);
};

const Ignore = (flag) => {
  ipcRenderer.invoke('Ignore', flag);
};

// 监听主进程同步完成事件(腾讯文档待办已写入 userData.json)
const onTodosSynced = (callback) => {
  ipcRenderer.on('todos-synced', () => {
    callback();
  });
};

// 监听主进程定时拉取完成事件(携带 时间 + 新增条数)
const onSyncStatus = (callback) => {
  ipcRenderer.on('sync-status', (event, info) => {
    callback(info);
  });
};

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});
contextBridge.exposeInMainWorld('myApi', {
  loadData: loadData,
  writeFile: writeFile,
  minimize: minimize,
  overhead: overhead,
  Ignore: Ignore,
  onTodosSynced: onTodosSynced,
  onSyncStatus: onSyncStatus,
  getLastSync: () => ipcRenderer.invoke('getLastSync'),
  openConfig: () => ipcRenderer.invoke('openConfig'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  saveConfig: (cfg) => ipcRenderer.invoke('saveConfig', cfg),
  openDoc: (url) => ipcRenderer.invoke('openDoc', url),
  fetchModels: (apiBase, apiKey) => ipcRenderer.invoke('fetchModels', apiBase, apiKey),
});