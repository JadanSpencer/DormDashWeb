// loadtest/start.mjs — starts the DormDash load test.
//
//   node loadtest/start.mjs
//   STUDENTS=100 DASHERS=15 node loadtest/start.mjs
//
// It starts a private copy of Firebase on this Mac (the emulator, project
// "demo-dormdash"), runs loadtest/run.mjs against it, and throws everything
// away afterwards. The live app is never touched.
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// 1. Java 21 or newer: the local Firestore emulator runs on it.
//    If an older Java is the default (e.g. Java 8 from java.com), use a
//    newer one that's installed alongside it.
function javaMajor(env) {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8', env });
  if (r.error || r.status !== 0) return 0;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(r.stderr + r.stdout);
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]); // "1.8" means Java 8
}
if (javaMajor(process.env) < 21 && process.platform === 'darwin') {
  const home = spawnSync('/usr/libexec/java_home', ['-v', '21+'], { encoding: 'utf8' });
  const path = home.status === 0 ? home.stdout.trim() : '';
  if (path) {
    process.env.JAVA_HOME = path;
    process.env.PATH = `${path}/bin:${process.env.PATH}`;
  }
}
const found = javaMajor(process.env);
if (found < 21) {
  console.error(`
The load test needs Java 21 or newer (found: ${found ? `Java ${found}` : 'none'}).
Install it once, then run the load test again:
  1. Go to https://adoptium.net/temurin/releases/?os=mac&version=21
  2. Download the .pkg for your Mac:
       Intel Mac (i5/i7/i9)  → x64
       M1/M2/M3/M4 Mac       → aarch64
  3. Double-click it and follow the installer.
You can leave the old Java 8 installed; this test picks the newer one.
`);
  process.exit(1);
}

// 2. A dummy WiPay key so the payment functions load in the emulator.
//    functions/.secret.local is emulator-only, ignored by git and never
//    deployed. Never put the live WiPay key in it.
const secret = 'functions/.secret.local';
if (!existsSync(secret)) {
  writeFileSync(secret, 'WIPAY_API_KEY=loadtest-not-a-real-key\n');
  console.log('Created functions/.secret.local (dummy key, local emulator only).');
}

// 3. firebase.json must list the Auth emulator, or it won't start.
//    Only the local "emulators" section is touched; deploys ignore it.
{
  const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
  cfg.emulators = cfg.emulators || {};
  let changed = false;
  if (!cfg.emulators.auth) { cfg.emulators.auth = { port: 9099 }; changed = true; }
  if (!cfg.emulators.functions) { cfg.emulators.functions = { port: 5001 }; changed = true; }
  if (changed) {
    writeFileSync('firebase.json', JSON.stringify(cfg, null, 2) + '\n');
    console.log('Added the local Auth and Functions emulators to firebase.json (local testing only).');
  }
}

// 4. Build the server code, then run the test inside the emulator.
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1;
if (run('npm', ['--prefix', 'functions', 'run', 'build']) !== 0) process.exit(1);
process.exit(run('firebase', [
  'emulators:exec', '--project', 'demo-dormdash', '--only', 'auth,firestore,functions',
  'node loadtest/run.mjs',
]));
