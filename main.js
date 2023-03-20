const path = require('path');
const { app, Menu, Tray, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const filePath = app.isPackaged
  ? path.resolve(path.dirname(app.getPath('exe')), 'resources', 'userData', 'userData.json')
  : path.resolve(__dirname, 'public', 'userData', 'userData.json');
const iconPath = app.isPackaged
  ? path.resolve(__dirname, 'dist', 'memo.ico')
  : path.resolve(__dirname, 'public', 'memo.ico');
const configPath = app.isPackaged
  ? path.resolve(path.dirname(app.getPath('exe')), 'resources', 'configSetting', 'config.json')
  : path.resolve(__dirname, 'public', 'configSetting', 'config.json');


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


const createWindow = () => {
  const win = new BrowserWindow({
    alwaysOnTop: false,
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
    alwaysOnTop: false,
  });
  // win.webContents.openDevTools();

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, './dist/index.html'));
  } else {
    win.loadURL('http://127.0.0.1:5173/');
  }

  win.on('ready-to-show', () => {
    // win.show();
    winState.manage(win);
  });
  return win
};




if (!gotTheLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    tray = new Tray(iconPath);
    config = await loadConfig()
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

  });

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    //输入从第二个实例中接收到的数据
    console.log(additionalData)
    console.log(win);
    //有人试图运行第二个实例，我们应该关注我们的窗口
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      win.show()
    }
  })

}

ipcMain.handle('overhead', (e, flag) => {

  win.setAlwaysOnTop(flag);
  // win.setIgnoreMouseEvents(flag, { forward: true });
});

ipcMain.handle('Ignore', (e, flag) => {

  win.setIgnoreMouseEvents(flag, { forward: flag });
});

ipcMain.handle('minimize', () => {
  win.hide();
});

ipcMain.handle('loadData', async () => {
  const data = await fs.readFileSync(filePath, { encoding: 'utf-8' });
  // console.log(data);
  // console.log(app.isPackaged);    
  return { data, filePath };
});

ipcMain.handle('writeFile', async (e, arr) => {
  // console.log(e);
  let arrs = JSON.stringify(arr);
  await fs.writeFileSync(filePath, arrs, (err) => {
    console.log(err);
  });
  console.log(arrs);
});

const loadConfig = async () => {
  const data = await fs.readFileSync(configPath, { encoding: 'utf-8' });


  return JSON.parse(data)
}
const writeConfig = async (data) => {
  const config = JSON.stringify(data)
  console.log(config);
  await fs.writeFileSync(configPath, config, (err) => {
    console.log(err);
  });
}

app.commandLine.appendSwitch('wm-window-animations-disabled');



