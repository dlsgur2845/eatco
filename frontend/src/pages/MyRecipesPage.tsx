import { useEffect, useRef, useState } from 'react'
import api from '../api/client'

const MAX_IMAGE_WIDTH = 1200

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > MAX_IMAGE_WIDTH) {
        height = Math.round(height * (MAX_IMAGE_WIDTH / width))
        width = MAX_IMAGE_WIDTH
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}

interface CustomRecipe {
  id: string
  name: string
  category: string
  cooking_method: string
  calories: string | null
  ingredients: string[]
  manual_steps: string[]
  tip: string | null
  image_url: string | null
  created_by: string | null
  created_at: string
}

const CATEGORIES = ['반찬', '국/탕', '일품', '후식', '기타']
const METHODS = ['볶기', '끓이기', '찌기', '굽기', '무치기', '부치기', '조리기', '기타']

export default function MyRecipesPage() {
  const [recipes, setRecipes] = useState<CustomRecipe[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', category: '기타', cooking_method: '기타',
    calories: '', ingredients: '', manual_steps: '', tip: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchRecipes = () => {
    api.get<CustomRecipe[]>('/custom-recipes').then(r => setRecipes(r.data)).catch(() => {})
  }

  useEffect(() => { fetchRecipes() }, [])

  const resetForm = () => {
    setForm({ name: '', category: '기타', cooking_method: '기타', calories: '', ingredients: '', manual_steps: '', tip: '' })
    setImageFile(null)
    setImagePreview(null)
    setEditId(null)
    setShowForm(false)
  }

  const startEdit = (r: CustomRecipe) => {
    setForm({
      name: r.name,
      category: r.category,
      cooking_method: r.cooking_method,
      calories: r.calories || '',
      ingredients: r.ingredients.join('\n'),
      manual_steps: r.manual_steps.join('\n'),
      tip: r.tip || '',
    })
    setImagePreview(r.image_url)
    setImageFile(null)
    setEditId(r.id)
    setShowForm(true)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: form.name,
      category: form.category,
      cooking_method: form.cooking_method,
      calories: form.calories || null,
      ingredients: form.ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      manual_steps: form.manual_steps.split('\n').map(s => s.trim()).filter(Boolean),
      tip: form.tip || null,
    }

    let recipeId = editId
    if (editId) {
      await api.put(`/custom-recipes/${editId}`, data)
    } else {
      const res = await api.post<{id: string}>('/custom-recipes', data)
      recipeId = res.data.id
    }

    // 이미지 업로드 (리사이즈 후)
    if (imageFile && recipeId) {
      const resized = await resizeImage(imageFile)
      const formData = new FormData()
      formData.append('file', resized, 'recipe.jpg')
      await api.post(`/custom-recipes/${recipeId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }

    resetForm()
    fetchRecipes()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 레시피를 삭제하시겠습니까?')) return
    await api.delete(`/custom-recipes/${id}`)
    fetchRecipes()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-headline font-bold text-4xl tracking-tight text-on-surface mb-2">나의 레시피</h2>
          <p className="text-on-surface-variant">직접 등록한 레시피를 관리하세요</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-gradient-to-r from-primary to-primary-container text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          새 레시피
        </button>
      </div>

      {/* 등록/수정 폼 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-[2rem] p-6 shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline font-bold text-xl text-on-surface">
                {editId ? '레시피 수정' : '새 레시피 등록'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-surface-container-high rounded-full">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">요리 이름</label>
                <input
                  required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border-none p-0 text-lg font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
                  placeholder="예: 김치볶음밥"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                  <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">분류</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full border-none p-0 text-base font-medium bg-transparent focus:ring-0">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                  <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">조리법</label>
                  <select value={form.cooking_method} onChange={e => setForm({ ...form, cooking_method: e.target.value })}
                    className="w-full border-none p-0 text-base font-medium bg-transparent focus:ring-0">
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">칼로리 (선택)</label>
                <input value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })}
                  className="w-full border-none p-0 text-base font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
                  placeholder="예: 350" />
              </div>

              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">재료 (한 줄에 하나씩)</label>
                <textarea value={form.ingredients} onChange={e => setForm({ ...form, ingredients: e.target.value })}
                  rows={4} className="w-full border-none p-0 text-sm bg-transparent focus:ring-0 resize-none placeholder:text-surface-container-highest"
                  placeholder={"김치\n밥\n달걀\n참기름"} />
              </div>

              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">조리 순서 (한 줄에 하나씩)</label>
                <textarea value={form.manual_steps} onChange={e => setForm({ ...form, manual_steps: e.target.value })}
                  rows={4} className="w-full border-none p-0 text-sm bg-transparent focus:ring-0 resize-none placeholder:text-surface-container-highest"
                  placeholder={"김치를 잘게 썬다\n팬에 기름을 두르고 김치를 볶는다\n밥을 넣고 같이 볶는다"} />
              </div>

              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">팁 (선택)</label>
                <input value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })}
                  className="w-full border-none p-0 text-sm bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
                  placeholder="센 불에서 빠르게 볶아야 맛있어요" />
              </div>

              {/* 이미지 업로드 */}
              <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">사진 (선택)</label>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelect} />
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="미리보기" className="w-full h-40 object-cover rounded-xl" />
                    <button type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null) }}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 rounded-xl flex flex-col items-center gap-2 cursor-pointer hover:bg-primary/5 transition-colors"
                    style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
                    <span className="material-symbols-outlined text-2xl" style={{ color: 'var(--color-outline)', opacity: 0.5 }}>add_photo_alternate</span>
                    <span className="text-xs text-on-surface-variant">클릭하여 사진 추가 (자동 리사이즈)</span>
                  </button>
                )}
              </div>

              <button type="submit"
                className="w-full py-4 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold text-lg shadow-xl active:scale-95 transition-transform">
                {editId ? '수정하기' : '등록하기'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 레시피 목록 */}
      {recipes.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-6xl mb-4 block" style={{ color: 'var(--color-outline)', opacity: 0.4 }}>menu_book</span>
          <p className="text-on-surface-variant mb-2">아직 등록한 레시피가 없어요</p>
          <p className="text-xs text-outline">나만의 레시피를 등록하면 냉장고 재료와 매칭되어 추천됩니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map(r => (
            <div key={r.id} className="bg-surface-container-lowest rounded-[2rem] overflow-hidden transition-all hover:shadow-lg">
              {r.image_url && (
                <img src={r.image_url} alt={r.name} className="w-full h-40 object-cover" />
              )}
              <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <h3 className="font-semibold text-lg text-on-surface">{r.name}</h3>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {r.category} · {r.cooking_method}{r.calories ? ` · ${r.calories}kcal` : ''}
                    {r.created_by ? ` · ${r.created_by}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.ingredients.slice(0, 5).map((ing, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{ing}</span>
                    ))}
                    {r.ingredients.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">+{r.ingredients.length - 5}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(r)} className="p-2 hover:bg-surface-container-high rounded-full">
                    <span className="material-symbols-outlined text-on-surface-variant text-[20px]">edit</span>
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-2 hover:bg-tertiary/10 rounded-full">
                    <span className="material-symbols-outlined text-tertiary text-[20px]">delete</span>
                  </button>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="mt-4 pt-4 space-y-3 bg-surface-container-low rounded-2xl p-4">
                  {r.manual_steps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-on-surface-variant mb-2">조리 순서</p>
                      <div className="space-y-2">
                        {r.manual_steps.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}>
                              {i + 1}
                            </span>
                            <p className="text-sm text-on-surface">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.tip && (
                    <div className="px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
                      <p className="text-xs text-on-surface-variant">Tip: {r.tip}</p>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
