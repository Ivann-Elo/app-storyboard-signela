import { useState } from 'react'
import type { ChangeEvent, FC, MouseEvent as ReactMouseEvent } from 'react'
import type { Project, Scene, SceneModalMode } from '../types'
import {
  AUDIO_OPTIONS,
  FOCAL_OPTIONS,
  LOCATION_OPTIONS,
  MOMENT_OPTIONS,
  STATUS_OPTIONS,
} from '../types'
import { formatDuration, formatLabel, sanitizeDuration } from '../utils'
import Icon from './Icon'
import FormatPicker from './FormatPicker'
import Switch from './Switch'

const SceneModal: FC<{
  mode: SceneModalMode
  isNew: boolean
  scene: Scene | null
  project: Project
  onClose: () => void
  onEdit: () => void
  onSave: () => void
  onUpdate: (updates: Partial<Scene>) => void
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onGenerateImage: (format: Project['projectFrameFormat'], prompt: string) => Promise<void>
}> = ({
  mode,
  isNew,
  scene,
  project,
  onClose,
  onEdit,
  onSave,
  onUpdate,
  onImageUpload,
  onGenerateImage,
}) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  if (!scene) return null

  const formatInUse = scene.useProjectFormat ? project.projectFrameFormat : scene.sceneFrameFormat
  const promptValue = scene.imagePrompt || 'nanobanana'

  const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleGenerateImage = async () => {
    const prompt = promptValue.trim() || 'nanobanana'
    setIsGenerating(true)
    setImageError(null)
    try {
      await onGenerateImage(formatInUse, prompt)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation impossible.'
      setImageError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="modal" onClick={handleOverlayClick}>
      <div className="modal-content scene-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          {mode === 'view' ? (
            <div>
              <p className="modal-eyebrow">Scene {scene.order}</p>
              <h2>{scene.title}</h2>
              <div className="scene-meta">
                <span className="pill">Duree {formatDuration(scene.duration)}</span>
                <span className="pill">
                  {FOCAL_OPTIONS.find((option) => option.value === scene.focal)?.label}
                </span>
                <span className="pill">
                  {STATUS_OPTIONS.find((option) => option.value === scene.status)?.label}
                </span>
                <span className="pill">Format {formatLabel(formatInUse)}</span>
              </div>
            </div>
          ) : (
            <div>
              <p className="modal-eyebrow">{isNew ? 'Nouvelle scene' : `Scene ${scene.order}`}</p>
              <h2>{isNew ? 'Creer une scene' : 'Modifier la scene'}</h2>
              <p className="muted">Format {formatLabel(formatInUse)}</p>
            </div>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            <Icon name="close" />
            Fermer
          </button>
        </div>

        {mode === 'view' ? (
          <div className="modal-body scene-view">
            <div className="scene-view-grid">
              <div className="scene-view-main">
                <section className="section">
                  <h4>Texte / Description</h4>
                  <p>{scene.description || 'Aucune description.'}</p>
                </section>
                <section className="section">
                  <h4>Notes internes</h4>
                  <p>{scene.notes || 'Aucune note.'}</p>
                </section>
                <section className="section">
                  <h4>References</h4>
                  <p>{scene.references || 'Aucune reference.'}</p>
                </section>
              </div>
              <aside className="scene-view-aside">
                <section className="section">
                  <h4>Image</h4>
                  {scene.image ? (
                    <div
                      className="scene-image-preview"
                      style={{ aspectRatio: `${formatInUse.width} / ${formatInUse.height}` }}
                    >
                      <img src={scene.image.url} alt={scene.title} />
                    </div>
                  ) : (
                    <div
                      className="scene-image-empty"
                      style={{ aspectRatio: `${formatInUse.width} / ${formatInUse.height}` }}
                    >
                      <span className="muted">Aucune image</span>
                    </div>
                  )}
                  {scene.image?.prompt ? (
                    <p className="muted">Prompt: {scene.image.prompt}</p>
                  ) : null}
                </section>
                <section className="section">
                  <h4>Audio</h4>
                  <div className="tag-group">
                    {scene.audioTypes.length > 0 ? (
                      scene.audioTypes.map((audio) => (
                        <span className="tag" key={audio}>
                          {AUDIO_OPTIONS.find((option) => option.value === audio)?.label}
                        </span>
                      ))
                    ) : (
                      <span className="muted">Aucun son renseigne.</span>
                    )}
                  </div>
                </section>
                <section className="section">
                  <h4>Parametres</h4>
                  <div className="definition-list">
                    <div className="definition-item">
                      <span>Lieu</span>
                      <strong>
                        {LOCATION_OPTIONS.find((option) => option.value === scene.location)?.label ||
                          'Aucun'}
                      </strong>
                    </div>
                    <div className="definition-item">
                      <span>Moment</span>
                      <strong>
                        {MOMENT_OPTIONS.find((option) => option.value === scene.moment)?.label ||
                          'Aucun'}
                      </strong>
                    </div>
                    <div className="definition-item">
                      <span>Personnages</span>
                      <strong>{scene.characters || 'Aucun'}</strong>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        ) : (
          <div className="modal-body scene-edit">
            <div className="scene-edit-grid">
              <div className="scene-edit-main">
                <div className="field">
                  <label>Titre</label>
                  <input
                    value={scene.title}
                    onChange={(event) => onUpdate({ title: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={scene.description}
                    onChange={(event) => onUpdate({ description: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Notes internes</label>
                  <textarea
                    rows={3}
                    value={scene.notes}
                    onChange={(event) => onUpdate({ notes: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Image de scene</label>
                  <div className="scene-image">
                    {scene.image ? (
                      <div
                        className="scene-image-preview"
                        style={{ aspectRatio: `${formatInUse.width} / ${formatInUse.height}` }}
                      >
                        <img src={scene.image.url} alt={scene.title} />
                      </div>
                    ) : (
                      <div
                        className="scene-image-empty"
                        style={{ aspectRatio: `${formatInUse.width} / ${formatInUse.height}` }}
                      >
                        <span>Aucune image associee</span>
                      </div>
                    )}
                    <div className="scene-image-meta">
                      {scene.image ? (
                        <span className="pill">
                          {scene.image.source === 'generated' ? 'Nano' : 'Upload'}
                        </span>
                      ) : (
                        <span className="muted">Aucune image</span>
                      )}
                      {scene.image?.prompt ? (
                        <span className="muted">Prompt: {scene.image.prompt}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="image-actions">
                    <label className="btn btn-ghost image-upload">
                      <Icon name="upload" />
                      Televerser
                      <input type="file" accept="image/*" onChange={onImageUpload} />
                    </label>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => onUpdate({ image: null })}
                      disabled={!scene.image}
                    >
                      <Icon name="trash" />
                      Supprimer
                    </button>
                  </div>
                  <div className="image-generator">
                    <input
                      placeholder="nanobanana"
                      value={scene.imagePrompt}
                      onChange={(event) => onUpdate({ imagePrompt: event.target.value })}
                    />
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={isGenerating}
                    >
                      <Icon name="sparkles" />
                      {isGenerating ? 'Generation...' : 'Generer (nanobanana)'}
                    </button>
                  </div>
                  {imageError ? <p className="image-error">{imageError}</p> : null}
                </div>
                <div className="field">
                  <label>Son de fond</label>
                  <div className="chip-group">
                    {AUDIO_OPTIONS.map((option) => {
                      const active = scene.audioTypes.includes(option.value)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`chip${active ? ' active' : ''}`}
                          onClick={() =>
                            onUpdate({
                              audioTypes: active
                                ? scene.audioTypes.filter((audio) => audio !== option.value)
                                : [...scene.audioTypes, option.value],
                            })
                          }
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="scene-edit-side">
                <div className="field">
                  <label>Duree (secondes)</label>
                  <div className="field-row">
                    <input
                      type="number"
                      min={0}
                      value={scene.duration}
                      onChange={(event) =>
                        onUpdate({ duration: sanitizeDuration(Number(event.target.value)) })
                      }
                    />
                    <span className="muted">{formatDuration(scene.duration)}</span>
                  </div>
                </div>
                <div className="field">
                  <label>Focale / cadrage</label>
                  <select
                    value={scene.focal}
                    onChange={(event) => onUpdate({ focal: event.target.value as Scene['focal'] })}
                  >
                    {FOCAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Format scene</label>
                  <div className="format-toggle">
                    <Switch
                      checked={scene.useProjectFormat}
                      onChange={(checked) => onUpdate({ useProjectFormat: checked })}
                      label="Utiliser le format du projet"
                    />
                  </div>
                  {!scene.useProjectFormat && (
                    <FormatPicker
                      value={scene.sceneFrameFormat}
                      onChange={(format) => onUpdate({ sceneFrameFormat: format })}
                    />
                  )}
                  {scene.useProjectFormat && (
                    <p className="muted">Format projet: {formatLabel(project.projectFrameFormat)}</p>
                  )}
                </div>
                <div className="field">
                  <label>Lieu</label>
                  <select
                    value={scene.location}
                    onChange={(event) => onUpdate({ location: event.target.value as Scene['location'] })}
                  >
                    {LOCATION_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Moment</label>
                  <select
                    value={scene.moment}
                    onChange={(event) => onUpdate({ moment: event.target.value as Scene['moment'] })}
                  >
                    {MOMENT_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Personnages</label>
                  <input
                    value={scene.characters}
                    onChange={(event) => onUpdate({ characters: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>References (liens)</label>
                  <textarea
                    rows={2}
                    value={scene.references}
                    onChange={(event) => onUpdate({ references: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Statut</label>
                  <select
                    value={scene.status}
                    onChange={(event) => onUpdate({ status: event.target.value as Scene['status'] })}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {mode === 'view' ? (
            <button className="btn btn-primary" onClick={onEdit}>
              <Icon name="settings" />
              Modifier la scene
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                <Icon name="close" />
                Annuler
              </button>
              <button className="btn btn-primary" onClick={onSave}>
                <Icon name="sparkles" />
                Enregistrer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SceneModal
