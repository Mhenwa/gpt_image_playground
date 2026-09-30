import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ModelPicker({ value, onChange, catalog, disabled, label = '模型', ariaLabel = '选择生成模型' }: {
  value: string
  onChange: (value: string) => void
  catalog: { models: string[]; loading: boolean; error: string; refresh: () => void }
  disabled: boolean
  label?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 12, width: 320, maxHeight: 360 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const allModels = value && !catalog.models.includes(value) ? [value, ...catalog.models] : catalog.models
  const filtered = allModels.filter((model) => model.toLowerCase().includes(query.trim().toLowerCase()))

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      if (!trigger.current) return
      const rect = trigger.current.getBoundingClientRect()
      // 桌面/手机两套栏位通过 CSS 切换，隐藏栏位的弹出菜单也必须关闭。
      if (!rect.width || !rect.height) { setOpen(false); return }
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight
      const width = Math.min(Math.max(rect.width, 340), viewportWidth - 24)
      const above = rect.top - viewportTop - 12
      const below = viewportTop + viewportHeight - rect.bottom - 12
      const upwards = below < 280 && above > below
      setPosition({
        left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)),
        width,
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
        maxHeight: Math.max(120, Math.min(380, upwards ? above : below)),
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const selectModel = (model: string) => {
    if (disabled || !model.trim()) return
    onChange(model.trim())
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }

  return (
    <div className="min-w-0 col-span-2 sm:col-span-3 lg:col-span-1 flex flex-col gap-0.5">
      <span className="text-gray-400 dark:text-gray-500 ml-1">{label}</span>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { setQuery(''); setOpen(!open) }}
        title={value}
        className="flex min-w-0 items-center justify-between gap-1 px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs text-left transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate font-mono">{value || '选择模型'}</span>
        <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div ref={menu} style={position} className="fixed z-[170] flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xl dark:border-white/[0.12] dark:bg-gray-900">
          <div className="flex gap-2 border-b border-gray-100 p-2 dark:border-white/[0.08]">
            <input
              ref={search}
              aria-label="搜索或输入模型"
              placeholder="搜索模型，或手动输入模型 ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); selectModel(query || filtered[0] || '') } }}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 dark:border-white/[0.12] dark:bg-white/[0.04]"
            />
            <button type="button" aria-label="刷新模型列表" title="从当前 API 重新获取模型" onClick={catalog.refresh} disabled={catalog.loading} className="rounded-lg px-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/[0.08]">
              <svg className={`h-4 w-4 ${catalog.loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7v5h-5M4 17v-5h5m-4-4a7 7 0 0 1 12-2l3 3M4 15l3 3a7 7 0 0 0 12-2" /></svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label="API 模型列表">
            {filtered.map((model) => (
              <button key={model} type="button" role="option" aria-selected={model === value} onClick={() => selectModel(model)} title={model} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs ${model === value ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}>
                <span className="break-all font-mono">{model}</span>
                {model === value && <span className="shrink-0 text-[10px]">当前</span>}
              </button>
            ))}
            {!filtered.length && !catalog.loading && <p className="px-3 py-2 text-xs text-gray-400">{query ? '没有匹配的模型，可手动使用输入的 ID' : 'API 未返回模型，可手动输入模型 ID'}</p>}
          </div>
          {query.trim() && <button type="button" onClick={() => selectModel(query)} className="border-t border-gray-100 px-3 py-2 text-left text-xs text-blue-500 hover:bg-blue-50 dark:border-white/[0.08] dark:hover:bg-blue-500/10">手动使用：<span className="break-all font-mono">{query.trim()}</span></button>}
          <p role="status" className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400 dark:border-white/[0.08]">{catalog.loading ? '正在从当前 API 获取模型…' : catalog.error || `API 返回 ${catalog.models.length} 个模型；是否支持生图取决于上游`}</p>
        </div>,
        document.body,
      )}
    </div>
  )
}
