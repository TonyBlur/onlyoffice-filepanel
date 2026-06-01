const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'web', 'dist');
const target = path.join(root, 'dist', 'web', 'build');

if (!fs.existsSync(source)) {
  throw new Error(`Frontend build output not found: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
