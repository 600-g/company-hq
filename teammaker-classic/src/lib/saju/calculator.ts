import { HEAVENLY_STEMS, EARTHLY_BRANCHES, type Pillar, type SajuResult } from './constants'
import { solarToJdn, lunarToSolar } from './lunarCalendar'

/**
 * 절기 (Solar Terms) approximate dates for each month.
 * 사주 월주는 절기를 기준으로 결정됩니다.
 * 중기(中氣) 기준: 각 달의 시작은 해당 절기 이후
 *
 * 12개 절입 (節入) 기준 평균 날짜 (양력):
 * 1월: 입춘(立春) ~2/4
 * 2월: 경칩(驚蟄) ~3/6
 * 3월: 청명(淸明) ~4/5
 * 4월: 입하(立夏) ~5/6
 * 5월: 망종(芒種) ~6/6
 * 6월: 소서(小暑) ~7/7
 * 7월: 입추(立秋) ~8/8
 * 8월: 백로(白露) ~9/8
 * 9월: 한로(寒露) ~10/8
 * 10월: 입동(立冬) ~11/7
 * 11월: 대설(大雪) ~12/7
 * 12월: 소한(小寒) ~1/6 (next year)
 */
const JUNGGI_DATES: [number, number][] = [
  [1, 6],  // 소한 (小寒) - 음력 12월 시작 → 양력 1/6 경
  [2, 4],  // 입춘 (立春) - 음력 1월 시작 → 양력 2/4 경
  [3, 6],  // 경칩 (驚蟄) - 음력 2월 시작 → 양력 3/6 경
  [4, 5],  // 청명 (淸明) - 음력 3월 시작 → 양력 4/5 경
  [5, 6],  // 입하 (立夏) - 음력 4월 시작 → 양력 5/6 경
  [6, 6],  // 망종 (芒種) - 음력 5월 시작 → 양력 6/6 경
  [7, 7],  // 소서 (小暑) - 음력 6월 시작 → 양력 7/7 경
  [8, 8],  // 입추 (立秋) - 음력 7월 시작 → 양력 8/8 경
  [9, 8],  // 백로 (白露) - 음력 8월 시작 → 양력 9/8 경
  [10, 8], // 한로 (寒露) - 음력 9월 시작 → 양력 10/8 경
  [11, 7], // 입동 (立冬) - 음력 10월 시작 → 양력 11/7 경
  [12, 7], // 대설 (大雪) - 음력 11월 시작 → 양력 12/7 경
]

/**
 * 절기 기준 월주 인덱스 계산 (1~12)
 * 입춘(2/4경) 이전이면 이전 해 12월로 처리
 */
function getSolarMonth(year: number, month: number, day: number): number {
  for (let i = JUNGGI_DATES.length - 1; i >= 0; i--) {
    const [jm, jd] = JUNGGI_DATES[i]
    if (month > jm || (month === jm && day >= jd)) {
      return i + 1 // 1~12 (음력 월)
    }
  }
  // 소한 이전 → 전년도 11월
  return 12
}

/**
 * 연주 (年柱) 계산
 * 입춘(2/4경) 이전이면 전년도로 처리
 */
function getYearPillar(year: number, month: number, day: number): Pillar {
  let sYear = year
  // 입춘 이전이면 전 해 연주
  if (month < 2 || (month === 2 && day < 4)) {
    sYear--
  }
  const stemIdx = ((sYear - 4) % 10 + 10) % 10
  const branchIdx = ((sYear - 4) % 12 + 12) % 12
  return {
    stem: HEAVENLY_STEMS[stemIdx],
    branch: EARTHLY_BRANCHES[branchIdx],
    label: '연주(年柱)',
  }
}

/**
 * 월주 (月柱) 계산
 * 절기 기준 음력 월 계산 후, 연주 천간으로 월주 천간 결정
 */
function getMonthPillar(year: number, month: number, day: number): Pillar {
  // 절기 기준 음력 월 (1~12)
  const lunarMonth = getSolarMonth(year, month, day)

  // 입춘 전이면 연주 기준 연도 -1
  let sYear = year
  if (month < 2 || (month === 2 && day < 4)) {
    sYear--
  }

  const yearStemIdx = ((sYear - 4) % 10 + 10) % 10

  // 월주 천간: 연주 천간 그룹 × 2 + (lunarMonth - 1) % 10
  // 甲己년: 1월=丙, 乙庚년: 1월=戊, 丙辛년: 1월=庚, 丁壬년: 1월=壬, 戊癸년: 1월=甲
  const monthStemBase = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0][yearStemIdx]
  const stemIdx = (monthStemBase + lunarMonth - 1) % 10

  // 월주 지지: 음력 1월=寅(2), 순서대로
  const branchIdx = (lunarMonth + 1) % 12

  return {
    stem: HEAVENLY_STEMS[stemIdx],
    branch: EARTHLY_BRANCHES[branchIdx],
    label: '월주(月柱)',
  }
}

/**
 * 일주 (日柱) 계산 - Julian Day Number 기반
 * 기준점: 2000년 1월 1일 (JDN 2451545) = 甲辰日 (60갑자 40번)
 */
function getDayPillar(year: number, month: number, day: number): Pillar {
  const jdn = solarToJdn(year, month, day)
  const BASE_JDN = 2451545 // 2000-01-01
  const BASE_IDX = 40      // 甲辰 = 60갑자 index 40 (0-based)

  const idx60 = ((jdn - BASE_JDN + BASE_IDX) % 60 + 60) % 60
  const stemIdx = idx60 % 10
  const branchIdx = idx60 % 12

  return {
    stem: HEAVENLY_STEMS[stemIdx],
    branch: EARTHLY_BRANCHES[branchIdx],
    label: '일주(日柱)',
  }
}

/**
 * 시주 (時柱) 계산
 * 23시 이후는 子시 (다음날 子시)
 */
function getHourPillar(hour: number, dayStemIdx: number): Pillar {
  // 시지 인덱스: 子(0)=23~1시, 丑(1)=1~3시 ...
  let branchIdx: number
  if (hour === 23) {
    branchIdx = 0
  } else {
    branchIdx = Math.floor((hour + 1) / 2) % 12
  }

  // 시주 천간: 일주 천간 그룹으로 결정
  // 甲己일: 子시=甲子, 乙庚일: 子시=丙子, 丙辛일: 子시=戊子, 丁壬일: 子시=庚子, 戊癸일: 子시=壬子
  const hourStemBase = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8][dayStemIdx]
  const stemIdx = (hourStemBase + branchIdx) % 10

  return {
    stem: HEAVENLY_STEMS[stemIdx],
    branch: EARTHLY_BRANCHES[branchIdx],
    label: '시주(時柱)',
  }
}

export interface SajuInput {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  calendarType: 'solar' | 'lunar'
  isLeapMonth?: boolean
}

/** 사주팔자 계산 메인 함수 */
export function calculateSaju(input: SajuInput): SajuResult {
  let { year, month, day } = input

  // 음력 입력이면 양력으로 변환
  if (input.calendarType === 'lunar') {
    const solar = lunarToSolar(year, month, day, input.isLeapMonth)
    year = solar.year
    month = solar.month
    day = solar.day
  }

  const yearPillar = getYearPillar(year, month, day)
  const monthPillar = getMonthPillar(year, month, day)
  const dayPillar = getDayPillar(year, month, day)
  const hourPillar = getHourPillar(input.hour, HEAVENLY_STEMS.indexOf(dayPillar.stem))

  return {
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    birthDate: `${year}년 ${month}월 ${day}일 ${input.hour}시`,
    calendarType: input.calendarType,
  }
}
