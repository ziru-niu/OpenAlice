import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type ToolCall } from '../api'
import type { ChannelListItem } from '../api/channels'
import { useSSE } from '../hooks/useSSE'
import { ChatMessage, ToolCallGroup, ThinkingIndicator } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'

/** Unified display item for the message list. */
type DisplayItem =
  | { kind: 'text'; role: 'user' | 'assistant' | 'notification'; text: string; timestamp?: string | null; media?: Array<{ type: string; url: string }>; _id: number }
  | { kind: 'tool_calls'; calls: ToolCall[]; timestamp?: string; _id: number }

interface ChatPageProps {
  onSSEStatus?: (connected: boolean) => void
}

export function ChatPage({ onSSEStatus }: ChatPageProps) {
  const [channels, setChannels] = useState<ChannelListItem[]>([{ id: 'default', label: 'Alice' }])
  const [activeChannel, setActiveChannel] = useState('default')
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelId, setNewChannelId] = useState('')
  const [newChannelLabel, setNewChannelLabel] = useState('')
  const [newChannelError, setNewChannelError] = useState('')
  const [messages, setMessages] = useState<DisplayItem[]>([])
  const [isWaiting, setIsWaiting] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const nextId = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeChannelRef = useRef(activeChannel)
  activeChannelRef.current = activeChannel

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [])

  useEffect(scrollToBottom, [messages, isWaiting, scrollToBottom])

  // Detect user scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const isUp = scrollHeight - scrollTop - clientHeight > 80
      userScrolledUp.current = isUp
      setShowScrollBtn(isUp)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Load channels list on mount
  useEffect(() => {
    api.channels.list().then(({ channels: ch }) => setChannels(ch)).catch(() => {})
  }, [])

  // Load chat history when active channel changes
  useEffect(() => {
    const channel = activeChannel === 'default' ? undefined : activeChannel
    api.chat.history(100, channel).then(({ messages: msgs }) => {
      setMessages(msgs.map((m): DisplayItem => {
        if (m.kind === 'text' && m.metadata?.kind === 'notification') {
          return { ...m, role: 'notification', _id: nextId.current++ }
        }
        return { ...m, _id: nextId.current++ }
      }))
    }).catch((err) => {
      console.warn('Failed to load history:', err)
    })
  }, [activeChannel])

  // SSE for the active channel
  const sseChannel = activeChannel === 'default' ? undefined : activeChannel
  useSSE({
    url: sseChannel ? `/api/chat/events?channel=${encodeURIComponent(sseChannel)}` : '/api/chat/events',
    onMessage: (data) => {
      if (data.type === 'message' && data.text) {
        const role = data.kind === 'message' ? 'assistant' : 'notification'
        setMessages((prev) => [
          ...prev,
          { kind: 'text', role, text: data.text, media: data.media, _id: nextId.current++ },
        ])
      }
    },
    onStatus: activeChannel === 'default' ? onSSEStatus : undefined,
  })

  // Send message
  const handleSend = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { kind: 'text', role: 'user', text, _id: nextId.current++ }])
    setIsWaiting(true)

    try {
      const channel = activeChannelRef.current === 'default' ? undefined : activeChannelRef.current
      const data = await api.chat.send(text, channel)

      if (data.text) {
        const media = data.media?.length ? data.media : undefined
        setMessages((prev) => [...prev, { kind: 'text', role: 'assistant', text: data.text, media, _id: nextId.current++ }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        { kind: 'text', role: 'notification', text: `Error: ${msg}`, _id: nextId.current++ },
      ])
    } finally {
      setIsWaiting(false)
    }
  }, [])

  const handleScrollToBottom = useCallback(() => {
    userScrolledUp.current = false
    setShowScrollBtn(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleCreateChannel = useCallback(async () => {
    setNewChannelError('')
    if (!newChannelId.trim() || !newChannelLabel.trim()) {
      setNewChannelError('ID and label are required')
      return
    }
    try {
      const { channel } = await api.channels.create({ id: newChannelId.trim(), label: newChannelLabel.trim() })
      setChannels((prev) => [...prev, channel])
      setActiveChannel(channel.id)
      setShowNewChannel(false)
      setNewChannelId('')
      setNewChannelLabel('')
    } catch (err) {
      setNewChannelError(err instanceof Error ? err.message : 'Failed to create channel')
    }
  }, [newChannelId, newChannelLabel])

  const handleDeleteChannel = useCallback(async (id: string) => {
    try {
      await api.channels.remove(id)
      setChannels((prev) => prev.filter((ch) => ch.id !== id))
      if (activeChannel === id) setActiveChannel('default')
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }, [activeChannel])

  const activeChannelConfig = channels.find((ch) => ch.id === activeChannel)

  return (
    <div className="flex flex-col flex-1 min-h-0 max-w-[800px] mx-auto w-full">
      {/* Channel tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 border-b border-border overflow-x-auto">
        {channels.map((ch) => (
          <div key={ch.id} className="flex items-center group">
            <button
              onClick={() => setActiveChannel(ch.id)}
              className={`px-3 py-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeChannel === ch.id
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:text-text hover:bg-bg-secondary'
              }`}
            >
              {ch.label}
            </button>
            {ch.id !== 'default' && (
              <button
                onClick={() => handleDeleteChannel(ch.id)}
                className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-bg-secondary transition-all"
                aria-label={`Delete ${ch.label}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowNewChannel((v) => !v)}
          className="ml-1 w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-secondary transition-colors flex-shrink-0"
          aria-label="New channel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* New channel form */}
      {showNewChannel && (
        <div className="px-4 py-3 border-b border-border bg-bg-secondary/50 flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="id (e.g. research)"
            value={newChannelId}
            onChange={(e) => setNewChannelId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
            className="text-sm px-2 py-1 rounded border border-border bg-bg text-text placeholder:text-text-muted focus:outline-none focus:border-accent w-36"
          />
          <input
            type="text"
            placeholder="label"
            value={newChannelLabel}
            onChange={(e) => setNewChannelLabel(e.target.value)}
            className="text-sm px-2 py-1 rounded border border-border bg-bg text-text placeholder:text-text-muted focus:outline-none focus:border-accent w-32"
          />
          <button
            onClick={handleCreateChannel}
            className="text-sm px-3 py-1 rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => { setShowNewChannel(false); setNewChannelError('') }}
            className="text-sm px-2 py-1 rounded text-text-muted hover:text-text"
          >
            Cancel
          </button>
          {newChannelError && <span className="text-sm text-red-400">{newChannelError}</span>}
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-6 relative">
        {messages.length === 0 && !isWaiting && (
          <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 select-none">
            <div className="w-14 h-14 rounded-2xl bg-bg-secondary border border-border flex items-center justify-center text-accent">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <div className="text-center">
              {activeChannel === 'default' ? (
                <>
                  <h2 className="text-lg font-semibold text-text mb-1">Hi, I'm Alice</h2>
                  <p className="text-sm text-text-muted">Send a message to start chatting</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-text mb-1">{activeChannelConfig?.label ?? activeChannel}</h2>
                  <p className="text-sm text-text-muted">Send a message to start chatting</p>
                </>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col">
          {messages.map((msg, i) => {
            const prev = i > 0 ? messages[i - 1] : undefined

            if (msg.kind === 'tool_calls') {
              const prevIsAssistantish = prev != null && (
                prev.kind === 'tool_calls' ||
                (prev.kind === 'text' && prev.role === 'assistant')
              )
              return (
                <div key={msg._id} className={prevIsAssistantish ? 'mt-1' : i === 0 ? '' : 'mt-5'}>
                  <ToolCallGroup calls={msg.calls} timestamp={msg.timestamp} />
                </div>
              )
            }

            const isGrouped =
              msg.role === 'assistant' && prev != null && (
                (prev.kind === 'text' && prev.role === 'assistant') ||
                prev.kind === 'tool_calls'
              )
            return (
              <div key={msg._id} className={isGrouped ? 'mt-1' : i === 0 ? '' : 'mt-5'}>
                <ChatMessage
                  role={msg.role}
                  text={msg.text}
                  timestamp={msg.timestamp}
                  isGrouped={isGrouped}
                  media={msg.media}
                />
              </div>
            )
          })}
          {isWaiting && (
            <div className={`${messages.length > 0 ? 'mt-5' : ''}`}>
              <ThinkingIndicator />
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div className="relative">
          <button
            onClick={handleScrollToBottom}
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-bg-secondary border border-border text-text-muted hover:text-text hover:border-accent/50 flex items-center justify-center transition-all shadow-lg z-10"
            aria-label="Scroll to bottom"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput disabled={isWaiting} onSend={handleSend} />
    </div>
  )
}
