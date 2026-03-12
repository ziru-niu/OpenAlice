import { headers } from './client'
import type { ChatResponse, ChatHistoryItem } from './types'

export const chatApi = {
  async send(message: string, channelId?: string): Promise<ChatResponse> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, ...(channelId ? { channelId } : {}) }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    return res.json()
  },

  async history(limit = 100, channel?: string): Promise<{ messages: ChatHistoryItem[] }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (channel) params.set('channel', channel)
    const res = await fetch(`/api/chat/history?${params}`)
    if (!res.ok) throw new Error('Failed to load history')
    return res.json()
  },

  connectSSE(
    onMessage: (data: { type: string; kind?: string; text: string; media?: Array<{ type: string; url: string }> }) => void,
    channel?: string,
  ): EventSource {
    const url = channel ? `/api/chat/events?channel=${encodeURIComponent(channel)}` : '/api/chat/events'
    const es = new EventSource(url)
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch { /* ignore */ }
    }
    return es
  },
}
