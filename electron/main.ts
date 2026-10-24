// Electron 主进程 —— 只做壳：拉起本地服务（8666）+ 窗口 + 托盘常驻；业务全在 Next 服务端
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 8666;
const ROOT = app.isPackaged ? process.resourcesPath! : path.join(__dirname, '..');
const DB_PATH = path.join(app.getPath('userData'), 'mitv.db');

let serverProc: ChildProcess | null = null;
let tray: Tray | null = null;
let win: BrowserWindow | null = null;

function probeServer(timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/state', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function spawnServer(): void {
  const env = {
    ...process.env,
    DATABASE_URL: 'file:' + DB_PATH,
    MITV_RESOURCES: path.join(process.resourcesPath ?? ROOT, 'resources'),
    PORT: String(PORT),
  };
  // 首次运行：把随包分发的空库模板落到 userData
  const template = path.join(process.resourcesPath ?? ROOT, 'db-template.db');
  if (!fs.existsSync(DB_PATH) && fs.existsSync(template)) fs.copyFileSync(template, DB_PATH);

  const standalone = app.isPackaged
    ? path.join(process.resourcesPath!, 'standalone', 'server.js')
    : path.join(ROOT, '.next', 'desktop-bundle', 'server.js');
  if (fs.existsSync(standalone)) {
    // 用 Electron 自带 Node 运行 standalone 服务（免依赖系统 Node/Bun）
    serverProc = spawn(process.execPath, [standalone], {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      cwd: path.dirname(standalone),
      stdio: 'ignore',
    });
  } else {
    // 开发机回退：bun next start（需先 bun run build）
    serverProc = spawn('bun', ['run', 'start'], { env, cwd: ROOT, stdio: 'ignore' });
  }
  serverProc.on('exit', () => { serverProc = null; });
}

async function ensureServer(): Promise<void> {
  if (await probeServer()) return; // 已有实例在跑（dev server 或另一份客户端）
  spawnServer();
  for (let i = 0; i < 60; i++) {
    if (await probeServer(800)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  dialog.showErrorBox('MiTV 控制中心', '本地服务启动失败（端口 8666）。请检查是否有旧实例占用。');
  app.quit();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 980, minHeight: 640,
    backgroundColor: '#131318',
    autoHideMenuBar: true,
    title: 'MiTV 控制中心',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('http://127.0.0.1:' + PORT);
  win.on('closed', () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    await ensureServer();
    createWindow();

    // 托盘常驻：关窗不退出
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath!, 'tray.png')
      : path.join(ROOT, 'build', 'tray.png');
    tray = new Tray(iconPath);
    tray.setToolTip('MiTV 控制中心');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示控制面板', click: () => { createWindow(); } },
      { type: 'separator' },
      { label: '退出', click: () => { app.quit(); } },
    ]));
  });

  app.on('window-all-closed', () => { /* 常驻托盘，不退出 */ });
  app.on('before-quit', () => { try { serverProc?.kill(); } catch {} });
}
