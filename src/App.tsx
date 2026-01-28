import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

type ViewMode = 'cards' | 'list'
type CardSize = 'small' | 'medium' | 'large'
type GridMode = 'stable' | 'adaptive'
type AudioType = 'live' | 'voice' | 'music'
type FocalType = 'large' | 'medium' | 'tight'
type SceneStatus = 'draft' | 'approved' | 'shot'
type LocationType = 'interior' | 'exterior'
type MomentType = 'day' | 'night'
type FormatSource = 'preset' | 'custom'
type SceneImageSource = 'upload' | 'generated'
type SceneModalMode = 'view' | 'edit'

type FilterState = {
  focal: 'all' | FocalType
  audio: 'all' | AudioType
  status: 'all' | SceneStatus
}

type SceneModalState = {
  mode: SceneModalMode
  sceneId: string | null
  isNew: boolean
}

interface FrameFormat {
  width: number
  height: number
  label: string
  source: FormatSource
}

interface SceneImage {
  url: string
  source: SceneImageSource
  prompt?: string
}

interface Scene {
  id: string
  order: number
  title: string
  duration: number
  focal: FocalType
  description: string
  notes: string
  audioTypes: AudioType[]
  useProjectFormat: boolean
  sceneFrameFormat: FrameFormat
  imagePrompt: string
  image: SceneImage | null
  location: LocationType | ''
  moment: MomentType | ''
  characters: string
  references: string
  status: SceneStatus
}

interface Project {
  id: string
  name: string
  projectFrameFormat: FrameFormat
  gridMode: GridMode
  createdAt: string
  updatedAt: string
  scenes: Scene[]
}

const STORAGE_KEY = 'signela.projects.v1'
const ACTIVE_KEY = 'signela.activeProjectId.v1'

const PRESET_FORMATS: FrameFormat[] = [
  { width: 16, height: 9, label: '16:9', source: 'preset' },
  { width: 9, height: 16, label: '9:16', source: 'preset' },
  { width: 1, height: 1, label: '1:1', source: 'preset' },
  { width: 4, height: 5, label: '4:5', source: 'preset' },
]

const FOCAL_OPTIONS: Array<{ value: FocalType; label: string }> = [
  { value: 'large', label: 'Large' },
  { value: 'medium', label: 'Moyen' },
  { value: 'tight', label: 'Serre' },
]

const AUDIO_OPTIONS: Array<{ value: AudioType; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'voice', label: 'Voix off' },
  { value: 'music', label: 'Musique' },
]

const STATUS_OPTIONS: Array<{ value: SceneStatus; label: string }> = [
  { value: 'draft', label: 'A ecrire' },
  { value: 'approved', label: 'Valide' },
  { value: 'shot', label: 'Tourne' },
]

const LOCATION_OPTIONS: Array<{ value: LocationType | ''; label: string }> = [
  { value: '', label: 'Aucun' },
  { value: 'interior', label: 'Interieur' },
  { value: 'exterior', label: 'Exterieur' },
]

const MOMENT_OPTIONS: Array<{ value: MomentType | ''; label: string }> = [
  { value: '', label: 'Aucun' },
  { value: 'day', label: 'Jour' },
  { value: 'night', label: 'Nuit' },
]

const GRID_OPTIONS: Array<{ value: GridMode; label: string }> = [
  { value: 'stable', label: 'Grille stable' },
  { value: 'adaptive', label: 'Cards adaptatives' },
]

const CARD_SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

const nowIso = () => new Date().toISOString()

const formatLabel = (format: FrameFormat) =>
  format.source === 'preset' ? format.label : `${format.width}x${format.height}`

const formatDuration = (seconds: number) => {
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

const sanitizeDimension = (value: number) => {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(9999, Math.round(value)))
}

