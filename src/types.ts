export type ViewMode = 'cards' | 'list'
export type CardSize = 'small' | 'medium' | 'large'
export type GridMode = 'stable' | 'adaptive'
export type AudioType = 'live' | 'voice' | 'music'
export type FocalType = 'large' | 'medium' | 'tight'
export type SceneStatus = 'draft' | 'approved' | 'shot'
export type LocationType = 'interior' | 'exterior'
export type MomentType = 'day' | 'night'
export type FormatSource = 'preset' | 'custom'
export type SceneImageSource = 'upload' | 'generated'
export type SceneModalMode = 'view' | 'edit'

export type FilterState = {
  focal: 'all' | FocalType
  audio: 'all' | AudioType
  status: 'all' | SceneStatus
}

export interface FrameFormat {
  width: number
  height: number
  label: string
  source: FormatSource
}

export interface SceneImage {
  url: string
  source: SceneImageSource
  prompt?: string
}

export interface Scene {
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

export interface Project {
  id: string
  name: string
  projectFrameFormat: FrameFormat
  gridMode: GridMode
  createdAt: string
  updatedAt: string
  scenes: Scene[]
}

export type SceneModalState = {
  mode: SceneModalMode
  sceneId: string | null
  isNew: boolean
}

export type AuthUser = {
  id: string
  email: string
}

export type AuthState = {
  token: string | null
  user: AuthUser | null
  status: 'idle' | 'loading' | 'ready'
}

export const PRESET_FORMATS: FrameFormat[] = [
  { width: 16, height: 9, label: '16:9', source: 'preset' },
  { width: 9, height: 16, label: '9:16', source: 'preset' },
  { width: 1, height: 1, label: '1:1', source: 'preset' },
  { width: 4, height: 5, label: '4:5', source: 'preset' },
]

export const FOCAL_OPTIONS: Array<{ value: FocalType; label: string }> = [
  { value: 'large', label: 'Large' },
  { value: 'medium', label: 'Moyen' },
  { value: 'tight', label: 'Serre' },
]

export const AUDIO_OPTIONS: Array<{ value: AudioType; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'voice', label: 'Voix off' },
  { value: 'music', label: 'Musique' },
]

export const STATUS_OPTIONS: Array<{ value: SceneStatus; label: string }> = [
  { value: 'draft', label: 'A ecrire' },
  { value: 'approved', label: 'Valide' },
  { value: 'shot', label: 'Tourne' },
]

export const LOCATION_OPTIONS: Array<{ value: LocationType | ''; label: string }> = [
  { value: '', label: 'Aucun' },
  { value: 'interior', label: 'Interieur' },
  { value: 'exterior', label: 'Exterieur' },
]

export const MOMENT_OPTIONS: Array<{ value: MomentType | ''; label: string }> = [
  { value: '', label: 'Aucun' },
  { value: 'day', label: 'Jour' },
  { value: 'night', label: 'Nuit' },
]

export const GRID_OPTIONS: Array<{ value: GridMode; label: string }> = [
  { value: 'stable', label: 'Grille stable' },
  { value: 'adaptive', label: 'Cards adaptatives' },
]

export const CARD_SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]
