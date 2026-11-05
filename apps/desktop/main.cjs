const { app, BrowserWindow, session, nativeTheme, Menu } = require('electron');
const path = require('node:path');
app.setName('AtlasFX');
app.setPath('userData',path.join(app.getPath('appData'),'CorteStudio'));
if (!app.requestSingleInstanceLock()) app.quit();
let mainWindow;
app.on('second-instance',() => { if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();} });
function open() {
  const win = mainWindow = new BrowserWindow({width:1560,height:980,minWidth:1050,minHeight:720,backgroundColor:'#121212',title:'AtlasFX',autoHideMenuBar:true,
    icon:path.join(__dirname,process.platform==='win32'?'logo.ico':'../web/dist/logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  win.loadFile(path.join(__dirname,'../web/dist/index.html'));
  win.on('closed',() => { mainWindow = null; });
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
  open(); app.on('activate',() => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed',() => { if (process.platform !== 'darwin') app.quit(); });
