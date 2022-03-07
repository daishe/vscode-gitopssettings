import * as vscode from 'vscode';

import * as background from './background';
import * as configuration from './configuration';
import * as data from './data';
import * as directory from './directory';
import * as git from './git';

const IMPORT_DATA_WITHOUT_PULL_COMMAND_TAG = 'gitopssettings.importDataWithoutPull';
const IMPORT_DATA_COMMAND_TAG = 'gitopssettings.importData';
const CHECK_FOR_UPDATES_COMMAND_TAG = 'gitopssettings.checkForUpdates';
const EXPORT_CURRENT_DATA_COMMAND_TAG = 'gitopssettings.exportCurrentData';
const SET_STORAGE_DIRECTORY_COMMAND_TAG = 'gitopssettings.setStorageDirectory';
const OPEN_STORAGE_DIRECTORY_COMMAND_TAG = 'gitopssettings.openStorageDirectory';

function registerCommand(context: vscode.ExtensionContext, key: string, title: string, callback: (actions: Actions) => Promise<void>) {
	const cb = withProgress(title, () => {
		const conf = new configuration.Configuration(context);
		return reportFailure(callback(new Actions(context, true, conf)));
	});
	context.subscriptions.push(vscode.commands.registerCommand(key, cb));
}

// await vscode.commands.executeCommand(
// 	"workbench.extensions.uninstallExtension",
// 	`${extension.publisher}.${extension.name}`
// );

// await vscode.commands.executeCommand(
// 	"workbench.extensions.installExtension",
// 	name
// );

function createPeriodicJob(context: vscode.ExtensionContext, title: string, single: boolean, callback: (actions: Actions) => Promise<void>): background.PeriodicJob {
	const periodicJob = new background.PeriodicJob();
	let cb = callback;
	if (single) {
		cb = async (actions: Actions) => {
			try { await callback(actions); } catch (err) { throw err; }
			periodicJob.stop();
		};
	}
	periodicJob.interval = () => {
		return new configuration.Configuration(context).updatesCheckInterval;
	};
	periodicJob.callback = withProgress(title, () => {
		const conf = new configuration.Configuration(context);
		return reportFailure(cb(new Actions(context, false, conf)));
	});
	return periodicJob;
}

async function reportFailure(action: Promise<void>): Promise<void> {
	try {
		await action;
	} catch (err) {
		console.error('GitOpsSettings extension failed: ', err);
		if (err instanceof Error) {
			vscode.window.showErrorMessage(`GitOpsSettings extension failed: ${err.message}.`);
		} else {
			vscode.window.showErrorMessage(`GitOpsSettings extension failed: ${err}`);
		}
	}
}

function withProgress(title: string, callback: () => Promise<void>): () => Promise<void> {
	const progressOpts = {
		"title": title,
		"cancellable": false,
		"location": vscode.ProgressLocation.Window
	};
	return () => {
		return new Promise<void>((resolve, rejected) => {
			const thenable = vscode.window.withProgress(progressOpts, () => callback());
			thenable.then(() => resolve(), (err) => rejected(err));
		});
	};
}

let backgroundCheckForUpdates: background.PeriodicJob;

export function activate(context: vscode.ExtensionContext) {
	const conf = new configuration.Configuration(context);

	registerCommand(
		context,
		IMPORT_DATA_WITHOUT_PULL_COMMAND_TAG,
		'Importing configuration',
		(actions) => actions.importDataWithoutPull()
	);
	registerCommand(
		context,
		IMPORT_DATA_COMMAND_TAG,
		'Importing configuration',
		(actions) => actions.importData()
	);
	registerCommand(
		context,
		CHECK_FOR_UPDATES_COMMAND_TAG,
		'Checking for configuration updates',
		(actions) => actions.checkForUpdates()
	);
	registerCommand(
		context,
		EXPORT_CURRENT_DATA_COMMAND_TAG,
		'Exporting current configuration',
		(actions) => actions.exportCurrentData()
	);
	registerCommand(
		context,
		SET_STORAGE_DIRECTORY_COMMAND_TAG,
		'Setting storage directory',
		(actions) => actions.setStorageDirectory()
	);
	registerCommand(
		context,
		OPEN_STORAGE_DIRECTORY_COMMAND_TAG,
		'Opening storage directory',
		(actions) => actions.openStorageDirectory()
	);

	backgroundCheckForUpdates = createPeriodicJob(
		context,
		'Checking for configuration updates',
		conf.singleUpdatesCheck,
		actions => actions.checkForUpdates()
	);

	backgroundCheckForUpdates.start(true);
}

export function deactivate() {
	if (backgroundCheckForUpdates !== undefined && backgroundCheckForUpdates !== null) {
		backgroundCheckForUpdates.stop();
	}
}

