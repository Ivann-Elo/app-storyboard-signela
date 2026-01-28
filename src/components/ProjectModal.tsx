import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { FrameFormat, GridMode, Project } from '../types'
import { GRID_OPTIONS, PRESET_FORMATS } from '../types'
import Icon from './Icon'
import FormatPicker from './FormatPicker'

const ProjectModal: FC<{
  project: Project | null
  onClose: () => void
  onSubmit: (name: string, format: FrameFormat, gridMode: GridMode) => void
}> = ({ project, onClose, onSubmit }) => {
  const [name, setName] = useState(project?.name ?? '')
  const [format, setFormat] = useState<FrameFormat>(
    project?.projectFrameFormat ?? PRESET_FORMATS[0]
  )
  const [gridMode, setGridMode] = useState<GridMode>(project?.gridMode ?? 'stable')

  useEffect(() => {
    setName(project?.name ?? '')
    setFormat(project?.projectFrameFormat ?? PRESET_FORMATS[0])
    setGridMode(project?.gridMode ?? 'stable')
  }, [project])

  const title = project ? 'Modifier le projet' : 'Nouveau projet'

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            <Icon name="close" />
            Fermer
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nom du projet</label>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label>Format principal</label>
            <FormatPicker value={format} onChange={setFormat} />
          </div>
          <div className="field">
            <label>Mode grille</label>
            <div className="segmented">
              {GRID_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={gridMode === option.value ? 'active' : ''}
                  onClick={() => setGridMode(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            <Icon name="close" />
            Annuler
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit(name, format, gridMode)}>
            <Icon name="sparkles" />
            {project ? 'Mettre a jour' : 'Creer le projet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectModal
