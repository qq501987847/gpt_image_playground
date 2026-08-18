export interface PromptLibraryCase {
  id: number
  title: string
  image: string
  imageAlt: string
  sourceLabel: string
  sourceUrl: string
  prompt: string
  promptPreview: string
  category: string
  styles: string[]
  scenes: string[]
  featured: boolean
  githubUrl: string
}

export interface PromptLibraryData {
  repository: string
  totalCases: number
  categories: string[]
  cases: PromptLibraryCase[]
}

export const PROMPT_LIBRARY_COMMIT = '76fcd0e6b3961ef2b041547aac654f1efd1ef270'

export const PROMPT_LIBRARY_CATEGORY_LABELS: Record<string, string> = {
  'Architecture & Spaces': '建筑与空间',
  'Brand & Logos': '品牌与标志',
  'Characters & People': '角色与人物',
  'Charts & Infographics': '图表与信息可视化',
  'Documents & Publishing': '文档与出版',
  'History & Classical Themes': '历史与古典',
  'Illustration & Art': '插画与艺术',
  'Other Use Cases': '其他场景',
  'Photography & Realism': '摄影与写实',
  'Posters & Typography': '海报与排版',
  'Products & E-commerce': '商品与电商',
  'Scenes & Storytelling': '场景与叙事',
  'UI & Interfaces': 'UI 与界面',
}

export function getPromptLibraryImageUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@${PROMPT_LIBRARY_COMMIT}/data${normalized}`
}

export function filterPromptLibraryCases(cases: PromptLibraryCase[], query: string, category: string) {
  const normalized = query.trim().toLowerCase()
  return cases.filter((item) => {
    if (category && item.category !== category) return false
    if (!normalized) return true
    return [item.title, item.prompt, item.category, ...item.styles, ...item.scenes]
      .some((value) => value.toLowerCase().includes(normalized))
  })
}
