import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

const app = new Hono().basePath('/api');

// Handle CORS natively in Hono automatically for everything
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204 as any);
  }
  await next();
});

// ============ GEMINI API ============
app.post('/gemini', async (c) => {
  try {
    const { apiKey, message, history } = await c.req.json();
    if (!apiKey) return c.json({ error: 'API key required' }, 400);

    const contents = [
      ...(history || []),
      { role: 'user', parts: [{ text: message }] }
    ];

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{
              text: `You are "Someone's Voice Assistant", a helpful, witty, and concise AI assistant. 
              Keep responses SHORT and conversational (2-3 sentences max unless asked for detail).
              You speak naturally as if talking to a friend.
              When asked about weather or news, parse the data provided and summarize it conversationally.
              When asked to play music, extract the song/artist name from the request.
              For greetings, be warm but brief.
              Current date/time context will be provided by the user.`
            }]
          },
          generationConfig: {
            temperature: 0.8,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      let errMsg = `Gemini API error (${resp.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson?.error?.message || errMsg;
      } catch {}
      return c.json({ error: errMsg }, 200);
    }

    const data = await resp.json();
    const text = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    return c.json({ response: text });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============ WEATHER API ============
app.get('/weather', async (c) => {
  try {
    const lat = c.req.query('lat');
    const lon = c.req.query('lon');
    if (!lat || !lon) return c.json({ error: 'lat and lon required' }, 400);

    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset&timezone=auto&forecast_days=3`
    );
    const weather = await weatherResp.json();

    const revGeoResp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'User-Agent': 'SomeonesVoiceAssistant/1.0' } }
    );
    let locationName = 'your area';
    try {
      const revGeo = await revGeoResp.json();
      locationName = (revGeo as any)?.address?.city || (revGeo as any)?.address?.town || (revGeo as any)?.address?.village || (revGeo as any)?.address?.county || 'your area';
    } catch {}

    return c.json({ weather, locationName });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============ NEWS API ============
app.get('/news', async (c) => {
  try {
    const country = c.req.query('country') || 'us';
    const rssUrl = `https://news.google.com/rss?hl=en-${country.toUpperCase()}&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:en`;
    const resp = await fetch(rssUrl);
    const xml = await resp.text();
    
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '';
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '';
      items.push({ title, link, pubDate, source });
    }

    return c.json({ articles: items });
  } catch (e: any) {
    return c.json({ error: e.message, articles: [] }, 500);
  }
});

// ============ YOUTUBE API WITH FALLBACKS ============
const instances = [
  { type: 'piped', url: 'https://pipedapi.kavin.rocks' },
  { type: 'piped', url: 'https://pipedapi.lunar.icu' },
  { type: 'piped', url: 'https://pipedapi.nexus-it.pt' },
  { type: 'piped', url: 'https://pipedapi.drgns.space' },
  { type: 'invidious', url: 'https://iv.ggtyler.dev/api/v1' },
  { type: 'invidious', url: 'https://invidious.nerdvpn.de/api/v1' },
  { type: 'invidious', url: 'https://inv.thepixora.com/api/v1' },
  { type: 'invidious', url: 'https://yt.chocolatemoo53.com/api/v1' },
  { type: 'invidious', url: 'https://invidious.no-logs.com/api/v1' }
];

app.get('/youtube/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'Query required' }, 400);

  for (const instance of instances) {
    try {
      const searchUrl = instance.type === 'invidious' 
        ? `${instance.url}/search?q=${encodeURIComponent(q)}` 
        : `${instance.url}/search?q=${encodeURIComponent(q)}&filter=music_songs`;

      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) continue;

      const data = await resp.json() as any;
      let results = [];

      if (instance.type === 'invidious') {
        results = data.filter((v: any) => v.type === 'video').slice(0, 5).map((v: any) => ({
          id: v.videoId,
          title: v.title,
          author: v.author || '',
          duration: v.lengthSeconds || 0,
          thumbnail: v.videoThumbnails?.[0]?.url || '',
          instance: 'invidious'
        }));
      } else {
        results = (data.items || []).slice(0, 5).map((v: any) => ({
          id: v.url.replace('/watch?v=', ''),
          title: v.title,
          author: v.uploaderName || '',
          duration: v.duration,
          thumbnail: v.thumbnail || '',
          instance: 'piped'
        }));
      }

      if (results.length > 0) {
        return c.json({ results });
      }
    } catch (e) {
      continue;
    }
  }

  return c.json({ error: 'Music search unavailable. All backup instances failed or timed out.', results: [] }, 500);
});

app.get('/youtube/stream', async (c) => {
  const videoId = c.req.query('id');
  if (!videoId) return c.json({ error: 'Video ID required' }, 400);

  for (const instance of instances) {
    try {
      const streamUrl = instance.type === 'invidious' 
        ? `${instance.url}/videos/${videoId}` 
        : `${instance.url}/streams/${videoId}`;

      const resp = await fetch(streamUrl, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) continue;

      const data = await resp.json() as any;
      let audioUrl = null;

      if (instance.type === 'invidious') {
        const audioStreams = data.formatStreams?.filter((s: any) => s.type?.includes('audio') || s.itag == 140) || [];
        const adaptive = data.adaptiveFormats?.filter((s: any) => s.type?.includes('audio')) || [];
        const best = audioStreams[0] || adaptive[0];
        if (best) audioUrl = best.url;
      } else {
        const audioStreams = data.audioStreams || [];
        const bestAudio = audioStreams.find((s: any) => s.mimeType.includes('audio/mp4')) || audioStreams[0];
        if (bestAudio) audioUrl = bestAudio.url;
      }

      if (audioUrl) {
        if (audioUrl.includes('googlevideo.com')) {
          audioUrl = `/api/youtube/proxy?url=${encodeURIComponent(audioUrl)}`;
        }
        return c.json({
          audioUrl,
          title: data.title || '',
          author: data.author || data.uploader || '',
          duration: data.lengthSeconds || data.duration || 0,
          thumbnail: data.videoThumbnails?.[0]?.url || data.thumbnailUrl || ''
        });
      }
    } catch (e) {
      continue;
    }
  }

  return c.json({ error: 'Failed to fetch stream from all instances' }, 500);
});

app.get('/youtube/proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.text('Missing url', 400);

  const range = c.req.header('range');
  const targetUrl = decodeURIComponent(url);

  const proxyFetch = async (target: string, attempt = 0): Promise<Response> => {
    if (attempt > 10) {
      console.error(`Proxy redirect loop detected for: ${target}`);
      return new Response('Too many redirects in proxy loop', { status: 508 });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.youtube.com/',
      'Accept': '*/*',
    };
    if (range) headers['Range'] = range;

    const resp = await fetch(target, { 
      headers,
      redirect: 'manual' 
    });

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (location) return proxyFetch(location, attempt + 1);
    }

    const responseHeaders = new Headers();
    const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    headersToCopy.forEach(h => {
      const val = resp.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    // Ensure Safari sees byte support
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: responseHeaders
    });
  };

  try {
    return await proxyFetch(targetUrl);
  } catch (e) {
    return c.text('Proxy exception: ' + (e as Error).message, 500);
  }
});

export const onRequest = handle(app);
