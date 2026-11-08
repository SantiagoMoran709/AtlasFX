const { app, BrowserWindow, session, nativeTheme, Menu, desktopCapturer, screen, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installSpeech } = require('./speech.cjs');
const renderer = path.join(__dirname, app.isPackaged ? 'dist' : '../web/dist');
const editorUrl = pathToFileURL(path.join(renderer,'index.html')).href;
app.setName('AtlasFX');
app.setPath('userData',path.join(app.getPath('appData'),'CorteStudio'));
if (!app.requestSingleInstanceLock()) app.quit();
let mainWindow;
const stopSpeech = installSpeech(ipcMain,event=>
  event.sender===mainWindow?.webContents && event.senderFrame===event.sender.mainFrame && event.senderFrame?.url===editorUrl);
app.on('before-quit', stopSpeech);
app.on('second-instance',() => { if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();} });
function open() {
  const win = mainWindow = new BrowserWindow({width:1560,height:980,minWidth:1050,minHeight:720,backgroundColor:'#121212',title:'AtlasFX',autoHideMenuBar:true,
    icon:process.platform==='win32'?path.join(__dirname,'logo.ico'):path.join(renderer,'logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  win.loadFile(path.join(renderer,'index.html'));
  win.on('closed',() => { mainWindow = null; });
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  const fromEditor = (contents,details) =>
    contents === mainWindow?.webContents && details.isMainFrame && details.requestingUrl === editorUrl;
  session.defaultSession.setPermissionCheckHandler((contents,permission,_origin,details) =>
    fromEditor(contents,details) && (permission === 'display-capture' || (permission === 'media' && details.mediaType === 'video')));
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details) => {
    callback(fromEditor(contents,details) && (permission === 'display-capture' ||
      (permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video')));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request,callback) => {
    const window = mainWindow;
    if(!window || request.frame !== window.webContents.mainFrame || request.frame.url !== editorUrl ||
        !request.userGesture || !request.videoRequested || request.audioRequested) {
      callback(null);
      return;
    }
    let source;
    try {
      const sources = await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});
      source = sources.find(item=>item.display_id === String(screen.getPrimaryDisplay().id));
      if(source && !window.isDestroyed()){
        const {response} = await dialog.showMessageBox(window,{
          type:'question',message:'¿Grabar la pantalla principal?',
          buttons:['Cancelar','Grabar pantalla'],defaultId:0,cancelId:0,
        });
        if(response!==1)source=undefined;
      }
    } catch {
      source=undefined;
    }
    callback(source && !window.isDestroyed()?{video:source}:null);
  });
  open(); app.on('activate',() => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed',() => { if (process.platform !== 'darwin') app.quit(); });
