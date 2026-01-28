import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { FrameFormat } from '../types'
import { PRESET_FORMATS } from '../types'
import { sanitizeDimension } from '../utils'

const FormatPicker: FC<{
  value: FrameFormat
  onChange: (format: FrameFormat) => void
}> = ({ value, onChange }) => {
  const [customWidth, setCustomWidth] = useState<number>(value.width)
  const [customHeight, setCustomHeight] = useState<number>(value.height)

  useEffect(() => {
    if (value.source === 'custom') {
      setCustomWidth(value.width)
      setCustomHeight(value.height)
    }
  }, [value])

  const updateCustom = (nextWidth: number, nextHeight: number) => {
    const safeWidth = sanitizeDimension(nextWidth)
    const safeHeight = sanitizeDimension(nextHeight)
    setCustomWidth(safeWidth)
    setCustomHeight(safeHeight)
    onChange({
      width: safeWidth,
      height: safeHeight,
      label: `${safeWidth}x${safeHeight}`,
      source: 'custom',
    })
  }

  return (
    <div className="format-picker">
      <div className="format-presets">
        {PRESET_FORMATS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={value.label === preset.label && value.source === 'preset' ? 'active' : ''}
            onClick={() => onChange({ ...preset })}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={value.source === 'custom' ? 'active' : ''}
          onClick={() =>
            onChange({
              width: customWidth,
              height: customHeight,
              label: `${customWidth}x${customHeight}`,
              source: 'custom',
            })
          }
        >
          Custom
        </button>
      </div>
      <div className="format-custom">
        <input
          type="number"
          min={1}
          value={customWidth}
          onChange={(event) => updateCustom(Number(event.target.value), customHeight)}
          disabled={value.source !== 'custom'}
        />
        <span>x</span>
        <input
          type="number"
          min={1}
          value={customHeight}
          onChange={(event) => updateCustom(customWidth, Number(event.target.value))}
          disabled={value.source !== 'custom'}
        />
        <span className="muted">Largeur x hauteur</span>
      </div>
    </div>
  )
}

export default FormatPicker
