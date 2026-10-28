import { Contents } from '@jupyterlab/services';

/** True when the contents API answers 404 for `path`; any other error is logged and leaves the file unmarked. */
export async function isFileMissing(
  contents: Pick<Contents.IManager, 'get'>,
  path: string
): Promise<boolean> {
  try {
    await contents.get(path, { content: false });
    return false;
  } catch (reason) {
    if ((reason as any)?.response?.status === 404) {
      return true;
    }
    console.warn(`Could not check whether ${path} exists.`, reason);
    return false;
  }
}
