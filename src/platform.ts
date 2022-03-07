import * as fs from 'fs/promises';
import * as path from 'path';

export enum Platform {
  darwin = 'darwin',
  linux = 'linux',
  windows = 'windows',
  wsl = 'wsl',
}

let idCache: Platform | null = null;

export async function id(): Promise<Platform> {
  if (idCache !== undefined && idCache !== null) {
    return idCache;
  }
  if (process.platform === 'win32') {
    return idCache = Platform.windows;
  }
  else if (process.platform === 'darwin') {
    return idCache = Platform.darwin;
  } else if (await isWslDetected()) {
    return idCache = Platform.wsl;
  }
  // otherwise assume linux
  return idCache = Platform.linux;
}

async function isWslDetected(): Promise<boolean> {
  const has = await Promise.all([
    checkFileForWsl('/proc/sys/kernel/osrelease'),
    checkFileForWsl('/proc/version'),
  ]);
  return has.includes(true);
}

async function checkFileForWsl(filePath: string): Promise<boolean> {
  try {
    const data = (await fs.readFile(filePath)).toString().toLowerCase();
    return data.includes('wsl') || data.includes('microsoft');
  } catch {
    return false;
  }
}

let configurationPathCache: string | null = null;

export async function configurationPath(): Promise<string> {
  if (configurationPathCache !== undefined && configurationPathCache !== null) {
    return configurationPathCache;
  }
  const platform = await id();
  if (platform === Platform.windows) {
    return configurationPathCache = path.join(process.env.APPDATA ?? '', 'Code', 'User');
  } else if (platform === Platform.darwin) {
    return configurationPathCache = path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Code', 'User');
  } else if (platform === Platform.wsl) {
    return configurationPathCache = path.join(process.env.HOME ?? '', '.vscode-server', 'data', 'User');
  }
  // otherwise assume linux
  return configurationPathCache = path.join(process.env.HOME ?? '', '.config', 'Code', 'User');
}
