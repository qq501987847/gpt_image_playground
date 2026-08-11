// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateAgentObservationSize,
  createAgentObservationImage,
} from './agentObservationImage'

class MockImage {
  naturalWidth = 3840
  naturalHeight = 2160
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

describe('Agent observation images', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calculates an uncropped proportional observation size', () => {
    expect(calculateAgentObservationSize(3840, 2160, 2048)).toEqual({ width: 2048, height: 1152 })
    expect(calculateAgentObservationSize(2160, 3840, 2048)).toEqual({ width: 1152, height: 2048 })
  })

  it('creates a smaller observation copy without changing the original data URL', async () => {
    const original = `data:image/png;base64,${'a'.repeat(3 * 1024 * 1024)}`
    const drawImage = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,observation')
    vi.stubGlobal('Image', MockImage)

    const result = await createAgentObservationImage(original)

    expect(result).toBe('data:image/webp;base64,observation')
    expect(original).toMatch(/^data:image\/png;base64,/)
    expect(getContext).toHaveBeenCalledWith('2d')
    expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.9)
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 2048, 1152)
  })

  it('passes a small in-budget image through without re-encoding it', async () => {
    class SmallImage extends MockImage {
      naturalWidth = 1200
      naturalHeight = 800
    }
    const original = 'data:image/jpeg;base64,c21hbGw='
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    vi.stubGlobal('Image', SmallImage)

    await expect(createAgentObservationImage(original)).resolves.toBe(original)
    expect(toDataURL).not.toHaveBeenCalled()
  })
})
