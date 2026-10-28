/** Names the recording excludes (design section 2); typed lines are refused too, so secrets never reach the settings file. */
const EXCLUDED_NAMES = new Set([
  '_',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'LINES',
  'COLUMNS'
]);
const EXCLUDED_PATTERN = /TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|CREDENTIAL/i;
const ENV_NAME = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** The value in single quotes; a single quote inside becomes `'\''`, so the shell reads the value unchanged. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The line a new terminal types: `export K='v' ...; <command>`; either part is left out when empty. */
export function exportLine(
  env: Record<string, string>,
  command: string
): string {
  const exports = Object.entries(env).map(([k, v]) => `${k}=${shellQuote(v)}`);
  return [exports.length ? `export ${exports.join(' ')}` : '', command]
    .filter(Boolean)
    .join('; ');
}

/** `KEY=VALUE` lines to variables; blank lines are skipped, and any invalid or excluded line gives null. */
export function parseEnvLines(text: string): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const match = ENV_NAME.exec(line);
    if (
      !match ||
      EXCLUDED_NAMES.has(match[1]) ||
      EXCLUDED_PATTERN.test(match[1])
    ) {
      return null;
    }
    env[match[1]] = line.slice(match[0].length);
  }
  return env;
}

/** Variables as `KEY=VALUE` lines, for the Environment field. */
export function formatEnvLines(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}
