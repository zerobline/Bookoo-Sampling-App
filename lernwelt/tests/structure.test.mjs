// Checks the app contract on disk and that the service worker precaches every launcher file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../src/core/registry.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test('every registered app has a valid manifest, icon and entry', async () => {
  const folders = JSON.parse(await readFile(join(ROOT, 'apps/index.json'), 'utf8'));
  assert.ok(folders.length >= 2);
  for (const folder of folders) {
    const dir = join(ROOT, 'apps', folder);
    const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(validateManifest(m, folder), [], folder);
    await access(join(dir, m.icon));
    await access(join(dir, m.entry ?? 'index.js'));
    for (const f of m.files ?? []) await access(join(dir, f));
    const src = await readFile(join(dir, m.entry ?? 'index.js'), 'utf8');
    assert.match(src, /export function mount\(/, `${folder}: mount`);
    assert.match(src, /export function unmount\(/, `${folder}: unmount`);
  }
});

test('service worker precaches all launcher files', async () => {
  const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]));
  const files = (await walk(join(ROOT, 'src'))).map((p) => relative(ROOT, p).split('\\').join('/'));
  for (const f of files) assert.ok(listed.has(f), `${f} missing from sw.js CORE`);
  for (const f of listed) if (f !== './') await access(join(ROOT, f));
});