enum MessageKind {
	error = 'error',
	warning = 'warning',
	info = 'info',
}

class Actions {
	private data: data.Warehouse;
	private notifications: Notifications;
	private confirmations: Confirmations;

	constructor(
		private context: vscode.ExtensionContext,
		private calledByUser: boolean,
		private conf: configuration.Configuration) {
		this.data = new data.Warehouse(context, this.conf);
		this.notifications = new Notifications(this.calledByUser, this.conf);
		this.confirmations = new Confirmations();
	}

	private async wrapAction(actionPromise: Promise<void>): Promise<void> {
		try {
			await actionPromise;
		} catch (err) {
			if (err instanceof git.OperationError) {
				return await this.notifications.gitOperationError(err);
			}
			throw err;
		}
	}

	private async warnOnFailure(gitOperation: Promise<void>): Promise<void> {
		try {
			await gitOperation;
		} catch (err) {
			if (err instanceof git.OperationError) {
				this.notifications.gitOperationWarning(err); // do not wait for action on warning notification
				return;
			}
			throw err;
		}
	}

	public async checkForUpdates(): Promise<void> {
		return await this.wrapAction(this.checkForUpdatesImpl());
	}

	private async checkForUpdatesImpl(): Promise<void> {
		if (this.conf.storageDirectory === '') {
			return await this.notifications.missingStorageDirectory();
		}

		const ops = new git.Operations();
		await ops.findRoot(this.conf.storageDirectory);
		await ops.fetch();
		if (!await ops.isWorkingTreeClean()) {
			return await this.notifications.dirtyWorkingTree(ops.root);
		}
		const ahead = await ops.currentBranchIsAhead();
		const behind = await ops.currentBranchIsBehind();
		if (ahead !== 0 || behind !== 0) {
			return await this.notifications.aheadOrBehind(ahead, behind, ops.root);
		}
		if (this.calledByUser) {
			return await this.notifications.upToDate();
		}
		return;
	}

	public async importDataWithoutPull(): Promise<void> {
		return await this.wrapAction(this.importDataWithoutPullImpl());
	}

	public async importDataWithoutPullImpl(): Promise<void> {
		if (this.conf.storageDirectory === '') {
			return await this.notifications.missingStorageDirectory();
		}

		const [currentSum, lastImportedSum] = await Promise.all([
			this.data.sumOfCurrent(),
			this.data.sumOfLastImported(),
		]);
		if (!currentSum.equals(lastImportedSum)) {
			if (!await this.confirmations.currentDataOverwrite()) {
				return;
			}
		}

		const ops = new git.Operations();

		await ops.findRoot(this.conf.storageDirectory);
		await this.warnOnFailure(ops.fetch());
		if (!await ops.isWorkingTreeClean()) {
			if (!await this.confirmations.continueWithDirtyWorkingTree(ops.root)) {
				return;
			}
		}

		const ahead = await ops.currentBranchIsAhead();
		const behind = await ops.currentBranchIsBehind();
		if (behind !== 0) {
			if (!await this.confirmations.continueBehind(ahead, behind, ops.root)) {
				return;
			}
		}

		await this.data.importStored();

		if (ahead !== 0) {
			return await this.notifications.successfulImportAhead(ahead, ops.root);
		}
		return await this.notifications.successfulImport(ops.root);
	}

	public async importData(): Promise<void> {
		return await this.wrapAction(this.importDataImpl());
	}

	public async importDataImpl(): Promise<void> {
		if (this.conf.storageDirectory === '') {
			return await this.notifications.missingStorageDirectory();
		}

		const [currentSum, lastImportedSum] = await Promise.all([
			this.data.sumOfCurrent(),
			this.data.sumOfLastImported(),
		]);
		if (!currentSum.equals(lastImportedSum)) {
			if (!await this.confirmations.currentDataOverwrite()) {
				return;
			}
		}

		const ops = new git.Operations();

		await ops.findRoot(this.conf.storageDirectory);
		await ops.fetch();
		if (!await ops.isWorkingTreeClean()) {
			return await this.notifications.dirtyWorkingTree(ops.root);
		}

		await ops.pullFastForward();
		const ahead = await ops.currentBranchIsAhead();
		const behind = await ops.currentBranchIsBehind();
		if (behind !== 0) {
			return await this.notifications.behindAfterFastForward(ahead, behind, ops.root);
		}

		const storedSum = await this.data.sumOfStored();
		if (currentSum.equals(storedSum)) {
			if (!storedSum.equals(lastImportedSum)) {
				await this.data.refreshLastImported();
			}
			if (ahead !== 0) {
				return await this.notifications.successfulImportAhead(ahead, ops.root);
			}
			return await this.notifications.successfulImport(ops.root);
		}

		await this.data.importStored();

		if (ahead !== 0) {
			return await this.notifications.successfulImportAhead(ahead, ops.root);
		}
		return await this.notifications.successfulImport(ops.root);
	}

