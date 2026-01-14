import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createAstroBuildTimeModule, runAstroBuildTimeConstants } from '../src/index';

describe('createAstroBuildTimeModule', () => {
  it('generates deterministic output for a fixed date', () => {
    const fixedDate = new Date('2024-01-02T03:04:05.678Z');
    const output = createAstroBuildTimeModule(
      { featureFlag: true, nested: { value: 42 } },
      fixedDate,
    );

    expect(output).toContain('epoch: 1704164646');
    expect(output).toContain('seconds: 5');
    expect(output).toContain('minutes: 4');
    expect(output).toContain('hours: 3');
    expect(output).toContain('fullYear: 2024');
    expect(output).toContain('month: 1');
    expect(output).toContain('date: 2');
    expect(output).toContain('    iso: "2024-01-02T03:04:05.678Z",');
    expect(output).toContain('featureFlag');
    expect(output).toContain('nested');
  });
});

describe('runAstroBuildTimeConstants', () => {
  it('writes the generated module to disk and ensures directories exist', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-build-time-constants-'));
    const outputFile = path.join(tmpRoot, 'nested', 'astro-build-time-constants.ts');

    runAstroBuildTimeConstants({ testKey: 'test-value' }, {
      outputFile,
      now: new Date('2024-06-15T16:30:40.000Z'),
    });

    const content = fs.readFileSync(outputFile, 'utf8');
    expect(content).toContain('testKey');
    expect(content).toContain('2024-06-15T16:30:40.000Z');

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});
