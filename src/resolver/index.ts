import type { Page } from 'playwright';
import { AutocrawError } from '../utils/errors';
import { awsWaf } from './aws-waf';
import { cloudflareChallenges } from './cloudflare-challenges';
import { cloudflareTurnstile } from './cloudflare-turnstile';
import { geetest } from './geetest';
import { powblock } from './powblock';
import { recaptchaEnterprise } from './recaptcha-enterprise';
import { recaptchaV2 } from './recaptcha-v2';
import { recaptchaV3 } from './recaptcha-v3';
import { wobble } from './wobble';
import {
  grepSitekey,
  isAwsWaf,
  isCloudflareChallenge,
  isGeetest,
  isPowblock,
  isRecaptchaEnterprise,
  isRecaptchaV2,
  isRecaptchaV3,
  isTurnstile,
  isWobble,
  readPage,
} from './shared';
import type { CaptchaKind, DetectionInput, Resolver, ResolverResult, SolveOptions } from './shared';

export { installGeetestHook } from './geetest';
export { leadingZeroBits, solvePowToken } from './powblock';
export { grepSitekey, installSitekeyHook, isInterstitial } from './shared';

const resolvers: Resolver[] = [
  cloudflareChallenges,
  cloudflareTurnstile,
  recaptchaV2,
  recaptchaEnterprise,
  recaptchaV3,
  geetest,
  awsWaf,
  wobble,
  powblock,
];

export interface SolveCaptchaOptions extends SolveOptions {
  readonly kind?: CaptchaKind;
}

export function registerResolver(resolver: Resolver): void {
  const index = resolvers.findIndex((item) => item.kind === resolver.kind);
  if (index >= 0) resolvers[index] = resolver;
  else resolvers.push(resolver);
}

export function listResolvers(): CaptchaKind[] {
  return resolvers.map((resolver) => resolver.kind);
}

export function getResolver(kind: CaptchaKind): Resolver {
  const resolver = resolvers.find((item) => item.kind === kind);
  if (!resolver) throw new AutocrawError('E_CAPTCHA', `Unknown captcha resolver: ${kind}`, { kind, available: listResolvers() });
  return resolver;
}

export function detectKinds(input: DetectionInput): CaptchaKind[] {
  const kinds: CaptchaKind[] = [];
  if (isCloudflareChallenge(input)) kinds.push('cloudflare-challenges');
  if (isTurnstile(input)) kinds.push('cloudflare-turnstile');
  if (isRecaptchaV2(input)) kinds.push('recaptcha-v2');
  if (isRecaptchaEnterprise(input)) kinds.push('recaptcha-enterprise');
  if (isRecaptchaV3(input)) kinds.push('recaptcha-v3');
  if (isGeetest(input)) kinds.push('geetest');
  if (isAwsWaf(input)) kinds.push('aws-waf');
  if (isWobble(input)) kinds.push('wobble');
  if (isPowblock(input)) kinds.push('powblock');
  return kinds;
}

export async function detectCaptcha(page: Page): Promise<CaptchaKind[]> {
  const kinds = detectKinds(await readPage(page));
  if (!kinds.includes('cloudflare-turnstile') && (await grepSitekey(page)).length > 0) kinds.push('cloudflare-turnstile');
  return kinds;
}

export async function detectCaptchaKind(page: Page): Promise<CaptchaKind | null> {
  return (await detectCaptcha(page))[0] ?? null;
}

export async function solveCaptcha(page: Page, options: SolveCaptchaOptions = {}): Promise<ResolverResult> {
  if (options.kind) return getResolver(options.kind).solve(page, options);
  const [kind] = await detectCaptcha(page);
  if (!kind) throw new AutocrawError('E_CAPTCHA', 'No supported captcha detected on the page', { url: page.url() });
  return getResolver(kind).solve(page, options);
}

export { awsWaf, cloudflareChallenges, cloudflareTurnstile, geetest, powblock, recaptchaV2, recaptchaV3, recaptchaEnterprise, wobble };
export type { CaptchaKind, DetectionInput, Resolver, ResolverResult, SolveOptions };
