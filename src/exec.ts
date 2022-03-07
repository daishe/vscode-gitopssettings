import * as childProcess from 'child_process';

export class ExitError extends Error {
  constructor(private _code: number) {
    super(`process exited with ${_code}`);
    Object.setPrototypeOf(this, ExitError.prototype);
  }
  public get code(): number {
    return this._code;
  }
}

export class Result {
  constructor(private _cmd: string[], private _error: Error | null, private _stdout: string, private _stderr: string) {
  }

  public get cmd(): string[] {
    return this._cmd;
  }

  public get cmdLine(): string {
    return this._cmd.join(' ');
  }

  public get stdout(): string {
    return this._stdout;
  }

  public get stderr(): string {
    return this._stderr;
  }

  public get error(): Error | null {
    return this._error;
  }

  public get errorMessage(): string {
    return this._error?.message ?? '';
  }

  public get isError(): boolean {
    return this._error !== null;
  }
}

export class Process {
  constructor(public cmd: string[]) {
  }

  private _cwd: string = process.cwd();
  public cwd(v: string): Process {
    this._cwd = v;
    return this;
  }

  private _timeout: number = 1000 * 60; // 60s
  public timeout(v: number): Process {
    this._timeout = v;
    return this;
  }

  private _windowsHide: boolean = true;
  public windowsHide(v: boolean): Process {
    this._windowsHide = v;
    return this;
  }

  public run(): Promise<Result> {
    const opts = {
      cwd: this._cwd,
      timeout: this._timeout,
      windowsHide: this._windowsHide,
    };
    return new Promise((resolve, _) => {
      let err: Error | null = null;
      let stdout: string = '';
      let stderr: string = '';

      const p = childProcess.spawn(this.cmd[0], this.cmd.slice(1), opts);

      p.stdout.on('data', (data) => {
        stdout += data;
      });
      p.stderr.on('data', (data) => {
        stderr += data;
      });

      p.on('error', (e) => {
        err = e;
        p.kill();
      });
      p.on('close', (code) => {
        if (code !== 0 && err === null) {
          err = new ExitError(code === null ? -1 : code);
        }
        resolve(new Result(this.cmd, err, stdout, stderr));
      });
    });
  }
}
