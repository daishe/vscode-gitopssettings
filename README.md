# GitOpsSettings

Manage your settings and Visual Studio Code configuration in GitOps style!

> This is a very fresh (initial) release. I have put a great deal of effort into making sure that it will not destroy your Visual Studio Code installation. Nevertheless, to be doubly sure, please backup your settings before enabling this extension and playing with it. They can be found in `%APPDATA%\Code\User` (Windows), `~/.config/Code/User` (Linux) and `~/Library/Application Support/Code/User` (Mac).

## Features

It automatically synchronizes your entire Visual Studio Code configuration. That includes:

- Settings
- Keyboard shortcuts
- User snippets
- User tasks
- Extensions

And uses Git repository as the single source of truth.

### Why create this extension when Visual Studio Code has built in functionally for synchronizing configuration

Yes is does, and **if built in synchronization is good enough for you, you should probably use it**. However it requires Github (or Microsoft account). Moreover it requires signing in into this account (and thus providing credentials) on every machine. If any of the two is a problem or a deal breaker, GitOpsSettings is for you!

Of course this extension requires credential to access your Git server however it do not places any requirements on the Git hosting provider. Credentials for Git repositories usually allow only pull and push operations (nobody can delete anything) and they can often be limited to single repo or restrict access as read only.

## Requirements

You need to have Git. Not really surprising... Besides that no other requirements.

Of course you need to also have Git repository (both locally and hosted on some remote server) to synchronize your data.

## Setting up synchronization

Since this extension can also synchronizes settings, the location of directory congaing repository is kept, by GitOpsSettings, separately. You can configure it by invoking `Set storage directory` command.

## Extension Settings

To configure GitOpsSettings the following settings are available:

- **GitOpsSettings > Base > SilentGitFailures**: When git operation fails during automatic checking for available updates, do not report anything. Note, that this option do not affect commands called explicitly by user. _(Default: on)_
- **GitOpsSettings > Base > SingleUpdatesCheck**: Perform check for available updates only once, at startup (otherwise perform updates checks periodically). Note, that when enabled, check attempts will still be periodically performed until the first fully successful updates availability check. A reload is required for this option change to take effect. _(Default: on)_
- **GitOpsSettings > Base > UpdatesCheckInterval**: Time interval between successive updates availability checks (in minutes). _(Default: 10)_
- **GitOpsSettings > Synchronize > Settings**: Enable settings synchronization. _(Default: on)_
- **GitOpsSettings > Synchronize > KeyboardShortcuts**: Enable user keyboard shortcuts synchronization. _(Default: on)_
- **GitOpsSettings > Synchronize > UserSnippets**: Enable user snippets synchronization. _(Default: on)_
- **GitOpsSettings > Synchronize > UserTasks**: Enable user tasks synchronization. _(Default: on)_
- **GitOpsSettings > Synchronize > Extensions**: Enable extensions synchronization. This option causes installation of missing extensions, uninstallation of non listed extension and management of enabled/disabled states. _(Default: on)_
- **GitOpsSettings > Synchronize > UiState**: Enable UI state synchronization. _(Default: on)_

## Exporting configuration

To export current Visual Studio Code configuration invoke `Export current configuration` command and pick directory to store your configuration in. By default it will open directory set as storage directory.

## Commands

- **Import configuration without performing pull operation** [`gitopssettings.importDataWithoutPull`]: Imports configuration from storage directory. It also prompts for confirmation on problems (like dirty working tree or upstream ahead) instead of failing.
- **Import configuration** [`gitopssettings.importData`]: Performs Git fast forward pull and imports configuration from storage directory.
- **Check for available updates** [`gitopssettings.checkForUpdates`]: Performs Git fetch operation and checks repository for available updates on current branch in relation to upstream.
- **Export current configuration** [`gitopssettings.exportCurrentData`]: Opens directory selection dialog to select export location. By default opens on path set as storage directory.
- **Set storage directory** [`gitopssettings.setStorageDirectory`]: Opens directory selection dialog to configure internally kept path to storage directory.
- **Open storage directory** [`gitopssettings.openStorageDirectory`]: Opens a system file browser on directory set as storage.

## Known issues and limitations

- It does not synchronizes enabled/disabled states for extensions. Support for this is coming soon!
- This extension does not (by itself) perform any (almost) modifications to Git repository. All it does is call `git fetch` and `git pull` with fast forward only option. This is both good and bad - good since extension has minimal footprint and you can structure and manage repository how you want, bad because you do not have one simple command to commit and push your changes of the configuration.
- It does not synchronizes version of installed extensions.
- GitOpsSettings do not synchronizes any workspace specific configurations or UI state.
- Currently, this extension does not support customization of configuration for different environments. You can achieve this manually by creating multiple storage directories in your repository and by copping files between them.

## Related projects

If you like or need this extension you may also like [chezmoi](https://www.chezmoi.io/). If not for the fact that extensions are not a simple file, dotfile managers, like chezmoi, could replace this extension.

## Release notes

### 0.0.1

Initial release.
