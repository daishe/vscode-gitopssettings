import * as fs from 'fs/promises';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as stringify from 'json-stable-stringify';
import * as vscode from 'vscode';

import * as configuration from './configuration';
import * as exec from './exec';
import * as platform from './platform';
import * as sum from './sum';

// export enum Kind {
enum Kind {
  current = 'current',
  lastImported = 'lastImported',
  stored = 'stored',
}

type KindMap<To> = { current: To, lastImported: To, stored: To };

export class PartialSum {
  constructor(private k: string, private v: string = '') {}
  public get key(): string { return this.k; }
  public get value(): string { return this.v; }
  public equals(other: PartialSum): boolean { return this.k === other.k && this.v === other.v; }
}

export class Sum {
  private partials: PartialSum[];

  constructor(...partials: PartialSum[]) {
    this.partials = partials;
  }

  public equals(other: Sum): boolean {
    return (
      this.partials.length === other.partials.length &&
      this.partials.every((value, index) => value.equals(other.partials[index]))
    );
  }
}

// async function GitKeep.create(at: string): Promise<void> {
//   return await fs.writeFile(path.join(at, '.gitkeep'), '\n', { 'mode': 0o644 });
// }

async function exists(loc: string): Promise<boolean> {
  try {
    await fs.access(loc);
  } catch {
    return false;
  }
  return true;
}

class GitKeep {
  public static async create(at: string): Promise<void> {
    return await fs.writeFile(GitKeep.location(at), '\n', { 'mode': 0o644 });
  }
  public static async exists(at: string): Promise<boolean> {
    return await exists(GitKeep.location(at));
  }
  private static location(parentDir: string): string {
    return path.join(parentDir, '.gitkeep');
  }
}

interface Handler {
  sum(kind: Kind, location: string): Promise<PartialSum>;
  has(kind: Kind, location: string): Promise<boolean>;
  copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void>;
  // remove(kind: Kind, location: string): Promise<void>;
}

class FileSyncHandler implements Handler {
  constructor(private key: string, private kindToSubPath: KindMap<string>) {
  }

  public async sum(kind: Kind, location: string): Promise<PartialSum> {
    const path = this.path(kind, location);
    if (!await exists(path)) {
      return new PartialSum(this.key);
    }
    return new PartialSum(this.key, await sum.file(path));
  }

  public async has(kind: Kind, location: string): Promise<boolean> {
    if (kind === Kind.current) {
      return true;
    }
    return (await Promise.all([
      exists(this.path(kind, location)),
      GitKeep.exists(this.parentDirPath(kind, location)),
    ])).some(e => e);
  }

  public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
    if (!await this.has(fromKind, from)) {
      return;
    }

    const toParentPath = this.parentDirPath(toKind, to);
    await fs.mkdir(toParentPath, { 'recursive': true, 'mode': 0o755 });
    if (toKind !== Kind.current) {
      await GitKeep.create(toParentPath);
    }

    const fromPath = this.path(fromKind, from);
    const toPath = this.path(toKind, to);
    if (await exists(toPath)) {
      await fs.unlink(toPath);
    }
    if (await exists(fromPath)) {
      await fs.copyFile(fromPath, toPath);
    }
    return;
  }

  // public async remove(kind: Kind, location: string): Promise<void> {
  //   if (kind === Kind.current) {
  //     return;
  //   }
  //   const p = this.path(kind, location);
  //   if (await exists(p)) {
  //     return await fs.unlink(p);
  //   }
  //   // return await fs.rm(this.parentDirPath(kind, location), { 'recursive': true, 'force': true });
  // }

  private path(kind: Kind, location: string): string {
    switch (kind) {
      case Kind.current:
        return path.join(location, this.kindToSubPath.current);
      case Kind.lastImported:
        return path.join(location, this.kindToSubPath.lastImported);
      case Kind.stored:
        return path.join(location, this.kindToSubPath.stored);
    }
  }

  private parentDirPath(kind: Kind, location: string): string {
    return path.dirname(this.path(kind, location));
  }
}

class DirectorySyncHandler implements Handler {
  constructor(private key: string, private kindToSubPath: KindMap<string>) {
  }

