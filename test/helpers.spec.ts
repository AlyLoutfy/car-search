import { describe, expect, it } from 'vitest';
import { extractAssignedJson, slugToTitle } from '../src/parsers/helpers';

describe('slugToTitle', () => {
  it('title-cases a hyphenated slug', () => {
    expect(slugToTitle('seat-leon-2020')).toBe('Seat Leon 2020');
  });
});

describe('extractAssignedJson', () => {
  it('reads the object even when more script follows it', () => {
    const html = '<script>window.state = {"a":{"b":[1,2]}};\nwindow.other = {"c":3};</script>';
    expect(extractAssignedJson(html, 'window.state')).toEqual({ a: { b: [1, 2] } });
  });

  it('is not fooled by braces or escaped quotes inside strings', () => {
    const html = String.raw`window.state = {"text":"a } b \" { c","n":1};`;
    expect(extractAssignedJson(html, 'window.state')).toEqual({ text: 'a } b " { c', n: 1 });
  });

  it('returns undefined when the assignment is missing or truncated', () => {
    expect(extractAssignedJson('<html></html>', 'window.state')).toBeUndefined();
    expect(extractAssignedJson('window.state = {"a":{', 'window.state')).toBeUndefined();
  });
});
