const { app, BrowserWindow, session, nativeTheme, Menu, desktopCapturer, screen, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { realpathSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const { installSpeech } = require('./speech.cjs');
const { installFFmpeg } = require('./ffmpeg.cjs');
const renderer = path.join(__dirname, app.isPackaged ? 'dist' : '../web/dist');
const editorFile = path.join(renderer,'index.html');
function isEditorUrl(url) {
  try {
    return path.relative(realpathSync(editorFile),realpathSync(fileURLToPath(url)))==='';
  } catch { return false; }
}
app.setName('AtlasFX');
const userDataDir=app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData',path.isAbsolute(userDataDir)?userDataDir:path.join(app.getPath('appData'),'CorteStudio'));
if (!app.requestSingleInstanceLock()) app.quit();
let mainWindow;
const isEditor = event =>
  event.sender===mainWindow?.webContents && event.senderFrame===event.sender.mainFrame && isEditorUrl(event.senderFrame?.url);
const stopSpeech = installSpeech(ipcMain,isEditor);
const discardExport = installFFmpeg(ipcMain,isEditor,app);
app.on('before-quit', stopSpeech);
app.on('second-instance',() => { if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();} });
function open() {
  const win = mainWindow = new BrowserWindow({width:1560,height:980,minWidth:1050,minHeight:720,backgroundColor:'#121212',title:'AtlasFX',autoHideMenuBar:true,
    icon:process.platform==='win32'?path.join(__dirname,'logo.ico'):path.join(renderer,'logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  let allowClose=false;
  let closeId=0;
  let closeTimer;
  function finishCloseRequest() {
    clearTimeout(closeTimer);
    closeTimer=undefined;
  }
  async function closeResult(event,id,saved) {
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||
        !isEditorUrl(event.senderFrame?.url)||!closeTimer||id!==closeId)return;
    finishCloseRequest();
    if(saved===true){
      await discardExport().catch(console.error);
      if(win.isDestroyed())return;
      allowClose=true;
      win.close();
    }
  }
  ipcMain.on('atlasfx:close-result',closeResult);
  win.on('close',event=>{
    if(allowClose||win.webContents.isCrashed()||!isEditorUrl(win.webContents.getURL()))return;
    event.preventDefault();
    if(closeTimer)return;
    closeTimer=setTimeout(()=>{
      finishCloseRequest();
      void dialog.showMessageBox(win,{type:'warning',message:'AtlasFX no pudo confirmar el guardado. La ventana seguirá abierta.'});
    },15000);
    win.webContents.send('atlasfx:close-requested',++closeId);
  });
  win.webContents.on('will-prevent-unload',()=>{allowClose=false;});
  win.loadFile(editorFile);
  win.on('closed',() => {
    finishCloseRequest();
    ipcMain.removeListener('atlasfx:close-result',closeResult);
    mainWindow = null;
    void discardExport().catch(console.error);
  });
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  const fromEditor = (contents,details) =>
    contents === mainWindow?.webContents && details.isMainFrame && isEditorUrl(details.requestingUrl);
  session.defaultSession.setPermissionCheckHandler((contents,permission,_origin,details) =>
    fromEditor(contents,details) && (permission === 'display-capture' || (permission === 'media' && details.mediaType === 'video')));
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details) => {
    callback(fromEditor(contents,details) && (permission === 'display-capture' ||
      (permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video')));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request,callback) => {
    const window = mainWindow;
    if(!window || request.frame !== window.webContents.mainFrame || !isEditorUrl(request.frame.url) ||
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