  public async sum(kind: Kind, location: string): Promise<PartialSum> {
    const path = this.path(kind, location);
    if (!await exists(path)) {
      return new PartialSum(this.key);
    }
    return new PartialSum(this.key, await sum.directory(path, undefined, true));
  }

  public async has(kind: Kind, location: string): Promise<boolean> {
    if (kind === Kind.current) {
      return true;
    }
    return await exists(this.path(kind, location));
  }

  public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
    if (!await this.has(fromKind, from)) {
      return;
    }

    const fromPath = this.path(fromKind, from);
    const toPath = this.path(toKind, to);
    await fs.rm(toPath, { 'recursive': true, 'force': true });
    await fse.copy(fromPath, toPath);
    if (toKind !== Kind.current) {
      await GitKeep.create(toPath);
    }
    return;
  }

  private path(kind: Kind, location: string): string {
    switch (kind) {
      case Kind.current:
        return path.join(location, this.kindToSubPath.current);
      case Kind.lastImported:
        return path.join(location, this.kindToSubPath.lastImported);
      case Kind.stored:
        return path.join(location, this.kindToSubPath.stored);
    }
  }
}

// class SettingsHandler implements Handler {
//   constructor(private conf: configuration.Configuration) {
//   }

//   public async sum(kind: Kind, location: string): Promise<PartialSum> {
//     if (!await this.has(kind, location)) {
//       return new PartialSum('settings');
//     }
//     return new PartialSum('settings', await sum.file(this.path(kind, location)));
//   }

//   public async has(kind: Kind, location: string): Promise<boolean> {
//     if (!this.conf.synchronizeSettings) {
//       return false;
//     }
//     try {
//       await fs.access(this.path(kind, location));
//     } catch {
//       return false;
//     }
//     return true;
//   }

//   public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
//     if (!await this.has(fromKind, from)) {
//       return;
//     }
//     await this.mkDst(toKind, to);
//     return await fs.copyFile(this.path(fromKind, from), this.path(toKind, to));
//   }

//   public async remove(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     return await fs.rm(path.join(location, 'settings'), {'recursive': true, 'force': true});
//   }

//   private path(kind: Kind, location: string): string {
//     if (kind === Kind.current) {
//       return path.join(location, 'settings.json');
//     }
//     return path.join(location, 'settings', 'settings.json');
//   }

//   private async mkDst(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     await fs.mkdir(path.join(location, 'settings'), {'recursive': true, 'mode': 0o755});
//     return;
//   }
// }

// class KeyBindingsHandler implements Handler {
//   constructor(private conf: configuration.Configuration) {
//   }

//   public async sum(kind: Kind, location: string): Promise<PartialSum> {
//     if (!await this.has(kind, location)) {
//       return new PartialSum('keyBindings');
//     }
//     return new PartialSum('keyBindings', await sum.file(this.path(kind, location)));
//   }

//   public async has(kind: Kind, location: string): Promise<boolean> {
//     if (!this.conf.synchronizeKeyboardShortcuts) {
//       return false;
//     }
//     try {
//       await fs.access(this.path(kind, location));
//     } catch {
//       return false;
//     }
//     return true;
//   }

//   public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
//     if (!await this.has(fromKind, from)) {
//       return;
//     }
//     await this.mkDst(toKind, to);
//     return await fs.copyFile(this.path(fromKind, from), this.path(toKind, to));
//   }

//   public async remove(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     return await fs.rm(path.join(location, 'keyboardShortcuts'), {'recursive': true, 'force': true});
//   }

//   private path(kind: Kind, location: string): string {
//     if (kind === Kind.current) {
//       return path.join(location, 'keybindings.json');
//     }
//     return path.join(location, 'keyboardShortcuts', 'keybindings.json');
//   }

//   private async mkDst(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     await fs.mkdir(path.join(location, 'keyboardShortcuts'), {'recursive': true, 'mode': 0o755});
//     return;
//   }
// }

// class SnippetsHandler implements Handler {
//   constructor(private conf: configuration.Configuration) {
//   }

