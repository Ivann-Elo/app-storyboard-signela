import { useState } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import type { AuthUser } from '../types'
import Icon from './Icon'

const AuthModal: FC<{
  onClose: () => void
  onSuccess: (token: string, user: AuthUser) => void
  initialEmail: string
  apiRequest: <T,>(
    path: string,
    options?: RequestInit,
    token?: string | null
  ) => Promise<T>
}> = ({ onClose, onSuccess, initialEmail, apiRequest }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = await apiRequest<{ token: string; user: AuthUser }>(
        mode === 'login' ? '/api/auth/login' : '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      )
      onSuccess(payload.token, payload.user)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de connexion.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal" onClick={handleOverlayClick}>
      <div className="modal-content auth-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Synchronisation</p>
            <h2>{mode === 'login' ? 'Connexion' : 'Creer un compte'}</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <Icon name="close" />
            Fermer
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="image-error">{error}</p> : null}
        </div>
        <div className="modal-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Creer un compte' : 'J ai deja un compte'}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            <Icon name="sparkles" />
            {isSubmitting ? 'Connexion...' : mode === 'login' ? 'Se connecter' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
