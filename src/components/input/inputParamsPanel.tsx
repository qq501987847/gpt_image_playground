import type { ApiProfile, TaskParams } from '../../types'
import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import Select from '../Select'
import ButtonTooltip from './buttonTooltip'
import { GEMINI_IMAGE_SIZES, getGeminiAspectRatios } from '../../lib/geminiCapabilities'
import { getGptImage2SizeOptions, getModelCapability, GPT_IMAGE_2_ASPECT_RATIOS, GPT_IMAGE_2_RESOLUTIONS, modelSupportsField, type ModelField } from '../../lib/modelCapabilities'

interface HintTooltipState {
  visible: boolean
  show: () => void
  hide: () => void
  clearTimer: () => void
  startTouch: () => void
}

export default function InputParamsPanel({
  cols,
  params,
  setParams,
  activeProfile,
  isFalProvider,
  isFalTextToImage,
  isGeminiProvider,
  displaySize,
  qualityOptions,
  selectClass,
  compressionHint,
  compressionDisabled,
  outputCompressionInput,
  setOutputCompressionInput,
  commitOutputCompression,
  moderationHint,
  moderationDisabled,
  agentAutoImageCount,
  outputImageLimit,
  nInput,
  setNInputFocused,
  commitN,
  handleNInputChange,
  handleNLimitIncreaseAttempt,
  showAgentNHint,
  hideNLimitHint,
  startAgentNHintTouch,
  clearAgentNHintTouchTimer,
  nLimitHint,
  nLimitHintText,
  streamConcurrentByN,
  streamConcurrentHint,
  sizeHint,
  qualityHint,
  onOpenSizePicker,
  showAdvanced = true,
  advancedOnly = false,
  panel = false,
}: {
  cols: string
  params: TaskParams
  setParams: (patch: Partial<TaskParams>) => void
  activeProfile: ApiProfile
  isFalProvider: boolean
  isFalTextToImage: boolean
  isGeminiProvider: boolean
  displaySize: string
  qualityOptions: Array<{ label: string; value: string }>
  selectClass: string
  compressionHint: HintTooltipState
  compressionDisabled: boolean
  outputCompressionInput: string
  setOutputCompressionInput: (value: string) => void
  commitOutputCompression: () => void
  moderationHint: HintTooltipState
  moderationDisabled: boolean
  agentAutoImageCount: boolean
  outputImageLimit: number
  nInput: string
  setNInputFocused: (focused: boolean) => void
  commitN: () => void
  handleNInputChange: (value: string) => void
  handleNLimitIncreaseAttempt: (preventDefault: () => void) => void
  showAgentNHint: () => void
  hideNLimitHint: () => void
  startAgentNHintTouch: () => void
  clearAgentNHintTouchTimer: () => void
  nLimitHint: HintTooltipState
  nLimitHintText: string
  streamConcurrentByN: boolean
  streamConcurrentHint: HintTooltipState
  sizeHint: HintTooltipState
  qualityHint: HintTooltipState
  onOpenSizePicker: () => void
  showAdvanced?: boolean
  advancedOnly?: boolean
  panel?: boolean
}) {
  const capability = activeProfile.provider === 'openai' || activeProfile.provider === 'gemini'
    ? getModelCapability(activeProfile.provider, activeProfile.model, activeProfile.apiMode)
    : {
        protocol: 'openai' as const,
        verified: true,
        fields: ['size', 'quality', 'n', 'output_format', 'output_compression', 'moderation', 'transparent_output'] as ModelField[],
        sizes: [],
        qualities: [],
      }
  if (panel) {
    const buttonClass = (selected: boolean) => `flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs transition-[transform,background-color,color] active:scale-[0.96] ${selected ? 'border-gray-700 bg-gray-700 text-white dark:border-white dark:bg-white/15' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.14] dark:text-gray-300 dark:hover:bg-white/[0.06]'}`
    const gptImage2Ratio = !params.geminiAspectRatio || params.geminiAspectRatio === 'auto' ? '1:1' : params.geminiAspectRatio
    const gptImage2Sizes = !isGeminiProvider
      ? getGptImage2SizeOptions(gptImage2Ratio)
      : {}
    return <div className="space-y-3 text-xs">
      {modelSupportsField(capability, 'quality') && <section><p className="mb-1 text-gray-500 dark:text-gray-400">质量</p><div className="grid grid-cols-4 gap-2">{capability.qualities.map((value) => <button key={value} type="button" onClick={() => setParams({ quality: value })} className={buttonClass(params.quality === value)}>{value === 'auto' ? '自动' : value === 'low' ? '低' : value === 'medium' ? '中' : '高'}</button>)}</div></section>}
      {modelSupportsField(capability, 'size') && !capability.aspectRatios && <section><p className="mb-1 text-gray-500 dark:text-gray-400">分辨率</p><div className="grid grid-cols-4 gap-2">{capability.sizes.map((value) => <button key={value} type="button" onClick={() => setParams({ size: value })} className={buttonClass(params.size === value)}>{value === 'auto' ? '自动' : value}</button>)}</div></section>}
      {modelSupportsField(capability, 'geminiImageSize') && <section><p className="mb-1 text-gray-500 dark:text-gray-400">{isGeminiProvider ? '清晰度' : '分辨率'}</p><div className={`grid gap-2 ${isGeminiProvider ? 'grid-cols-4' : 'grid-cols-3'}`}>{(isGeminiProvider ? (capability.verified ? GEMINI_IMAGE_SIZES : ['auto']) : GPT_IMAGE_2_RESOLUTIONS.filter((value) => gptImage2Sizes[value])).map((value) => {
        const size = gptImage2Sizes[value]
        return <button key={value} type="button" onClick={() => setParams({ geminiImageSize: value as TaskParams['geminiImageSize'] })} className={`${buttonClass((params.geminiImageSize ?? '2K') === value)} ${size ? 'min-h-14 flex-col gap-0.5' : ''}`}><span>{value === 'auto' ? '自动' : value}</span>{size && <span className="font-mono text-[10px] opacity-70">{size.replace('x', '×')}</span>}</button>
      })}</div></section>}
      {modelSupportsField(capability, 'geminiAspectRatio') && <section><p className="mb-1 text-gray-500 dark:text-gray-400">比例</p><div className="grid grid-cols-5 gap-2">{(isGeminiProvider ? ['auto', ...(capability.verified ? getGeminiAspectRatios(activeProfile.model) : [])] : GPT_IMAGE_2_ASPECT_RATIOS).map((value) => <button key={value} type="button" onClick={() => setParams({
        geminiAspectRatio: value,
        ...(!isGeminiProvider && !getGptImage2SizeOptions(value)[params.geminiImageSize ?? '2K'] ? { geminiImageSize: '2K' as const } : {}),
      })} className={buttonClass((isGeminiProvider ? params.geminiAspectRatio ?? 'auto' : gptImage2Ratio) === value)}>{value === 'auto' ? '自动' : value}</button>)}</div></section>}
      {(isGeminiProvider || modelSupportsField(capability, 'n')) && <section><div className="mb-1 flex items-center justify-between gap-3 text-gray-500 dark:text-gray-400"><p>生成数量</p><span className="shrink-0 tabular-nums">最大数量 {outputImageLimit}</span></div><div className="grid grid-cols-[repeat(3,minmax(0,1fr))_5rem] gap-2">{[1, 2, 4].filter((value) => value <= outputImageLimit).map((value) => <button key={value} type="button" onClick={() => setParams({ n: value })} className={buttonClass(params.n === value)}>{value}张</button>)}<input value={nInput} onChange={(event) => handleNInputChange(event.target.value)} onBlur={commitN} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} type="number" inputMode="numeric" min={1} max={outputImageLimit} step={1} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-center text-xs tabular-nums outline-none dark:border-white/[0.14] dark:bg-white/[0.03]" aria-label={`自定义生成数量，范围 1 到 ${outputImageLimit}`} /></div></section>}
    </div>
  }
  if (isGeminiProvider) {
    if (advancedOnly) return null
    const selectButtonClass = (selected: boolean) => `flex h-8 items-center justify-center rounded-lg border text-xs transition-[transform,background-color,color] active:scale-[0.96] ${selected ? 'border-gray-700 bg-gray-700 text-white dark:border-white dark:bg-white/15' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.14] dark:text-gray-300 dark:hover:bg-white/[0.06]'}`
    const ratios = capability.verified ? getGeminiAspectRatios(activeProfile.model) : []
    return (
      <div className="space-y-3 text-xs">
        <section>
          <p className="mb-1 text-gray-500 dark:text-gray-400">质量</p>
          <div className="grid grid-cols-4 gap-2">{(['auto', 'low', 'medium', 'high'] as const).map((value) => <button key={value} type="button" onClick={() => setParams({ quality: value })} className={selectButtonClass(params.quality === value)}>{value === 'auto' ? '自动' : value === 'low' ? '低' : value === 'medium' ? '中' : '高'}</button>)}</div>
        </section>
        {modelSupportsField(capability, 'geminiImageSize') && <section>
          <p className="mb-1 text-gray-500 dark:text-gray-400">清晰度</p>
          <div className="grid grid-cols-4 gap-2">{(capability.verified ? GEMINI_IMAGE_SIZES : ['auto']).map((value) => <button key={value} type="button" onClick={() => setParams({ geminiImageSize: value as TaskParams['geminiImageSize'] })} className={selectButtonClass((params.geminiImageSize ?? 'auto') === value)}>{value === 'auto' ? '自动' : value}</button>)}</div>
        </section>}
        {modelSupportsField(capability, 'geminiAspectRatio') && <section>
          <p className="mb-1 text-gray-500 dark:text-gray-400">比例</p>
          <div className="grid grid-cols-5 gap-2"><button type="button" onClick={() => setParams({ geminiAspectRatio: 'auto' })} className={selectButtonClass((params.geminiAspectRatio ?? 'auto') === 'auto')}>自动</button>{ratios.map((value) => <button key={value} type="button" onClick={() => setParams({ geminiAspectRatio: value })} className={selectButtonClass(params.geminiAspectRatio === value)}>{value}</button>)}</div>
        </section>}
        <section>
          <p className="mb-1 text-gray-500 dark:text-gray-400">生成数量</p>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_5rem] gap-2">{[1, 2, 4].map((value) => <button key={value} type="button" onClick={() => setParams({ n: value })} className={selectButtonClass(params.n === value)}>{value}张</button>)}<input value={nInput} onChange={(event) => handleNInputChange(event.target.value)} onBlur={commitN} type="number" min={1} max={10} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-center text-xs outline-none dark:border-white/[0.14] dark:bg-white/[0.03]" aria-label="自定义生成数量" /></div>
        </section>
      </div>
    )
  }

  return (
    <div className={`grid ${cols} gap-2 text-xs flex-1`}>
      {!advancedOnly && modelSupportsField(capability, 'size') && <label
        className="relative flex flex-col gap-0.5"
        onMouseEnter={sizeHint.show}
        onMouseLeave={sizeHint.hide}
        onTouchStart={sizeHint.startTouch}
        onTouchEnd={sizeHint.clearTimer}
        onTouchCancel={sizeHint.hide}
        onClick={sizeHint.show}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">尺寸</span>
        <button
          type="button"
          onClick={() => { dismissAllTooltips(); onOpenSizePicker() }}
          className="px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] focus:outline-none text-xs text-left transition-all duration-200 shadow-sm font-mono"
        >
          {displaySize}
        </button>
        <ButtonTooltip
          visible={(isFalTextToImage || activeProfile.codexCli) && sizeHint.visible}
          text={isFalTextToImage
            ? <>fal.ai 的文生图模式不支持 <code className="rounded bg-white/10 px-1 py-0.5 font-mono">auto</code> 参数</>
            : 'Codex CLI 不支持尺寸参数，此处设置仅基于提示词工程'}
        />
      </label>}
      {!advancedOnly && modelSupportsField(capability, 'quality') && <label
        className="relative flex flex-col gap-0.5"
        onMouseEnter={qualityHint.show}
        onMouseLeave={qualityHint.hide}
        onTouchStart={qualityHint.startTouch}
        onTouchEnd={qualityHint.clearTimer}
        onTouchCancel={qualityHint.hide}
        onClick={qualityHint.show}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">质量</span>
        <Select
          value={activeProfile.codexCli ? 'auto' : isFalProvider && params.quality === 'auto' ? 'high' : params.quality}
          onChange={(val) => {
            if (!activeProfile.codexCli) setParams({ quality: val as TaskParams['quality'] })
          }}
          options={qualityOptions}
          disabled={activeProfile.codexCli}
          showValueTooltips={false}
          className={activeProfile.codexCli
            ? 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed text-xs transition-all duration-200 shadow-sm'
            : selectClass}
        />
        <ButtonTooltip
          visible={(activeProfile.codexCli || isFalProvider) && qualityHint.visible}
          text={isFalProvider ? <>fal.ai 不支持 <code className="rounded bg-white/10 px-1 py-0.5 font-mono">auto</code> 质量参数</> : 'Codex CLI 不支持质量参数'}
        />
      </label>}
      {showAdvanced && modelSupportsField(capability, 'output_compression') ? (
        <label
          className="relative flex flex-col gap-0.5"
          onMouseEnter={compressionHint.show}
          onMouseLeave={compressionHint.hide}
          onTouchStart={compressionHint.startTouch}
          onTouchEnd={compressionHint.clearTimer}
          onTouchCancel={compressionHint.hide}
          onClick={compressionHint.show}
        >
          <span className="text-gray-400 dark:text-gray-500 ml-1">压缩率</span>
          <input
            value={outputCompressionInput}
            onChange={(e) => setOutputCompressionInput(e.target.value)}
            onBlur={commitOutputCompression}
            disabled={compressionDisabled}
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            className={`px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] focus:outline-none text-xs transition-all duration-200 shadow-sm ${
              compressionDisabled
                ? 'bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed'
                : 'bg-white/50 dark:bg-white/[0.03]'
              }`}
          />
          <ButtonTooltip
            visible={compressionHint.visible}
            text={isFalProvider ? 'fal.ai 不支持压缩率参数' : '仅 JPEG 和 WebP 支持压缩率'}
          />
        </label>
      ) : null}
      {showAdvanced && modelSupportsField(capability, 'background') && <label className="flex flex-col gap-0.5">
        <span className="ml-1 text-gray-400 dark:text-gray-500">背景</span>
        <Select
          value={params.background}
          onChange={(value) => setParams({ background: value as TaskParams['background'] })}
          options={[{ label: '自动', value: 'auto' }, { label: '不透明', value: 'opaque' }]}
          showValueTooltips={false}
          className={selectClass}
        />
      </label>}
      {showAdvanced && modelSupportsField(capability, 'moderation') && <label
        className="relative flex flex-col gap-0.5"
        onMouseEnter={moderationHint.show}
        onMouseLeave={moderationHint.hide}
        onTouchStart={moderationHint.startTouch}
        onTouchEnd={moderationHint.clearTimer}
        onTouchCancel={moderationHint.hide}
        onClick={moderationHint.show}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">审核</span>
        <Select
          value={moderationDisabled ? 'auto' : params.moderation}
          onChange={(val) => {
            if (!moderationDisabled) setParams({ moderation: val as TaskParams['moderation'] })
          }}
          options={[
            { label: 'auto', value: 'auto' },
            { label: 'low', value: 'low' },
          ]}
          disabled={moderationDisabled}
          showValueTooltips={false}
          className={moderationDisabled
            ? 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed text-xs transition-all duration-200 shadow-sm'
            : selectClass}
        />
        <ButtonTooltip
          visible={moderationDisabled && moderationHint.visible}
          text="fal.ai 不支持审核参数"
        />
      </label>}
      {!advancedOnly && modelSupportsField(capability, 'n') && <label
        className="relative flex flex-col gap-0.5"
        onMouseEnter={() => { showAgentNHint(); streamConcurrentHint.show() }}
        onMouseLeave={() => { hideNLimitHint(); streamConcurrentHint.hide() }}
        onTouchStart={() => { startAgentNHintTouch(); streamConcurrentHint.startTouch() }}
        onTouchEnd={() => { clearAgentNHintTouchTimer(); streamConcurrentHint.clearTimer() }}
        onTouchCancel={() => {
          clearAgentNHintTouchTimer()
          hideNLimitHint()
          streamConcurrentHint.hide()
        }}
        onClick={() => { showAgentNHint(); streamConcurrentHint.show() }}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">数量</span>
        <input
          value={nInput}
          onChange={(e) => handleNInputChange(e.target.value)}
          onFocus={() => setNInputFocused(true)}
          onBlur={() => {
            setNInputFocused(false)
            commitN()
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          onWheel={(e) => {
            if (e.deltaY < 0) {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          disabled={agentAutoImageCount}
          type={agentAutoImageCount ? 'text' : 'number'}
          min={agentAutoImageCount ? undefined : 1}
          max={agentAutoImageCount ? undefined : outputImageLimit}
          className={`px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] focus:outline-none text-xs transition-all duration-200 shadow-sm ${
            agentAutoImageCount
              ? 'bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed'
              : 'bg-white/50 dark:bg-white/[0.03]'
          }`}
        />
        <ButtonTooltip visible={nLimitHint.visible} text={nLimitHintText} />
        <ButtonTooltip visible={streamConcurrentByN && streamConcurrentHint.visible && !nLimitHint.visible} text="数量大于 1 时会将多图生成拆分为并发单图" />
      </label>}
    </div>
  )
}
