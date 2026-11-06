const { app, BrowserWindow, session, nativeTheme, Menu, ipcMain, utilityProcess } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const renderer = path.join(__dirname, app.isPackaged ? 'dist' : '../web/dist');
const rendererUrl = pathToFileURL(path.join(renderer, 'index.html')).href;
app.setName('AtlasFX');
app.setPath('userData',path.join(app.getPath('appData'),'CorteStudio'));
if (!app.requestSingleInstanceLock()) app.quit();
let mainWindow;
let transcribing = false;
if (!app.isPackaged) {
  ipcMain.handle('atlasfx:transcribe', async (event, audio, language) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame?.url !== rendererUrl) {
      throw new Error('Origen de transcripción no autorizado.');
    }
    if (!(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 300 ||
        !['spanish', 'english', 'auto'].includes(language)) {
      throw new Error('Audio o idioma no válido.');
    }
    if (transcribing) throw new Error('Ya hay una transcripción en curso.');
    transcribing = true;
    try {
      const worker = utilityProcess.fork(path.join(__dirname, 'transcribe.mjs'), [], {
        env: {...process.env, ATLASFX_MODEL_CACHE:path.join(app.getPath('userData'), 'speech-models')},
      });
      try {
        return await new Promise((resolve, reject) => {
          worker.once('exit', () => reject(new Error('El motor de transcripción se cerró.')));
          worker.once('message', result => {
            if (result.error) reject(new Error(result.error));
            else resolve(result.chunks);
          });
          worker.once('spawn', () => worker.postMessage({audio, language}));
        });
      } finally {
        worker.kill();
      }
    } finally {
      transcribing = false;
    }
  });
}
app.on('second-instance',() => { if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();} });
function open() {
  const win = mainWindow = new BrowserWindow({width:1560,height:980,minWidth:1050,minHeight:720,backgroundColor:'#121212',title:'AtlasFX',autoHideMenuBar:true,
    icon:process.platform==='win32'?path.join(__dirname,'logo.ico'):path.join(renderer,'logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,
      preload:app.isPackaged?undefined:path.join(__dirname,'preload.cjs')}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  win.loadFile(path.join(renderer,'index.html'));
  win.on('closed',() => { mainWindow = null; });
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
  open(); app.on('activate',() => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed',() => { if (process.platform !== 'darwin') app.quit(); });
