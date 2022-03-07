import * as exec from './exec';

export async function openInExternalBrowser(path: string): Promise<void> {
  if (process.platform === 'win32') {
    await win(path);
  }
  else if (process.platform === 'darwin') {
    await darwin(path);
  }
  else { // otherwise assume linux
    await linux(path);
  }
}

async function win(path: string) {
  await new exec.Process(['explorer', path]).windowsHide(false).run();
}

async function darwin(path: string) {
  await new exec.Process(['open', path]).windowsHide(false).run();
}

async function linux(path: string) {
  await new exec.Process(['xdg-open', path]).windowsHide(false).run();
}
