import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Page } from 'playwright';
import axios from 'axios';
import { getTempPath } from '..';

/** Playwright chromium.launch 仅支持 Chromium 内核浏览器 */
const CHROMIUM_PROG_IDS: { match: RegExp; label: string }[] = [
  { match: /^ChromeHTML/i, label: 'chrome' },
  { match: /^MSEdgeHTM/i, label: 'edge' },
  { match: /^BraveHTML/i, label: 'brave' },
  { match: /^ChromiumHTM/i, label: 'chromium' },
  { match: /^OperaStable/i, label: 'opera' },
];

function fileExistsSync(p: string): boolean {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
}

function firstExisting(candidates: string[]): string | null {
  for (const p of candidates) {
    if (fileExistsSync(p)) return p;
  }
  return null;
}

function chromeCandidates(): string[] {
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : '',
  ].filter(Boolean);
}

function edgeCandidates(): string[] {
  return [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          'Microsoft',
          'Edge',
          'Application',
          'msedge.exe',
        )
      : '',
  ].filter(Boolean);
}

function braveCandidates(): string[] {
  return [
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          'BraveSoftware',
          'Brave-Browser',
          'Application',
          'brave.exe',
        )
      : '',
  ].filter(Boolean);
}

function regQuery(key: string, valueName?: string): string | null {
  try {
    // /ve = 读取键的默认值；(Default) 在不同语言系统显示名不同
    const args =
      valueName && valueName !== '(Default)'
        ? `reg query "${key}" /v ${valueName}`
        : `reg query "${key}" /ve`;
    const out = execSync(args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const line = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /REG_(SZ|EXPAND_SZ)/i.test(l));
    if (!line) return null;
    const parts = line.split(/\s{2,}/);
    return parts[parts.length - 1]?.trim() || null;
  } catch {
    return null;
  }
}

/** 从 ProgId 的 open 命令里抽出 .exe 路径 */
function exeFromOpenCommand(cmd: string): string | null {
  const quoted = cmd.match(/"([^"]+\.exe)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = cmd.match(/([A-Za-z]:\\[^\s"]+\.exe)/i);
  return bare?.[1] || null;
}

function resolveProgIdExe(progId: string): string | null {
  const cmd =
    regQuery(`HKCR\\${progId}\\shell\\open\\command`) ||
    regQuery(`HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`);
  if (!cmd) return null;
  const exe = exeFromOpenCommand(cmd);
  return exe && fileExistsSync(exe) ? exe : null;
}

/** 读取 Windows「默认打开 http 链接」的浏览器 ProgId */
function getDefaultHttpProgId(): string | null {
  return regQuery(
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
    'ProgId',
  );
}

function isChromiumProgId(progId: string): boolean {
  return CHROMIUM_PROG_IDS.some((x) => x.match.test(progId));
}

/**
 * 可供 Playwright 启动的 Chromium 内核浏览器路径（去重、按优先级）。
 * 优先 Chrome：Electron 提权主进程下 Edge 常出现 launch 后立刻退出。
 */
export async function getChromiumExecutableCandidates(): Promise<string[]> {
  const list: string[] = [];
  const add = (p: string | null | undefined) => {
    if (p && fileExistsSync(p) && !list.includes(p)) list.push(p);
  };

  for (const p of chromeCandidates()) add(p);
  for (const p of edgeCandidates()) add(p);
  for (const p of braveCandidates()) add(p);

  if (process.platform === 'win32') {
    const progId = getDefaultHttpProgId();
    if (progId && isChromiumProgId(progId)) {
      add(resolveProgIdExe(progId));
    }
  }

  for (const bin of ['chrome', 'msedge', 'brave']) {
    try {
      const result = execSync(`where ${bin}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
        .trim()
        .split(/\r?\n/)[0];
      add(result);
    } catch {
      // ignore
    }
  }

  return list;
}

/**
 * 解析单个首选路径（兼容旧调用）。
 * 顺序：Chrome → Edge → Brave → 系统默认 → where
 */
export async function getChromePath(): Promise<string | null> {
  const all = await getChromiumExecutableCandidates();
  return all[0] || null;
}

/** 从 Electron 主进程启动外部浏览器时剔除会污染子进程的环境变量 */
export function envForPlaywrightLaunch(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  return env;
}

export function matcheTargetUrl(targetUrl: string, currentUrl: string): boolean {
  const normalizePath = (pp: string): string =>
    pp !== '/' ? pp.replace(/\/+$/, '') : pp;

  const normalizedTarget = normalizePath(targetUrl);
  const normalizedCurrent = normalizePath(currentUrl);
  const regexPattern = normalizedTarget.replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedCurrent);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream' });
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function checkHasHttpPrefix(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export async function uploadFile(
  page: Page,
  selector: string,
  filePath: string,
): Promise<void> {
  const element = await page.$(selector);
  if (!element) {
    throw new Error('找不到文件上传按钮');
  }

  if (checkHasHttpPrefix(filePath)) {
    const tempDir = path.join(getTempPath(), 'tmpdir');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `upload-${Date.now()}`);
    await downloadFile(filePath, tempFilePath);
    await page.setInputFiles(selector, tempFilePath);
    return;
  }

  const fullPath = path.resolve(filePath);
  if (!(await fileExists(fullPath))) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  await page.setInputFiles(selector, fullPath);
}
