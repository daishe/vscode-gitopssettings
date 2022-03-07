import * as vscode from 'vscode';

export class Configuration {
  private conf: vscode.WorkspaceConfiguration;
  private data: Map<string, any>;

  constructor(private context: vscode.ExtensionContext) {
    this.conf = vscode.workspace.getConfiguration();
    this.data = new Map<string, any>();
  }

  private get<T>(key: string): T {
    let val = this.data.get(key) as T;
    if (val === undefined || val === null) {
      const val = this.conf.get(key) as T;
      this.data.set(key, val);
      return val;
    }
    return val;
  }

  public set storageDirectory(v: string) {
    this.context.globalState.update('gitopssettings.storageDirectory', v);
  }

  public get storageDirectory(): string {
    return this.context.globalState.get('gitopssettings.storageDirectory') ?? '';
  }

  public get silentGitFailures(): boolean {
    return this.get('gitopssettings.base.silentGitFailures');
  }

  public get singleUpdatesCheck(): boolean {
    return this.get('gitopssettings.base.singleUpdatesCheck');
  }

  public get updatesCheckInterval(): number {
    return Number(this.get('gitopssettings.base.updatesCheckInterval')) * 60; // convert to seconds
  }

  public get synchronizeSettings(): boolean {
    return this.get('gitopssettings.synchronize.settings');
  }

  public get synchronizeKeyboardShortcuts(): boolean {
    return this.get('gitopssettings.synchronize.keyboardShortcuts');
  }

  public get synchronizeUserSnippets(): boolean {
    return this.get('gitopssettings.synchronize.userSnippets');
  }

  public get synchronizeUserTasks(): boolean {
    return this.get('gitopssettings.synchronize.userTasks');
  }

  public get synchronizeExtensions(): boolean {
    return this.get('gitopssettings.synchronize.extensions');
  }

  // "gitopssettings.synchronize.uiState": {
  //   "type": "boolean",
  //   "default": true,
  //   "description": "Enable UI state synchronization."
  // }
}
