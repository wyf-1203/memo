const path = require('path');
const { app, Menu, Tray, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const filePath = app.isPackaged
  ? path.resolve(process.cwd(), 'resources', 'userData', 'userData.json')
  : path.resolve(__dirname, 'public', 'userData', 'userData.json');
const iconPath = app.isPackaged
  ? path.resolve(__dirname, 'dist', 'memo.ico')
  : path.resolve(__dirname, 'public', 'memo.ico');

// const iconPath = path.resolve(__dirname, 'dist', 'memo.ico');
// const filePath =    process.cwd(),
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
    alwaysOnTop: false,
  });
  win.webContents.openDevTools();

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, './dist/index.html'));
  } else {
    win.loadURL('http://127.0.0.1:5173/');
  }

  ipcMain.handle('overhead', (e, flag) => {
    console.log(flag);
    win.setAlwaysOnTop(flag);
    // win.setIgnoreMouseEvents(flag, { forward: true });
  });

  ipcMain.handle('Ignore', (e, flag) => {
    console.log(flag);
    // win.setAlwaysOnTop(true);
    win.setIgnoreMouseEvents(flag, { forward: flag });
  });

  ipcMain.handle('minimize', () => {
    console.log('minimize');
    // win.minimize();
    win.hide();
  });
  tray.on('click', () => {
    win.show();
  });
};
let tray = null;
app.whenReady().then(() => {
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: '开机自启动', type: 'checkbox', checked: true },
    { label: '预留1', type: 'checkbox' },
    { label: '预留2', type: 'checkbox', checked: true },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setToolTip('桌面便签');
  tray.setContextMenu(contextMenu);
  createWindow();
});
app.commandLine.appendSwitch('wm-window-animations-disabled');

ipcMain.handle('loadData', async () => {
  const data = await fs.readFileSync(filePath, { encoding: 'utf-8' });
  // console.log(data);
  // console.log(app.isPackaged);
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
