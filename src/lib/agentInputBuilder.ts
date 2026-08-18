import type { AgentConversation, AgentMessage, AgentRound, ResponsesOutputItem, TaskRecord } from '../types'
import { getAgentRoundPath } from './agentConversationState'
import {
  collectAgentRoundOutputImageSlots,
  extractAgentReferenceIds,
  getAgentCurrentReferenceId,
  getAgentGeneratedImageReferenceId,
  replaceAgentPromptImageReferencesForApi,
} from './agentImageReferences'
import { getDataUrlByteLength } from './agentObservationImage'
import { getAgentRoundResponseOutput, sanitizeResponseOutputForInput } from './agentResponseState'

type LoadImage = (id: string) => Promise<string | null | undefined>
type ImagePart = { type: string; text?: string; image_url?: string }

type AgentImageCandidate = {
  imageId: string
  referenceId: string
}

const AGENT_IMAGE_CONTEXT_MAX_BYTES = 8 * 1024 * 1024

interface BuildAgentApiInputOptions {
  conversation: AgentConversation
  currentRound: AgentRound
  tasks: TaskRecord[]
  loadImage: LoadImage
}

interface BuildAgentContinuationInputOptions {
  baseInput: unknown[]
  conversation: AgentConversation
  currentRound: AgentRound
  tasks: TaskRecord[]
  currentRoundOutput: ResponsesOutputItem[]
  functionCallOutputs?: ResponsesOutputItem[]
  batchTaskIds: string[]
  toolCallsUsed: number
  maxToolCalls: number
  loadImage: LoadImage
  continuationOnly?: boolean
  usePreviousResponseId?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getAgentImageCandidates(
  conversation: AgentConversation,
  currentRound: AgentRound,
  tasks: TaskRecord[],
) {
  const rounds = getAgentRoundPath(conversation, currentRound.id)
  const workflow: AgentImageCandidate[] = currentRound.inputImageIds.map((imageId, index) => ({
    imageId,
    referenceId: getAgentCurrentReferenceId(currentRound, index),
  }))

  const skillPlan = conversation.skillPlan?.status === 'approved' ? conversation.skillPlan : null
  const skillSourceRound = skillPlan && rounds.some((round) => round.id === skillPlan.sourceRoundId)
    ? rounds.find((round) => round.id === skillPlan.sourceRoundId)
    : null
  if (skillSourceRound && skillSourceRound.id !== currentRound.id) {
    workflow.push(...skillSourceRound.inputImageIds.map((imageId, index) => ({
      imageId,
      referenceId: getAgentCurrentReferenceId(skillSourceRound, index),
    })))
  }

  const currentMessage = conversation.messages.find((message) => message.id === currentRound.userMessageId)
  if (!currentMessage) return { workflow, historical: [] }

  const text = replaceAgentPromptImageReferencesForApi(currentMessage.content, currentRound, rounds, tasks)
  const historical: AgentImageCandidate[] = []
  for (const referenceId of extractAgentReferenceIds(text)) {
    const match = referenceId.match(/^round-(\d+)-image-(\d+)$/)
    if (!match) continue
    const round = rounds.find((item) => item.index === Number(match[1]))
    const imageId = round ? collectAgentRoundOutputImageSlots(round, tasks)[Number(match[2]) - 1] : null
    if (imageId) historical.push({ imageId, referenceId })
  }
  return { workflow, historical }
}

async function selectAgentImages(
  candidates: AgentImageCandidate[],
  loadImage: LoadImage,
  initialBytes = 0,
  initialImageIds: Set<string> = new Set(),
  initialDataUrls: Set<string> = new Set(),
) {
  const selected = new Map<string, string>()
  const imageIds = new Set(initialImageIds)
  const dataUrls = new Set(initialDataUrls)
  let bytes = initialBytes

  for (const candidate of candidates) {
    if (imageIds.has(candidate.imageId)) continue
    imageIds.add(candidate.imageId)
    const dataUrl = await loadImage(candidate.imageId)
    if (!dataUrl || dataUrls.has(dataUrl)) continue
    const nextBytes = bytes + getDataUrlByteLength(dataUrl)
    if (nextBytes > AGENT_IMAGE_CONTEXT_MAX_BYTES) continue
    selected.set(candidate.referenceId, dataUrl)
    dataUrls.add(dataUrl)
    bytes = nextBytes
  }

  return { selected, imageIds, dataUrls, bytes }
}

function getInputImageDataUrls(input: unknown[]) {
  const dataUrls: string[] = []
  for (const item of input) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (!isRecord(part) || part.type !== 'input_image' || typeof part.image_url !== 'string') continue
      dataUrls.push(part.image_url)
    }
  }
  return dataUrls
}

