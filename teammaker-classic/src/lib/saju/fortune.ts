import { FIVE_ELEMENTS, type ElementType, type SajuResult } from './constants'

export interface ElementCount {
  목: number
  화: number
  토: number
  금: number
  수: number
}

export interface FortuneReading {
  elementCounts: ElementCount
  dominantElement: ElementType
  weakElement: ElementType
  luckyElement: ElementType
  personality: string[]
  strengths: string[]
  weaknesses: string[]
  luckyItems: {
    color: string
    direction: string
    number: string
    season: string
  }
  yearFortune: string
  loveAdvice: string
  careerAdvice: string
  healthAdvice: string
  overallMessage: string
}

const ELEMENT_PERSONALITY: Record<ElementType, string[]> = {
  목: [
    '진취적이고 성장 지향적인 기질을 지녔습니다',
    '창의성과 상상력이 풍부합니다',
    '인자하고 너그러운 성품으로 주변 사람을 이끌어갑니다',
    '새로운 시작과 변화를 즐기는 개척자 기질이 강합니다',
  ],
  화: [
    '열정적이고 활동적인 에너지를 가졌습니다',
    '표현력이 뛰어나고 사교성이 강합니다',
    '직관적이고 영감이 넘치는 사람입니다',
    '빠른 판단력과 실행력이 장점입니다',
  ],
  토: [
    '안정감 있고 신뢰받는 성품을 지녔습니다',
    '포용력이 넓고 중재 능력이 탁월합니다',
    '실용적이고 현실적인 판단을 잘합니다',
    '끈기 있게 목표를 향해 나아가는 뚝심이 있습니다',
  ],
  금: [
    '냉철한 판단력과 원칙을 중시합니다',
    '날카로운 통찰력으로 본질을 꿰뚫어봅니다',
    '의리를 중시하고 한번 맺은 인연을 소중히 합니다',
    '완벽주의적 성향으로 높은 성취를 이룹니다',
  ],
  수: [
    '지혜롭고 탐구적인 지성을 갖추었습니다',
    '유연하고 적응력이 뛰어납니다',
    '깊은 감수성과 직관력을 가졌습니다',
    '상황에 맞게 흘러가는 물처럼 유연하게 대처합니다',
  ],
}

const ELEMENT_STRENGTHS: Record<ElementType, string[]> = {
  목: ['리더십', '창의력', '성장력', '결단력'],
  화: ['열정', '표현력', '추진력', '영감'],
  토: ['신뢰감', '포용력', '안정성', '인내력'],
  금: ['판단력', '원칙', '통찰력', '의리'],
  수: ['지혜', '적응력', '감수성', '분석력'],
}

const ELEMENT_WEAKNESSES: Record<ElementType, string[]> = {
  목: ['고집', '급한 성격', '지속성 부족', '완급 조절 어려움'],
  화: ['조급함', '충동성', '감정 기복', '지속력 부족'],
  토: ['변화 저항', '우유부단', '걱정 과다', '과보호 성향'],
  금: ['융통성 부족', '비판적 성향', '고독감', '냉혹함'],
  수: ['우유부단', '과도한 생각', '결단력 부족', '은둔 성향'],
}

const LUCKY_ITEMS: Record<ElementType, { color: string; direction: string; number: string; season: string }> = {
  목: { color: '초록·파란색', direction: '동쪽', number: '3, 8', season: '봄' },
  화: { color: '빨간·보라색', direction: '남쪽', number: '2, 7', season: '여름' },
  토: { color: '노란·갈색', direction: '중앙', number: '5, 10', season: '환절기' },
  금: { color: '흰색·금색', direction: '서쪽', number: '4, 9', season: '가을' },
  수: { color: '검정·파란색', direction: '북쪽', number: '1, 6', season: '겨울' },
}

const YEAR_FORTUNE: Record<ElementType, string> = {
  목: '올해는 새로운 프로젝트와 계획이 싹트는 시기입니다. 무에서 유를 창조하는 도전을 두려워하지 마세요. 봄처럼 성장의 기운이 강하게 흐릅니다.',
  화: '올해는 활동과 표현이 빛나는 해입니다. 인간관계와 대외 활동이 활발해지며 인정받는 기회가 많아집니다. 내면의 열정을 외부로 표출하는 시기입니다.',
  토: '올해는 안정과 토대를 다지는 해입니다. 섣부른 변화보다 현재를 충실히 하는 것이 유리합니다. 신뢰 기반의 관계가 장기적 성과로 이어집니다.',
  금: '올해는 결실을 거두고 정리하는 시기입니다. 그동안 노력한 것들이 인정받고 보상받는 기운이 흐릅니다. 불필요한 것을 과감히 정리하세요.',
  수: '올해는 내면을 돌아보고 지혜를 축적하는 해입니다. 겉으로 드러나는 성과보다 내면의 깊이를 더하는 시간입니다. 학습과 연구에 투자하세요.',
}

