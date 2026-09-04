@echo off
chcp 65001 >nul
echo 启动调试 Chrome(9222) 以便后台读取腾讯文档(不打扰前台)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion --user-data-dir=%LOCALAPPDATA%\Google\Chrome\DebugProfile9222
echo 已启动(后台不节流)。请扫码登录并打开你的表格。
pause
