import { useCallback, useEffect, useState } from 'react'
import type { CatalogResponse } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import type { ContentLocale } from '@duolinting/domain'

const emptyCatalog: CatalogResponse = {
  categoryGroups: [],
  categories: [],
  exercises: [],
}

export function useCatalog(contentLocale?: ContentLocale, authToken?: string) {
  // Responses belong to one account/language context. Match the key during
  // render so even the frame before the next fetch effect cannot show old data.
  const requestKey = JSON.stringify([contentLocale, authToken])
  const [loadedCatalog, setLoadedCatalog] = useState<{ key: string; data: CatalogResponse }>()
  const [loadState, setLoadState] = useState({ key: requestKey, loading: true, failed: false })
  const [retryVersion, setRetryVersion] = useState(0)
  const retryCatalog = useCallback(() => setRetryVersion((current) => current + 1), [])

  useEffect(() => {
    let mounted = true
    setLoadState((current) => ({
      key: requestKey,
      loading: true,
      failed: current.key === requestKey && current.failed,
    }))

    apiClient
      .getCatalog(contentLocale, authToken)
      .then((remoteCatalog) => {
        if (!mounted) {
          return
        }

        setLoadedCatalog({ key: requestKey, data: remoteCatalog })
        setLoadState({ key: requestKey, loading: false, failed: false })
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setLoadState({ key: requestKey, loading: false, failed: true })
      })

    return () => {
      mounted = false
    }
  }, [authToken, contentLocale, requestKey, retryVersion])

  const catalogLoaded = loadedCatalog?.key === requestKey
  const stateIsCurrent = loadState.key === requestKey
  return {
    catalog: catalogLoaded ? loadedCatalog.data : emptyCatalog,
    catalogLoadFailed: stateIsCurrent && loadState.failed,
    catalogLoading: !stateIsCurrent || loadState.loading,
    catalogLoaded,
    retryCatalog,
  }
}
