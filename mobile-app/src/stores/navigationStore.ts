import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type NavigationStoreState = {
  pendingPath: string | null
  selectedSeriesId: number | null
  setPendingPath: (path: string | null) => void
  setSelectedSeriesId: (seriesId: number | null) => void
}

export const useNavigationStore = create<NavigationStoreState>()(
  persist(
    (set) => ({
      pendingPath: null,
      selectedSeriesId: null,
      setPendingPath: (path) => set({ pendingPath: path }),
      setSelectedSeriesId: (seriesId) => set({ selectedSeriesId: seriesId }),
    }),
    {
      name: 'duolinting.mobile.navigation.v1',
      partialize: (state) => ({
        selectedSeriesId: state.selectedSeriesId,
      }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
