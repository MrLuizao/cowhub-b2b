#!/usr/bin/env node
/// Despliega firestore.rules al proyecto vía Firestore Rules API
/// (sin firebase CLI). Uso: node scripts/deploy-rules.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GoogleAuth } from 'google-auth-library';

const sa = JSON.parse(
  readFileSync(resolve(process.cwd(), 'service-account.json'), 'utf8'),
);
const project = sa.project_id;
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;

// 1. Crear ruleset
const rs = await client.request({
  url: `${base}/rulesets`,
  method: 'POST',
  data: {
    source: { files: [{ name: 'firestore.rules', content: rules }] },
  },
});
const rulesetName = rs.data.name;
console.log('Ruleset creado:', rulesetName);

// 2. Crear/mover el release cloud.firestore a ese ruleset
try {
  await client.request({
    url: `${base}/releases/cloud.firestore`,
    method: 'PATCH',
    data: {
      name: `projects/${project}/releases/cloud.firestore`,
      rulesetName,
    },
  });
} catch {
  await client.request({
    url: `${base}/releases`,
    method: 'POST',
    data: {
      name: `projects/${project}/releases/cloud.firestore`,
      rulesetName,
    },
  });
}
console.log('✓ firestore.rules desplegadas a', project);
