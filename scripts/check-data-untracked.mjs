// CI guard (C-4): nothing under data/ may be tracked by git.
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '--', 'data'], { encoding: 'utf8' }).trim();
if (tracked) {
  console.error(`Files under data/ are tracked by git and must not be:\n${tracked}`);
  process.exit(1);
}
console.log('check:data: nothing under data/ is tracked');
