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

// ============ YOUTUBE (PIPED) API ============
// Search using Piped API
app.get('/youtube/search', async (c) => {
  try {
    const q = c.req.query('q');
    if (!q) return c.json({ error: 'Query required' }, 400);

    const resp = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=music_songs`);
    if (!resp.ok) return c.json({ error: 'Failed to search music' }, 500);

    const data = await resp.json() as any;
    
    // Map Piped response to our expected format
    const results = (data.items || []).slice(0, 5).map((v: any) => ({
      id: v.url.replace('/watch?v=', ''),
      title: v.title,
      author: v.uploaderName || '',
      duration: v.duration,
      thumbnail: v.thumbnail || '',
      instance: 'piped'
    }));

    return c.json({ results });
  } catch (e: any) {
    return c.json({ error: e.message, results: [] }, 500);
  }
});

// Stream using Piped API
app.get('/youtube/stream', async (c) => {
  try {
    const videoId = c.req.query('id');
    if (!videoId) return c.json({ error: 'Video ID required' }, 400);

    const resp = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
    if (!resp.ok) return c.json({ error: 'Failed to fetch stream details' }, 500);

    const data = await resp.json() as any;
    
    // Find highest quality audio-only stream (usually m4a or webm)
    const audioStreams = data.audioStreams || [];
    if (audioStreams.length === 0) return c.json({ error: 'No audio streams found' }, 404);

    // Prefer m4a if available, otherwise fallback
    const bestAudio = audioStreams.find((s: any) => s.mimeType.includes('audio/mp4')) || audioStreams[0];

    return c.json({
      audioUrl: bestAudio.url, // Piped direct stream URLs handle their own CORS
      title: data.title,
      author: data.uploader,
      duration: data.duration,
      thumbnail: data.thumbnailUrl || ''
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export const onRequest = handle(app);
