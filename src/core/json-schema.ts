import { AutocrawError } from '../utils/errors';

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function displayType(value: unknown): string {
  const actual = typeOf(value);
  return actual === 'integer' ? 'number' : actual;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

export function assertSupportedSchema(schema: unknown, path = '$'): void {
  if (schema === null || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => assertSupportedSchema(item, `${path}[${index}]`));
    return;
  }
  const record = schema as Schema;
  if ('$ref' in record) throw new AutocrawError('E_INPUT', `Unsupported "$ref" at ${path}. Inline the referenced schema instead.`);
  for (const [key, value] of Object.entries(record)) assertSupportedSchema(value, `${path}.${key}`);
}

export function validateJsonSchema(value: unknown, schema: Schema, path = '$'): string[] {
  const errors: string[] = [];
  const type = schema.type;
  if (type !== undefined) {
    const types = Array.isArray(type) ? (type as string[]) : [type as string];
    if (!types.some((item) => matchesType(value, item))) {
      errors.push(`${path}: expected ${types.join(' or ')} but got ${displayType(value)}`);
      return errors;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${path}: value is not one of the allowed options`);
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: value must equal the constant ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const options = (schema.anyOf ?? schema.oneOf) as Schema[];
    if (!options.some((option) => validateJsonSchema(value, option, path).length === 0)) errors.push(`${path}: value does not match any allowed shape`);
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern ${schema.pattern}`);
      } catch {
        errors.push(`${path}: schema pattern is not a valid regular expression`);
      }
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items as Schema, `${path}[${index}]`)));
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in record)) errors.push(`${path}.${key}: required property is missing`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) errors.push(...validateJsonSchema(record[key], child, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) if (!(key in properties)) errors.push(`${path}.${key}: unexpected property`);
    }
  }
  return errors;
}
