// 천간 (Heavenly Stems)
export const HEAVENLY_STEMS = [
  { hanja: '甲', korean: '갑', element: '목', yin: false, color: '#4CAF50', meaning: '큰 나무' },
  { hanja: '乙', korean: '을', element: '목', yin: true,  color: '#66BB6A', meaning: '작은 나무' },
  { hanja: '丙', korean: '병', element: '화', yin: false, color: '#F44336', meaning: '큰 불' },
  { hanja: '丁', korean: '정', element: '화', yin: true,  color: '#EF9A9A', meaning: '작은 불' },
  { hanja: '戊', korean: '무', element: '토', yin: false, color: '#FF9800', meaning: '큰 흙' },
  { hanja: '己', korean: '기', element: '토', yin: true,  color: '#FFCC80', meaning: '작은 흙' },
  { hanja: '庚', korean: '경', element: '금', yin: false, color: '#9E9E9E', meaning: '큰 쇠' },
  { hanja: '辛', korean: '신', element: '금', yin: true,  color: '#CFD8DC', meaning: '작은 쇠' },
  { hanja: '壬', korean: '임', element: '수', yin: false, color: '#2196F3', meaning: '큰 물' },
  { hanja: '癸', korean: '계', element: '수', yin: true,  color: '#90CAF9', meaning: '작은 물' },
] as const

// 지지 (Earthly Branches)
export const EARTHLY_BRANCHES = [
  { hanja: '子', korean: '자', animal: '쥐',   element: '수', hour: '23-01', yin: false, direction: '북' },
  { hanja: '丑', korean: '축', animal: '소',   element: '토', hour: '01-03', yin: true,  direction: '북동' },
  { hanja: '寅', korean: '인', animal: '호랑이', element: '목', hour: '03-05', yin: false, direction: '동' },
  { hanja: '卯', korean: '묘', animal: '토끼',  element: '목', hour: '05-07', yin: true,  direction: '동' },
  { hanja: '辰', korean: '진', animal: '용',   element: '토', hour: '07-09', yin: false, direction: '동남' },
  { hanja: '巳', korean: '사', animal: '뱀',   element: '화', hour: '09-11', yin: true,  direction: '남' },
  { hanja: '午', korean: '오', animal: '말',   element: '화', hour: '11-13', yin: false, direction: '남' },
  { hanja: '未', korean: '미', animal: '양',   element: '토', hour: '13-15', yin: true,  direction: '남서' },
  { hanja: '申', korean: '신', animal: '원숭이', element: '금', hour: '15-17', yin: false, direction: '서' },
  { hanja: '酉', korean: '유', animal: '닭',   element: '금', hour: '17-19', yin: true,  direction: '서' },
  { hanja: '戌', korean: '술', animal: '개',   element: '토', hour: '19-21', yin: false, direction: '서북' },
  { hanja: '亥', korean: '해', animal: '돼지',  element: '수', hour: '21-23', yin: true,  direction: '북' },
] as const

// 오행 (Five Elements)
export const FIVE_ELEMENTS = {
  목: { name: '목(木)', emoji: '🌿', color: '#4CAF50', generates: '화', controls: '토', adjective: '나무' },
  화: { name: '화(火)', emoji: '🔥', color: '#F44336', generates: '토', controls: '금', adjective: '불' },
  토: { name: '토(土)', emoji: '🪨', color: '#FF9800', generates: '금', controls: '수', adjective: '흙' },
  금: { name: '금(金)', emoji: '⚙️', color: '#9E9E9E', generates: '수', controls: '목', adjective: '쇠' },
  수: { name: '수(水)', emoji: '💧', color: '#2196F3', generates: '목', controls: '화', adjective: '물' },
} as const

export type ElementType = keyof typeof FIVE_ELEMENTS
export type HeavenlyStem = typeof HEAVENLY_STEMS[number]
export type EarthlyBranch = typeof EARTHLY_BRANCHES[number]

export interface Pillar {
  stem: HeavenlyStem
  branch: EarthlyBranch
  label: string
}

export interface SajuResult {
  yearPillar: Pillar
  monthPillar: Pillar
  dayPillar: Pillar
  hourPillar: Pillar
  birthDate: string
  calendarType: 'solar' | 'lunar'
}