function filterInputImages(input: unknown[], allowedDataUrls: Set<string>) {
  const emitted = new Set<string>()
  return input.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return item
    const content = item.content.filter((part) => {
      if (!isRecord(part) || part.type !== 'input_image' || typeof part.image_url !== 'string') return true
      if (!allowedDataUrls.has(part.image_url) || emitted.has(part.image_url)) return false
      emitted.add(part.image_url)
      return true
    })
    return content.length === item.content.length ? item : { ...item, content }
  })
}

function createUserInputItem(
  conversation: AgentConversation,
  round: AgentRound,
  message: AgentMessage,
  tasks: TaskRecord[],
  selectedImages: Map<string, string>,
) {
  const rounds = getAgentRoundPath(conversation, round.id)
  const text = replaceAgentPromptImageReferencesForApi(message.content, round, rounds, tasks)
  const referenceText = round.inputImageIds.length > 0
    ? `\n\n<available_refs>${round.inputImageIds.map((_, index) => `\n  <ref id="${getAgentCurrentReferenceId(round, index)}" />`).join('')}\n</available_refs>`
    : ''
  return {
    role: 'user',
    content: [
      { type: 'input_text', text: `${text}${referenceText}` },
      ...round.inputImageIds.flatMap((_, index) => {
        const dataUrl = selectedImages.get(getAgentCurrentReferenceId(round, index))
        return dataUrl ? [{ type: 'input_image', image_url: dataUrl }] : []
      }),
    ],
  }
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function createGeneratedImageReferencePart(round: AgentRound, task: TaskRecord, imageIndex: number) {
  const prompt = (typeof task.prompt === 'string' ? task.prompt : '').replace(/\s+/g, ' ').trim()
  const truncatedPrompt = prompt.length > 1200 ? `${prompt.slice(0, 1200)}...` : prompt
  const promptAttribute = truncatedPrompt ? ` prompt="${escapeXmlAttribute(truncatedPrompt)}"` : ''
  return {
    type: 'input_text',
    text: `<ref id="${getAgentGeneratedImageReferenceId(round, imageIndex)}"${promptAttribute} />`,
  }
}

function createGeneratedImagesInputItem(round: AgentRound, tasks: TaskRecord[], selectedImages: Map<string, string>) {
  const content: ImagePart[] = []
  let imageIndex = 0
  for (const taskId of round.outputTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      content.push({ type: 'input_text', text: `<removed_ref id="${getAgentGeneratedImageReferenceId(round, imageIndex)}" />` })
      imageIndex += 1
      continue
    }
    for (let outputIndex = 0; outputIndex < task.outputImages.length; outputIndex += 1) {
      const dataUrl = selectedImages.get(getAgentGeneratedImageReferenceId(round, imageIndex))
      if (dataUrl) content.push({ type: 'input_image', image_url: dataUrl })
      content.push(createGeneratedImageReferencePart(round, task, imageIndex))
      imageIndex += 1
    }
  }
  return content.length > 0 ? { role: 'user', content } : null
}

function createBatchImagesInputItem(round: AgentRound, tasks: TaskRecord[], batchTaskIds: string[], selectedImages: Map<string, string>) {
  const content: ImagePart[] = []
  let baseImageIndex = 0
  for (const taskId of round.outputTaskIds) {
    if (batchTaskIds.includes(taskId)) break
    const task = tasks.find((item) => item.id === taskId)
    baseImageIndex += task ? task.outputImages.length : 1
  }

  let imageIndex = baseImageIndex
  for (const taskId of batchTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'done') continue
    for (let outputIndex = 0; outputIndex < task.outputImages.length; outputIndex += 1) {
      const dataUrl = selectedImages.get(getAgentGeneratedImageReferenceId(round, imageIndex))
      if (dataUrl) content.push({ type: 'input_image', image_url: dataUrl })
      content.push(createGeneratedImageReferencePart(round, task, imageIndex))
      imageIndex += 1
    }
  }
  return content.length > 0 ? { role: 'user', content } : null
}

function createAssistantFallbackItem(text: string) {
  return {
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  }
}

export async function buildAgentApiInput(options: BuildAgentApiInputOptions): Promise<unknown[]> {
  const input: unknown[] = []
  const rounds = getAgentRoundPath(options.conversation, options.currentRound.id)
  const candidates = getAgentImageCandidates(options.conversation, options.currentRound, options.tasks)
  const selectedImages = (await selectAgentImages(
    [...candidates.workflow, ...candidates.historical],
    options.loadImage,
  )).selected

  for (const round of rounds) {
    const userMessage = options.conversation.messages.find((message) => message.id === round.userMessageId)
    if (!userMessage) continue

    input.push(createUserInputItem(options.conversation, round, userMessage, options.tasks, selectedImages))
    if (round.id === options.currentRound.id) continue

    const output = getAgentRoundResponseOutput(round, options.tasks)
    if (output?.length) {
      const sanitizedOutput = sanitizeResponseOutputForInput(output)
      if (sanitizedOutput.length > 0) {
        input.push(...sanitizedOutput)
      } else {
        const assistantMessage = round.assistantMessageId
          ? options.conversation.messages.find((message) => message.id === round.assistantMessageId)
          : null
        input.push(createAssistantFallbackItem(assistantMessage?.content || '图像已生成。'))
      }
    } else {
      const assistantMessage = round.assistantMessageId
        ? options.conversation.messages.find((message) => message.id === round.assistantMessageId)
        : null
      input.push(createAssistantFallbackItem(assistantMessage?.content || '[No text response]'))
    }

    if (round.outputTaskIds.length > 0) {
      const imagesItem = createGeneratedImagesInputItem(round, options.tasks, selectedImages)
      if (imagesItem) input.push(imagesItem)
    }
  }

  return input
}