//   public async sum(kind: Kind, location: string): Promise<PartialSum> {
//     if (!await this.has(kind, location)) {
//       return new PartialSum('snippets');
//     }
//     return new PartialSum('snippets', await sum.directory(this.path(kind, location), undefined, true));
//   }

//   public async has(kind: Kind, location: string): Promise<boolean> {
//     if (!this.conf.synchronizeUserSnippets) {
//       return false;
//     }
//     try {
//       await fs.access(this.path(kind, location));
//     } catch {
//       return false;
//     }
//     return true;
//   }

//   public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
//     if (!await this.has(fromKind, from)) {
//       return;
//     }
//     await fse.copy(this.path(fromKind, from), this.path(toKind, to));
//     if (toKind !== Kind.current) {
//       await GitKeep.create(this.path(toKind, to));
//     }
//     return;
//   }

//   public async remove(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     return await fs.rm(this.path(kind, location), {'recursive': true, 'force': true});
//   }

//   private path(kind: Kind, location: string): string {
//     return path.join(location, 'snippets');
//   }
// }

// class TasksHandler implements Handler {
//   constructor(private conf: configuration.Configuration) {
//   }

//   public async sum(kind: Kind, location: string): Promise<PartialSum> {
//     if (!await this.has(kind, location)) {
//       return new PartialSum('tasks');
//     }
//     return new PartialSum('tasks', await sum.file(this.path(kind, location)));
//   }

//   public async has(kind: Kind, location: string): Promise<boolean> {
//     if (!this.conf.synchronizeUserTasks) {
//       return false;
//     }
//     try {
//       await fs.access(this.path(kind, location));
//     } catch {
//       return false;
//     }
//     return true;
//   }

//   public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
//     if (!await this.has(fromKind, from)) {
//       return;
//     }
//     await this.mkDst(toKind, to);
//     return await fs.copyFile(this.path(fromKind, from), this.path(toKind, to));
//   }

//   public async remove(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     return await fs.rm(path.join(location, 'tasks'), {'recursive': true, 'force': true});
//   }

//   private path(kind: Kind, location: string): string {
//     if (kind === Kind.current) {
//       return path.join(location, 'tasks.json');
//     }
//     return path.join(location, 'tasks', 'tasks.json');
//   }

//   private async mkDst(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     await fs.mkdir(path.join(location, 'tasks'), {'recursive': true, 'mode': 0o755});
//     return;
//   }
// }

class ExtensionData {
  constructor(public name: string = '', public enabled: boolean = false) {
  }
}

class VSCodeError extends Error {
  constructor(private cause: Error | null, msg: string) {
    super(msg);
    Object.setPrototypeOf(this, VSCodeError.prototype);
  }
  public unwrap(): Error | null {
    return this.cause;
  }
}

class ExtensionsHandler implements Handler {
  constructor(private key: string, private kindToSubPath: KindMap<string>) {
  }

  public async sum(kind: Kind, location: string): Promise<PartialSum> {
    if (kind !== Kind.current && !await exists(this.path(kind, location))) {
      return new PartialSum(this.key);
    }
    const hash = await sum.data(stringify(await this.data(kind, location)));
    return new PartialSum(this.key, hash);
  }

  public async has(kind: Kind, location: string): Promise<boolean> {
    if (kind === Kind.current) {
      return true;
    }
    return await exists(this.path(kind, location));
  }