const sanitizeDuration = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(9999, Math.round(value)))
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const requestGeneratedImage = async (prompt: string, format: FrameFormat) => {
  let response: Response
  try {
    response = await fetch('/api/images', {
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

const makeProject = (name: string, format: FrameFormat, gridMode: GridMode): Project => ({
  id: crypto.randomUUID(),
  name: name.trim() || 'Nouveau projet',
  projectFrameFormat: { ...format },
  gridMode,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  scenes: [],
})

const makeScene = (project: Project, order: number): Scene => ({
  id: crypto.randomUUID(),
  order,
  title: `Scene ${order}`,
  duration: 5,
  focal: 'medium',
  description: '',
  notes: '',
  audioTypes: [],
  useProjectFormat: true,
  sceneFrameFormat: { ...project.projectFrameFormat },
  imagePrompt: 'nanobanana',
  image: null,
  location: '',
  moment: '',
  characters: '',
  references: '',
  status: 'draft',
})

const duplicateScene = (scene: Scene, order: number): Scene => ({
  ...scene,
  id: crypto.randomUUID(),
  order,
  title: `${scene.title} (copie)`,
  sceneFrameFormat: { ...scene.sceneFrameFormat },
  audioTypes: [...scene.audioTypes],
  imagePrompt: scene.imagePrompt,
  image: scene.image ? { ...scene.image } : null,
})

const cloneScene = (scene: Scene): Scene => ({
  ...scene,
  audioTypes: [...scene.audioTypes],
  sceneFrameFormat: { ...scene.sceneFrameFormat },
  image: scene.image ? { ...scene.image } : null,
})

const duplicateProject = (project: Project): Project => ({
  ...project,
  id: crypto.randomUUID(),
  name: `${project.name} (copie)`,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  scenes: project.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({
      ...scene,
      id: crypto.randomUUID(),
      order: index + 1,
      sceneFrameFormat: { ...scene.sceneFrameFormat },
      audioTypes: [...scene.audioTypes],
      imagePrompt: scene.imagePrompt ?? 'nanobanana',
      image: scene.image ? { ...scene.image } : null,
    })),
})

const reorderScenes = (scenes: Scene[], fromId: string, toId: string) => {
  const ordered = scenes.slice().sort((a, b) => a.order - b.order)
  const fromIndex = ordered.findIndex((scene) => scene.id === fromId)
  const toIndex = ordered.findIndex((scene) => scene.id === toId)
  if (fromIndex === -1 || toIndex === -1) return scenes
  const [moved] = ordered.splice(fromIndex, 1)
  ordered.splice(toIndex, 0, moved)
  return ordered.map((scene, index) => ({ ...scene, order: index + 1 }))
}

const moveSceneToEnd = (scenes: Scene[], fromId: string) => {
  const ordered = scenes.slice().sort((a, b) => a.order - b.order)
  const fromIndex = ordered.findIndex((scene) => scene.id === fromId)
  if (fromIndex === -1) return scenes
  const [moved] = ordered.splice(fromIndex, 1)
  ordered.push(moved)
  return ordered.map((scene, index) => ({ ...scene, order: index + 1 }))
}

const normalizeProjects = (projects: Project[]): Project[] =>
  projects.map((project) => ({
    ...project,
    scenes: (project.scenes || []).map((scene) => ({
      ...scene,
      imagePrompt: scene.imagePrompt ?? 'nanobanana',
      image: scene.image ?? null,
    })),
  }))

const loadProjects = (): Project[] => {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? normalizeProjects(parsed) : []
  } catch {
    return []
  }
}

const loadActiveProjectId = () => {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(ACTIVE_KEY)
  return stored || null
}

const sceneMatchesFilters = (scene: Scene, search: string, filters: FilterState) => {
  const term = search.trim().toLowerCase()
  const matchesSearch =
    term.length === 0 ||
    [scene.title, scene.description, scene.notes].some((field) =>
      field.toLowerCase().includes(term)
    )
  const matchesFocal = filters.focal === 'all' || scene.focal === filters.focal
  const matchesAudio =
    filters.audio === 'all' || scene.audioTypes.includes(filters.audio)
  const matchesStatus = filters.status === 'all' || scene.status === filters.status
  return matchesSearch && matchesFocal && matchesAudio && matchesStatus
}

function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    loadActiveProjectId()
  )
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [cardSize, setCardSize] = useState<CardSize>('medium')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>({
    focal: 'all',
    audio: 'all',
    status: 'all',
  })
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [modalProject, setModalProject] = useState<Project | null>(null)
  const [isProjectModalOpen, setProjectModalOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isPointerDragging, setIsPointerDragging] = useState(false)
  const [sceneModal, setSceneModal] = useState<SceneModalState | null>(null)
  const [draftScene, setDraftScene] = useState<Scene | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragOverIdRef = useRef<string | null>(null)
  const pointerDragRef = useRef<{
    id: string
    pointerId: number
    overCanvas: boolean
  } | null>(null)

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  )

  const orderedScenes = useMemo(() => {
    if (!activeProject) return []
    return activeProject.scenes.slice().sort((a, b) => a.order - b.order)
  }, [activeProject])

  const filteredScenes = useMemo(() => {
    if (!activeProject) return []
    return orderedScenes.filter((scene) => sceneMatchesFilters(scene, search, filters))
  }, [orderedScenes, activeProject, search, filters])

  const totalDuration = useMemo(() => {
    if (!activeProject) return 0
    return activeProject.scenes.reduce((sum, scene) => sum + scene.duration, 0)
  }, [activeProject])

  const focalDistribution = useMemo(() => {
    if (!activeProject) return []
    return FOCAL_OPTIONS.map((option) => ({
      label: option.label,
      count: activeProject.scenes.filter((scene) => scene.focal === option.value).length,
    })).filter((entry) => entry.count > 0)
  }, [activeProject])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_KEY, activeProjectId)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
    setLastSavedAt(new Date())
  }, [projects, activeProjectId])

  useEffect(() => {
    if (!activeProjectId) return
    if (!projects.find((project) => project.id === activeProjectId)) {
      setActiveProjectId(null)
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    if (!activeProjectId) {
      closeSceneModal()
    }
  }, [activeProjectId])

  useEffect(() => {
    if (selectedSceneId && !orderedScenes.find((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(null)
    }
  }, [orderedScenes, selectedSceneId])

  useEffect(() => {
    dragOverIdRef.current = dragOverId
  }, [dragOverId])

  useEffect(() => {
    setSelectedSceneIds([])
  }, [viewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName || ''
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return
      if (!activeProject) return

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleAddScene()
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        setLastSavedAt(new Date())
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        if (selectedSceneIds.length > 0) {
          handleDuplicateSelected()
          return
        }
        if (selectedSceneId) {
          handleDuplicateScene(selectedSceneId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeProject, selectedSceneId, selectedSceneIds])

  const updateProject = (projectId: string, updater: (project: Project) => Project) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project
        const updated = updater(project)
        return { ...updated, updatedAt: nowIso() }
      })
    )
  }

  const updateProjectScenes = (projectId: string, scenes: Scene[]) => {
    updateProject(projectId, (project) => ({ ...project, scenes }))
  }

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId)
    setSelectedSceneId(null)
  }

  const handleCreateProject = (name: string, format: FrameFormat, gridMode: GridMode) => {
    const project = makeProject(name, format, gridMode)
    setProjects((prev) => [...prev, project])
    setActiveProjectId(project.id)
  }

  const handleUpdateProject = (
    projectId: string,
    name: string,
    format: FrameFormat,
    gridMode: GridMode
  ) => {
    updateProject(projectId, (project) => ({
      ...project,
      name: name.trim() || project.name,
      projectFrameFormat: { ...format },
      gridMode,
    }))
  }

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== projectId))
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
    }
  }

  const handleDuplicateProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    const copy = duplicateProject(project)
    setProjects((prev) => [...prev, copy])
  }

  const handleAddScene = () => {
    openSceneCreate()
  }

  const handleDuplicateScene = (sceneId: string) => {
    if (!activeProject) return
    const target = activeProject.scenes.find((scene) => scene.id === sceneId)
    if (!target) return
    const nextOrder = activeProject.scenes.length + 1
    const duplicate = duplicateScene(target, nextOrder)
    updateProjectScenes(activeProject.id, [...activeProject.scenes, duplicate])
    setSelectedSceneId(duplicate.id)
  }

  const handleDuplicateSelected = () => {
    if (!activeProject || selectedSceneIds.length === 0) return
    const selected = activeProject.scenes.filter((scene) =>
      selectedSceneIds.includes(scene.id)
    )
    if (!selected.length) return
    const nextScenes = activeProject.scenes.slice()
    selected.forEach((scene) => {
      nextScenes.push(duplicateScene(scene, nextScenes.length + 1))
    })
    updateProjectScenes(activeProject.id, nextScenes)
    setSelectedSceneIds([])
  }

  const handleDeleteSelected = () => {
    if (!activeProject || selectedSceneIds.length === 0) return
    const remaining = activeProject.scenes.filter(
      (scene) => !selectedSceneIds.includes(scene.id)
    )
    const normalized = remaining
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((scene, index) => ({ ...scene, order: index + 1 }))
    updateProjectScenes(activeProject.id, normalized)
    setSelectedSceneIds([])
    if (selectedSceneId && selectedSceneIds.includes(selectedSceneId)) {
      setSelectedSceneId(null)
    }
  }

  const handleReorderScene = (fromId: string, toId: string) => {
    if (!activeProject) return
    const nextScenes = reorderScenes(activeProject.scenes, fromId, toId)
    updateProjectScenes(activeProject.id, nextScenes)
  }

  const handleDropToEnd = (sourceId: string) => {
    if (!activeProject) return
    const nextScenes = moveSceneToEnd(activeProject.scenes, sourceId)
    updateProjectScenes(activeProject.id, nextScenes)
  }

  const handleDragStart = (sceneId: string) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData('text/plain', sceneId)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(sceneId)
  }

  const handleDragOver = (sceneId: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragOverId(sceneId)
  }

  const handleDrop = (sceneId: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const sourceId = event.dataTransfer.getData('text/plain')
    if (sourceId && sourceId !== sceneId) {
      handleReorderScene(sourceId, sceneId)
    }
    setDraggingId(null)
    setDragOverId(null)
  }

  const handleDropOnCanvas = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain')
    if (sourceId) {
      handleDropToEnd(sourceId)
    }
    setDraggingId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const handlePointerDragStart = (sceneId: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    event.stopPropagation()
    pointerDragRef.current = {
      id: sceneId,
      pointerId: event.pointerId,
      overCanvas: true,
    }
    dragOverIdRef.current = sceneId
    setDraggingId(sceneId)
    setDragOverId(sceneId)
    setIsPointerDragging(true)
  }

  useEffect(() => {
    if (!isPointerDragging) return

    const handleMove = (event: PointerEvent) => {
      const state = pointerDragRef.current
      if (!state || event.pointerId !== state.pointerId) return
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const dropTarget = target?.closest('[data-scene-id]') as HTMLElement | null
      const overId = dropTarget?.dataset.sceneId || null
      dragOverIdRef.current = overId
      setDragOverId(overId)
      if (canvasRef.current) {
        state.overCanvas = target ? canvasRef.current.contains(target) : false
      }
    }

    const handleUp = (event: PointerEvent) => {
      const state = pointerDragRef.current
      if (!state || event.pointerId !== state.pointerId) return
      const sourceId = state.id
      const overId = dragOverIdRef.current
      if (overId && overId !== sourceId) {
        handleReorderScene(sourceId, overId)
      } else if (!overId && state.overCanvas) {
        handleDropToEnd(sourceId)
      }
      pointerDragRef.current = null
      setDraggingId(null)
      setDragOverId(null)
      setIsPointerDragging(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isPointerDragging, handleReorderScene, handleDropToEnd])

  const updateDraftScene = (updates: Partial<Scene>) => {
    setDraftScene((current) => {
      if (current) return { ...current, ...updates }
      if (!activeProject || !sceneModal?.sceneId) return current
      const base = activeProject.scenes.find((scene) => scene.id === sceneModal.sceneId)
      return base ? { ...cloneScene(base), ...updates } : current
    })
  }

  const openSceneView = (sceneId: string) => {
    setSceneModal({ mode: 'view', sceneId, isNew: false })
    setSelectedSceneId(sceneId)
  }

  const openSceneEdit = (sceneId: string) => {
    if (!activeProject) return
    const scene = activeProject.scenes.find((item) => item.id === sceneId)
    if (!scene) return
    setDraftScene(cloneScene(scene))
    setSceneModal({ mode: 'edit', sceneId, isNew: false })
    setSelectedSceneId(sceneId)
  }

  const openSceneCreate = () => {
    if (!activeProject) return
    const nextOrder = activeProject.scenes.length + 1
    const scene = makeScene(activeProject, nextOrder)
    setDraftScene(scene)
    setSceneModal({ mode: 'edit', sceneId: scene.id, isNew: true })
    setSelectedSceneId(scene.id)
  }

  const closeSceneModal = () => {
    setSceneModal(null)
    setDraftScene(null)
  }

  const saveSceneModal = () => {
    if (!activeProject || !draftScene || !sceneModal) return
    if (sceneModal.isNew) {
      const nextOrder = activeProject.scenes.length + 1
      const sceneToAdd = { ...draftScene, order: nextOrder }
      updateProjectScenes(activeProject.id, [...activeProject.scenes, sceneToAdd])
      setSelectedSceneId(sceneToAdd.id)
    } else if (sceneModal.sceneId) {
      updateProjectScenes(
        activeProject.id,
        activeProject.scenes.map((scene) =>
          scene.id === sceneModal.sceneId ? { ...draftScene, id: scene.id } : scene
        )
      )
    }
    closeSceneModal()
  }

  const openCreateModal = () => {
    setModalProject(null)
    setProjectModalOpen(true)
  }

  const openEditModal = (project: Project) => {
    setModalProject(project)
    setProjectModalOpen(true)
  }

  const closeProjectModal = () => {
    setProjectModalOpen(false)
  }

  const handleProjectModalSubmit = (name: string, format: FrameFormat, gridMode: GridMode) => {
    if (modalProject) {
      handleUpdateProject(modalProject.id, name, format, gridMode)
    } else {
      handleCreateProject(name, format, gridMode)
    }
    setProjectModalOpen(false)
  }

  if (!activeProject) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <header className="projects-header">
            <div>
              <p className="brand">Signela</p>
              <p className="subtitle">Storyboard pro pour equipes creatives.</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-primary" onClick={openCreateModal}>
                <Icon name="plus" />
                Nouveau projet
              </button>
            </div>
          </header>

          <section className="project-grid">
            {projects.length === 0 ? (
              <div className="empty-state">
                <h2>Aucun projet pour le moment.</h2>
                <p>Créez votre premier projet video et commencez le storyboard.</p>
                <button className="btn btn-primary" onClick={openCreateModal}>
                  <Icon name="plus" />
                  Creer un projet
                </button>
              </div>
            ) : (
              projects.map((project) => (
                <article className="project-card" key={project.id}>
                  <div className="project-card__top">
                    <h3>{project.name}</h3>
                    <div className="project-card__meta">
                      <span className="pill">Format {formatLabel(project.projectFrameFormat)}</span>
                      <span className="pill">{project.scenes.length} scenes</span>
                    </div>
                  </div>
                  <div className="project-card__actions">
                    <button className="btn btn-ghost" onClick={() => handleOpenProject(project.id)}>
                      Ouvrir
                    </button>
                    <button className="btn btn-ghost" onClick={() => openEditModal(project)}>
                      Renommer
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleDuplicateProject(project.id)}>
                      Dupliquer
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDeleteProject(project.id)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </div>

        {isProjectModalOpen && (
          <ProjectModal
            project={modalProject}
            onClose={closeProjectModal}
            onSubmit={handleProjectModalSubmit}
          />
        )}
      </div>
    )
  }

  const projectFormatLabel = formatLabel(activeProject.projectFrameFormat)
  const isListView = viewMode === 'list'
  const hasSelection = selectedSceneIds.length > 0
  const formattedSavedAt = lastSavedAt
    ? `Autosave ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Autosave actif'

  return (
    <div className="app-root">
      <div className="editor-shell">
        <header className="editor-header">
          <div>
            <p className="brand">Signela</p>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setActiveProjectId(null)
                closeSceneModal()
              }}
            >
              Retour aux projets
            </button>
          </div>
          <div className="project-header-main">
            <input
              className="project-title"
              value={activeProject.name}
              onChange={(event) =>
                handleUpdateProject(
                  activeProject.id,
                  event.target.value,
                  activeProject.projectFrameFormat,
                  activeProject.gridMode
                )
              }
            />
            <div className="meta-row">
              <span className="pill">Format {projectFormatLabel}</span>
              <span className="pill">
                {activeProject.gridMode === 'stable' ? 'Grille stable' : 'Cards adaptatives'}
              </span>
              <span className="pill">{activeProject.scenes.length} scenes</span>
              <span className="pill">Total {formatDuration(totalDuration)}</span>
            </div>
            <div className="stats-row">
              {focalDistribution.length > 0 ? (
                <p>
                  {focalDistribution
                    .map((entry) => `${entry.label} ${entry.count}`)
                    .join('  ')}
                </p>
              ) : (
                <p>Aucune scene pour l instant.</p>
              )}
            </div>
          </div>
          <div className="header-actions">
            <div className="segmented">
              <button
                className={viewMode === 'cards' ? 'active' : ''}
                onClick={() => setViewMode('cards')}
              >
                <Icon name="grid" />
                Vue Scene
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
              >
                <Icon name="list" />
                Vue Liste
              </button>
            </div>
            <button className="btn btn-primary" onClick={handleAddScene}>
              <Icon name="plus" />
              Nouvelle scene
            </button>
            <button className="btn btn-ghost" onClick={() => openEditModal(activeProject)}>
              <Icon name="settings" />
              Parametres projet
            </button>
            <span className="muted">{formattedSavedAt}</span>
          </div>
        </header>

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-field">
              <Icon name="search" />
              <input
                className="search-input"
                placeholder="Rechercher titre, description, notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="filters">
              <select
                value={filters.focal}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    focal: event.target.value as FilterState['focal'],
                  }))
                }
              >
                <option value="all">Focale: Toutes</option>
                {FOCAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={filters.audio}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    audio: event.target.value as FilterState['audio'],
                  }))
                }
              >
                <option value="all">Audio: Tous</option>
                {AUDIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as FilterState['status'],
                  }))
                }
              >
                <option value="all">Statut: Tous</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar-right">
            {viewMode === 'cards' && (
              <div className="segmented">
                {CARD_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={cardSize === option.value ? 'active' : ''}
                    onClick={() => setCardSize(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isListView && hasSelection && (
          <div className="bulk-bar">
            <span>{selectedSceneIds.length} selectionnee(s)</span>
            <div>
              <button className="btn btn-ghost" onClick={handleDuplicateSelected}>
                <Icon name="copy" />
                Dupliquer
              </button>
              <button className="btn btn-danger" onClick={handleDeleteSelected}>
                <Icon name="trash" />
                Supprimer
              </button>
            </div>
          </div>
        )}

        <div className="workspace">
          <main
            className="canvas"
            ref={canvasRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropOnCanvas}
          >
            {viewMode === 'cards' ? (
              <SceneGrid
                scenes={filteredScenes}
                project={activeProject}
                cardSize={cardSize}
                selectedSceneId={selectedSceneId}
                draggingId={draggingId}
                dragOverId={dragOverId}
                onOpen={openSceneView}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onPointerDown={handlePointerDragStart}
              />
            ) : (
              <SceneTable
                scenes={filteredScenes}
                project={activeProject}
                selectedSceneId={selectedSceneId}
                selectedSceneIds={selectedSceneIds}
                onOpenScene={openSceneView}
                onToggleSelect={(sceneId) =>
                  setSelectedSceneIds((current) =>
                    current.includes(sceneId)
                      ? current.filter((id) => id !== sceneId)
                      : [...current, sceneId]
                  )
                }
                onToggleSelectAll={() =>
                  setSelectedSceneIds((current) =>
                    current.length === filteredScenes.length
                      ? []
                      : filteredScenes.map((scene) => scene.id)
                  )
                }
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onPointerDown={handlePointerDragStart}
                draggingId={draggingId}
                dragOverId={dragOverId}
              />
            )}
          </main>
        </div>
      </div>

      {isProjectModalOpen && (
        <ProjectModal
          project={modalProject}
          onClose={closeProjectModal}
          onSubmit={handleProjectModalSubmit}
        />
      )}

      {sceneModal && activeProject && (
        <SceneModal
          mode={sceneModal.mode}
          isNew={sceneModal.isNew}
          scene={
            sceneModal.mode === 'edit'
              ? draftScene ||
                activeProject.scenes.find((scene) => scene.id === sceneModal.sceneId) ||
                null
              : activeProject.scenes.find((scene) => scene.id === sceneModal.sceneId) || null
          }
          project={activeProject}
          onClose={closeSceneModal}
          onEdit={() => sceneModal.sceneId && openSceneEdit(sceneModal.sceneId)}
          onSave={saveSceneModal}
          onUpdate={updateDraftScene}
        />
      )}
    </div>
  )
}

function SceneGrid({
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
}) {
  return (
    <div className={`scene-grid size-${cardSize}`}>
      {scenes.length === 0 ? (
        <div className="empty-state">
          <h2>Aucune scene a afficher.</h2>
          <p>Ajoutez une scene ou ajustez vos filtres.</p>
        </div>
      ) : (
        scenes.map((scene, index) => {
          const format = scene.useProjectFormat
            ? project.projectFrameFormat
            : scene.sceneFrameFormat
          const frameFormat =
            project.gridMode === 'adaptive' ? format : project.projectFrameFormat
          const ratio = `${frameFormat.width} / ${frameFormat.height}`
          return (
            <article
              key={scene.id}
              className={`scene-card${
                selectedSceneId === scene.id ? ' is-selected' : ''
              }${draggingId === scene.id ? ' is-dragging' : ''}${
                dragOverId === scene.id ? ' is-over' : ''
              } status-${scene.status}`}
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
                  <span>
                    {STATUS_OPTIONS.find((option) => option.value === scene.status)?.label}
                  </span>
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
}

function SceneTable({
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
  onOpenScene: (sceneId: string) => void
  onToggleSelect: (sceneId: string) => void
  onToggleSelectAll: () => void
  onDragStart: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragOver: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDrop: (sceneId: string) => (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onPointerDown: (sceneId: string) => (event: ReactPointerEvent<HTMLElement>) => void
  draggingId: string | null
  dragOverId: string | null
}) {
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
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th className="cell-drag" />
              <th>Ordre</th>
              <th>Titre</th>
              <th>Duree</th>
              <th>Focale</th>
              <th>Format</th>
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
              return (
                <tr
                  key={scene.id}
                  className={`scene-row${
                    selectedSceneId === scene.id ? ' is-selected' : ''
                  }${draggingId === scene.id ? ' is-dragging' : ''}${
                    dragOverId === scene.id ? ' is-over' : ''
                  } status-${scene.status}`}
                  data-scene-id={scene.id}
                  draggable
                  onClick={() => onOpenScene(scene.id)}
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

function SceneModal({
  mode,
  isNew,
  scene,
  project,
  onClose,
  onEdit,
  onSave,
  onUpdate,
}: {
  mode: SceneModalMode
  isNew: boolean
  scene: Scene | null
  project: Project
  onClose: () => void
  onEdit: () => void
  onSave: () => void
  onUpdate: (updates: Partial<Scene>) => void
}) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  if (!scene) return null

  const formatInUse = scene.useProjectFormat
    ? project.projectFrameFormat
    : scene.sceneFrameFormat
  const promptValue = scene.imagePrompt || 'nanobanana'

  const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    readFileAsDataUrl(file)
      .then((url) => {
        onUpdate({ image: { url, source: 'upload' } })
        setImageError(null)
      })
      .catch(() => {})
    event.target.value = ''
  }

  const handleGenerateImage = async () => {
    const prompt = promptValue.trim() || 'nanobanana'
    setIsGenerating(true)
    setImageError(null)
    try {
      const url = await requestGeneratedImage(prompt, formatInUse)
      onUpdate({ image: { url, source: 'generated', prompt }, imagePrompt: prompt })
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
                      <input type="file" accept="image/*" onChange={handleImageUpload} />
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
                    onChange={(event) =>
                      onUpdate({ focal: event.target.value as FocalType })
                    }
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
                    <p className="muted">
                      Format projet: {formatLabel(project.projectFrameFormat)}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label>Lieu</label>
                  <select
                    value={scene.location}
                    onChange={(event) =>
                      onUpdate({ location: event.target.value as Scene['location'] })
                    }
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
                    onChange={(event) =>
                      onUpdate({ moment: event.target.value as Scene['moment'] })
                    }
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
                    onChange={(event) =>
                      onUpdate({ status: event.target.value as SceneStatus })
                    }
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

function ProjectModal({
  project,
  onClose,
  onSubmit,
}: {
  project: Project | null
  onClose: () => void
  onSubmit: (name: string, format: FrameFormat, gridMode: GridMode) => void
}) {
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
          <button
            className="btn btn-primary"
            onClick={() => onSubmit(name, format, gridMode)}
          >
            <Icon name="sparkles" />
            {project ? 'Mettre a jour' : 'Creer le projet'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormatPicker({
  value,
  onChange,
}: {
  value: FrameFormat
  onChange: (format: FrameFormat) => void
}) {
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

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}

function Icon({
  name,
  className,
}: {
  name:
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
  className?: string
}) {
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
          <path d="M18 15l0.9 2.4L21 18l-2.1 0.6L18 21l-0.9-2.4L15 18l2.1-0.6L18 15z" className="secondary" />
        </svg>
      )
    default:
      return null
  }
}

export default App
