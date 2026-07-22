'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const scanRoots = [
  'Backend_server/admin',
  'Backend_server/public',
  'Backend_server/js',
  'WebMapEditor'
];
const colorPattern = /#[0-9a-fA-F]{3,8}\b/g;
const tokenFiles = new Set([
  'Backend_server/admin/css/admin-tokens.css',
  'Backend_server/public/css/landing-tokens.css',
  'WebMapEditor/css/editor-tokens.css'
]);
// Baseline legacy ghi nhận khi bật gate; không mở rộng danh sách này cho component mới.
const legacyAllowlist = new Set((
  '#f2f4f7 #f79009 #ee46bc #12b76a #f04438 #98a2b3 #344054 #e4e7ec ' +
  '#101828 #64748b #fff #f3f5ff #465fff #e8edf3 #1d2939 #667085 #f8fafc ' +
  '#475467 #d0d5dd #9aa8ff #f9fafb #f0f2f5 #fafbff #ecfdf3 #027a48 ' +
  '#fef3f2 #d92d20 #eff8ff #175cd3 #fff7e8 #b54708 #fda29b #b42318 ' +
  '#3641f5 #b8860b #f5faff #cfe2ff #1d4ed8 #666 #ddd #eaecf0 #95a5a6 ' +
  '#e74c3c #f5f8ff #d6e4ff #3b6fd4 #888 #c0392b #dbeafe #15803d ' +
  '#2563eb #0f172a #e5e7eb #0b1120 #111827 #334155 #aeb9c9 #075985 ' +
  '#0f766e #172033 #06b6d4 #f97316 #ec4899 #0b1220 #60a5fa #93c5fd ' +
  '#dbe4ee #1e293b #94a3b8 ' +
  '#172554 #3b82f6 #e11d48 #475569 #22c55e #f59e0b #ef4444 #ffffff ' +
  '#3498db #9b59b6 #27ae60 #e67e22 #92400e #dc2626 #0ea5e9 #14b8a6 ' +
  '#8b5cf6 #ff0000 #00ff00'
).split(/\s+/));

function runGit(args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
}

function gitDiff() {
  const localDiff = runGit(['diff', '--quiet', 'HEAD', '--', ...scanRoots]);
  const base = process.env.WEB_COLOR_BASE_REF || (localDiff.status === 1 ? 'HEAD' : 'HEAD~1');
  const result = runGit(['diff', '--unified=0', '--no-ext-diff', base, '--', ...scanRoots]);
  if (result.status !== 0) {
    console.error(result.stderr || ('Không đọc được git diff từ ' + base));
    process.exit(2);
  }
  return result.stdout;
}

let currentFile = '';
const violations = [];
gitDiff().split(/\r?\n/).forEach((line) => {
  if (line.startsWith('+++ b/')) {
    currentFile = line.slice(6).replace(/\\/g, '/');
    return;
  }
  if (!line.startsWith('+') || line.startsWith('+++') || tokenFiles.has(currentFile)) return;
  const colors = line.match(colorPattern) || [];
  colors.forEach((color) => {
    const normalized = color.toLowerCase();
    if (!legacyAllowlist.has(normalized)) {
      violations.push(currentFile + ': màu mới ' + normalized);
    }
  });
});

if (violations.length) {
  console.error('Không thêm mã màu trực tiếp; khai báo token rồi dùng var(...):');
  violations.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}
console.log('Color gate pass: không có mã màu mới ngoài token.');
