import { useEffect, useState } from 'react'
import type { ApiProfile } from '../types'
import { shouldUseApiProxy } from '../lib/devProxy'
import { fetchModelCatalog } from '../lib/modelCatalog'

export default function useModelCatalog(profile: ApiProfile, enabled = true) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const proxyEnabled = shouldUseApiProxy(profile.apiProxy)

  useEffect(() => {
    setModels([])
    setError('')
    setLoading(false)
    if (!enabled) return
    if (profile.provider === 'fal') {
      setError('此服务商没有兼容的模型列表，请手动输入模型 ID')
      return
    }
    if (!profile.apiKey.trim()) {
      setError('请先在设置中填写 API Key，再获取模型列表')
      return
    }
    if (!proxyEnabled && !profile.baseUrl.trim()) {
      setError('请先在设置中填写 API 地址')
      return
    }

    const controller = new AbortController()
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    setLoading(true)
    // 等待用户完成 Key/地址输入，切换配置后取消旧请求，避免串用模型列表。
    const debounce = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 20000)
      fetchModelCatalog(profile, controller.signal)
        .then((items) => {
          if (!cancelled) setModels(items)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setError(controller.signal.aborted
            ? '获取模型列表超时，请刷新重试或手动输入'
            : err instanceof Error ? err.message : '获取模型列表失败，请手动输入')
        })
        .finally(() => {
          clearTimeout(timeout)
          if (!cancelled) setLoading(false)
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(debounce)
      clearTimeout(timeout)
      controller.abort()
    }
  }, [enabled, profile.id, profile.provider, profile.baseUrl, profile.apiKey, profile.apiProxy, proxyEnabled, revision])

  return { models, loading, error, refresh: () => setRevision((value) => value + 1) }
}
