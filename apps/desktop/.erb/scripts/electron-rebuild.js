import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { dependencies } from '../../release/app/package.json';
import webpackPaths from '../configs/webpack.paths';

function hasSqliteBinding(appPath) {
  const bindingRoot = path.join(
    appPath,
    'node_modules',
    'sqlite3',
    'lib',
    'binding',
  );
  if (!fs.existsSync(bindingRoot)) return false;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name.endsWith('.node')) return true;
      if (fs.statSync(full).isDirectory() && walk(full)) return true;
    }
    return false;
  };
  return walk(bindingRoot);
}

function resolvePython() {
  if (process.env.PYTHON && fs.existsSync(process.env.PYTHON)) {
    return process.env.PYTHON;
  }
  try {
    const out = execSync('py -3 -c "import sys; print(sys.executable)"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out && fs.existsSync(out) && !out.includes('WindowsApps')) {
      return out;
    }
  } catch {
    // ignore
  }
  return null;
}

if (
  Object.keys(dependencies || {}).length > 0 &&
  fs.existsSync(webpackPaths.appNodeModulesPath)
) {
  const python = resolvePython();
  if (python) {
    process.env.PYTHON = python;
    process.env.npm_config_python = python;
  }

  // Avoid --force: sqlite3 uses N-API prebuilds; forced rebuild needs MSVC.
  const electronRebuildCmd =
    '../../node_modules/.bin/electron-rebuild --types prod,dev,optional --module-dir .';
  const cmd =
    process.platform === 'win32'
      ? electronRebuildCmd.replace(/\//g, '\\')
      : electronRebuildCmd;
  try {
    execSync(cmd, {
      cwd: webpackPaths.appPath,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    if (hasSqliteBinding(webpackPaths.appPath)) {
      console.warn(
        '[electron-rebuild] Rebuild failed, but sqlite3 N-API binding exists; continuing.',
      );
    } else {
      throw err;
    }
  }
}
