import type { FrameFormat } from './types'

export const nowIso = () => new Date().toISOString()

export const formatLabel = (format: FrameFormat) =>
  format.source === 'preset' ? format.label : `${format.width}x${format.height}`

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export const sanitizeDimension = (value: number) => {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(9999, Math.round(value)))
}

export const sanitizeDuration = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(9999, Math.round(value)))
}

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const requestGeneratedImage = async (
  baseUrl: string,
  prompt: string,
  format: FrameFormat
) => {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        format: {
          width: format.width,
          height: format.height,
        },
      }),
    })
  } catch {
    throw new Error('Serveur image indisponible. Lancez `npm run dev` (client + server).')
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.error || 'Generation impossible.'
    throw new Error(message)
  }

  const data = (await response.json()) as { url?: string }
  if (!data.url) {
    throw new Error('Image indisponible.')
  }
  return data.url
}
