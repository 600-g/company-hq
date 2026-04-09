# 두근컴퍼니 디자인 시스템
> 모든 에이전트가 UI/디자인 작업 시 참고하는 공통 규칙

---

## 브랜드

- **이름**: (주)두근 컴퍼니
- **도메인**: 600g.net
- **톤**: 게임 같은 사무실, 따뜻하고 귀여운 전문성

---

## 색상 팔레트

### 기본
| 용도 | 색상 | HEX |
|------|------|-----|
| 배경 (메인) | 진한 남색 | `#1a1a2e` |
| 배경 (카드) | 더 진한 남색 | `#0f0f1f` |
| 배경 (입력) | 중간 남색 | `#12122a` |
| 테두리 | 보라빛 회색 | `#2a2a5a` / `#3a3a5a` |

### 강조
| 용도 | 색상 | Tailwind |
|------|------|----------|
| 주요 액션 | 노란색 | `yellow-400` / `#f5c842` |
| 성공/정상 | 초록색 | `green-400` / `#50d070` |
| 위험/오류 | 빨간색 | `red-400` / `red-500` |
| 정보/링크 | 파란색 | `blue-400` / `#60a0e0` |
| 보조 | 보라색 | `purple-400` |

### 상태 표시
| 상태 | 색상 | 설명 |
|------|------|------|
| 작업중 | `yellow-400` + animate-pulse | 노란 점 깜빡 |
| 정상 | `green-400` | 초록 점 |
| 대기 | `gray-500` | 회색 점 |
| 오류/끊김 | `red-400` + animate-pulse | 빨간 점 깜빡 |

---

## 타이포그래피

- **본문**: `Pretendard Variable`, system-ui 폴백
- **코드**: `'SF Mono', Consolas, monospace`
- **크기 기준** (Tailwind):
  - 제목: `text-sm` (14px)
  - 본문: `text-[11px]` ~ `text-xs` (11~12px)
  - 라벨/태그: `text-[9px]` ~ `text-[10px]`
  - 미세 정보: `text-[7px]` ~ `text-[8px]`
- **해상도**: 고DPI 텍스트는 `resolution: DPR * 2`

---

## 컴포넌트 패턴

### 카드
```
bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2
```

### 버튼 (주요)
```
bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded
hover:bg-yellow-500/20 transition-colors
text-[9px] px-2 py-0.5
```

### 버튼 (보조)
```
bg-[#2a2a3a] text-gray-400 border border-[#3a3a5a] rounded
hover:bg-[#3a3a4a] transition-colors
```

### 입력
```
bg-[#1a1a2e] border border-[#3a3a5a] text-white rounded
focus:outline-none focus:border-yellow-400/50
```

### 팝업/모달
```
fixed inset-0 z-[100] bg-black/70 flex items-center justify-center
내부: bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl
```

### 드래그 윈도우 (채팅)
```
fixed bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl
타이틀바: bg-[#1a1a3a] border-b border-[#2a2a5a] cursor-move
```

---

## 픽셀아트 스타일 (Phaser 게임)

### 캐릭터
- 프레임: 16×32px (LimeZu 기반)
- 4방향: front(0), left(row1), right(row2), back(row3)
- 스프라이트시트: 7열 × 6행
- 스케일: 1.0 (기본), 1.5 (CPO 솔로)

### 사무실 색상 (Phaser hex)
| 용도 | HEX |
|------|-----|
| 야간 하늘 | `0x050918` |
| 주간 하늘 | `0x2888c8` |
| 금색 강조 | `0xf5c842` |
| 피부톤 | `0xfcd9a8` |
| 건물 회색 | `0x3a4a5a` ~ `0x7a8a9a` |
| 서버실 바닥 | `0x1e1e2e` |
| LED 초록 | `0x40d080` |
| LED 파랑 | `0x40a0d0` |

### depth 규칙 (등맞대기 2×2 배치)
```
d1: 윗줄 캐릭 (뒷모습, 가장 뒤)
d2: 윗줄 책상
d3: 윗줄 모니터뒤
d4: 아랫줄 모니터정면
d5: 아랫줄 책상
d6: 아랫줄 캐릭 (정면, 가장 앞)
※ container.sort("depth") 필수
※ 팀 간: container.setDepth(gridY + 10)
```

### 오리지널 에셋 (Pixel Forge)
- 위치: `assets/original/office/`
- 생성기: `tools/pixel_forge_office.py`
- 종류: 노트북, 모니터, 의자, 책장, 서버랙, 화이트보드, 정수기, 커피머신, 에어컨, 소화기 등 19종

---

## 반응형

- **PC** (md 이상): 사이드 패널 300px + 게임 영역
- **모바일**: 전체 화면, 채팅은 풀스크린 오버레이
- 게임 스케일: `Phaser.Scale.FIT` + `Math.min(dpr, 3)`

---

## AI 이미지 생성 (Gemini MCP)

디자인팀은 `mcp__gemini-image__generate_image` 도구로 이미지를 생성할 수 있다.

### 사용법
```
mcp__gemini-image__generate_image(
  prompt: "설명 (영문 권장)",
  output_directory: "저장 경로",
  file_name: "파일명 (확장자 없이)",
  target_image_max_size: 512,        # 최대 픽셀 (긴 변 기준)
  force_conversion_type: "png",      # png/jpeg/webp
  input_image_paths: ["참조이미지"]   # 선택: 레퍼런스 기반 생성
)
```

### 용도
| 용도 | 프롬프트 예시 | 저장 경로 |
|------|-------------|----------|
| 픽셀아트 에셋 | "16x32 pixel art character, office worker, front view" | `ui/public/assets/original/` |
| UI 아이콘 | "minimal flat icon, dark background, neon green" | `ui/public/assets/icons/` |
| 로고/브랜딩 | "minimalist logo, gaming company, dark navy" | `ui/public/assets/brand/` |
| 배경/일러스트 | "isometric pixel art office, night, warm lighting" | `ui/public/assets/bg/` |
| 참조 기반 변형 | input_image_paths로 원본 전달 + 변형 지시 | 원본과 같은 경로 |

### 품질 규칙
- 프롬프트는 **영문** 권장 (AI 품질 향상)
- 픽셀아트는 `target_image_max_size: 128` 이하로 (확대 시 선명)
- UI용 이미지는 `png`, 배경은 `webp` (용량 최적화)
- 생성 후 반드시 `DESIGN.md` 팔레트와 색상 일관성 확인
- 에셋 3MB 초과 금지

---

## 터미널 UI 디자인 (v2 추가)

### 채팅 윈도우 스타일
```
헤더: 신호등(●●●) + 팀이모지+이름 + 스펙아이콘 + 모델뱃지(opus/sonnet)
배경: #080818 (콘텐츠) / #0f0f1f (헤더)
폰트: SF Mono, JetBrains Mono (모노폰트)
메시지: 유저=파랑계열 왼쪽바, AI=초록계열 왼쪽바
```

### 모델 뱃지 색상
| 모델 | 배경 | 텍스트 | 테두리 |
|------|------|--------|--------|
| opus | #2a1a4a | #a080f0 | #4a2a7a |
| sonnet | #1a2a3a | #60a0e0 | #2a4a6a |

---

## 금지 사항

- 하드코딩 색상 → 위 팔레트 사용
- 폰트 크기 12px 이상 (제목 제외) → 작고 깔끔하게
- 흰 배경 → 항상 다크 모드
- 에셋 > 3MB → 최적화 필수 (배포 전 용량 체크)
- 이모지 남발 → 상태 표시용으로만 절제
