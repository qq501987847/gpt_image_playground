import { describe, expect, it } from 'vitest'
import { pickActualParams } from './imageApiShared'

describe('pickActualParams', () => {
  it.each(['xhigh', 'max'] as const)('keeps the gpt-image-2.5 %s quality returned by the API', (quality) => {
    expect(pickActualParams({ quality })).toEqual({ quality })
  })
})
