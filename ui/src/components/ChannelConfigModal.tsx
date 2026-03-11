import { useState, useEffect } from 'react'
import { api } from '../api'
import type { ChannelListItem } from '../api/channels'
import type { ToolInfo } from '../api/tools'

interface ChannelConfigModalProps {
  channel: ChannelListItem
  onClose: () => void
  onSaved: (updated: ChannelListItem) => void
}

export function ChannelConfigModal({ channel, onClose, onSaved }: ChannelConfigModalProps) {
  const [label, setLabel] = useState(channel.label)
  const [systemPrompt, setSystemPrompt] = useState(channel.systemPrompt ?? '')
  const [provider, setProvider] = useState(channel.provider ?? '')
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set(channel.disabledTools ?? []))
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.tools.load().then(({ inventory }) => setTools(inventory)).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { channel: updated } = await api.channels.update(channel.id, {
        label: label.trim() || channel.label,
        systemPrompt: systemPrompt.trim() || undefined,
        provider: (provider as 'claude-code' | 'vercel-ai-sdk') || undefined,
        disabledTools: disabledTools.size > 0 ? [...disabledTools] : undefined,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = (name: string) => {
    setDisabledTools((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Group tools by group name
  const toolGroups = tools.reduce<Record<string, ToolInfo[]>>((acc, t) => {
    ;(acc[t.group] ??= []).push(t)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text">
            <span className="text-text-muted mr-1">#</span>
            {channel.id}
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-secondary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Custom instructions for this channel..."
              rows={4}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text focus:outline-none focus:border-accent"
            >
              <option value="">Default (global)</option>
              <option value="vercel-ai-sdk">Vercel AI SDK</option>
              <option value="claude-code">Claude Code</option>
            </select>
          </div>

          {/* Disabled Tools */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">
              Disabled Tools
              {disabledTools.size > 0 && (
                <span className="ml-2 text-text-muted/60">({disabledTools.size} disabled)</span>
              )}
            </label>
            {tools.length === 0 ? (
              <p className="text-xs text-text-muted">Loading tools...</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {Object.entries(toolGroups).map(([group, groupTools]) => (
                  <div key={group}>
                    <p className="text-xs font-medium text-text-muted/70 mb-1">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {groupTools.map((t) => {
                        const isDisabled = disabledTools.has(t.name)
                        return (
                          <button
                            key={t.name}
                            onClick={() => toggleTool(t.name)}
                            title={t.description}
                            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                              isDisabled
                                ? 'border-red-400/30 bg-red-400/10 text-red-400 line-through'
                                : 'border-border bg-bg-secondary text-text hover:border-accent/50'
                            }`}
                          >
                            {t.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          {error ? <p className="text-xs text-red-400">{error}</p> : <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-lg text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
