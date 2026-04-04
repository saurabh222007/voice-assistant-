import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('/api/*', cors())

// ============ API ROUTES ============

// Proxy Gemini API calls (keeps user's API key in frontend only, proxied for CORS)
app.post('/api/gemini', async (c) => {
  try {
    const { apiKey, message, history } = await c.req.json()
    if (!apiKey) return c.json({ error: 'API key required' }, 400)

    const contents = [
      ...(history || []),
      { role: 'user', parts: [{ text: message }] }
    ]

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
    )

    if (!resp.ok) {
      const errText = await resp.text()
      let errMsg = `Gemini API error (${resp.status})`
      try {
        const errJson = JSON.parse(errText)
        errMsg = errJson?.error?.message || errMsg
      } catch {}
      return c.json({ error: errMsg }, 200) // Always return 200 to frontend with error in body
    }

    const data = await resp.json() as any
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.'
    return c.json({ response: text })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Weather API (using open-meteo - free, no key needed)
app.get('/api/weather', async (c) => {
  try {
    const lat = c.req.query('lat')
    const lon = c.req.query('lon')
    if (!lat || !lon) return c.json({ error: 'lat and lon required' }, 400)

    // Get weather data
    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset&timezone=auto&forecast_days=3`
    )
    const weather = await weatherResp.json() as any

    // Get location name via reverse geocoding
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${lat}&longitude=${lon}&count=1`
    )

    // Reverse geocode
    const revGeoResp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'User-Agent': 'SomeonesVoiceAssistant/1.0' } }
    )
    let locationName = 'your area'
    try {
      const revGeo = await revGeoResp.json() as any
      locationName = revGeo?.address?.city || revGeo?.address?.town || revGeo?.address?.village || revGeo?.address?.county || 'your area'
    } catch {}

    return c.json({ weather, locationName })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// News API (using multiple free RSS-to-JSON services)
app.get('/api/news', async (c) => {
  try {
    const country = c.req.query('country') || 'us'
    
    // Use Google News RSS feed converted to JSON
    const rssUrl = `https://news.google.com/rss?hl=en-${country.toUpperCase()}&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:en`
    const resp = await fetch(rssUrl)
    const xml = await resp.text()
    
    // Parse RSS XML manually
    const items: any[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const itemXml = match[1]
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ''
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      items.push({ title, link, pubDate, source })
    }

    return c.json({ articles: items })
  } catch (e: any) {
    return c.json({ error: e.message, articles: [] }, 500)
  }
})

// YouTube search (using Invidious API - free, no key needed)
app.get('/api/youtube/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q) return c.json({ error: 'Query required' }, 400)

    // Try multiple Invidious instances
    const instances = [
      'https://vid.puffyan.us',
      'https://invidious.lunar.icu',
      'https://inv.tux.pizza',
      'https://invidious.privacyredirect.com',
      'https://iv.ggtyler.dev'
    ]

    let results: any[] = []
    
    for (const instance of instances) {
      try {
        const resp = await fetch(
          `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&sort_by=relevance`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (resp.ok) {
          const data = await resp.json() as any[]
          results = data.filter((v: any) => v.type === 'video').slice(0, 5).map((v: any) => ({
            id: v.videoId,
            title: v.title,
            author: v.author,
            duration: v.lengthSeconds,
            thumbnail: v.videoThumbnails?.[0]?.url || '',
            instance
          }))
          break
        }
      } catch {
        continue
      }
    }

    // Fallback: use Piped API
    if (results.length === 0) {
      try {
        const resp = await fetch(
          `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=videos`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (resp.ok) {
          const data = await resp.json() as any
          results = (data.items || []).slice(0, 5).map((v: any) => ({
            id: v.url?.replace('/watch?v=', ''),
            title: v.title,
            author: v.uploaderName,
            duration: v.duration,
            thumbnail: v.thumbnail || '',
            instance: 'https://pipedapi.kavin.rocks'
          }))
        }
      } catch {}
    }

    return c.json({ results })
  } catch (e: any) {
    return c.json({ error: e.message, results: [] }, 500)
  }
})

// Get audio stream URL for a YouTube video
app.get('/api/youtube/stream', async (c) => {
  try {
    const videoId = c.req.query('id')
    if (!videoId) return c.json({ error: 'Video ID required' }, 400)

    const instances = [
      'https://vid.puffyan.us',
      'https://invidious.lunar.icu',
      'https://inv.tux.pizza',
      'https://invidious.privacyredirect.com',
      'https://iv.ggtyler.dev'
    ]

    for (const instance of instances) {
      try {
        const resp = await fetch(
          `${instance}/api/v1/videos/${videoId}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (resp.ok) {
          const data = await resp.json() as any
          // Get audio-only adaptive format
          const audioFormats = (data.adaptiveFormats || [])
            .filter((f: any) => f.type?.startsWith('audio/'))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))

          if (audioFormats.length > 0) {
            return c.json({
              audioUrl: audioFormats[0].url,
              title: data.title,
              author: data.author,
              duration: data.lengthSeconds,
              thumbnail: data.videoThumbnails?.[0]?.url || ''
            })
          }
        }
      } catch {
        continue
      }
    }

    // Fallback: use Piped
    try {
      const resp = await fetch(
        `https://pipedapi.kavin.rocks/streams/${videoId}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (resp.ok) {
        const data = await resp.json() as any
        const audioStreams = (data.audioStreams || [])
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
        
        if (audioStreams.length > 0) {
          return c.json({
            audioUrl: audioStreams[0].url,
            title: data.title,
            author: data.uploader,
            duration: data.duration,
            thumbnail: data.thumbnailUrl || ''
          })
        }
      }
    } catch {}

    return c.json({ error: 'Could not find audio stream' }, 404)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============ MAIN PAGE ============
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Someone's Voice Assistant</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎙️</text></svg>">
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <div id="app"></div>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