  public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
    if (!await this.has(fromKind, from)) {
      return;
    }
    const fromData = await this.data(fromKind, from);
    if (toKind === Kind.current) {
      const toData = await this.data(toKind, to);
      await this.install(fromData, toData);
      await this.uninstall(fromData, toData);
      return;
    } else {
      const toParentPath = this.parentDirPath(toKind, to);
      await fs.mkdir(toParentPath, { 'recursive': true, 'mode': 0o755 });
      const toPath = this.path(toKind, to);
      await fs.writeFile(toPath, stringify(fromData, { space: 3 }), { 'mode': 0o644 });
      return;
    }
  }

  private async vsCodeStdout(args: string[], location: string): Promise<string> {
    let cmd = 'code';
    if (process.platform === 'win32') {
      cmd = 'code.cmd';
    }
    const res = await new exec.Process([cmd, ...args]).cwd(location).run();
    if (res.isError) {
      throw new VSCodeError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return res.stdout;
  }

  private async data(kind: Kind, location: string): Promise<ExtensionData[]> {
    let li: ExtensionData[] = [];
    if (kind === Kind.current) {
      const enabled = vscode.extensions.all
        .map(e => e.id);
      const builtin = vscode.extensions.all
        .filter(e => e.packageJSON.isBuiltin)
        .map(e => e.id);
      li = (await this.vsCodeStdout(['--list-extensions'], location))
        .split('\n')
        .map(n => n.trim())
        .filter(n => n !== '')
        .filter(n => !builtin.includes(n))
        .map(n => new ExtensionData(n, enabled.includes(n)));
    } else {
      const stringified = (await fs.readFile(this.path(kind, location))).toString();
      li = JSON.parse(stringified) as ExtensionData[];
    }
    li.forEach(ed => ed.enabled = true); // synchronization of enabled/disables state is not supported - to correctly hash data override enabled state with true
    return li.sort((ed0, ed1) => ed0.name > ed1.name ? 1 : -1);
  }

  private path(kind: Kind, location: string): string {
    switch (kind) {
      case Kind.current:
        return path.join(location, this.kindToSubPath.current);
      case Kind.lastImported:
        return path.join(location, this.kindToSubPath.lastImported);
      case Kind.stored:
        return path.join(location, this.kindToSubPath.stored);
    }
  }

  private parentDirPath(kind: Kind, location: string): string {
    return path.dirname(this.path(kind, location));
  }

  private async install(dst: ExtensionData[], src: ExtensionData[]): Promise<void> {
    const srcNames = src.map(ed => ed.name);
    const dstNames = dst.map(ed => ed.name);
    const toInstall = dstNames.filter(n => !srcNames.includes(n));
    for (const name of toInstall) {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', name);
    }
    return;
  }

  private async uninstall(dst: ExtensionData[], src: ExtensionData[]): Promise<void> {
    const srcNames = src.map(ed => ed.name);
    const dstNames = dst.map(ed => ed.name);
    const toUninstall = srcNames.filter(n => !dstNames.includes(n));
    for (const name of toUninstall) {
      await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', name);
    }
    return;
  }
}

// class UiStateHandler implements Handler {
//   constructor(private conf: configuration.Configuration) {
//   }

//   public async sum(kind: Kind, location: string): Promise<PartialSum> {
//     if (!await this.has(kind, location)) {
//       return new PartialSum('uiState');
//     }
//     return new PartialSum('uiState', await sum.file(this.path(kind, location)));
//   }

//   public async has(kind: Kind, location: string): Promise<boolean> {
//     if (!this.conf.synchronizeUiState) {
//       return false;
//     }
//     try {
//       await fs.access(this.path(kind, location));
//     } catch {
//       return false;
//     }
//     return true;
//   }

//   public async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
//     if (!await this.has(fromKind, from)) {
//       return;
//     }
//     await this.mkDst(toKind, to);
//     return await fs.copyFile(this.path(fromKind, from), this.path(toKind, to));
//   }

//   public async remove(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     return await fs.rm(path.join(location, 'uiState'), {'recursive': true, 'force': true});
//   }

//   private path(kind: Kind, location: string): string {
//     if (kind === Kind.current) {
//       return path.join(location, 'globalStorage', 'state.vscdb');
//     }
//     return path.join(location, 'uiState', 'state.vscdb');
//   }

//   private async mkDst(kind: Kind, location: string): Promise<void> {
//     if (kind === Kind.current) {
//       return;
//     }
//     await fs.mkdir(path.join(location, 'uiState'), {'recursive': true, 'mode': 0o755});
//     return;
//   }
// }

export class Warehouse {
  private handlers: Handler[] = [];

