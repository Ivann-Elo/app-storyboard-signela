import type { FC } from 'react'

const Switch: FC<{
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}> = ({ checked, onChange, label }) => (
  <label className="switch">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="switch-track">
      <span className="switch-thumb" />
    </span>
    <span>{label}</span>
  </label>
)

export default Switch