export async function buildAgentContinuationInput(options: BuildAgentContinuationInputOptions): Promise<unknown[]> {
  const functionCallOutputIds = new Set((options.functionCallOutputs ?? [])
    .filter((item) => item.type === 'function_call_output' && item.call_id)
    .map((item) => item.call_id!))
  const currentRoundOutput = options.currentRoundOutput.filter(
    (item) => item.type !== 'function_call_output' || !item.call_id || !functionCallOutputIds.has(item.call_id),
  )
  const candidates = getAgentImageCandidates(options.conversation, options.currentRound, options.tasks)
  const workflowImages = await selectAgentImages(candidates.workflow, options.loadImage)

  let selectedBatchImages = new Map<string, string>()
  let selectedBytes = workflowImages.bytes
  const allowedDataUrls = new Set(workflowImages.dataUrls)
  const batchCandidates: AgentImageCandidate[] = []
  let batchImageIndex = 0
  for (const taskId of options.currentRound.outputTaskIds) {
    const task = options.tasks.find((item) => item.id === taskId)
    if (!task) {
      batchImageIndex += 1
      continue
    }
    for (const imageId of task.outputImages) {
      if (options.batchTaskIds.includes(taskId) && task.status === 'done') {
        batchCandidates.push({ imageId, referenceId: getAgentGeneratedImageReferenceId(options.currentRound, batchImageIndex) })
      }
      batchImageIndex += 1
    }
  }
  if (batchCandidates.length > 0) {
    const batchImages = await selectAgentImages(batchCandidates, options.loadImage, selectedBytes, workflowImages.imageIds, allowedDataUrls)
    selectedBatchImages = batchImages.selected
    selectedBytes = batchImages.bytes
    for (const dataUrl of batchImages.dataUrls) allowedDataUrls.add(dataUrl)
  }

  for (const dataUrl of getInputImageDataUrls(options.baseInput)) {
    if (allowedDataUrls.has(dataUrl)) continue
    const nextBytes = selectedBytes + getDataUrlByteLength(dataUrl)
    if (nextBytes > AGENT_IMAGE_CONTEXT_MAX_BYTES) continue
    allowedDataUrls.add(dataUrl)
    selectedBytes = nextBytes
  }

  const input = options.usePreviousResponseId
    ? [...(options.functionCallOutputs ?? [])]
    : [
        ...filterInputImages(options.baseInput, allowedDataUrls),
        ...sanitizeResponseOutputForInput(currentRoundOutput, { allowPendingFunctionCalls: true }),
        ...(options.functionCallOutputs ?? []),
      ]
  const batchImagesItem = createBatchImagesInputItem(options.currentRound, options.tasks, options.batchTaskIds, selectedBatchImages)
  if (batchImagesItem) input.push(batchImagesItem)

  const newImageRefs = collectAgentRoundOutputImageSlots(options.currentRound, options.tasks)
    .map((imageId, index) => imageId ? `<ref id="${getAgentGeneratedImageReferenceId(options.currentRound, index)}" />` : null)
    .filter((ref): ref is string => Boolean(ref))
  const lines = ['[System] The app has saved your generated outputs and is continuing the same Agent turn.']
  if (newImageRefs.length > 0) {
    lines.push(options.continuationOnly
      ? `These saved image refs are available as context for the written reply: ${newImageRefs.join(', ')}`
      : `The following image ref ids are now available for you to reference in subsequent image_generation prompts: ${newImageRefs.join(', ')}`)
  }
  lines.push(options.continuationOnly
    ? 'Continue the written reply using the saved tool results. Do not generate or request any new images.'
    : 'Continue generating. Do NOT repeat what you already said in earlier responses.')
  if (!options.continuationOnly) {
    lines.push('If you still need another round after this (e.g. more dependent images), call continue_generation.')
  }
  lines.push(`Tool-call budget: ${options.toolCallsUsed}/${options.maxToolCalls} used.`)
  input.push({
    role: 'user',
    content: [{ type: 'input_text', text: lines.join('\n') }],
  })
  return input
}
