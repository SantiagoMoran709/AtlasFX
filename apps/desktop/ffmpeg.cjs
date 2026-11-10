const { spawn, execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const { mkdtemp, open, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

function installFFmpeg(ipc, isEditor, app) {
  const executable = [
    process.env.ATLASFX_FFMPEG,
    path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe'),
    ...(process.env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir.replace(/^"|"$/g, ''), 'ffmpeg.exe')),
  ].find(file => file && path.isAbsolute(file) && existsSync(file));
  let available;
  function probe() {
    return available ??= new Promise(resolve => {
      if (!executable) return resolve(false);
      execFile(executable, ['-hide_banner', '-encoders'], { windowsHide: true, timeout: 5000 },
        (error, stdout) => resolve(!error && /\blibx264\s/.test(stdout) && /\baac\s/.test(stdout)));
    });
  }

  let job;
  let starting = false;
  let generation = 0;
  const handle = (name, run) => ipc.handle(`atlasfx:ffmpeg-${name}`, (event, ...args) => {
    if (!isEditor(event)) throw new Error('Origen de exportación no autorizado.');
    return run(...args);
  });
  async function discard() {
    generation++;
    const current = job;
    if (!current) return;
    job = undefined;
    current.process.stdin.destroy();
    current.process.kill();
    await current.closed;
    await rm(current.dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
  handle('available', probe);
  handle('start', async (bitrate, fps) => {
    if (job || starting) throw new Error('Ya hay una exportación nativa en curso.');
    if (!Number.isInteger(bitrate) || bitrate < 100_000 || bitrate > 100_000_000 ||
        !Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error('Ajustes de exportación no válidos.');
    starting = true;
    const request = generation;
    try {
      if (!await probe()) throw new Error('Se necesita FFmpeg con los codificadores libx264 y AAC.');
      const dir = await mkdtemp(path.join(tmpdir(), 'atlasfx-export-'));
      if (request !== generation) {
        await rm(dir, { recursive: true, force: true });
        throw new Error('Exportación cancelada.');
      }
      const output = path.join(dir, 'render.mp4');
      const child = spawn(executable, [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror',
        '-protocol_whitelist', 'pipe', '-f', 'matroska', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(bitrate),
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output,
      ], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      const current = job = { dir, output, process: child, finished: false, writing: false, error: '' };
      child.stdin.on('error', error => { current.error ||= error.message; });
      child.on('error', error => { current.error ||= error.message; });
      child.stderr.on('data', chunk => { current.error = (current.error + chunk).slice(-2048); });
      current.closed = new Promise(resolve => child.once('close', resolve));
    } finally { starting = false; }
  });
  handle('write', async bytes => {
    const current = job;
    if (!current || current.finished || current.writing || !(bytes instanceof ArrayBuffer) ||
        bytes.byteLength > 1024 * 1024 || !bytes.byteLength) throw new Error('Bloque de exportación no válido.');
    current.writing = true;
    try {
      await new Promise((resolve, reject) => current.process.stdin.write(Buffer.from(bytes),
        error => error ? reject(new Error(current.error || error.message)) : resolve()));
    } finally { current.writing = false; }
  });
  handle('finish', async () => {
    const current = job;
    if (!current || current.finished || current.writing) throw new Error('No hay una exportación para finalizar.');
    current.finished = true;
    current.process.stdin.end();
    if (await current.closed !== 0) throw new Error(current.error || 'FFmpeg no pudo codificar el video.');
    const file = await open(current.output);
    try { return (await file.stat()).size; } finally { await file.close(); }
  });
  handle('read', async offset => {
    const current = job;
    if (!current?.finished || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Lectura de exportación no válida.');
    const file = await open(current.output);
    try {
      const bytes = new Uint8Array(1024 * 1024);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
      return bytes.buffer.slice(0, bytesRead);
    } finally { await file.close(); }
  });
  handle('discard', discard);
  return discard;
}

module.exports = { installFFmpeg };
