import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Genera el ZIP desde Windows con Node.js y Electron x64.');
}

const root = path.resolve(import.meta.dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');
const requireDesktop = createRequire(path.join(desktop, 'package.json'));
const electron = requireDesktop('electron');
const { version } = requireDesktop('./package.json');
const output = path.join(root, 'output');
const archiveName = `AtlasFX-${version}-Windows-x64.zip`;
const stage = mkdtempSync(path.join(tmpdir(), 'atlasfx-package-'));
const bundle = path.join(stage, 'AtlasFX');
mkdirSync(output, { recursive: true });
const pending = path.join(output, `.${path.basename(stage)}.zip`);

try {
  cpSync(path.dirname(electron), bundle, { recursive: true });
  // Renaming the executable preserves the original Electron binary.
  renameSync(path.join(bundle, 'electron.exe'), path.join(bundle, 'AtlasFX.exe'));
  renameSync(path.join(bundle, 'electron_wer.dll'), path.join(bundle, 'AtlasFX_wer.dll'));
  rmSync(path.join(bundle, 'resources', 'default_app.asar'), { force: true });
  const app = path.join(bundle, 'resources', 'app');
  mkdirSync(app, { recursive: true });
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({
    name: 'atlasfx',
    productName: 'AtlasFX',
    version,
    main: 'main.cjs',
  }, null, 2));
  cpSync(path.join(desktop, 'main.cjs'), path.join(app, 'main.cjs'));
  for (const file of ['preload.cjs', 'speech.cjs', 'speech.ps1', 'ffmpeg.cjs']) {
    cpSync(path.join(desktop, file), path.join(app, file));
  }
  cpSync(path.join(desktop, 'logo.ico'), path.join(app, 'logo.ico'));
  cpSync(path.join(root, 'apps', 'web', 'dist'), path.join(app, 'dist'), { recursive: true });

  execFileSync('tar.exe', ['-a', '-cf', pending, '-C', stage, 'AtlasFX'], { stdio: 'inherit' });
  const archive = path.join(output, archiveName);
  renameSync(pending, archive);
  console.log(archive);
} finally {
  rmSync(pending, { force: true });
  rmSync(stage, { recursive: true, force: true });
}