	public async exportCurrentData(): Promise<void> {
		return await this.wrapAction(this.exportCurrentDataImpl());
	}

	private async exportCurrentDataImpl(): Promise<void> {
		const options: vscode.OpenDialogOptions = {
			title: 'Select folder to store exported data',
			openLabel: 'Select',
			canSelectMany: false,
			canSelectFiles: false,
			canSelectFolders: true,
		};

		if (this.conf.storageDirectory !== '') {
			try {
				options.defaultUri = vscode.Uri.parse('file:///' + this.conf.storageDirectory);
			} catch {
				// ignore all errors
			}
		}

		const fileUri = await vscode.window.showOpenDialog(options);
		if (!fileUri || !fileUri[0]) {
			return;
		}
		const path = fileUri[0].fsPath;
		await this.data.exportCurrent(path);
		return await this.notifications.successfulExport(path);
	}

	public async setStorageDirectory(): Promise<void> {
		return await this.wrapAction(this.setStorageDirectoryImpl());
	}

	private async setStorageDirectoryImpl(): Promise<void> {
		const options: vscode.OpenDialogOptions = {
			title: 'Select folder to use as storage',
			openLabel: 'Select',
			canSelectMany: false,
			canSelectFiles: false,
			canSelectFolders: true,
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (!fileUri || !fileUri[0]) {
			return Promise.resolve();
		}
		const path = fileUri[0].fsPath;
		this.conf.storageDirectory = path;
		return Promise.resolve();
	}

	public async openStorageDirectory(): Promise<void> {
		return await this.wrapAction(this.openStorageDirectoryImpl());
	}

	private async openStorageDirectoryImpl(): Promise<void> {
		if (this.conf.storageDirectory === '') {
			return await this.notifications.missingStorageDirectory();
		}
		await directory.openInExternalBrowser(this.conf.storageDirectory);
	}
}

class Notifications {
	constructor(private calledByUser: boolean, private conf: configuration.Configuration) {
	}

	public async gitOperationError(err: git.OperationError): Promise<void> {
		if (!this.calledByUser && this.conf.silentGitFailures) {
			return;
		}
		return await this.showMessage(MessageKind.error, err.message);
	}

	public async gitOperationWarning(err: git.OperationError): Promise<void> {
		if (!this.calledByUser && this.conf.silentGitFailures) {
			return;
		}
		return await this.showMessage(MessageKind.warning, err.message);
	}

	public async missingStorageDirectory(): Promise<void> {
		const actions = new Map<string, () => Promise<void>>([
			[`Set storage directory`, async () => this.runCommand(SET_STORAGE_DIRECTORY_COMMAND_TAG)],
		]);

		return await this.showMessage(MessageKind.error, `Storage directory is not set.`, actions);
	}

	public async dirtyWorkingTree(root: string): Promise<void> {
		const actions = new Map<string, () => Promise<void>>();
		if (root !== this.conf.storageDirectory) {
			actions.set(`Open root of the repository`, async () => await directory.openInExternalBrowser(root));
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		} else {
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		}

		return await this.showMessage(MessageKind.error, `Repository ${root} is dirty.`, actions);
	}

