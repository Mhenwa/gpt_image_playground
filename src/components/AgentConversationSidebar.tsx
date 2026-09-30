import { useEffect, useMemo, useRef, useState } from 'react'
import { removeMultipleTasks, useStore } from '../store'
import { getAgentConversationTaskIds, getConversationSearchText } from '../lib/agentConversationState'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon, CollectionManageIcon, EditIcon, SettingsIcon, SidebarLeftIcon, TrashIcon } from './icons'

export default function AgentConversationSidebar() {
  const conversations = useStore((s) => s.agentConversations)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const createConversation = useStore((s) => s.createAgentConversation)
  const setActiveConversationId = useStore((s) => s.setActiveAgentConversationId)
  const renameConversation = useStore((s) => s.renameAgentConversation)
  const deleteConversation = useStore((s) => s.deleteAgentConversation)
  const sidebarCollapsed = useStore((s) => s.agentSidebarCollapsed)
  const setSidebarCollapsed = useStore((s) => s.setAgentSidebarCollapsed)
  const mobileSidebarOpen = useStore((s) => s.agentMobileSidebarOpen)
  const setMobileSidebarOpen = useStore((s) => s.setAgentMobileSidebarOpen)
  const editingConversationId = useStore((s) => s.agentEditingConversationId)
  const setEditingConversationId = useStore((s) => s.setAgentEditingConversationId)
  const generatingTitleIds = useStore((s) => s.agentGeneratingTitleIds)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const showToast = useStore((s) => s.showToast)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [focusSearch, setFocusSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const editingConversationTitle = conversations.find((item) => item.id === editingConversationId)?.title
  usePreventBackgroundScroll(mobileSidebarOpen, sidebarRef)
  useCloseOnEscape(mobileSidebarOpen, () => setMobileSidebarOpen(false))

  const groups = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - 7)
    const sorted = [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((item) => !query || getConversationSearchText(item).includes(query))
    return [
      { title: '今天', items: sorted.filter((item) => item.updatedAt >= today.getTime()) },
      { title: '最近 7 天', items: sorted.filter((item) => item.updatedAt < today.getTime() && item.updatedAt >= weekStart.getTime()) },
      { title: '更早', items: sorted.filter((item) => item.updatedAt < weekStart.getTime()) },
    ].filter((group) => group.items.length > 0)
  }, [conversations, searchQuery])

  useEffect(() => {
    if (!editingConversationId) return
    if (editingConversationTitle) setEditingTitle(editingConversationTitle)
    setSearchQuery('')
    setActionsId(null)
  }, [editingConversationId, editingConversationTitle])

  useEffect(() => {
    if (sidebarCollapsed && !mobileSidebarOpen) setEditingConversationId(null)
  }, [sidebarCollapsed, mobileSidebarOpen, setEditingConversationId])

  useEffect(() => {
    if (!focusSearch || sidebarCollapsed) return
    searchRef.current?.focus()
    setFocusSearch(false)
  }, [focusSearch, sidebarCollapsed])

  useEffect(() => {
    if (!actionsId) return
    const handlePointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[data-agent-conversation-actions]')) return
      setActionsId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [actionsId])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (media.matches) setMobileSidebarOpen(false)
    }
    closeOnDesktop()
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [setMobileSidebarOpen])

  useEffect(() => {
    if (!mobileSidebarOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    const firstFocus = sidebarRef.current?.querySelector<HTMLInputElement>('input[aria-label="对话标题"]')
      ?? sidebarRef.current?.querySelector<HTMLButtonElement>('[data-agent-sidebar-close]')
    firstFocus?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const buttons = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input') ?? [])
        .filter((element) => element.getClientRects().length > 0)
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [mobileSidebarOpen, setMobileSidebarOpen])

  const confirmRename = () => {
    if (editingConversationId && editingTitle.trim() && !generatingTitleIds[editingConversationId]) {
      renameConversation(editingConversationId, editingTitle.trim())
    }
    setEditingConversationId(null)
  }

  const handleDelete = (id: string) => {
    const conversation = conversations.find((item) => item.id === id)
    const relatedTaskIds = getAgentConversationTaskIds(conversation, tasks)
    const relatedTaskIdSet = new Set(relatedTaskIds)
    const imageCount = new Set(tasks.filter((task) => relatedTaskIdSet.has(task.id)).flatMap((task) => task.outputImages || [])).size
    setActionsId(null)
    setMobileSidebarOpen(false)
    setConfirmDialog({
      title: '删除对话',
      message: '确定要删除这个 Agent 对话吗？',
      checkbox: imageCount > 0 ? { label: `同时删除对话中生成的图片（${imageCount} 张）`, tone: 'danger' } : undefined,
      action: async (deleteGeneratedImages = false) => {
        deleteConversation(id)
        if (deleteGeneratedImages && relatedTaskIds.length > 0) await removeMultipleTasks(relatedTaskIds)
      },
    })
  }

  return (
    <>
      {mobileSidebarOpen && <button type="button" aria-label="关闭对话列表遮罩" className="fixed inset-0 z-[45] bg-black/40 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileSidebarOpen(false)} />}
      <aside
        id="agent-conversation-sidebar"
        ref={sidebarRef}
        aria-label="对话列表"
        role={mobileSidebarOpen ? 'dialog' : undefined}
        aria-modal={mobileSidebarOpen ? true : undefined}
        data-collapsed={sidebarCollapsed}
        data-mobile-open={mobileSidebarOpen}
        className={`agent-sidebar safe-area-top safe-area-bottom fixed inset-y-0 left-0 z-[46] w-[min(320px,85vw)] flex-col border-r border-gray-200/80 bg-[#f7f7f8] dark:border-white/[0.06] dark:bg-[#171717] lg:w-[var(--agent-sidebar-width)] ${mobileSidebarOpen ? 'flex' : 'hidden lg:flex'}`}
      >
        <div className={`flex min-h-0 flex-1 flex-col px-3 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-1">
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">Playground</span>
            <button type="button" aria-label="折叠对话列表" title="折叠对话列表" className="hidden rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06] lg:block" onClick={() => setSidebarCollapsed(true)}>
              <SidebarLeftIcon className="h-5 w-5" />
            </button>
            <button type="button" data-agent-sidebar-close aria-label="关闭对话列表" className="rounded-lg p-2 text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06] lg:hidden" onClick={() => setMobileSidebarOpen(false)}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <button type="button" aria-label="新对话" onClick={() => { createConversation(); setMobileSidebarOpen(false) }} className="mb-3 flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200/70 dark:text-gray-100 dark:hover:bg-white/[0.06]">
            <EditIcon className="h-5 w-5" />
            <span>新对话</span>
          </button>
          <div className="relative mb-5 shrink-0">
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="m16 16 4 4" /></svg>
            <input ref={searchRef} aria-label="搜索对话" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索对话" className="h-10 w-full rounded-xl border border-gray-200/80 bg-white/70 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-white dark:focus:border-white/25" />
          </div>
          <nav aria-label="历史对话" className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
            {groups.length === 0 && <p className="px-3 py-8 text-center text-xs text-gray-400">{searchQuery.trim() ? '没有找到匹配的对话' : '还没有历史对话'}</p>}
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="mb-1.5 px-3 text-xs font-medium text-gray-400 dark:text-gray-500">{group.title}</h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <div key={item.id} data-agent-conversation-item={item.id} className={`group relative flex h-10 items-center gap-1 rounded-lg px-3 text-sm transition-colors ${item.id === activeConversationId ? 'bg-gray-200/80 text-gray-900 dark:bg-white/[0.08] dark:text-white' : 'text-gray-700 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-white/[0.05]'}`}>
                      {editingConversationId === item.id ? (
                        <input aria-label="对话标题" className="h-7 min-w-0 flex-1 rounded border border-gray-400 bg-white px-1.5 text-sm text-gray-900 outline-none dark:border-white/25 dark:bg-[#212121] dark:text-white" value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} autoFocus onBlur={confirmRename} onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); confirmRename() }
                          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingConversationId(null) }
                        }} />
                      ) : (
                        <button type="button" title={item.title} aria-current={item.id === activeConversationId ? 'page' : undefined} className="min-w-0 flex-1 truncate py-2 text-left" onClick={() => { setActiveConversationId(item.id); setMobileSidebarOpen(false); setActionsId(null) }}>{item.title}</button>
                      )}
                      {editingConversationId !== item.id && <div data-agent-conversation-actions>
                        <button type="button" aria-label={`对话操作：${item.title}`} aria-expanded={actionsId === item.id} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-300/60 dark:text-gray-400 dark:hover:bg-white/[0.08] lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 ${actionsId === item.id ? 'opacity-100' : 'lg:opacity-0'}`} onClick={() => setActionsId(actionsId === item.id ? null : item.id)}>
                          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                        </button>
                        {actionsId === item.id && <div className="absolute right-1 top-9 z-10 w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#262626]">
                          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-white/[0.06]" onClick={() => {
                            setActionsId(null)
                            if (generatingTitleIds[item.id]) { showToast('标题生成中，暂不能修改标题', 'info'); return }
                            setEditingConversationId(item.id)
                          }}><EditIcon className="h-4 w-4" />重命名</button>
                          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleDelete(item.id)}><TrashIcon className="h-4 w-4" />删除对话</button>
                        </div>}
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="shrink-0 space-y-1 border-t border-gray-200/80 py-3 dark:border-white/[0.06]">
            <button type="button" onClick={() => { setMobileSidebarOpen(false); setAppMode('gallery') }} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/[0.06]"><CollectionManageIcon className="h-5 w-5" />画廊</button>
            <button type="button" onClick={() => { setMobileSidebarOpen(false); setShowSettings(true) }} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/[0.06]"><SettingsIcon className="h-5 w-5" />设置</button>
          </div>
        </div>
        {sidebarCollapsed && <div className="hidden min-h-0 flex-1 flex-col items-center gap-2 py-4 lg:flex">
          <button type="button" aria-label="展开对话列表" title="展开对话列表" onClick={() => setSidebarCollapsed(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06]"><SidebarLeftIcon className="h-5 w-5" /></button>
          <button type="button" aria-label="新对话" title="新对话" onClick={createConversation} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/[0.06]"><EditIcon className="h-5 w-5" /></button>
          <button type="button" aria-label="搜索对话" title="搜索对话" onClick={() => { setSidebarCollapsed(false); setFocusSearch(true) }} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06]"><svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="m16 16 4 4" /></svg></button>
          <div className="mt-auto space-y-2">
            <button type="button" aria-label="画廊" title="画廊" onClick={() => setAppMode('gallery')} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06]"><CollectionManageIcon className="h-5 w-5" /></button>
            <button type="button" aria-label="设置" title="设置" onClick={() => setShowSettings(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.06]"><SettingsIcon className="h-5 w-5" /></button>
          </div>
        </div>}
      </aside>
    </>
  )
}
