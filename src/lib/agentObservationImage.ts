const AGENT_OBSERVATION_MAX_BYTES = 2 * 1024 * 1024
const AGENT_OBSERVATION_PASSTHROUGH_BYTES = 1024 * 1024

const AGENT_OBSERVATION_STEPS = [
  { maxLongEdge: 2048, quality: 0.9 },
  { maxLongEdge: 1536, quality: 0.88 },
  { maxLongEdge: 1280, quality: 0.86 },
  { maxLongEdge: 1024, quality: 0.82 },
]

export function calculateAgentObservationSize(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return { width, height }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function getDataUrlByteLength(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return dataUrl.length

  const metadata = dataUrl.slice(0, commaIndex)
  const data = dataUrl.slice(commaIndex + 1)
  if (!/;base64$/i.test(metadata)) return data.length

  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding)
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Agent 参考图加载失败'))
    image.src = dataUrl
  })
}

export async function createAgentObservationImage(dataUrl: string) {
  const originalBytes = getDataUrlByteLength(dataUrl)
  if (originalBytes <= AGENT_OBSERVATION_PASSTHROUGH_BYTES) return dataUrl

  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('Agent 参考图尺寸无效')
  if (Math.max(width, height) <= AGENT_OBSERVATION_STEPS[0].maxLongEdge && originalBytes <= AGENT_OBSERVATION_MAX_BYTES) {
    return dataUrl
  }

  let smallest = dataUrl
  for (const step of AGENT_OBSERVATION_STEPS) {
    const size = calculateAgentObservationSize(width, height, step.maxLongEdge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 Agent 参考图处理')
    ctx.drawImage(image, 0, 0, size.width, size.height)

    const observation = canvas.toDataURL('image/webp', step.quality)
    if (getDataUrlByteLength(observation) < getDataUrlByteLength(smallest)) smallest = observation
    if (getDataUrlByteLength(observation) <= AGENT_OBSERVATION_MAX_BYTES) return observation
  }

  return smallest
}