	public async aheadOrBehind(ahead: number, behind: number, root: string): Promise<void> {
		let kind: MessageKind = MessageKind.info;
		let msg: string;
		let actions = new Map<string, () => Promise<void>>();
		if (ahead !== 0) {
			if (behind !== 0) {
				kind = MessageKind.warning;
				msg = `Current branch is behind by ${behind} and ahead by ${ahead} commits in repository ${root}.`;
			} else {
				msg = `Current branch is ahead by ${ahead} commits in repository ${root}. Remember to publish your changes.`;
			}
			if (root !== this.conf.storageDirectory) {
				actions.set(`Open root of the repository`, async () => await directory.openInExternalBrowser(root));
				actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
			} else {
				actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
			}
		} else if (behind !== 0) {
			msg = `Current branch is behind by ${behind} commits in repository ${root}. Do you want to import data?`;
			if (root !== this.conf.storageDirectory) {
				actions.set(`Yes, fast forward and import`, async () => this.runCommand(IMPORT_DATA_COMMAND_TAG));
				actions.set(`No, open root of the repository`, async () => await directory.openInExternalBrowser(root));
				actions.set(`No, open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
			} else {
				actions.set(`Yes, fast forward and import`, async () => this.runCommand(IMPORT_DATA_COMMAND_TAG));
				actions.set(`No, open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
			}
		} else {
			return;
		}

		return await this.showMessage(kind, msg, actions);
	}

	public async behindAfterFastForward(ahead: number, behind: number, root: string): Promise<void> {
		let msg: string;
		if (ahead !== 0) {
			msg = `After fast forward current branch is still behind by ${behind} and ahead by ${ahead} commits in repository ${root}.`;
		} else {
			msg = `After fast forward current branch is still behind by ${behind} commits in repository ${root}.`;
		}
		let actions = new Map<string, () => Promise<void>>();
		if (root !== this.conf.storageDirectory) {
			actions.set(`Open root of the repository`, async () => await directory.openInExternalBrowser(root));
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		} else {
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		}

		return await this.showMessage(MessageKind.error, msg, actions);
	}

	public async upToDate(): Promise<void> {
		return await this.showMessage(MessageKind.info, `Your configuration is up to date!`);
	}

	public async successfulExport(path: string): Promise<void> {
		const actions = new Map<string, () => Promise<void>>([
			[`Open export directory`, async () => await directory.openInExternalBrowser(path)],
		]);
		return await this.showMessage(MessageKind.info, `Current configuration exported to ${path}.`, actions);
	}

	public async successfulImport(root: string): Promise<void> {
		const msg = `Configuration imported successfully (repository ${root})!`;
		return await this.showMessage(MessageKind.info, msg);
	}

	public async successfulImportAhead(ahead: number, root: string): Promise<void> {
		const msg = `Configuration imported successfully! However current branch is ahead by ${ahead} commits in repository ${root}. Remember to publish your changes.`;
		let actions = new Map<string, () => Promise<void>>();
		if (root !== this.conf.storageDirectory) {
			actions.set(`Open root of the repository`, async () => await directory.openInExternalBrowser(root));
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		} else {
			actions.set(`Open storage directory`, async () => await directory.openInExternalBrowser(this.conf.storageDirectory));
		}
		return await this.showMessage(MessageKind.info, msg, actions);
	}

	private static lastMessage: string = '';

	private async showMessage(kind: MessageKind, msg: string, actions?: Map<string, () => Promise<void>>): Promise<void> {
		if (!this.calledByUser && Notifications.lastMessage === msg) {
			return; // skip reporting
		}
		Notifications.lastMessage = msg;

		let showProcedure = vscode.window.showInformationMessage;
		if (kind === MessageKind.error) {
			showProcedure = vscode.window.showErrorMessage;
		} else if (kind === MessageKind.warning) {
			showProcedure = vscode.window.showWarningMessage;
		}

		if (actions === undefined || actions === null) {
			showProcedure(msg);
			return;
		}

		const action = await showProcedure(msg, ...actions.keys());
		if (action === undefined || action === null) {
			return;
		}
		const actionCb = actions.get(action) ?? (async () => { });
		return await actionCb();
	}

	private runCommand(key: string): void {
		// do not await for command to avoid so indicator can disappear and stop cluttering the progress bar
		vscode.commands.executeCommand(key);
	}
}

class Confirmations {
	constructor() {
	}

	public async currentDataOverwrite(): Promise<boolean> {
		return await this.showConfirmation(
			MessageKind.warning,
			`Last applied configuration differs from the current one. Override your current configuration?`,
			`Yes, overwrite`,
			`No, don't do anything`
		);
	}

	public async continueWithDirtyWorkingTree(root: string): Promise<boolean> {
		return await this.showConfirmation(
			MessageKind.warning,
			`Working tree is dirty in repository ${root}. Continue?`,
			`Yes, continue with dirty working tree`,
			`No, don't do anything`
		);
	}

	public async continueBehind(ahead: number, behind: number, root: string): Promise<boolean> {
		let msg: string;
		if (ahead !== 0) {
			msg = `Current branch is behind by ${behind} and ahead by ${ahead} commits in repository ${root}. Do you want to continue import?`;
		} else {
			msg = `Current branch is behind by ${behind} commits in repository ${root}. Do you want to continue import?`;
		}

		return await this.showConfirmation(
			MessageKind.warning,
			msg,
			`Yes, continue`,
			`No, don't do anything`
		);
	}

	private async showConfirmation(kind: MessageKind, msg: string, okActionsMsg: string, cancelActionMsg: string): Promise<boolean> {
		let showProcedure = vscode.window.showInformationMessage;
		if (kind === MessageKind.error) {
			showProcedure = vscode.window.showErrorMessage;
		} else if (kind === MessageKind.warning) {
			showProcedure = vscode.window.showWarningMessage;
		}

		const action = await showProcedure(msg, okActionsMsg, cancelActionMsg);
		return action === okActionsMsg;
	}
}
