import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { CardSize, Project, Scene } from '../types'
import { AUDIO_OPTIONS, CAMERA_MOVEMENT_OPTIONS, FOCAL_OPTIONS, STATUS_OPTIONS } from '../types'
import { formatLabel, formatDuration } from '../utils'

const SceneGrid = ({
  scenes,
  project,
  cardSize,
  selectedSceneId,
  draggingId,
  dragOverId,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDown,
}: {
  scenes: Scene[]
  project: Project
  cardSize: CardSize
  selectedSceneId: string | null
  draggingId: string | null
  dragOverId: string | null
  onOpen: (sceneId: string) => void
  onDragStart: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragOver: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDrop: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onPointerDown: (sceneId: string) => (event: ReactPointerEvent<HTMLElement>) => void
}) => (
  <div className={`scene-grid size-${cardSize}`}>
    {scenes.length === 0 ? (
      <div className="empty-state">
        <h2>Aucune scene a afficher.</h2>
        <p>Ajoutez une scene ou ajustez vos filtres.</p>
      </div>
    ) : (
      scenes.map((scene, index) => {
        const format = scene.useProjectFormat ? project.projectFrameFormat : scene.sceneFrameFormat
        const frameFormat = project.gridMode === 'adaptive' ? format : project.projectFrameFormat
        const ratio = `${frameFormat.width} / ${frameFormat.height}`
        const statusLabel = STATUS_OPTIONS.find((option) => option.value === scene.status)?.label
        const cameraLabel =
          CAMERA_MOVEMENT_OPTIONS.find((option) => option.value === scene.cameraMovement)?.label ||
          'Fixe'
        return (
          <article
            key={scene.id}
            className={`scene-card${selectedSceneId === scene.id ? ' is-selected' : ''}${
              draggingId === scene.id ? ' is-dragging' : ''
            }${dragOverId === scene.id ? ' is-over' : ''} status-${scene.status}`}
            data-scene-id={scene.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            draggable
            onClick={() => onOpen(scene.id)}
            onDragStart={onDragStart(scene.id)}
            onDragOver={onDragOver(scene.id)}
            onDrop={onDrop(scene.id)}
            onDragEnd={onDragEnd}
          >
            <div className="scene-card__frame" style={{ aspectRatio: ratio }}>
              <div className="scene-card__meta-top">
                <div className="meta-left">
                  <span className="pill">#{scene.order}</span>
                  <span className="pill">
                    {FOCAL_OPTIONS.find((option) => option.value === scene.focal)?.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="drag-handle"
                  aria-label="Deplacer"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={onPointerDown(scene.id)}
                />
              </div>
              {!scene.useProjectFormat && (
                <span className="badge">Override {formatLabel(scene.sceneFrameFormat)}</span>
              )}
              <div className="frame-placeholder">
                {scene.image?.url ? (
                  <img src={scene.image.url} alt={scene.title} loading="lazy" />
                ) : (
                  <span>{formatLabel(frameFormat)}</span>
                )}
              </div>
            </div>
            <div className="scene-card__body">
              <h3>{scene.title}</h3>
              <div className="scene-card__info">
                <span>{formatDuration(scene.duration)}</span>
                {statusLabel ? <span>{statusLabel}</span> : null}
                <span>Cam: {cameraLabel}</span>
              </div>
              <div className="scene-card__tags">
                {scene.image ? (
                  <span className="tag">
                    {scene.image.source === 'generated' ? 'Image: Nano' : 'Image: Upload'}
                  </span>
                ) : (
                  <span className="tag muted">Image: aucune</span>
                )}
                  {scene.audioTypes.length > 0 ? (
                    scene.audioTypes.map((audio) => (
                      <span className="tag" key={audio}>
                        {AUDIO_OPTIONS.find((option) => option.value === audio)?.label}
                      </span>
                    ))
                  ) : (
                    <span className="tag muted">Audio: aucun</span>
                  )}
              </div>
            </div>
          </article>
        )
      })
    )}
  </div>
)

export default SceneGrid
