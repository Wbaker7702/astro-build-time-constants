#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DEFAULT_THRESHOLD = 80;

const rawArg = process.argv.find((arg) => arg.startsWith('--threshold='));
const cliThreshold = rawArg ? Number(rawArg.split('=')[1]) : undefined;
const envThreshold = process.env.DOCSTRING_THRESHOLD
  ? Number(process.env.DOCSTRING_THRESHOLD)
  : undefined;
const threshold = [cliThreshold, envThreshold, DEFAULT_THRESHOLD].find(
  (value) => typeof value === 'number' && !Number.isNaN(value),
);

if (typeof threshold !== 'number' || Number.isNaN(threshold)) {
  console.error('Docstring coverage threshold must be a valid number.');
  process.exit(1);
}

if (!fs.existsSync(SRC_DIR)) {
  console.log('No src directory detected; docstring coverage assumed at 100%.');
  process.exit(0);
}

const tsFiles = collectTsFiles(SRC_DIR);

let totalExports = 0;
let documentedExports = 0;
const missingDocstrings = [];

for (const filePath of tsFiles) {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!isExportedDeclaration(line)) {
      return;
    }

    totalExports += 1;

    if (hasDocComment(lines, index)) {
      documentedExports += 1;
    } else {
      missingDocstrings.push({
        filePath,
        line: index + 1,
        declaration: line.trim(),
      });
    }
  });
}

const coverage = totalExports === 0 ? 100 : (documentedExports / totalExports) * 100;
const formattedCoverage = coverage.toFixed(2);

console.log(`Docstring coverage: ${formattedCoverage}% (${documentedExports}/${totalExports})`);

if (missingDocstrings.length > 0) {
  console.log('\nMissing docstrings:');
  missingDocstrings.forEach(({ filePath, line, declaration }) => {
    console.log(` - ${filePath}:${line} -> ${declaration}`);
  });
}

if (coverage + Number.EPSILON < threshold) {
  console.error(`\nDocstring coverage threshold of ${threshold}% not met.`);
  process.exit(1);
}

function collectTsFiles(targetDir) {
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '__tests__'].includes(entry.name)) {
        continue;
      }

      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function isExportedDeclaration(line) {
  const trimmed = line.trim();

  if (!trimmed.startsWith('export')) {
    return false;
  }

  if (/^export\s*\{/.test(trimmed)) {
    return false; // Re-export block
  }

  if (/^export\s+default\s+(class|function)\b/.test(trimmed)) {
    return true;
  }

  return /^export\s+(const|let|var|function|class|interface|type)\b/.test(trimmed);
}

function hasDocComment(lines, declarationIndex) {
  let index = declarationIndex - 1;
  let insideBlock = false;

  while (index >= 0) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!insideBlock) {
      if (line === '') {
        index -= 1;
        continue;
      }

      if (line.startsWith('/**')) {
        return true;
      }

      if (line.endsWith('*/')) {
        insideBlock = true;
        if (line.includes('/**')) {
          return true;
        }
        index -= 1;
        continue;
      }

      return false;
    }

    if (line.includes('/**')) {
      return true;
    }

    if (line.includes('/*')) {
      return false;
    }

    index -= 1;
  }

  return false;
}