  constructor(private context: vscode.ExtensionContext, private conf: configuration.Configuration) {
    const mkSubPaths = (pref: string | null | undefined, final: string) => {
      if (pref === null || pref === undefined) {
        return { current: final, lastImported: final, stored: final } as KindMap<string>;
      }
      const p = path.join(pref, final);
      return { current: final, lastImported: p, stored: p } as KindMap<string>;
    };

    if (conf.synchronizeSettings) {
      this.handlers.push(new FileSyncHandler('settings', mkSubPaths('settings', 'settings.json')));
    }
    if (conf.synchronizeKeyboardShortcuts) {
      this.handlers.push(new FileSyncHandler('keyboardShortcuts', mkSubPaths('keyboardShortcuts', 'keybindings.json')));
    }
    if (conf.synchronizeUserSnippets) {
      this.handlers.push(new DirectorySyncHandler('snippets', mkSubPaths(null, 'snippets')));
    }
    if (conf.synchronizeUserTasks) {
      this.handlers.push(new FileSyncHandler('tasks', mkSubPaths('tasks', 'tasks.json')));
    }
    if (conf.synchronizeExtensions) {
      this.handlers.push(new ExtensionsHandler('extensions', mkSubPaths('extensions', 'extensions.json')));
    }
  }

  private async location(kind: Kind): Promise<string> {
    if (kind === Kind.current) {
      return await platform.configurationPath();
    } else if (kind === Kind.lastImported) {
      let globalStoragePath = this.context.globalStorageUri.path;
      if (await platform.id() === platform.Platform.windows) {
        if (globalStoragePath.startsWith('/') || globalStoragePath.startsWith('\\')) {
          globalStoragePath = globalStoragePath.slice(1);
        }
      }
      return path.join(globalStoragePath, 'last-imported');
    }
    // kind === Kind.stored
    return this.conf.storageDirectory;
  }

  // public async isNoOpCopy(fromKind: Kind, toKind: Kind): Promise<boolean> {
  //   const [from, to] = await Promise.all([
  //     this.location(fromKind),
  //     this.location(toKind),
  //   ]);

  //   const has = await Promise.all(
  //     this.handlers.map(h => h.has(fromKind, from))
  //   );
  //   const handlers = this.handlers.filter((h, idx) => has[idx]);

  //   const [fromSum, toSum] = await Promise.all([
  //     Warehouse.sum(handlers, fromKind, from),
  //     Warehouse.sum(handlers, toKind, to),
  //   ]);
  //   return fromSum.equals(toSum);
  // }

  public async sumOfCurrent(): Promise<Sum> {
    return await this.sum(Kind.current, await this.location(Kind.current));
  }

  public async sumOfLastImported(): Promise<Sum> {
    return await this.sum(Kind.lastImported, await this.location(Kind.lastImported));
  }

  public async sumOfStored(): Promise<Sum> {
    return await this.sum(Kind.stored, await this.location(Kind.stored));
  }

  private async sum(kind: Kind, location: string): Promise<Sum> {
    const partials = await Promise.all(this.handlers.map(h => h.sum(kind, location)));
    return new Sum(...partials);
  }

  // private static async sum(handlers: Handler[], kind: Kind, location: string): Promise<Sum> {
  //   const partials = await Promise.all(handlers.map(h => h.sum(kind, location)));
  //   return new Sum(...partials);
  // }

  public async importStored(): Promise<void> {
    await this.copy(Kind.stored, await this.location(Kind.stored), Kind.current, await this.location(Kind.current));
    await this.refreshLastImported();
  }

  public async reimportLastImported(): Promise<void> {
    await this.copy(Kind.lastImported, await this.location(Kind.lastImported), Kind.current, await this.location(Kind.current));
  }

  public async refreshLastImported(): Promise<void> {
    const lastImportedLocation = await this.location(Kind.lastImported);
    await fs.mkdir(lastImportedLocation, { 'recursive': true, 'mode': 0o755 });
    await this.copy(Kind.current, await this.location(Kind.current), Kind.lastImported, lastImportedLocation);
  }

  public async exportCurrent(path: string): Promise<void> {
    await fs.mkdir(path, {'recursive': true, 'mode': 0o755});
    await this.copy(Kind.current, await this.location(Kind.current), Kind.stored, path);
  }

  private async copy(fromKind: Kind, from: string, toKind: Kind, to: string): Promise<void> {
    await Promise.all(this.handlers.map(h => h.copy(fromKind, from, toKind, to)));
    return;
  }
}
