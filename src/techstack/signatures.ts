import type { Technology } from '../types';

export type ProbeSource = 'html' | 'script-src' | 'inline' | 'header' | 'cookie' | 'meta-generator' | 'link' | 'selector';

export interface Probe {
  source: ProbeSource;
  pattern: RegExp | string;
  header?: string;
  version?: RegExp;
  weight?: number;
  label?: string;
}

export interface Signature {
  name: string;
  category: Technology['category'];
  probes: Probe[];
  implies?: string[];
}

const p = (source: ProbeSource, pattern: RegExp | string, extra: Partial<Probe> = {}): Probe => ({ source, pattern, ...extra });

export const SIGNATURES: Signature[] = [
  {
    name: 'Next.js',
    category: 'meta-framework',
    implies: ['React'],
    probes: [
      p('selector', '[id="__NEXT_DATA__"]', { weight: 0.6, label: '__NEXT_DATA__ script' }),
      p('html', /\/_next\/static\//, { weight: 0.5, label: '/_next/static assets' }),
      p('inline', /self\.__next_f/, { weight: 0.6, label: 'self.__next_f flight chunks' }),
      p('header', /Next\.js\s*([\d.]+)?/i, { header: 'x-powered-by', version: /Next\.js\s*([\d.]+)/i, weight: 0.6 }),
      p('header', /./, { header: 'x-nextjs-cache', weight: 0.4 }),
      p('header', /./, { header: 'x-nextjs-prerender', weight: 0.4 }),
    ],
  },
  {
    name: 'Nuxt',
    category: 'meta-framework',
    implies: ['Vue.js'],
    probes: [
      p('selector', '[id="__nuxt"]', { weight: 0.5, label: '__nuxt root' }),
      p('selector', '[id="__NUXT_DATA__"]', { weight: 0.6, label: '__NUXT_DATA__ script' }),
      p('inline', /window\.__NUXT__/, { weight: 0.6, label: 'window.__NUXT__' }),
      p('html', /\/_nuxt\//, { weight: 0.5, label: '/_nuxt assets' }),
    ],
  },
  {
    name: 'Remix',
    category: 'meta-framework',
    implies: ['React'],
    probes: [
      p('inline', /__remixContext|__remixManifest|__remixRouteModules/, { weight: 0.8, label: 'Remix context globals' }),
      p('html', /data-remix/i, { weight: 0.3 }),
    ],
  },
  {
    name: 'SvelteKit',
    category: 'meta-framework',
    implies: ['Svelte'],
    probes: [
      p('html', /\/_app\/immutable\//, { weight: 0.6, label: '/_app/immutable assets' }),
      p('inline', /__sveltekit_/, { weight: 0.7, label: '__sveltekit bootstrap' }),
      p('selector', '[data-sveltekit-preload-data]', { weight: 0.5 }),
    ],
  },
  {
    name: 'Astro',
    category: 'meta-framework',
    probes: [
      p('selector', 'astro-island', { weight: 0.8, label: 'astro-island element' }),
      p('meta-generator', /^Astro\s*v?([\d.]+)?/i, { version: /Astro\s*v?([\d.]+)/i, weight: 0.8 }),
      p('html', /\/_astro\//, { weight: 0.5, label: '/_astro assets' }),
      p('selector', '[data-astro-cid]', { weight: 0.4 }),
    ],
  },
  {
    name: 'Qwik',
    category: 'meta-framework',
    probes: [
      p('selector', '[q\\:container]', { weight: 0.9, label: 'q:container attribute' }),
      p('selector', 'script[type="qwik/json"]', { weight: 0.7 }),
    ],
  },
  {
    name: 'Gatsby',
    category: 'meta-framework',
    implies: ['React'],
    probes: [
      p('selector', '[id="___gatsby"]', { weight: 0.8, label: '___gatsby root' }),
      p('meta-generator', /Gatsby\s*([\d.]+)?/i, { version: /Gatsby\s*([\d.]+)/i, weight: 0.8 }),
      p('html', /\/page-data\/.*page-data\.json/, { weight: 0.4 }),
    ],
  },
  {
    name: 'Angular',
    category: 'framework',
    probes: [
      p('selector', '[ng-version]', { weight: 0.9, label: 'ng-version attribute' }),
      p('selector', 'app-root', { weight: 0.3 }),
      p('script-src', /(?:^|\/)(?:main|polyfills|runtime)(?:[.-][a-f0-9]{8,})?\.js/, { weight: 0.2 }),
    ],
  },
  {
    name: 'React',
    category: 'framework',
    probes: [
      p('selector', '[data-reactroot]', { weight: 0.8, label: 'data-reactroot' }),
      p('script-src', /react(?:-dom)?(?:\.production)?(?:\.min)?\.js|react@[\d.]+/i, { weight: 0.7, version: /react(?:-dom)?@([\d.]+)/i }),
      p('inline', /__REACT_DEVTOOLS_GLOBAL_HOOK__|react-dom/, { weight: 0.3 }),
      p('selector', '[id="root"]', { weight: 0.15 }),
    ],
  },
  {
    name: 'Vue.js',
    category: 'framework',
    probes: [
      p('selector', '[data-v-app]', { weight: 0.8, label: 'data-v-app' }),
      p('selector', '[data-server-rendered="true"]', { weight: 0.8 }),
      p('script-src', /vue(?:\.global)?(?:\.prod)?(?:\.min)?\.js|vue@[\d.]+/i, { weight: 0.7, version: /vue@([\d.]+)/i }),
      p('html', /\sdata-v-[0-9a-f]{8}/, { weight: 0.5, label: 'scoped style attributes' }),
    ],
  },
  {
    name: 'Svelte',
    category: 'framework',
    probes: [p('html', /class="[^"]*\bsvelte-[a-z0-9]{5,8}/, { weight: 0.8, label: 'svelte scoped classes' })],
  },
  {
    name: 'SolidJS',
    category: 'framework',
    probes: [
      p('selector', '[data-hk]', { weight: 0.8, label: 'data-hk hydration keys' }),
      p('inline', /_\$HY/, { weight: 0.8 }),
    ],
  },
  {
    name: 'Alpine.js',
    category: 'framework',
    probes: [p('selector', '[x-data]', { weight: 0.7 }), p('script-src', /alpinejs|alpine(?:\.min)?\.js/i, { weight: 0.7 })],
  },
  {
    name: 'htmx',
    category: 'library',
    probes: [p('selector', '[hx-get], [hx-post], [hx-trigger]', { weight: 0.7 }), p('script-src', /htmx(?:\.min)?\.js/i, { weight: 0.7 })],
  },
  {
    name: 'Livewire',
    category: 'framework',
    implies: ['Laravel'],
    probes: [p('selector', '[wire\\:id]', { weight: 0.8 }), p('script-src', /livewire/i, { weight: 0.6 })],
  },
  {
    name: 'Inertia.js',
    category: 'framework',
    probes: [p('selector', '[id="app"][data-page]', { weight: 0.9, label: 'inertia data-page' })],
  },
  {
    name: 'jQuery',
    category: 'library',
    probes: [p('script-src', /jquery[.-]?([\d.]+)?(?:\.min)?\.js/i, { weight: 0.9, version: /jquery[.-]?(\d+\.\d+(?:\.\d+)?)/i })],
  },
  {
    name: 'Bootstrap',
    category: 'css',
    probes: [
      p('link', /bootstrap(?:[.-][\d.]+)?(?:\.min)?\.css/i, { weight: 0.8, version: /bootstrap[@\/-]v?(\d+\.\d+(?:\.\d+)?)/i }),
      p('script-src', /bootstrap(?:\.bundle)?(?:\.min)?\.js/i, { weight: 0.6 }),
    ],
  },
  {
    name: 'Tailwind CSS',
    category: 'css',
    probes: [p('link', /tailwind/i, { weight: 0.7 }), p('script-src', /cdn\.tailwindcss\.com/i, { weight: 0.9 })],
  },
  {
    name: 'Font Awesome',
    category: 'css',
    probes: [p('link', /font-?awesome|fontawesome/i, { weight: 0.8 }), p('script-src', /fontawesome/i, { weight: 0.6 })],
  },
  {
    name: 'Owl Carousel',
    category: 'library',
    probes: [p('script-src', /owl\.carousel/i, { weight: 0.9 }), p('selector', '.owl-carousel', { weight: 0.6 })],
  },
  {
    name: 'Swiper',
    category: 'library',
    probes: [p('script-src', /swiper/i, { weight: 0.7 }), p('selector', '.swiper, .swiper-container', { weight: 0.5 })],
  },
  {
    name: 'Video.js',
    category: 'library',
    probes: [p('script-src', /video(?:js)?(?:\.min)?\.js|videojs/i, { weight: 0.7 }), p('selector', '.video-js', { weight: 0.7 })],
  },
  {
    name: 'JW Player',
    category: 'library',
    probes: [p('script-src', /jwplayer|jwpcdn/i, { weight: 0.9 })],
  },
  {
    name: 'Plyr',
    category: 'library',
    probes: [p('script-src', /plyr/i, { weight: 0.8 }), p('selector', '.plyr', { weight: 0.5 })],
  },
  {
    name: 'hls.js',
    category: 'library',
    probes: [p('script-src', /hls(?:\.min)?\.js|hls\.js/i, { weight: 0.9 })],
  },
  {
    name: 'Fancybox',
    category: 'library',
    probes: [p('script-src', /fancybox/i, { weight: 0.8 })],
  },
  {
    name: 'WordPress',
    category: 'cms',
    implies: ['PHP'],
    probes: [
      p('meta-generator', /WordPress\s*([\d.]+)?/i, { version: /WordPress\s*([\d.]+)/i, weight: 0.9 }),
      p('html', /\/wp-content\/|\/wp-includes\//, { weight: 0.8, label: 'wp-content / wp-includes paths' }),
      p('header', /api\.w\.org/, { header: 'link', weight: 0.7, label: 'api.w.org link header' }),
      p('selector', 'link[rel*="api.w.org"]', { weight: 0.7 }),
    ],
  },
  {
    name: 'WooCommerce',
    category: 'ecommerce',
    implies: ['WordPress'],
    probes: [p('html', /woocommerce/i, { weight: 0.7 }), p('selector', 'body.woocommerce', { weight: 0.8 })],
  },
  {
    name: 'Elementor',
    category: 'builder',
    implies: ['WordPress'],
    probes: [p('html', /elementor-(?:element|widget|section|kit)|\/plugins\/elementor\//i, { weight: 0.8 })],
  },
  {
    name: 'Yoast SEO',
    category: 'library',
    probes: [p('html', /yoast seo|class="yoast-schema-graph"/i, { weight: 0.9 })],
  },
  {
    name: 'Shopify',
    category: 'ecommerce',
    probes: [p('html', /cdn\.shopify\.com|Shopify\.theme/, { weight: 0.9 }), p('header', /./, { header: 'x-shopid', weight: 0.8 })],
  },
  {
    name: 'Wix',
    category: 'builder',
    probes: [p('meta-generator', /Wix\.com/i, { weight: 0.9 }), p('html', /static\.parastorage\.com|wixstatic\.com/, { weight: 0.7 })],
  },
  {
    name: 'Webflow',
    category: 'builder',
    probes: [p('selector', 'html[data-wf-site]', { weight: 0.9 }), p('html', /assets\.website-files\.com|webflow\.js/, { weight: 0.7 })],
  },
  {
    name: 'Squarespace',
    category: 'builder',
    probes: [p('meta-generator', /Squarespace/i, { weight: 0.9 }), p('html', /static1\.squarespace\.com/, { weight: 0.7 })],
  },
  {
    name: 'Laravel',
    category: 'framework',
    implies: ['PHP'],
    probes: [p('cookie', /laravel_session/, { weight: 0.9 }), p('cookie', /XSRF-TOKEN/, { weight: 0.3 })],
  },
  {
    name: 'PHP',
    category: 'language',
    probes: [
      p('header', /PHP\/?([\d.]+)?/i, { header: 'x-powered-by', version: /PHP\/([\d.]+)/i, weight: 0.9 }),
      p('cookie', /PHPSESSID/, { weight: 0.7 }),
    ],
  },
  {
    name: 'Express',
    category: 'framework',
    implies: ['Node.js'],
    probes: [p('header', /Express/i, { header: 'x-powered-by', weight: 0.9 })],
  },
  {
    name: 'Node.js',
    category: 'language',
    probes: [p('header', /Node\.js/i, { header: 'x-powered-by', weight: 0.6 })],
  },
  {
    name: 'ASP.NET',
    category: 'framework',
    probes: [p('header', /ASP\.NET/i, { header: 'x-powered-by', weight: 0.9 }), p('header', /./, { header: 'x-aspnet-version', weight: 0.9 })],
  },
  {
    name: 'Cloudflare',
    category: 'cdn',
    probes: [
      p('header', /cloudflare/i, { header: 'server', weight: 0.9 }),
      p('header', /./, { header: 'cf-ray', weight: 0.9 }),
      p('cookie', /__cf_bm|cf_clearance/, { weight: 0.6 }),
    ],
  },
  {
    name: 'Vercel',
    category: 'cdn',
    probes: [p('header', /./, { header: 'x-vercel-id', weight: 0.9 }), p('header', /vercel/i, { header: 'server', weight: 0.8 })],
  },
  {
    name: 'Netlify',
    category: 'cdn',
    probes: [p('header', /./, { header: 'x-nf-request-id', weight: 0.9 }), p('header', /netlify/i, { header: 'server', weight: 0.8 })],
  },
  {
    name: 'Fastly',
    category: 'cdn',
    probes: [p('header', /./, { header: 'x-served-by', weight: 0.4 }), p('header', /fastly/i, { header: 'via', weight: 0.7 })],
  },
  {
    name: 'Amazon CloudFront',
    category: 'cdn',
    probes: [p('header', /./, { header: 'x-amz-cf-id', weight: 0.9 }), p('header', /cloudfront/i, { header: 'via', weight: 0.8 })],
  },
  {
    name: 'DDoS-Guard',
    category: 'security',
    probes: [p('header', /ddos-guard/i, { header: 'server', weight: 0.9 }), p('cookie', /__ddg/, { weight: 0.8 })],
  },
  {
    name: 'nginx',
    category: 'server',
    probes: [p('header', /nginx\/?([\d.]+)?/i, { header: 'server', version: /nginx\/([\d.]+)/i, weight: 0.9 })],
  },
  {
    name: 'Apache',
    category: 'server',
    probes: [p('header', /apache\/?([\d.]+)?/i, { header: 'server', version: /Apache\/([\d.]+)/i, weight: 0.9 })],
  },
  {
    name: 'LiteSpeed',
    category: 'server',
    probes: [p('header', /litespeed/i, { header: 'server', weight: 0.9 }), p('header', /./, { header: 'x-litespeed-cache', weight: 0.8 })],
  },
  {
    name: 'OpenResty',
    category: 'server',
    probes: [p('header', /openresty/i, { header: 'server', weight: 0.9 })],
  },
  {
    name: 'Caddy',
    category: 'server',
    probes: [p('header', /caddy/i, { header: 'server', weight: 0.9 })],
  },
  {
    name: 'Google Analytics',
    category: 'analytics',
    probes: [p('script-src', /google-analytics\.com\/(?:analytics|ga)\.js|googletagmanager\.com\/gtag\/js/i, { weight: 0.9 })],
  },
  {
    name: 'Google Tag Manager',
    category: 'analytics',
    probes: [p('script-src', /googletagmanager\.com\/gtm\.js/i, { weight: 0.9 }), p('html', /GTM-[A-Z0-9]{4,8}/, { weight: 0.5 })],
  },
  {
    name: 'Cloudflare Web Analytics',
    category: 'analytics',
    probes: [p('script-src', /static\.cloudflareinsights\.com/i, { weight: 0.9 })],
  },
  {
    name: 'Histats',
    category: 'analytics',
    probes: [p('html', /histats\.com|_Hasync/i, { weight: 0.8 })],
  },
  {
    name: 'Matomo',
    category: 'analytics',
    probes: [p('script-src', /matomo|piwik/i, { weight: 0.8 })],
  },
  {
    name: 'Plausible',
    category: 'analytics',
    probes: [p('script-src', /plausible\.io\/js/i, { weight: 0.9 })],
  },
  {
    name: 'Facebook Pixel',
    category: 'analytics',
    probes: [p('script-src', /connect\.facebook\.net\/.*fbevents\.js/i, { weight: 0.9 })],
  },
  {
    name: 'reCAPTCHA',
    category: 'security',
    probes: [p('script-src', /google\.com\/recaptcha|gstatic\.com\/recaptcha/i, { weight: 0.9 })],
  },
  {
    name: 'hCaptcha',
    category: 'security',
    probes: [p('script-src', /hcaptcha\.com/i, { weight: 0.9 })],
  },
  {
    name: 'Cloudflare Turnstile',
    category: 'security',
    probes: [p('script-src', /challenges\.cloudflare\.com\/turnstile/i, { weight: 0.9 })],
  },
];
