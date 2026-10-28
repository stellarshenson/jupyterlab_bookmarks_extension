/** The setting `sessionEnvExclude` keeps the names a captured session leaves out; one expression per entry, case kept. */

/** The expression as a regular expression: `*` any run, `?` one character, `[...]` one of a set. */
function expressionToRegExp(expression: string): RegExp {
  let pattern = '^';
  for (let index = 0; index < expression.length; index++) {
    const character = expression[index];
    const end = expression.indexOf(']', index + 2);
    if (character === '*') {
      pattern += '.*';
    } else if (character === '?') {
      pattern += '.';
    } else if (character === '[' && end > 0) {
      pattern += expression.slice(index, end + 1);
      index = end;
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(pattern + '$');
}

/** Whether `name` matches one expression of the list. */
export function matchesEnvName(name: string, expressions: string[]): boolean {
  return expressions.some(expression =>
    expressionToRegExp(expression).test(name)
  );
}

/** The captured environment without the names the setting excludes. */
export function filterCapturedEnv(
  env: Record<string, string>,
  expressions: string[]
): Record<string, string> {
  const patterns = expressions.map(expressionToRegExp);
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!patterns.some(pattern => pattern.test(name))) {
      kept[name] = value;
    }
  }
  return kept;
}
