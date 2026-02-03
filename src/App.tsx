import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  AuthState,
  AuthUser,
  CardSize,
  FilterState,
  FrameFormat,
  GridMode,
  Project,
  Scene,
  SceneImage,
  SceneImageSource,
  SceneModalState,
  ViewMode,
} from './types'
import {
  AUDIO_OPTIONS,
  CARD_SIZE_OPTIONS,
  FOCAL_OPTIONS,
  PRESET_FORMATS,
  STATUS_OPTIONS,
} from './types'
import { formatDuration, formatLabel, nowIso, readFileAsDataUrl, requestGeneratedImage } from './utils'
import SceneGrid from './components/SceneGrid'
import SceneTable from './components/SceneTable'
import SceneModal from './components/SceneModal'
import ProjectModal from './components/ProjectModal'
import AuthModal from './components/AuthModal'
import Icon from './components/Icon'

const STORAGE_KEY = 'signela.projects.v1'
const ACTIVE_KEY = 'signela.activeProjectId.v1'
const TOKEN_KEY = 'signela.auth.token.v1'
const storageKeyForUser = (userId: string | null | undefined) =>
  userId ? `${STORAGE_KEY}:${userId}` : null
const activeKeyForUser = (userId: string | null | undefined) =>
  userId ? `${ACTIVE_KEY}:${userId}` : null
const API_BASE = import.meta.env.VITE_API_BASE || ''

const normalizeSceneStatus = (status?: string | null): Scene['status'] =>
  status === 'shot' ? 'shot' : 'to-shoot'

const warnSceneIssues = (scene: Partial<Scene>, projectId: string) => {
  if (!import.meta.env.DEV) return
  const issues: string[] = []
  if (!scene.sceneFrameFormat) issues.push('sceneFrameFormat manquant')
  if (!Array.isArray(scene.audioTypes)) issues.push('audioTypes invalide')
  if (!scene.status) issues.push('status manquant')
  if (scene.image && typeof scene.image === 'object' && !('url' in scene.image)) {
    issues.push('image invalide')
  }
  if (issues.length > 0) {
    console.warn('[signela] Scene normalisee avec champs manquants', {
      projectId,
      sceneId: scene.id ?? 'inconnu',
      issues,
    })
  }
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
  imagePrompt: '',
  image: null,
  cameraMovement: 'fixed',
  location: '',
  moment: '',
  characters: '',
  references: '',
  status: 'to-shoot',
})

const cloneScene = (scene: Scene, fallbackFormat?: FrameFormat): Scene => ({
  ...scene,
  audioTypes: Array.isArray(scene.audioTypes) ? [...scene.audioTypes] : [],
  sceneFrameFormat: {
    ...(scene.sceneFrameFormat ?? fallbackFormat ?? PRESET_FORMATS[0]),
  },
  imagePrompt: scene.imagePrompt ?? '',
  image:
    scene.image && typeof scene.image === 'object' && 'url' in scene.image
      ? { ...scene.image }
      : null,
  cameraMovement: scene.cameraMovement ?? 'fixed',
  status: normalizeSceneStatus(scene.status),
})

const duplicateScene = (scene: Scene, order: number): Scene => ({
  ...cloneScene(scene),
  id: crypto.randomUUID(),
  order,
  title: `${scene.title} (copie)`,
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
      ...cloneScene(scene, project.projectFrameFormat),
      id: crypto.randomUUID(),
      order: index + 1,
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
    scenes: (project.scenes || []).map((scene) => {
      warnSceneIssues(scene, project.id)
      return {
        ...scene,
        audioTypes: Array.isArray(scene.audioTypes) ? scene.audioTypes : [],
        useProjectFormat: scene.useProjectFormat ?? true,
        sceneFrameFormat: scene.sceneFrameFormat ?? project.projectFrameFormat,
        imagePrompt: scene.imagePrompt ?? '',
        image:
          scene.image && typeof scene.image === 'object' && 'url' in scene.image
            ? (scene.image as SceneImage)
            : null,
        cameraMovement: scene.cameraMovement ?? 'fixed',
        status: normalizeSceneStatus(scene.status),
      }
    }),
  }))

