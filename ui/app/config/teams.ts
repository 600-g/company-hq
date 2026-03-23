export interface Team {
  id: string;
  name: string;
  emoji: string;
  repo: string;
  localPath: string;
  status: string;
  siteUrl?: string;
  githubUrl?: string;
}

export const defaultTeams: Team[] = [
  {
    id: "server-monitor",
    name: "서버실",
    emoji: "🖥",
    repo: "company-hq",
    localPath: "~/Developer/my-company/company-hq",
    status: "운영중",
    siteUrl: "https://600g.net",
    githubUrl: "https://github.com/600-g/company-hq",
  },
  {
    id: "cpo-claude",
    name: "CPO 클로드",
    emoji: "🧠",
    repo: "company-hq",
    localPath: "~/Developer/my-company/company-hq",
    status: "운영중",
    githubUrl: "https://github.com/600-g/company-hq",
  },
  {
    id: "trading-bot",
    name: "매매봇",
    emoji: "🤖",
    repo: "upbit-auto-trading-bot",
    localPath: "~/Developer/my-company/upbit-auto-trading-bot",
    status: "운영중",
    githubUrl: "https://github.com/600-g/upbit-auto-trading-bot",
  },
  {
    id: "date-map",
    name: "데이트지도",
    emoji: "🗺️",
    repo: "date-map",
    localPath: "~/Developer/my-company/date-map",
    status: "운영중",
    githubUrl: "https://github.com/600-g/date-map",
  },
  {
    id: "claude-biseo",
    name: "클로드비서",
    emoji: "🤵",
    repo: "claude-biseo-v1.0",
    localPath: "~/Developer/my-company/claude-biseo-v1.0",
    status: "운영중",
    githubUrl: "https://github.com/600-g/claude-biseo-v1.0",
  },
  {
    id: "ai900",
    name: "AI900",
    emoji: "📚",
    repo: "ai900",
    localPath: "~/Developer/my-company/ai900",
    status: "운영중",
    siteUrl: "https://ai900.600g.net",
    githubUrl: "https://github.com/600-g/ai900",
  },
  {
    id: "cl600g",
    name: "CL600G",
    emoji: "⚡",
    repo: "cl600g",
    localPath: "~/Developer/my-company/cl600g",
    status: "운영중",
    githubUrl: "https://github.com/600-g/cl600g",
  },
  {
    id: "design-team",
    name: "디자인팀",
    emoji: "🎨",
    repo: "design-team",
    localPath: "~/Developer/my-company/design-team",
    status: "운영중",
    githubUrl: "https://github.com/600-g/design-team",
  },
  {
    id: "content-lab",
    name: "콘텐츠랩",
    emoji: "🔬",
    repo: "content-lab",
    localPath: "~/Developer/my-company/content-lab",
    status: "운영중",
    githubUrl: "https://github.com/600-g/content-lab",
  },
  {
    id: "frontend-team",
    name: "프론트엔드",
    emoji: "🖼",
    repo: "frontend-team",
    localPath: "~/Developer/my-company/frontend-team",
    status: "운영중",
    githubUrl: "https://github.com/600-g/frontend-team",
  },
  {
    id: "backend-team",
    name: "백엔드",
    emoji: "⚙️",
    repo: "backend-team",
    localPath: "~/Developer/my-company/backend-team",
    status: "운영중",
    githubUrl: "https://github.com/600-g/backend-team",
  },
];

// 하위 호환: 기존 `teams` import 유지
export const teams = defaultTeams;
