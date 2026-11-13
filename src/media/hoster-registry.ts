export interface Hoster {
  name: string;
  match: RegExp;
  kind: 'stream' | 'download' | 'video-platform';
}

export const HOSTERS: Hoster[] = [
  { name: 'YouTube', match: /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i, kind: 'video-platform' },
  { name: 'Dailymotion', match: /dailymotion\.com|dai\.ly/i, kind: 'video-platform' },
  { name: 'Vimeo', match: /vimeo\.com/i, kind: 'video-platform' },
  { name: 'Google Drive', match: /drive\.google\.com|docs\.google\.com\/file|googleusercontent\.com\/.*video/i, kind: 'stream' },
  { name: 'Blogger Video', match: /blogger\.com\/video\.g|googlevideo\.com/i, kind: 'stream' },
  { name: 'OK.ru', match: /ok\.ru\/videoembed|odnoklassniki/i, kind: 'stream' },
  { name: 'Streamwish', match: /streamwish|wishfast|awish|embedwish|hlswish|strwish|swish/i, kind: 'stream' },
  { name: 'Filemoon', match: /filemoon|moonplayer|kerapoxy/i, kind: 'stream' },
  { name: 'Doodstream', match: /dood(?:stream)?\.|dsvplay|d0o0d|do0od|ds2play|playmogo/i, kind: 'stream' },
  { name: 'Mp4upload', match: /mp4upload\.com/i, kind: 'stream' },
  { name: 'Streamtape', match: /streamtape|strtape|stape|tapecontent/i, kind: 'stream' },
  { name: 'Mixdrop', match: /mixdrop|mdbekjwqa|mixdroop/i, kind: 'stream' },
  { name: 'VidHide', match: /vidhide|vidhidepro|vidhidevip|filelions|vidguard|vgfplay/i, kind: 'stream' },
  { name: 'Voe', match: /(?:^|[./])voe(?:-network)?\.|voe\.sx/i, kind: 'stream' },
  { name: 'Vidmoly', match: /vidmoly/i, kind: 'stream' },
  { name: 'Sendvid', match: /sendvid\.com/i, kind: 'stream' },
  { name: 'Fembed', match: /fembed|femax20|fcdn\.stream|embedsito|vanfem/i, kind: 'stream' },
  { name: 'Streamlare', match: /streamlare|slmaxed/i, kind: 'stream' },
  { name: 'Uqload', match: /uqload/i, kind: 'stream' },
  { name: 'Upstream', match: /upstream\.to/i, kind: 'stream' },
  { name: 'Krakenfiles', match: /krakenfiles\.com/i, kind: 'download' },
  { name: 'Pixeldrain', match: /pixeldrain\.com/i, kind: 'download' },
  { name: 'MEGA', match: /mega\.nz|mega\.io/i, kind: 'download' },
  { name: 'Acefile', match: /acefile\.co/i, kind: 'download' },
  { name: 'Terabox', match: /terabox|1024tera|teraboxapp/i, kind: 'download' },
  { name: 'Mediafire', match: /mediafire\.com/i, kind: 'download' },
  { name: 'GoFile', match: /gofile\.io/i, kind: 'download' },
  { name: 'Zippyshare', match: /zippyshare/i, kind: 'download' },
  { name: 'Racaty', match: /racaty/i, kind: 'download' },
  { name: 'Archive.org', match: /archive\.org/i, kind: 'stream' },
  { name: 'Odysee', match: /odysee\.com/i, kind: 'video-platform' },
  { name: 'Rumble', match: /rumble\.com/i, kind: 'video-platform' },
  { name: 'Facebook Video', match: /facebook\.com\/plugins\/video/i, kind: 'video-platform' },
  { name: 'D.Tube', match: /d\.tube/i, kind: 'video-platform' },
  { name: 'AbyssPlayer', match: /abyssplayer|abysscdn|abyss\.to/i, kind: 'stream' },
  { name: 'Streamruby', match: /streamruby|rubystm|rubyvidhub|rubyvid/i, kind: 'stream' },
  { name: 'Vidara', match: /vidara\.to/i, kind: 'stream' },
  { name: 'Mirrorace', match: /mirrorace\.com/i, kind: 'download' },
];

export function identifyHoster(url: string, label?: string | null): string | null {
  let host = url;
  try {
    const parsed = new URL(url);
    host = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    host = url;
  }
  for (const hoster of HOSTERS) if (hoster.match.test(host)) return hoster.name;
  if (label) {
    const text = label.toLowerCase();
    for (const hoster of HOSTERS) if (text.includes(hoster.name.toLowerCase().replace(/[^a-z0-9]/g, ''))) return hoster.name;
    if (/\bdoods?\b/.test(text)) return 'Doodstream';
    if (/okru|ok\.ru/.test(text)) return 'OK.ru';
  }
  return null;
}

export function hosterKind(name: string): Hoster['kind'] | null {
  return HOSTERS.find((hoster) => hoster.name === name)?.kind ?? null;
}