type StoredSceneImage = { source: SceneImageSource; prompt?: string } | null
type StoredScene = Omit<Scene, 'image'> & { image: StoredSceneImage }
type StoredProject = Omit<Project, 'scenes'> & { scenes: StoredScene[] }

const serializeProjectsForStorage = (projects: Project[]): StoredProject[] =>
  projects.map((project) => ({
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      image: scene.image
        ? {
            source: scene.image.source,
            prompt: scene.image.prompt,
          }
        : null,
    })),
  }))

const loadProjects = (userId: string | null | undefined): Project[] => {
  if (typeof window === 'undefined') return []
  const storageKey = storageKeyForUser(userId)
  if (!storageKey) return []
  const stored = localStorage.getItem(storageKey)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? normalizeProjects(parsed) : []
  } catch {
    return []
  }
}

const loadActiveProjectId = (userId: string | null | undefined) => {
  if (typeof window === 'undefined') return null
  const activeKey = activeKeyForUser(userId)
  if (!activeKey) return null
  const stored = localStorage.getItem(activeKey)
  return stored || null
}

const loadToken = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

const saveToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

const decodeToken = (token: string | null): AuthUser | null => {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1]))
    if (!payload?.sub || !payload?.email) return null
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

const apiRequest = async <T,>(
  path: string,
  options: RequestInit = {},
  token: string | null = null
): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.error || 'Erreur serveur.'
    throw new Error(message)
  }
  return (await response.json()) as T
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
  const initialToken = loadToken()
  const initialUser = decodeToken(initialToken)
  const [projects, setProjects] = useState<Project[]>(() =>
    loadProjects(initialUser?.id)
  )
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    loadActiveProjectId(initialUser?.id)
  )
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: initialToken,
    user: initialUser,
    status: 'idle',
  }))
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
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isPointerDragging, setIsPointerDragging] = useState(false)
  const [sceneModal, setSceneModal] = useState<SceneModalState | null>(null)
  const [draftScene, setDraftScene] = useState<Scene | null>(null)
  const [isAuthModalOpen, setAuthModalOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const syncTimerRef = useRef<number | null>(null)
  const hasLoadedRemoteRef = useRef(false)
  const skipNextSyncRef = useRef(false)
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
    const storageKey = storageKeyForUser(auth.user?.id)
    const activeKey = activeKeyForUser(auth.user?.id)
    if (!storageKey || !activeKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(serializeProjectsForStorage(projects)))
      if (activeProjectId) {
        localStorage.setItem(activeKey, activeProjectId)
      } else {
        localStorage.removeItem(activeKey)
      }
    } catch {
      // Ignore quota errors; images are stored in backend when logged in.
    }
    setLastSavedAt(new Date())
  }, [projects, activeProjectId, auth.user?.id])

  useEffect(() => {
    saveToken(auth.token)
  }, [auth.token])

  useEffect(() => {
    if (!auth.token) {
      setProjects([])
      setActiveProjectId(null)
      setAuth((current) => ({ ...current, status: 'ready' }))
      hasLoadedRemoteRef.current = false
      return
    }
    let mounted = true
    setAuth((current) => ({ ...current, status: 'loading' }))
    apiRequest<Project[]>('/api/projects', {}, auth.token)
      .then((data) => {
        if (!mounted) return
        setAuth((current) => ({
          ...current,
          user: current.user ?? decodeToken(current.token),
        }))
        const userId = decodeToken(auth.token)?.id
        if (data.length === 0) {
          const local = loadProjects(userId)
          if (local.length > 0) {
            setProjects(local)
          } else {
            setProjects([])
          }
        } else {
          skipNextSyncRef.current = true
          setProjects(normalizeProjects(data))
        }
        const storedActive = loadActiveProjectId(userId)
        if (storedActive && data.find((project) => project.id === storedActive)) {
          setActiveProjectId(storedActive)
        } else {
          setActiveProjectId(null)
        }
        hasLoadedRemoteRef.current = true
        setAuth((current) => ({ ...current, status: 'ready' }))
      })
      .catch(() => {
        if (!mounted) return
        setAuth((current) => ({ ...current, status: 'ready' }))
      })
    return () => {
      mounted = false
    }
  }, [auth.token])

  useEffect(() => {
    if (!activeProjectId) return
    if (!projects.find((project) => project.id === activeProjectId)) {
      setActiveProjectId(null)
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    if (!auth.token || !hasLoadedRemoteRef.current) return
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false
      setSyncStatus('idle')
      return
    }
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current)
    }
    setSyncStatus('syncing')
    syncTimerRef.current = window.setTimeout(() => {
      Promise.all(
        projects.map((project) =>
          apiRequest(
            `/api/projects/${project.id}/sync`,
            { method: 'POST', body: JSON.stringify(project) },
            auth.token
          )
        )
      )
        .then(() => {
          setSyncStatus('idle')
        })
        .catch(() => {
          setSyncStatus('error')
        })
    }, 800)
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current)
      }
    }
  }, [projects, auth.token])

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
    if (!pendingDeleteProject) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPendingDeleteProject(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingDeleteProject])

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
    if (auth.token) {
      apiRequest(`/api/projects/${projectId}`, { method: 'DELETE' }, auth.token).catch(
        () => {}
      )
    }
  }

  const openDeleteProjectConfirm = (project: Project) => {
    setPendingDeleteProject(project)
  }

  const closeDeleteProjectConfirm = () => {
    setPendingDeleteProject(null)
  }

  const confirmDeleteProject = () => {
    if (!pendingDeleteProject) return
    handleDeleteProject(pendingDeleteProject.id)
    setPendingDeleteProject(null)
  }

  const handleDeleteOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeDeleteProjectConfirm()
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
      return base
        ? { ...cloneScene(base, activeProject.projectFrameFormat), ...updates }
        : current
    })
  }

  const handleSceneImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    readFileAsDataUrl(file)
      .then((url) => {
        updateDraftScene({ image: { url, source: 'upload' } })
      })
      .catch(() => {})
    event.target.value = ''
  }

  const handleGenerateSceneImage = async (format: FrameFormat, prompt: string) => {
    const url = await requestGeneratedImage(API_BASE, prompt, format)
    updateDraftScene({ image: { url, source: 'generated', prompt }, imagePrompt: prompt })
  }

  const openSceneView = (scene: Scene) => {
    setDraftScene(cloneScene(scene, activeProject?.projectFrameFormat))
    setSceneModal({ mode: 'view', sceneId: scene.id, isNew: false })
    setSelectedSceneId(scene.id)
  }

  const openSceneEdit = (scene: Scene) => {
    if (!activeProject) return
    setDraftScene(cloneScene(scene, activeProject.projectFrameFormat))
    setSceneModal({ mode: 'edit', sceneId: scene.id, isNew: false })
    setSelectedSceneId(scene.id)
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
    if (!auth.token) {
      openAuthModal()
      return
    }
    setModalProject(null)
    setProjectModalOpen(true)
  }

  const openAuthModal = () => {
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
  }

  const handleAuthSuccess = (token: string, user: AuthUser) => {
    setAuth({ token, user, status: 'ready' })
    const localProjects = loadProjects(user.id)
    const storedActive = loadActiveProjectId(user.id)
    const nextActive =
      storedActive && localProjects.some((project) => project.id === storedActive)
        ? storedActive
        : null
    setProjects(localProjects)
    setActiveProjectId(nextActive)
    hasLoadedRemoteRef.current = false
    setAuthModalOpen(false)
  }

  const handleLogout = () => {
    setAuth({ token: null, user: null, status: 'ready' })
    setProjects([])
    setActiveProjectId(null)
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

  const deleteConfirmModal = pendingDeleteProject ? (
    <div className="modal" onClick={handleDeleteOverlayClick}>
      <div className="modal-content confirm-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Supprimer ce projet ?</h2>
          <button className="btn btn-ghost" onClick={closeDeleteProjectConfirm}>
            <Icon name="close" />
            Fermer
          </button>
        </div>
        <div className="modal-body">
          <p>Supprimer ce projet ? Cette action est irréversible.</p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={closeDeleteProjectConfirm} autoFocus>
            <Icon name="close" />
            Annuler
          </button>
          <button className="btn btn-danger" onClick={confirmDeleteProject}>
            <Icon name="trash" />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (!activeProject) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <header className="projects-header">
            <div>
              <div className="brand brand--logo">
                <img className="brand-logo" src="/signela-logo.png" alt="Signela" />
              </div>
            </div>
            <div className="header-actions">
              {auth.user ? (
                <>
                  <span className="pill">Connecte: {auth.user.email}</span>
                  <button className="btn btn-ghost" onClick={handleLogout}>
                    <Icon name="close" />
                    Déconnexion
                  </button>
                  <button className="btn btn-primary" onClick={openCreateModal}>
                    <Icon name="plus" />
                    Nouveau projet
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={openAuthModal}>
                  <Icon name="settings" />
                  Se connecter
                </button>
              )}
            </div>
          </header>

          {!auth.token ? (
            <div className="empty-state auth-gate">
              <h2>Connectez-vous pour accéder à vos projets.</h2>
              <p>La synchronisation cloud est activée après connexion.</p>
              <button className="btn btn-primary" onClick={openAuthModal}>
                <Icon name="settings" />
                Se connecter
              </button>
            </div>
          ) : (
            <section className="project-grid">
              {projects.length === 0 ? (
                <div className="empty-state">
                  <h2>Aucun projet pour le moment.</h2>
                  <p>Créez votre premier projet videéo et commencez le storyboard.</p>
                  <button className="btn btn-primary" onClick={openCreateModal}>
                    <Icon name="plus" />
                    Créer un projet
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
                      <button
                        className="btn btn-danger"
                        onClick={() => openDeleteProjectConfirm(project)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                ))
              )}
            </section>
          )}
        </div>

        {isProjectModalOpen && (
          <ProjectModal
            project={modalProject}
            onClose={closeProjectModal}
            onSubmit={handleProjectModalSubmit}
          />
        )}

        {isAuthModalOpen && (
          <AuthModal
            onClose={closeAuthModal}
            onSuccess={handleAuthSuccess}
            initialEmail={auth.user?.email || ''}
            apiRequest={apiRequest}
          />
        )}

        {deleteConfirmModal}
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
            <div className="brand brand--logo">
              <img className="brand-logo" src="/signela-logo.png" alt="Signela" />
            </div>
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
                <p>Aucune scène pour l'instant.</p>
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
                Vue Scène
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
              Nouvelle scène
            </button>
            <button className="btn btn-ghost" onClick={() => openEditModal(activeProject)}>
              <Icon name="settings" />
              Paramètres projet
            </button>
            <span className="muted">{formattedSavedAt}</span>
            {auth.token && (
              <span className="muted">
                {syncStatus === 'syncing'
                  ? 'Sync...'
                  : syncStatus === 'error'
                    ? 'Sync echouee'
                    : 'Sync OK'}
              </span>
            )}
            {!auth.token && (
              <button className="btn btn-ghost" onClick={openAuthModal}>
                <Icon name="settings" />
                Se connecter
              </button>
            )}
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
            <span>{selectedSceneIds.length} sélèctionnée(s)</span>
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

      {isAuthModalOpen && (
        <AuthModal
          onClose={closeAuthModal}
          onSuccess={handleAuthSuccess}
          initialEmail={auth.user?.email || ''}
          apiRequest={apiRequest}
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
              : activeProject.scenes.find((scene) => scene.id === sceneModal.sceneId) ||
                draftScene ||
                null
          }
          project={activeProject}
          onClose={closeSceneModal}
          onEdit={openSceneEdit}
          onSave={saveSceneModal}
          onUpdate={updateDraftScene}
          onImageUpload={handleSceneImageUpload}
          onGenerateImage={handleGenerateSceneImage}
        />
      )}

      {deleteConfirmModal}
    </div>
  )
}

export default App