const LOVE_ADVICE: Record<ElementType, string> = {
  목: '상대방의 성장을 응원하고 함께 발전하는 관계를 추구하세요. 자유로운 공간을 허용할 때 관계가 더욱 깊어집니다.',
  화: '감정 표현에 솔직하되 상대방의 템포를 배려하세요. 열정이 때로 상대를 압도할 수 있으니 여유를 갖는 것이 중요합니다.',
  토: '꾸준하고 안정적인 사랑을 추구합니다. 변화보다는 일상의 소소한 행복을 나누는 것이 관계를 단단하게 합니다.',
  금: '명확한 기준과 원칙이 때로 상대를 지치게 할 수 있습니다. 완벽함보다 따뜻함을 보여주는 연습을 하세요.',
  수: '깊고 지적인 유대감을 원합니다. 마음을 쉽게 열지 않는 편이나 진실한 관계에서 깊은 헌신을 보입니다.',
}

const CAREER_ADVICE: Record<ElementType, string> = {
  목: '창업, 교육, 기획, 환경 분야에서 두각을 나타냅니다. 새로운 아이디어를 구현하는 직군이 잘 맞습니다.',
  화: '연예, 마케팅, 영업, 강의 등 사람 앞에 나서는 분야가 적합합니다. 에너지를 발산할 수 있는 환경이 중요합니다.',
  토: '부동산, 중재, 인사, 복지 등 사람과 사람 사이를 연결하는 역할이 맞습니다. 꾸준함으로 신뢰를 쌓는 직군에서 성공합니다.',
  금: '법조, 금융, 의료, 엔지니어링 등 정밀함이 요구되는 분야에서 능력을 발휘합니다. 원칙 있는 전문직이 적합합니다.',
  수: '연구, IT, 철학, 심리, 예술 등 깊은 탐구가 필요한 분야에서 뛰어납니다. 혼자 집중할 수 있는 환경에서 역량이 극대화됩니다.',
}

const HEALTH_ADVICE: Record<ElementType, string> = {
  목: '간과 담, 눈, 근육에 주의하세요. 스트레스를 받으면 소화 기관에 영향이 갑니다. 야외 활동과 스트레칭이 도움이 됩니다.',
  화: '심장과 소장, 혈액순환에 관심을 기울이세요. 흥분을 자주 하면 심장에 무리가 갑니다. 충분한 수면과 명상이 좋습니다.',
  토: '위장과 비장, 소화 기관을 챙기세요. 과식이나 불규칙한 식사를 조심해야 합니다. 규칙적인 식생활이 건강의 핵심입니다.',
  금: '폐와 대장, 피부에 유의하세요. 건조한 환경이나 먼지에 민감할 수 있습니다. 호흡기 건강과 규칙적인 배변 활동이 중요합니다.',
  수: '신장과 방광, 뼈에 관심을 기울이세요. 과로하면 신체 회복이 더딜 수 있습니다. 충분한 수분 섭취와 규칙적인 휴식이 필요합니다.',
}

/** 사주에서 오행 분포를 계산합니다 */
export function calculateElementCounts(saju: SajuResult): ElementCount {
  const counts: ElementCount = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 }

  const pillars = [saju.yearPillar, saju.monthPillar, saju.dayPillar, saju.hourPillar]
  for (const p of pillars) {
    counts[p.stem.element as ElementType]++
    counts[p.branch.element as ElementType]++
  }

  return counts
}

/** 사주 운세 풀이를 생성합니다 */
export function generateFortune(saju: SajuResult): FortuneReading {
  const elementCounts = calculateElementCounts(saju)

  const sorted = (Object.keys(elementCounts) as ElementType[]).sort(
    (a, b) => elementCounts[b] - elementCounts[a]
  )

  const dominantElement = sorted[0]
  const weakElement = sorted[sorted.length - 1]
  // 약한 오행을 생성하는 오행이 행운 오행
  const luckyElement = Object.keys(FIVE_ELEMENTS).find(
    (el) => FIVE_ELEMENTS[el as ElementType].generates === weakElement
  ) as ElementType ?? dominantElement

  const personality = ELEMENT_PERSONALITY[dominantElement]
  const strengths = ELEMENT_STRENGTHS[dominantElement]
  const weaknesses = ELEMENT_WEAKNESSES[dominantElement]
  const luckyItems = LUCKY_ITEMS[luckyElement]

  return {
    elementCounts,
    dominantElement,
    weakElement,
    luckyElement,
    personality,
    strengths,
    weaknesses,
    luckyItems,
    yearFortune: YEAR_FORTUNE[dominantElement],
    loveAdvice: LOVE_ADVICE[dominantElement],
    careerAdvice: CAREER_ADVICE[dominantElement],
    healthAdvice: HEALTH_ADVICE[dominantElement],
    overallMessage: `당신의 사주는 ${FIVE_ELEMENTS[dominantElement].name}의 기운이 강합니다. ${personality[0]}. ${YEAR_FORTUNE[dominantElement]}`,
  }
}
