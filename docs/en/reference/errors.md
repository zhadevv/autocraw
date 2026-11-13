# Errors and exit codes

Errors raised on purpose are `AutocrawError` with `code`, `message` and `details`.

| Code | Meaning | CLI exit | Server HTTP |
| --- | --- | --- | --- |
| `E_CONFIG` | Invalid configuration or missing credentials | 2 | 400 |
| `E_INPUT` | Invalid input such as a bad URL, selector, action or schema | 2 | 400 |
| `E_BLOCKED` | Blocked by anti-bot protection | 3 | 502 |
| `E_ROBOTS` | Disallowed by robots.txt | 3 | 403 |
| `E_HTTP` | Unexpected HTTP result or too many redirects | 4 | 502 |
| `E_NETWORK` | Network failure | 4 | 502 |
| `E_TIMEOUT` | Timed out | 4 | 504 |
| `E_BROWSER` | Browser missing, failed to start, or an action failed | 5 | 502 |
| `E_CAPTCHA` | A captcha could not be solved | 5 | 502 |
| `E_AI` | AI provider error | 6 | 502 |
| `E_AI_AUTH` | Key rejected or no quota | 6 | 502 |
| `E_AI_RATE_LIMIT` | Provider rate limit after retries | 6 | 429 |
| `E_AI_CONTEXT` | Prompt or output exceeds the model limit, or the report does not fit the token budget | 6 | 422 |
| `E_IO` | File could not be read or written | 7 | 500 |
| `E_PARSE` | Content or JSON could not be parsed | 7 | 422 |

`E_BLOCKED` and `E_BROWSER` messages include a suggested next step. Common causes and fixes are in [troubleshooting](../troubleshooting.md).
