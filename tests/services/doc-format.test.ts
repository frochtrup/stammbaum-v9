// tests/services/doc-format.test.ts — BL-139: Formaterkennung (GEDCOM vs GRAMPS) +
// gzip-Codec-Roundtrip. Beide sind Plattform-Seam-Bausteine des GRAMPS-Imports.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectDocFormat, isGzip } from '../../services/file/doc-format';
import { CompressionStreamGzipCodec } from '../../services/file/gzip-codec';

const grampsXml = readFileSync(join(__dirname, '../fixtures/mini.small.gramps'), 'utf8');

describe('detectDocFormat', () => {
  it('erkennt GRAMPS-XML (xml-Deklaration / <database> / Namespace)', () => {
    expect(detectDocFormat(grampsXml)).toBe('gramps');
    expect(detectDocFormat('<database xmlns="http://gramps-project.org/xml/1.7.2/"></database>')).toBe('gramps');
    expect(detectDocFormat('﻿  \n<?xml version="1.0"?>\n<database/>')).toBe('gramps');
  });

  it('erkennt GEDCOM (beginnt nie mit <)', () => {
    expect(detectDocFormat('0 HEAD\n1 SOUR X\n0 TRLR')).toBe('gedcom');
    expect(detectDocFormat('  \n0 @I1@ INDI')).toBe('gedcom');
  });
});

describe('isGzip', () => {
  it('erkennt das gzip-Magic 1F 8B', () => {
    expect(isGzip(new Uint8Array([0x1f, 0x8b, 0x08]))).toBe(true);
    expect(isGzip(new Uint8Array([0x3c, 0x3f, 0x78]))).toBe(false); // "<?x"
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
  });
});

describe('CompressionStreamGzipCodec', () => {
  it('gzip → gunzip ist verlustfrei (auch mit Unicode)', async () => {
    const codec = new CompressionStreamGzipCodec();
    const text = grampsXml + '\n<!-- Ümläute & <sic> -->';
    const bytes = await codec.gzip(text);
    expect(isGzip(bytes)).toBe(true); // echte gzip-Bytes
    expect(await codec.gunzip(bytes)).toBe(text);
  });
});
