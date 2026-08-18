import { describe, expect, it } from 'vitest'
import { filterPromptLibraryCases, getPromptLibraryImageUrl, type PromptLibraryCase } from './promptLibrary'

const cases: PromptLibraryCase[] = [{
  id: 1,
  title: '香水电商图',
  image: '/images/case1.jpg',
  imageAlt: '香水',
  sourceLabel: 'source',
  sourceUrl: 'https://example.com',
  prompt: 'Studio product photography with mint and rose',
  promptPreview: 'Studio product photography',
  category: 'Products & E-commerce',
  styles: ['Photography'],
  scenes: ['Commerce'],
  featured: false,
  githubUrl: 'https://github.com/example',
}]

describe('prompt library', () => {
  it('filters by category and searches titles, prompts, styles, and scenes', () => {
    expect(filterPromptLibraryCases(cases, '香水', '')).toEqual(cases)
    expect(filterPromptLibraryCases(cases, 'mint', '')).toEqual(cases)
    expect(filterPromptLibraryCases(cases, 'photography', '')).toEqual(cases)
    expect(filterPromptLibraryCases(cases, '', 'UI & Interfaces')).toEqual([])
  })

  it('resolves repository image paths against the pinned commit', () => {
    expect(getPromptLibraryImageUrl('/images/case1.jpg')).toBe('https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@76fcd0e6b3961ef2b041547aac654f1efd1ef270/data/images/case1.jpg')
  })
})
