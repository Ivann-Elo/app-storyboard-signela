import type { FC } from 'react'

export type IconName =
  | 'grid'
  | 'list'
  | 'plus'
  | 'settings'
  | 'search'
  | 'copy'
  | 'trash'
  | 'close'
  | 'upload'
  | 'sparkles'

const Icon: FC<{ name: IconName; className?: string }> = ({ name, className }) => {
  switch (name) {
    case 'grid':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" className="secondary" />
          <rect x="4" y="13" width="7" height="7" rx="1" className="secondary" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      )
    case 'list':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h14" />
          <path d="M6 12h14" className="secondary" />
          <path d="M6 17h14" />
          <rect x="4" y="6" width="1.5" height="1.5" rx="0.5" />
          <rect x="4" y="11" width="1.5" height="1.5" rx="0.5" className="secondary" />
          <rect x="4" y="16" width="1.5" height="1.5" rx="0.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" className="secondary" />
        </svg>
      )
    case 'settings':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M4 12h16" className="secondary" />
          <path d="M4 18h16" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" className="secondary" />
          <circle cx="11" cy="18" r="2" />
        </svg>
      )
    case 'search':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" className="secondary" />
        </svg>
      )
    case 'copy':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2" />
          <rect x="5" y="5" width="10" height="10" rx="2" className="secondary" />
        </svg>
      )
    case 'trash':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" className="secondary" />
          <path d="M7 7l1 12h8l1-12" />
          <path d="M10 11v5" className="secondary" />
          <path d="M14 11v5" className="secondary" />
        </svg>
      )
    case 'close':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6l-12 12" className="secondary" />
        </svg>
      )
    case 'upload':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V6" />
          <path d="M8 10l4-4 4 4" className="secondary" />
          <path d="M5 18h14" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path
            d="M18 15l0.9 2.4L21 18l-2.1 0.6L18 21l-0.9-2.4L15 18l2.1-0.6L18 15z"
            className="secondary"
          />
        </svg>
      )
    default:
      return null
  }
}

export default Icon
