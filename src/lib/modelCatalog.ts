import type { ApiProfile } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'

export async function fetchModelCatalog(profile: ApiProfile, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) throw new DOMException('获取模型已取消', 'AbortError')

  const apiKey = profile.apiKey.trim()
  if (!apiKey) throw new Error('请先填写 API Key，再获取模型列表。')

  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  if (!useApiProxy && !profile.baseUrl.trim()) throw new Error('请先填写 API 地址，再获取模型列表。')

  let response: Response
  try {
    response = await fetch(buildApiUrl(profile.baseUrl, 'models', proxyConfig, useApiProxy), {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (signal?.aborted || (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError')) {
      throw new DOMException('获取模型已取消', 'AbortError')
    }
    throw new Error('无法连接模型接口，请检查网络、API 地址或跨域设置。')
  }
  if (signal?.aborted) throw new DOMException('获取模型已取消', 'AbortError')

  // 上游错误可能带有凭证，界面只展示固定说明和状态码。
  if (response.status === 401 || response.status === 403) {
    throw new Error('API Key 无效或没有获取模型的权限，请检查 Key 和分组权限。')
  }
  if (response.status === 429) throw new Error('模型接口请求过于频繁，请稍后重试。')
  if (response.status >= 500) throw new Error(`模型服务暂时异常（HTTP ${response.status}），请稍后重试。`)
  if (response.status === 404) throw new Error('模型接口不存在（HTTP 404），请检查 API 地址或服务是否支持 /models。')
  if (!response.ok) throw new Error(`获取模型失败（HTTP ${response.status}），请检查 API 配置。`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch (err) {
    if (signal?.aborted || (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError')) {
      throw new DOMException('获取模型已取消', 'AbortError')
    }
    throw new Error('模型接口返回的不是有效 JSON，请检查 API 地址。')
  }
  if (signal?.aborted) throw new DOMException('获取模型已取消', 'AbortError')

  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
  if (record?.error || record?.success === false) {
    throw new Error('模型接口返回错误，请检查 API Key、地址或模型权限。')
  }

  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.models)
        ? record.models
        : null
  if (!models) throw new Error('模型接口返回格式异常，未找到模型列表。')

  const ids = models.flatMap((item: unknown) => {
    const id = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
        ? item.id
        : ''
    const trimmed = id.trim()
    return trimmed ? [trimmed] : []
  })
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}
