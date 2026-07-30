import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Page } from 'playwright';
import axios from 'axios';
import { getTempPath } from '..';

export async function getChromePath(): Promise<string | null> {
  const candidates = [
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

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const result = execSync('where chrome', { stdio: 'pipe' })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    if (result && fs.existsSync(result)) return result;
  } catch {
    // ignore
  }

  return null;
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
