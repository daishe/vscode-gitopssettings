import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export async function directory(dirPath: string, base?: string, skipGitKeep: boolean = false): Promise<string> {
  if (base === undefined || base === null) {
    base = dirPath;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const res = await Promise.all(entries.map((entry) => {
    const fullPath = path.resolve(dirPath, entry.name);
    if (skipGitKeep && (entry.name === '.gitkeep' || entry.name === '.keep')) {
      return '';
    } else if (entry.isDirectory()) {
      return directory(fullPath, base, false);
    } else if (entry.isFile()) {
      return file(fullPath, base);
    }
    return '';
  }));
  const hash = newHash();
  hash.update(trimName(dirPath, base));
  hash.update('\n');
  res.sort().forEach(h => hash.update(h));
  return hash.digest('hex');
}

export function file(filePath: string, base?: string): Promise<string> {
  if (base === undefined || base === null) {
    base = path.dirname(filePath);
  }

  return new Promise<string>((resolve, reject) => {
    base = base as string; // make typescript checker happy
    const hash = newHash();
    const input = fsSync.createReadStream(filePath);
    hash.update(trimName(filePath, base));
    hash.update('\n');
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('close', () => resolve(hash.digest('hex')));
  });
}

export function data(content: string): Promise<string> {
  return new Promise<string>((resolve, _) => {
    return resolve(newHash().update(content).digest('hex'));
  });
}

export function dataFile(content: string, filePath: string, base?: string): Promise<string> {
  if (base === undefined || base === null) {
    base = path.dirname(filePath);
  }

  return new Promise<string>((resolve, _) => {
    base = base as string; // make typescript checker happy
    const hash = newHash();
    hash.update(trimName(filePath, base));
    hash.update('\n');
    hash.update(content);
    return resolve(hash.digest('hex'));
  });
}

function trimName(loc: string, base: string): string {
  if (loc.startsWith(base)) {
    loc = loc.slice(base.length);
  }
  if (loc.startsWith('/')) {
    loc = loc.slice(1);
  }
  if (loc.startsWith('\\')) {
    loc = loc.slice(1);
  }
  return loc;
}

function newHash(): crypto.Hash {
  // return crypto.createHash('md5');
  // return crypto.createHash('sha1');
  return crypto.createHash('sha256');
}
