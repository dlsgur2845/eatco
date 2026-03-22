import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import type { Ingredient } from '../types'

export function useIngredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  const fetchIngredients = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Ingredient[]>('/ingredients')
      setIngredients(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIngredients()
  }, [fetchIngredients])

  return { ingredients, loading, refetch: fetchIngredients }
}
