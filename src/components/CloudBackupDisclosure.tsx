import { useStore } from '../store'
import { isCloudAssetsConfigured } from '../lib/cloudAssets'
import { useSub2ApiSession } from '../lib/sub2apiSession'

export default function CloudBackupDisclosure() {
  const session = useSub2ApiSession()
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  if (session.status !== 'ready' || !isCloudAssetsConfigured() || settings.cloudDisclosureSeen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-backup-title"
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl dark:border-white/[0.1] dark:bg-gray-900"
      >
        <h2 id="cloud-backup-title" className="text-base font-semibold text-gray-900 dark:text-white">云端临时保存已开启</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          新生成的原图和缩略图会在 AWAI 云端临时保留 24 小时。参考图、遮罩和其他输入附件不会上传。你可以随时关闭后续上传，或立即删除已有副本。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSettings({ cloudBackupEnabled: false, cloudDisclosureSeen: true })}
            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            关闭云端保存
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => setSettings({ cloudDisclosureSeen: true })}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
