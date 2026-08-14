import { useEffect, useState } from 'react'
import type { CatalogResponse } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import type { ContentLocale } from '@duolinting/domain'

const emptyCatalog: CatalogResponse = {
  categoryGroups: [],
  categories: [],
  exercises: [],
}

export function useCatalog(contentLocale?: ContentLocale) {
  const [catalog, setCatalog] = useState<CatalogResponse>(emptyCatalog)
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false)

  useEffect(() => {
    let mounted = true

    apiClient
      .getCatalog(contentLocale)
      .then((remoteCatalog) => {
        if (!mounted) {
          return
        }

        setCatalog(remoteCatalog)
        setCatalogLoadFailed(false)
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setCatalogLoadFailed(true)
      })

    return () => {
      mounted = false
    }
  }, [contentLocale])

  return {
    catalog,
    catalogLoadFailed,
  }
}
