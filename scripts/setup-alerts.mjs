// scripts/setup-alerts.mjs
// Creates DormDash's monitoring alerts in Google Cloud Monitoring, emailed
// to one address. Safe to run again: anything that already exists (same
// name) is left alone, so re-running only adds what's missing.
//
//   node scripts/setup-alerts.mjs you@example.com [projectId]
//
// Signs in with your Firebase CLI login (firebase login), or with
// ACCESS_TOKEN=$(gcloud auth print-access-token) if you have gcloud.
//
// Alerts (see PWA_HANDOFF.md, "Monitoring alerts"):
//   1. A Cloud Function logged an error          (at most one email / 30 min)
//   2. Card payments need checking               (at most one email / 3 h)
//   3. More than 20 dead push tokens in an hour  (a sign pushes are broken)

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const [email, project = 'dormdash-71035'] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/setup-alerts.mjs you@example.com [projectId]');
  process.exit(1);
}

async function accessToken() {
  if (process.env.ACCESS_TOKEN) return process.env.ACCESS_TOKEN;
  // The Firebase CLI's own login (the same one `firebase deploy` uses).
  const globalRoot = execSync('npm root -g').toString().trim();
  const require = createRequire(import.meta.url);
  const auth = require(path.join(globalRoot, 'firebase-tools/lib/auth'));
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  if (!cfg.tokens?.refresh_token) throw new Error('Not signed in: run `firebase login` first.');
  const t = await auth.getAccessToken(cfg.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  return t.access_token;
}

const token = await accessToken();
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${url}: ${res.status} ${text.slice(0, 400)}`), { status: res.status });
  return text ? JSON.parse(text) : {};
}
const MON = `https://monitoring.googleapis.com/v3/projects/${project}`;
const LOG = `https://logging.googleapis.com/v2/projects/${project}`;

// Cloud Functions (2nd gen) run on Cloud Run; 1st gen kept for safety.
const FUNCTIONS = '(resource.type="cloud_run_revision" OR resource.type="cloud_function")';

// ── Where to send them ──────────────────────────────────────────────────────
const channels = (await api('GET', `${MON}/notificationChannels`)).notificationChannels ?? [];
let channel = channels.find(c => c.type === 'email' && c.labels?.email_address === email);
if (!channel) {
  channel = await api('POST', `${MON}/notificationChannels`, {
    type: 'email', displayName: `DormDash alerts (${email})`, labels: { email_address: email },
  });
  console.log('Created email channel for', email);
} else console.log('Email channel exists');

// ── Log-based metric for dead push tokens ───────────────────────────────────
const DEAD_TOKENS = 'dormdash_dead_push_tokens';
try {
  await api('POST', `${LOG}/metrics`, {
    name: DEAD_TOKENS,
    description: 'DormDash: dead web push tokens removed (functions log "Dead web push token removed").',
    filter: `${FUNCTIONS} AND jsonPayload.message="Dead web push token removed"`,
    metricDescriptor: { metricKind: 'DELTA', valueType: 'INT64' },
  });
  console.log('Created log metric', DEAD_TOKENS);
} catch (e) {
  if (e.status !== 409) throw e;
  console.log('Log metric exists');
}

// ── Alert policies ──────────────────────────────────────────────────────────
const docs = (text) => ({ content: text, mimeType: 'text/markdown' });
const policies = [
  {
    displayName: 'DormDash: a Cloud Function error',
    documentation: docs('A DormDash Cloud Function logged an error. Open Firebase console → Functions → Logs, or Logs Explorer with this alert\'s filter, to see which one and why. At most one email every 30 minutes.'),
    conditions: [{
      displayName: 'Function logged an error',
      conditionMatchedLog: { filter: `${FUNCTIONS} AND severity>=ERROR` },
    }],
    alertStrategy: { notificationRateLimit: { period: '1800s' }, autoClose: '1800s' },
  },
  {
    displayName: 'DormDash: card payments to check',
    documentation: docs('A card payment has been pending for over 30 minutes or is held for review. Open the admin dashboard → "Card payments to check" and resolve it (see PAYMENTS_SETUP.md). At most one email every 3 hours.'),
    conditions: [{
      displayName: 'Payments need checking',
      conditionMatchedLog: {
        filter: `${FUNCTIONS} AND (jsonPayload.message="Card payments need checking" OR jsonPayload.message:"WiPay return held for review")`,
      },
    }],
    alertStrategy: { notificationRateLimit: { period: '10800s' }, autoClose: '10800s' },
  },
  {
    displayName: 'DormDash: many dead push tokens',
    documentation: docs('More than 20 web push tokens were found dead within an hour. A few a day is normal (people clear their browser); a burst usually means push keys or the service worker changed. Check PWA_HANDOFF.md, "Push fix: dead web tokens".'),
    conditions: [{
      displayName: 'Dead push tokens > 20 per hour',
      conditionThreshold: {
        filter: `metric.type="logging.googleapis.com/user/${DEAD_TOKENS}" AND resource.type="cloud_run_revision"`,
        aggregations: [{ alignmentPeriod: '3600s', perSeriesAligner: 'ALIGN_SUM', crossSeriesReducer: 'REDUCE_SUM' }],
        comparison: 'COMPARISON_GT',
        thresholdValue: 20,
        duration: '0s',
      },
    }],
    alertStrategy: { autoClose: '86400s' },
  },
];

const existing = (await api('GET', `${MON}/alertPolicies`)).alertPolicies ?? [];
for (const p of policies) {
  if (existing.some(x => x.displayName === p.displayName)) { console.log('Policy exists:', p.displayName); continue; }
  const body = { ...p, combiner: 'OR', enabled: true, notificationChannels: [channel.name] };
  // A brand-new log metric can take a minute to be usable in a policy.
  for (let attempt = 1; ; attempt++) {
    try {
      await api('POST', `${MON}/alertPolicies`, body);
      console.log('Created policy:', p.displayName);
      break;
    } catch (e) {
      if (attempt >= 6 || !/metric|not found|does not exist/i.test(e.message)) throw e;
      console.log('Waiting for the log metric to be ready…');
      await new Promise(r => setTimeout(r, 20000));
    }
  }
}
console.log(`Done. Alerts go to ${email}. Google may first email a confirmation link.`);
