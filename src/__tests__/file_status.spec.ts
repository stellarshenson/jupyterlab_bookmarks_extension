import { isFileMissing } from '../file/file_status';

/** A contents manager whose `get` fails with the given HTTP status, or succeeds without one. */
const contents = (status?: number) => ({
  get: async (): Promise<any> => {
    if (status) {
      throw { response: { status } };
    }
    return {};
  }
});

describe('file/file_status', () => {
  it('only 404 counts as missing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await isFileMissing(contents(404), 'a.txt')).toBe(true);
    expect(await isFileMissing(contents(403), 'a.txt')).toBe(false);
    expect(await isFileMissing(contents(500), 'a.txt')).toBe(false);
    expect(await isFileMissing(contents(), 'a.txt')).toBe(false);
  });
});
