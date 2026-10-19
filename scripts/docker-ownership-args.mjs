const BOOLEAN_FLAGS = new Set(['--owner', '--restart', '--initialize', '--gate']);

export function parseCliArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith('--')) throw new Error(`Unexpected argument: ${flag ?? '<missing>'}`);
    const next = argv[index + 1];
    if (BOOLEAN_FLAGS.has(flag) && (!next || next.startsWith('--'))) {
      values.set(flag, 'true');
      continue;
    }
    if (next === undefined || next.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values.set(flag, next);
    index += 1;
  }
  return values;
}
