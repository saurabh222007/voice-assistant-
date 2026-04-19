import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { stream } from 'hono/streaming'
import youtubedl from 'youtube-dl-exec'
import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

import { getSetting, setSetting, getHistory, addHistory, clearHistory } from './db.js'

const app = new Hono()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${apiKey}`,
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

// Database Routes for React App
app.get('/api/settings', (c) => {
  const key = c.req.query('key')
  if (!key) return c.json({ error: 'Key required' }, 400)
  return c.json({ value: getSetting(key) })
})

app.post('/api/settings', async (c) => {
  const { key, value } = await c.req.json()
  if (!key) return c.json({ error: 'Key required' }, 400)
  setSetting(key, value)
  return c.json({ success: true })
})

app.get('/api/history', (c) => {
  return c.json({ history: getHistory() })
})

app.post('/api/history', async (c) => {
  const { role, content } = await c.req.json()
  addHistory(role, content)
  return c.json({ success: true })
})

app.delete('/api/history', (c) => {
  clearHistory()
  return c.json({ success: true })
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

// YouTube search (robust manual execute for multiline JSON)
app.get('/api/youtube/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q) return c.json({ error: 'Query required' }, 400)

    // Using raw exec for ytsearch because it returns multiline JSON (one per result)
    // we use --flat-playlist for speed
    const bin = 'node_modules/youtube-dl-exec/bin/yt-dlp.exe'
    const command = `"${bin}" --dump-json --flat-playlist "ytsearch5:${q}"`
    
    const { stdout } = await execAsync(command)
    const lines = stdout.trim().split('\n')
    
    const results = lines.map(line => {
      try {
        const v = JSON.parse(line)
        return {
          id: v.id,
          title: v.title,
          author: v.uploader || v.channel || '',
          duration: v.duration,
          thumbnail: v.thumbnail || v.thumbnails?.[0]?.url || '',
          instance: 'yt-dlp'
        }
      } catch { return null }
    }).filter(v => v !== null)

    return c.json({ results })
  } catch (e: any) {
    console.error('yt-dlp search error:', e)
    return c.json({ error: String(e), results: [] }, 500)
  }
})

// Get audio stream URL for a YouTube video using yt-dlp
app.get('/api/youtube/stream', async (c) => {
  try {
    const videoId = c.req.query('id')
    if (!videoId) return c.json({ error: 'Video ID required' }, 400)

    const v = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpSingleJson: true,
      noWarnings: true,
      callHome: false,
      format: 'bestaudio'
    }) as any

    return c.json({
      audioUrl: `/api/youtube/proxy?url=${encodeURIComponent(v.url)}`,
      title: v.title,
      author: v.uploader,
      duration: v.duration,
      thumbnail: v.thumbnail || ''
    })
  } catch (e: any) {
    console.error('yt-dlp stream error:', e)
    return c.json({ error: e.message || String(e) }, 500)
  }
})

// Proxy audio stream to bypass CORS and IP-locking
app.get('/api/youtube/proxy', async (c) => {
  const url = c.req.query('url')
  if (!url) return c.text('URL required', 400)

  try {
    const resp = await fetch(url)
    if (!resp.ok) return c.text('Failed to fetch stream', 502)

    const contentType = resp.headers.get('content-type') || 'audio/mpeg'
    const contentLength = resp.headers.get('content-length')

    c.header('Content-Type', contentType)
    if (contentLength) c.header('Content-Length', contentLength)
    c.header('Accept-Ranges', 'bytes')

    return stream(c, async (stream) => {
      const reader = resp.body?.getReader()
      if (!reader) return
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await stream.write(value)
      }
    })
  } catch (e: any) {
    return c.text(e.message, 500)
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
  <meta name="description" content="A free AI-powered voice assistant powered by Google Gemini. Search and play music, check weather, get news, and chat with AI.">
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

const port = 3333
serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

export default app
