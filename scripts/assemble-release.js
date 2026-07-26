const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const outDir = path.join(root, 'release', 'ChatReaction-MultiPlatform');
const sourceReactionHtml = path.join(root, 'reaction.html');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return true;
}

function pickLatest(files) {
  if (!files.length) return null;
  return files
    .map((name) => {
      const filePath = path.join(distDir, name);
      const stat = fs.statSync(filePath);
      return { name, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

function listByExt(ext) {
  if (!fs.existsSync(distDir)) return [];
  return fs.readdirSync(distDir).filter((f) => f.toLowerCase().endsWith(ext));
}

function writeFile(relPath, content, mode) {
  const full = path.join(outDir, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, 'utf8');
  if (mode) fs.chmodSync(full, mode);
}

function main() {
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  ensureDir(outDir);
  ensureDir(path.join(outDir, 'windows'));
  ensureDir(path.join(outDir, 'linux'));
  ensureDir(path.join(outDir, 'macos'));

  const portableExe = pickLatest(listByExt('.exe').filter((f) => !f.toLowerCase().includes('setup')));
  const appImage = pickLatest(listByExt('.appimage'));
  const dmg = pickLatest(listByExt('.dmg'));
  const macZip = pickLatest(listByExt('.zip').filter((f) => f.toLowerCase().includes('mac')));
  const linuxZip = pickLatest(listByExt('.zip').filter((f) => f.toLowerCase().includes('linux')));

  if (portableExe) copyIfExists(path.join(distDir, portableExe), path.join(outDir, 'windows', portableExe));
  if (appImage) copyIfExists(path.join(distDir, appImage), path.join(outDir, 'linux', appImage));
  if (linuxZip) copyIfExists(path.join(distDir, linuxZip), path.join(outDir, 'linux', linuxZip));
  if (dmg) copyIfExists(path.join(distDir, dmg), path.join(outDir, 'macos', dmg));
  if (macZip) copyIfExists(path.join(distDir, macZip), path.join(outDir, 'macos', macZip));

  if (fs.existsSync(sourceReactionHtml)) {
    copyIfExists(sourceReactionHtml, path.join(outDir, 'reaction.html'));
  }

  writeFile(
    'overlay-config.js',
    'window.CHAT_REACTION_CONFIG = {\n  "version": 1,\n  "generatedAt": null,\n  "globalVolume": 1,\n  "animationDirection": "right",\n  "twitch": {\n    "channel": "",\n    "bot": "",\n    "token": ""\n  },\n  "reactions": []\n};\n'
  );

  writeFile(
    'launch-linux.sh',
    '#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\napp="$(ls linux/*.AppImage 2>/dev/null | head -n1 || true)"\nif [[ -z "$app" ]]; then\n  echo "No Linux AppImage found in ./linux"\n  exit 1\nfi\nchmod +x "$app"\nexec "$app"\n',
    0o755
  );

  writeFile(
    'launch-windows.bat',
    '@echo off\r\ncd /d "%~dp0"\r\nfor %%f in (windows\\*.exe) do (\r\n  start "" "%%f"\r\n  goto :eof\r\n)\r\necho No Windows executable found in .\\windows\r\nexit /b 1\r\n'
  );

  writeFile(
    'launch-macos.command',
    '#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\nif ls macos/*.dmg >/dev/null 2>&1; then\n  open "$(ls macos/*.dmg | head -n1)"\n  exit 0\nfi\nif ls macos/*.zip >/dev/null 2>&1; then\n  open "$(ls macos/*.zip | head -n1)"\n  exit 0\nfi\necho "No macOS artifact found in ./macos"\nexit 1\n',
    0o755
  );

  const summary = [
    '# ChatReaction Multi-Platform Bundle',
    '',
    'This folder groups the packaged artifacts in one place:',
    '- reaction.html and overlay-config.js at folder root for OBS Browser Source usage',
    '- windows/: .exe artifacts (portable and/or installer)',
    '- linux/: AppImage and optional Linux zip',
    '- macos/: dmg and/or mac zip',
    '',
    'Launchers included:',
    '- launch-windows.bat',
    '- launch-linux.sh',
    '- launch-macos.command',
    '',
    'If a platform artifact is missing, build it first from a compatible OS and run `npm run release:bundle` again.',
    ''
  ].join('\n');

  writeFile('README.txt', summary);

  console.log('[release] Bundle assembled at:', outDir);
}

main();
