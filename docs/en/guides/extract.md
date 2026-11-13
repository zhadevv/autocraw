# Structured extraction with AI

`extract` scrapes a page to Markdown and asks an AI model to return JSON. If you provide a JSON schema, the answer is validated and retried once with the problems fed back to the model.

```sh
zac extract example.com/product --schema product.schema.json --api-key YOUR_KEY
```

`product.schema.json`:

```json
{
  "type": "object",
  "required": ["name", "price"],
  "additionalProperties": false,
  "properties": {
    "name": { "type": "string" },
    "price": { "type": ["number", "null"] },
    "inStock": { "type": "boolean" }
  }
}
```

Or only a prompt:

```sh
zac extract example.com/about --prompt "company name, founding year and headquarters"
```

## Providers

OpenAI and Anthropic. Choose with `--ai-provider`, or let autocraw infer it from the key prefix (`sk-ant-` is Anthropic) or from `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. Override the model with `--ai-model`.

## Behavior

- Page content is passed to the model inside `<page>` tags and the model is told to treat it as data and ignore instructions in it. This reduces, but does not eliminate, prompt injection risk. Never use extracted values to run code or make privileged decisions without checking them.
- Missing values are returned as null; the model is told not to invent data.
- Content is truncated to the input token budget. When this happens `contentTruncated` is true.
- Output for one URL is an object; for several it is an array. Each result has `ok`, `data`, `errors`, `model`, token counts and `contentTruncated`.
- The exit code is 1 when any page failed validation.

## Supported schema keywords

`type` (including arrays of types), `enum`, `const`, `properties`, `required`, `additionalProperties: false`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `anyOf`, `oneOf`. `$ref` is not supported and is rejected; inline the referenced schema. Other keywords are ignored by the validator, though the model still sees them.

## Library

```ts
const [result] = await crawler.extract('example.com/product', {
  ai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY! },
  schema,
  prompt: 'Extract the product',
  maxAttempts: 2,
});
if (result.ok) console.log(result.data);
else console.error(result.errors);
```

## Cost

Each page costs roughly its Markdown size in input tokens plus the schema, with up to two attempts. Use `--include-tag` or the default main-content mode to keep input small, and `--ai-max-input` to cap it.
