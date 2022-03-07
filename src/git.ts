import * as fs from 'fs/promises';
import * as path from 'path';

import * as exec from './exec';

export class OperationError extends Error {
  constructor(private cause: Error | null, msg: string) {
    super(msg);
    Object.setPrototypeOf(this, OperationError.prototype);
  }
  public unwrap(): Error | null {
    return this.cause;
  }
}

export class Operations {
  public root: string = '';

  constructor() {
  }

  public async findRoot(innerPath: string): Promise<void> {
    let check = innerPath;
    while (check !== '' && check !== '/' && !(/^[a-z]:(\\\\?|\/\/?)$/i.test(check))) {
      if ((await fs.readdir(check)).includes('.git')) {
        this.root = check;
        return;
      }
      check = path.dirname(check);
    }
    throw new OperationError(null, `Directory ${innerPath} is not part of a Git repository. Did you forget to run git init?`);
  }

  public async fetch(): Promise<void> {
    const res = await new exec.Process(['git', 'fetch']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return;
  }

  public async lastCommitId(): Promise<string> {
    const res = await new exec.Process(['git', 'log', '--format=%H', '-n', '1']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return Promise.resolve(res.stdout);
  }

  public async currentBranchIsBehind(): Promise<number> {
    const res = await new exec.Process(['git', 'rev-list', '--count', 'HEAD..@{u}']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return Promise.resolve(Number(res.stdout));
  }

  public async currentBranchIsAhead(): Promise<number> {
    const res = await new exec.Process(['git', 'rev-list', '--count', '@{u}..HEAD']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return Promise.resolve(Number(res.stdout));
  }

  public async pullFastForward(): Promise<void> {
    const res = await new exec.Process(['git', 'pull', '--ff-only']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return;
  }

  public async isWorkingTreeClean(): Promise<boolean> {
    const res = await new exec.Process(['git', 'status', '--short']).cwd(this.root).run();
    if (res.isError) {
      throw new OperationError(res.error, `Command ${res.cmdLine} failed: ${res.errorMessage}.`);
    }
    return Promise.resolve(res.stdout.trim() === '');
  }
}
