const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const filePath = path.resolve(__dirname, 'dist', 'userData', 'userData.json');
// const filePath = path.resolve(
//   process.cwd(),
//   'resources',
//   'userData',
//   'userData.json'
// );

const createWindow = () => {
  const win = new BrowserWindow({
    alwaysOnTop: false,
    width: 400,
    height: 350,
    minWidth: 350,
    minHeight: 300,
    // frame: false,
    // backgroundColor: 'rgba(40, 37, 45, 0.4)',
    backgroundColor: 'rgba(12, 12, 12,.5)',
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
  });
  win.webContents.openDevTools();

  win.loadURL('http://127.0.0.1:5173/');
  // win.loadFile(path.join(__dirname, './dist/index.html'));
};

app.whenReady().then(() => {
  createWindow();
});
ipcMain.handle('loadData', async () => {
  const data = await fs.readFileSync(filePath, { encoding: 'utf-8' });
  // console.log(data);
  console.log(app.isPackaged);
  return data;
});

ipcMain.handle('writeFile', async (e, arr) => {
  // console.log(e);
  let arrs = JSON.stringify(arr);
  await fs.writeFileSync(filePath, arrs, (err) => {
    console.log(err);
  });
  console.log(arrs);
});
