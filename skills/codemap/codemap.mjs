#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Configuration
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'vendor',
  '.next',
  '__pycache__',
  '.venv',
  'target',
  '.cache',
  '.coverage',
  '.pytest_cache',
  '.tox',
  'venv',
  'env',
  'ENV',
  '.vscode',
  '.idea',
  '.DS_Store',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.rb',
  '.swift',
  '.kt',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.lua',
  '.zig',
]);

const CONFIG_EXTENSIONS = new Set([
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.md',
]);

const ENTRY_POINT_PATTERNS = [
  /^index\./,
  /^main\./,
  /^mod\./,
  /^lib\./,
  /^app\./,
];

const PROJECT_FILES = new Map([
  ['package.json', 'Node.js'],
  ['go.mod', 'Go'],
  ['Cargo.toml', 'Rust'],
  ['pyproject.toml', 'Python'],
  ['setup.py', 'Python'],
  ['pom.xml', 'Java/Maven'],
  ['build.gradle', 'Java/Gradle'],
  ['Gemfile', 'Ruby'],
  ['swift.package', 'Swift'],
  ['tsconfig.json', 'TypeScript'],
  ['gradle.properties', 'Gradle'],
  ['Makefile', 'Make'],
  ['CMakeLists.txt', 'CMake'],
]);

// Parse arguments
let targetDir = '.';
let maxDepth = 4;
let outputFile = 'codemap.md';

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--depth' && i + 1 < process.argv.length) {
    maxDepth = parseInt(process.argv[++i], 10);
  } else if (arg === '--output' && i + 1 < process.argv.length) {
    outputFile = process.argv[++i];
  } else if (!arg.startsWith('--')) {
    targetDir = arg;
  }
}

// Resolve to absolute path
targetDir = path.resolve(targetDir);

// Resolve output file path relative to current directory if not absolute
if (!path.isAbsolute(outputFile)) {
  outputFile = path.resolve(outputFile);
}

// Parse .gitignore patterns (simple implementation)
function parseGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  const patterns = [];

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    content.split('\n').forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        patterns.push(line);
      }
    });
  }

  return patterns;
}

// Check if path should be ignored
function shouldIgnore(name, dir, gitignorePatterns) {
  if (IGNORE_DIRS.has(name)) return true;

  for (const pattern of gitignorePatterns) {
    if (pattern.includes('/')) continue; // Skip complex patterns for now
    if (name === pattern || pattern === `${name}/`) return true;
  }

  return false;
}

// Walk directory tree and collect files
function walkDir(dir, depth, maxDepth, gitignorePatterns, result) {
  if (depth > maxDepth) return;

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }

  entries.forEach((entry) => {
    if (shouldIgnore(entry.name, dir, gitignorePatterns)) return;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(targetDir, fullPath);

    if (entry.isDirectory()) {
      result.dirs.push({ path: relativePath, depth });
      walkDir(fullPath, depth + 1, maxDepth, gitignorePatterns, result);
    } else {
      const ext = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(ext) || CONFIG_EXTENSIONS.has(ext)) {
        result.files.push({
          path: relativePath,
          name: entry.name,
          ext,
          depth,
          isSource: SOURCE_EXTENSIONS.has(ext),
          isConfig: CONFIG_EXTENSIONS.has(ext),
          isEntryPoint: ENTRY_POINT_PATTERNS.some((p) => p.test(entry.name)),
        });
      }
    }
  });
}

// Detect project patterns
function detectPatterns(files) {
  const patterns = new Set();

  files.forEach((file) => {
    PROJECT_FILES.forEach((label, filename) => {
      if (file.name === filename) {
        patterns.add(label);
      }
    });
  });

  return Array.from(patterns).sort();
}

// Build directory tree with file counts
function buildDirTree(files) {
  const dirCounts = new Map();

  files.forEach((file) => {
    const dir = path.dirname(file.path);
    if (!dirCounts.has(dir)) {
      dirCounts.set(dir, { source: 0, config: 0 });
    }
    const counts = dirCounts.get(dir);
    if (file.isSource) counts.source++;
    if (file.isConfig) counts.config++;
  });

  const tree = [];
  const dirs = Array.from(dirCounts.entries());
  dirs.sort((a, b) => a[0].localeCompare(b[0]));

  dirs.forEach(([dir, counts]) => {
    const depth = dir === '.' ? 0 : dir.split(path.sep).length;
    const indent = '  '.repeat(depth);
    const srcLabel = counts.source > 0 ? ` (${counts.source} src)` : '';
    const cfgLabel = counts.config > 0 ? ` (${counts.config} cfg)` : '';
    tree.push(`${indent}${path.basename(dir) || '.' }/${srcLabel}${cfgLabel}`);
  });

  return tree;
}

// Group files by directory
function groupFilesByDir(files) {
  const grouped = new Map();

  files.forEach((file) => {
    const dir = path.dirname(file.path);
    if (!grouped.has(dir)) {
      grouped.set(dir, []);
    }
    grouped.get(dir).push(file);
  });

  const result = [];
  const entries = Array.from(grouped.entries());
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  entries.forEach(([dir, dirFiles]) => {
    const indent = '  '.repeat(Math.max(0, dir.split(path.sep).length - 1));
    result.push(`${indent}**${dir}/**`);
    dirFiles.forEach((file) => {
      result.push(`${indent}  - \`${file.name}\``);
    });
  });

  return result;
}

// Generate markdown output
function generateMarkdown(projectName, dirTree, files, patterns) {
  const lines = [];

  lines.push(`# Codemap: ${projectName}`);
  lines.push('');

  // Directory tree section
  lines.push('## Directory Structure');
  lines.push('');
  dirTree.forEach((line) => lines.push(line));
  lines.push('');

  // File index section
  lines.push('## Source Files');
  lines.push('');
  groupFilesByDir(files).forEach((line) => lines.push(line));
  lines.push('');

  // Entry points section
  const entryPoints = files.filter((f) => f.isEntryPoint);
  if (entryPoints.length > 0) {
    lines.push('## Entry Points');
    lines.push('');
    entryPoints.forEach((file) => {
      lines.push(`- \`${file.path}\``);
    });
    lines.push('');
  }

  // Project patterns section
  if (patterns.length > 0) {
    lines.push('## Project Patterns');
    lines.push('');
    patterns.forEach((pattern) => {
      lines.push(`- **${pattern}**`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// Main execution
try {
  const gitignorePatterns = parseGitignore(targetDir);
  const result = { dirs: [], files: [] };

  walkDir(targetDir, 0, maxDepth, gitignorePatterns, result);

  const projectName = path.basename(targetDir);
  const dirTree = buildDirTree(result.files);
  const patterns = detectPatterns(result.files);
  const markdown = generateMarkdown(projectName, dirTree, result.files, patterns);

  if (outputFile === '/dev/stdout') {
    console.log(markdown);
  } else {
    fs.writeFileSync(outputFile, markdown);
    console.error(`✓ Codemap written to ${outputFile}`);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
