/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'
import { ExternalLinkIcon, RefreshCcwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp, formatTimestampToDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Dialog } from '@/components/dialog'
import { SettingsSection } from '../components/settings-section'

type ReleaseInfo = {
  tag_name: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
}

type GiteeTag = {
  name?: string
  message?: string
  commit?: {
    date?: string
  }
}

const updateSourceOwner =
  import.meta.env.VITE_REACT_APP_UPDATE_SOURCE_OWNER || 'LiuJiaSen'
const updateSourceRepo =
  import.meta.env.VITE_REACT_APP_UPDATE_SOURCE_REPO || 'new-api'
const updateSourceBaseURL =
  import.meta.env.VITE_REACT_APP_UPDATE_SOURCE_BASE_URL || 'https://gitee.com'
const giteeApiBaseURL =
  import.meta.env.VITE_REACT_APP_GITEE_API_BASE_URL ||
  'https://gitee.com/api/v5'

const normalizeBaseURL = (url: string) => url.replace(/\/+$/, '')

const buildUpdateSourceURL = (path: string) => {
  const baseURL = normalizeBaseURL(updateSourceBaseURL)
  return `${baseURL}/${updateSourceOwner}/${updateSourceRepo}${path}`
}

const toReleaseInfoFromTag = (tag: GiteeTag): ReleaseInfo | null => {
  if (!tag.name) {
    return null
  }

  return {
    tag_name: tag.name,
    name: tag.name,
    body: tag.message || '',
    html_url: buildUpdateSourceURL(`/tree/${encodeURIComponent(tag.name)}`),
    published_at: tag.commit?.date,
  }
}

const pickLatestTag = (tags: GiteeTag[]) => {
  const validTags = tags.filter((tag) => tag.name)
  if (validTags.length === 0) {
    return null
  }

  return validTags.reduce((latest, tag) => {
    const latestTime = latest.commit?.date
      ? new Date(latest.commit.date).getTime()
      : 0
    const tagTime = tag.commit?.date ? new Date(tag.commit.date).getTime() : 0
    return tagTime > latestTime ? tag : latest
  })
}

const fetchLatestGiteeRelease = async (): Promise<ReleaseInfo> => {
  const apiBaseURL = normalizeBaseURL(giteeApiBaseURL)
  const encodedOwner = encodeURIComponent(updateSourceOwner)
  const encodedRepo = encodeURIComponent(updateSourceRepo)
  const releaseResponse = await fetch(
    `${apiBaseURL}/repos/${encodedOwner}/${encodedRepo}/releases/latest`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (releaseResponse.ok) {
    const data = (await releaseResponse.json()) as ReleaseInfo
    if (data?.tag_name) {
      return data
    }
  }

  const tagsResponse = await fetch(
    `${apiBaseURL}/repos/${encodedOwner}/${encodedRepo}/tags?per_page=100`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!tagsResponse.ok) {
    throw new Error('Failed to check for updates')
  }

  const latestTag = pickLatestTag((await tagsResponse.json()) as GiteeTag[])
  const releaseInfo = latestTag ? toReleaseInfoFromTag(latestTag) : null
  if (!releaseInfo) {
    throw new Error('Unexpected release payload')
  }

  return releaseInfo
}

type UpdateCheckerSectionProps = {
  currentVersion?: string | null
  startTime?: number | null
}

export function UpdateCheckerSection({
  currentVersion,
  startTime,
}: UpdateCheckerSectionProps) {
  const { t } = useTranslation()
  const [checking, setChecking] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [release, setRelease] = useState<ReleaseInfo | null>(null)

  const uptime = startTime ? formatTimestamp(startTime) : t('Unknown')
  const version = currentVersion || t('Unknown')

  const handleCheckUpdates = async () => {
    setChecking(true)
    try {
      const data = await fetchLatestGiteeRelease()
      if (!data?.tag_name) {
        throw new Error(t('Unexpected release payload'))
      }

      if (currentVersion && data.tag_name === currentVersion) {
        toast.success(
          t('You are running the latest version ({{version}}).', {
            version: data.tag_name,
          })
        )
        return
      }

      setRelease(data)
      setDialogOpen(true)
    } catch (error) {
      const message =
        error instanceof Error
          ? t(error.message)
          : t('Failed to check for updates')
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  const goToRelease = () => {
    if (release?.html_url) {
      window.open(release.html_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      <SettingsSection title={t('System maintenance')}>
        <div className='space-y-6'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='rounded-lg border p-4'>
              <div className='text-muted-foreground text-sm'>
                {t('Current version')}
              </div>
              <div className='text-lg font-semibold'>{version}</div>
            </div>
            <div className='rounded-lg border p-4'>
              <div className='text-muted-foreground text-sm'>
                {t('Uptime since')}
              </div>
              <div className='text-lg font-semibold'>{uptime}</div>
            </div>
          </div>

          <Button onClick={handleCheckUpdates} disabled={checking}>
            {checking ? (
              t('Checking updates...')
            ) : (
              <>
                <RefreshCcwIcon className='me-2 h-4 w-4' />
                {t('Check for updates')}
              </>
            )}
          </Button>
        </div>
      </SettingsSection>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          release?.tag_name
            ? t('New version available: {{version}}', {
                version: release.tag_name,
              })
            : t('Release details')
        }
        description={
          release?.published_at
            ? `${t('Published')} ${formatTimestampToDate(
                new Date(release.published_at).getTime(),
                'milliseconds'
              )}`
            : undefined
        }
        contentClassName='max-h-[80vh] overflow-y-auto'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setDialogOpen(false)}
            >
              {t('Close')}
            </Button>
            {release?.html_url && (
              <Button type='button' onClick={goToRelease}>
                <ExternalLinkIcon className='me-2 h-4 w-4' />
                {t('Open release')}
              </Button>
            )}
          </>
        }
      >
        <div className='space-y-4'>
          {release?.body ? (
            <Markdown>{release.body}</Markdown>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('No release notes provided.')}
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}
