import { describe, expect, it } from 'vitest';
import { assertSupportedSchema, validateJsonSchema } from '../../src/core/json-schema';
import { parseJsonLoose, truncateToTokens } from '../../src/core/extract';

const schema = {
  type: 'object',
  required: ['title', 'episodes'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1 },
    episodes: { type: 'integer', minimum: 0 },
    status: { enum: ['ongoing', 'completed'] },
    genres: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    rating: { type: ['number', 'null'] },
  },
};

describe('validateJsonSchema', () => {
  it('accepts a valid value', () => {
    expect(validateJsonSchema({ title: 'A', episodes: 12, status: 'ongoing', genres: ['x'], rating: null }, schema)).toEqual([]);
  });

  it('reports every problem with a path', () => {
    const errors = validateJsonSchema({ title: '', episodes: 1.5, status: 'x', genres: [1, 2, 3, 4], extra: true }, schema);
    expect(errors).toEqual(
      expect.arrayContaining([
        '$.title: shorter than 1',
        '$.episodes: expected integer but got number',
        '$.status: value is not one of the allowed options',
        '$.genres: more than 3 items',
        '$.genres[0]: expected string but got number',
        '$.extra: unexpected property',
      ]),
    );
  });

  it('reports missing required properties', () => {
    expect(validateJsonSchema({}, schema)).toEqual(expect.arrayContaining(['$.title: required property is missing', '$.episodes: required property is missing']));
  });

  it('rejects $ref', () => {
    expect(() => assertSupportedSchema({ properties: { a: { $ref: '#/defs/a' } } })).toThrow(/Unsupported/);
  });
});

describe('extract helpers', () => {
  it('parses JSON wrapped in fences or prose', () => {
    const fence = '`'.repeat(3);
    expect(parseJsonLoose(`${fence}json\n{"a":1}\n${fence}`)).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":{"b":[1,2]}} thanks')).toEqual({ a: { b: [1, 2] } });
    expect(() => parseJsonLoose('no json here')).toThrow(/valid JSON/);
  });

  it('truncates long content to a token budget', () => {
    const text = 'word '.repeat(5000);
    const result = truncateToTokens(text, 200);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(text.length);
    expect(truncateToTokens('short', 200)).toEqual({ text: 'short', truncated: false });
  });
});
