import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('package scripts expose a working test entrypoint', async () => {
  const pkg = JSON.parse(await readText('package.json'));

  assert.equal(typeof pkg.scripts.test, 'string');
  assert.match(pkg.scripts.test, /node --test/i);
  assert.equal(typeof pkg.scripts.build, 'string');
  assert.equal(typeof pkg.scripts.lint, 'string');
  assert.equal(typeof pkg.scripts.start, 'string');
});

test('capacitor app shell is configured for the real installable app', async () => {
  const cfg = await readText('capacitor.config.ts');

  assert.match(cfg, /appId:\s*'com\.tukitask\.app'/);
  assert.match(cfg, /appName:\s*'TukiTask'/);
  assert.match(cfg, /server:\s*\{[\s\S]*url:\s*'https:\/\/tukitask\.vercel\.app'/);
});

test('Android push registration is wired for native notifications', async () => {
  const hookSource = await readText('src/lib/usePushNotifications.ts');
  const pushSource = await readText('src/lib/pushService.ts');

  assert.match(hookSource, /PushNotifications/);
  assert.match(hookSource, /ANDROID_PUSH_CHANNEL_ID/);
  assert.match(hookSource, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(hookSource, /PushNotifications\.register\(\)/);
  assert.match(pushSource, /sendEachForMulticast/);
  assert.match(pushSource, /channelId:\s*ANDROID_PUSH_CHANNEL_ID/);
});
