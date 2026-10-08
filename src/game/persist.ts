import { fromData, type BoardData } from './board'

/** Phiên bản schema. Kiểm tra ĐẦU TIÊN khi load (A6). */
export const SCHEMA_VERSION = 1

export type ThemeName = 'light' | 'dark' | 'contrast'

export type SaveSettings = {
  haptics: boolean
  reducedMotion: boolean
  dpad: 'auto' | 'on' | 'off'
  theme: ThemeName
  sfxVolume: number
}

export type SaveStats = {
  games: number
  bestTile: number
  totalScore: number
}

export type SaveData = {
  v: number
  board: BoardData
  score: number
  best: number
  won: boolean
  keepPlaying: boolean
  moves: number
  stats: SaveStats
  settings: SaveSettings
  lastSavedAt: string
}

export function defaultSave(): SaveData {
  return {
    v: SCHEMA_VERSION,
    board: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 0,
    best: 0,
    won: false,
    keepPlaying: false,
    moves: 0,
    stats: { games: 0, bestTile: 0, totalScore: 0 },
    settings: { haptics: true, reducedMotion: false, dpad: 'auto', theme: 'light', sfxVolume: 0.7 },
    lastSavedAt: '',
  }
}

export function serialize(d: SaveData): string {
  return JSON.stringify(d)
}

function asNonNegInt(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = Math.floor(v)
  return n < 0 ? fallback : n
}

function asBool(v: unknown): boolean {
  return v === true
}

function clamp01(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

function parseSettings(raw: unknown): SaveSettings {
  const base = defaultSave().settings
  if (typeof raw !== 'object' || raw === null) return base
  const o = raw as Record<string, unknown>
  const themes: ThemeName[] = ['light', 'dark', 'contrast']
  const dpads: SaveSettings['dpad'][] = ['auto', 'on', 'off']
  const theme = themes.find((t) => t === o['theme'])
  const dpad = dpads.find((d) => d === o['dpad'])
  return {
    haptics: typeof o['haptics'] === 'boolean' ? o['haptics'] : base.haptics,
    reducedMotion:
      typeof o['reducedMotion'] === 'boolean' ? o['reducedMotion'] : base.reducedMotion,
    dpad: dpad ?? base.dpad,
    theme: theme ?? base.theme,
    sfxVolume: clamp01(o['sfxVolume'], base.sfxVolume),
  }
}

function parseStats(raw: unknown): SaveStats {
  const base = defaultSave().stats
  if (typeof raw !== 'object' || raw === null) return base
  const o = raw as Record<string, unknown>
  return {
    games: asNonNegInt(o['games'], base.games),
    bestTile: asNonNegInt(o['bestTile'], base.bestTile),
    totalScore: asNonNegInt(o['totalScore'], base.totalScore),
  }
}

/**
 * Đọc save từ chuỗi thô. KHÔNG BAO GIỜ throw.
 *
 * Trả `null` khi chuỗi không dùng được ở mức cơ bản (không parse được, không
 * phải object, thiếu `v`).
 *
 * Khi object hợp lệ nhưng PHẦN VÁN hỏng (board sai hình dạng, giá trị lạ),
 * ta tạo ván mới nhưng GIỮ `best` và `stats` nếu đọc được. Mất một phiên đau
 * ít hơn mất kỷ lục mọi thời đại — bài học từ RPS.
 *
 * Board trả về toàn số 0 nghĩa là "chưa có ván đang chơi"; người gọi gọi
 * `createStartBoard`.
 */
export function parse(raw: string | null | undefined): SaveData | null {
  if (raw === null || raw === undefined || raw === '') return null

  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null

  const o = obj as Record<string, unknown>
  const version = o['v']
  if (typeof version !== 'number' || !Number.isFinite(version)) return null

  const base = defaultSave()

  // Hai thứ này sống sót qua board hỏng.
  const best = asNonNegInt(o['best'], base.best)
  const stats = parseStats(o['stats'])
  const settings = parseSettings(o['settings'])

  // Phần ván: hỏng thì rơi về ván mới. Dùng `fromData` làm hàm kiểm tra hình
  // dạng và giá trị — một nguồn sự thật duy nhất cho tính hợp lệ của board.
  let board: BoardData = base.board
  let score = 0
  let moves = 0
  let won = false
  let keepPlaying = false
  try {
    fromData(o['board'] as BoardData, () => 0)
    board = o['board'] as BoardData
    score = asNonNegInt(o['score'], 0)
    moves = asNonNegInt(o['moves'], 0)
    won = asBool(o['won'])
    keepPlaying = asBool(o['keepPlaying'])
  } catch {
    // giữ nguyên giá trị ván mới
  }

  return {
    v: SCHEMA_VERSION,
    board,
    score,
    best,
    won,
    keepPlaying,
    moves,
    stats,
    settings,
    lastSavedAt: typeof o['lastSavedAt'] === 'string' ? o['lastSavedAt'] : '',
  }
}
