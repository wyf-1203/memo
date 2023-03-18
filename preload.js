const { contextBridge, ipcRenderer } = require('electron');

const loadData = async () => {
  let data = await ipcRenderer.invoke('loadData');
  // console.log(data);
  return data;
};
const writeFile = async (arr) => {
  ipcRenderer.invoke('writeFile', arr);
  console.log(arr);
};
const minimize = () => {
  ipcRenderer.invoke('minimize');
};

const overhead = (flag) => {
  console.log(flag);
  ipcRenderer.invoke('overhead', flag);
};

const Ignore = (flag) => {
  ipcRenderer.invoke('Ignore', flag);
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
});
