import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { Project, Scene } from '../types'
import { AUDIO_OPTIONS, CAMERA_MOVEMENT_OPTIONS, FOCAL_OPTIONS, STATUS_OPTIONS } from '../types'
import { formatDuration, formatLabel } from '../utils'

const SceneTable = ({
  scenes,
  project,
  selectedSceneId,
  selectedSceneIds,
  onOpenScene,
  onToggleSelect,
  onToggleSelectAll,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDown,
  draggingId,
  dragOverId,
}: {
  scenes: Scene[]
  project: Project
  selectedSceneId: string | null
  selectedSceneIds: string[]
  onOpenScene: (scene: Scene) => void
  onToggleSelect: (sceneId: string) => void
  onToggleSelectAll: () => void
  onDragStart: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragOver: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDrop: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onPointerDown: (sceneId: string) => (event: ReactPointerEvent<HTMLElement>) => void
  draggingId: string | null
  dragOverId: string | null
}) => {
  const allSelected = scenes.length > 0 && selectedSceneIds.length === scenes.length

  return (
    <div className="table-wrap">
      {scenes.length === 0 ? (
        <div className="empty-state">
          <h2>Aucune scene a afficher.</h2>
          <p>Ajoutez une scene ou ajustez vos filtres.</p>
        </div>
      ) : (
        <table className="scene-table">
          <thead>
            <tr>
              <th className="cell-check">
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
              </th>
              <th className="cell-drag" />
              <th>Ordre</th>
              <th>Titre</th>
              <th>Duree</th>
              <th>Focale</th>
              <th>Format</th>
              <th>Cam</th>
              <th>Image</th>
              <th>Audio</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => {
              const isSelected = selectedSceneIds.includes(scene.id)
              const formatLabelText = scene.useProjectFormat
                ? `Projet ${formatLabel(project.projectFrameFormat)}`
                : `Override ${formatLabel(scene.sceneFrameFormat)}`
              const cameraLabel =
                CAMERA_MOVEMENT_OPTIONS.find((option) => option.value === scene.cameraMovement)
                  ?.label || 'Fixe'
              return (
                <tr
                  key={scene.id}
                  className={`scene-row${selectedSceneId === scene.id ? ' is-selected' : ''}${
                    draggingId === scene.id ? ' is-dragging' : ''
                  }${dragOverId === scene.id ? ' is-over' : ''} status-${scene.status}`}
                  data-scene-id={scene.id}
                  draggable
                  onClick={() => onOpenScene(scene)}
                  onDragStart={onDragStart(scene.id)}
                  onDragOver={onDragOver(scene.id)}
                  onDrop={onDrop(scene.id)}
                  onDragEnd={onDragEnd}
                >
                  <td className="cell-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(scene.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                  <td className="cell-drag">
                    <button
                      type="button"
                      className="drag-handle table-handle"
                      aria-label="Deplacer"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={onPointerDown(scene.id)}
                    />
                  </td>
                  <td className="cell-order">{scene.order}</td>
                  <td>
                    <span className="table-title">{scene.title}</span>
                  </td>
                  <td>
                    <div className="inline-stack">
                      <span>{scene.duration}s</span>
                      <span className="muted">{formatDuration(scene.duration)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="pill">
                      {FOCAL_OPTIONS.find((option) => option.value === scene.focal)?.label}
                    </span>
                  </td>
                  <td>
                    <span className="pill">{formatLabelText}</span>
                  </td>
                  <td>
                    <span className="tag muted">Cam: {cameraLabel}</span>
                  </td>
                  <td className="cell-image">
                    {scene.image ? (
                      <span className="pill">
                        {scene.image.source === 'generated' ? 'Nano' : 'Upload'}
                      </span>
                    ) : (
                      <span className="muted">Aucune</span>
                    )}
                  </td>
                  <td>
                    <div className="inline-audio">
                      {scene.audioTypes.length > 0 ? (
                        scene.audioTypes.map((audio) => (
                          <span className="tag" key={audio}>
                            {AUDIO_OPTIONS.find((option) => option.value === audio)?.label}
                          </span>
                        ))
                      ) : (
                        <span className="muted">Aucun</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="pill">
                      {STATUS_OPTIONS.find((option) => option.value === scene.status)?.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default SceneTable
