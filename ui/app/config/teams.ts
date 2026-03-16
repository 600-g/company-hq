export interface Team {
  id: string;
  name: string;
  emoji: string;
  repo: string;
  localPath: string;
  status: string;
}

export const teams: Team[] = [
  {
    id: "cpo-claude",
    name: "CPO 클로드",
    emoji: "🧠",
    repo: "company-hq",
    localPath: "~/Developer/my-company/company-hq",
    status: "운영중",
  },
  {
    id: "trading-bot",
    name: "매매봇",
    emoji: "🤖",
    repo: "upbit-auto-trading-bot",
    localPath: "~/Developer/my-company/upbit-auto-trading-bot",
    status: "운영중",
  },
  {
    id: "date-map",
    name: "데이트지도",
    emoji: "🗺️",
    repo: "date-map",
    localPath: "~/Developer/my-company/date-map",
    status: "운영중",
  },
  {
    id: "claude-biseo",
    name: "클로드비서",
    emoji: "🤵",
    repo: "claude-biseo-v1.0",
    localPath: "~/Developer/my-company/claude-biseo-v1.0",
    status: "운영중",
  },
  {
    id: "ai900",
    name: "AI900",
    emoji: "📚",
    repo: "ai900",
    localPath: "~/Developer/my-company/ai900",
    status: "운영중",
  },
  {
    id: "cl600g",
    name: "CL600G",
    emoji: "⚡",
    repo: "cl600g",
    localPath: "~/Developer/my-company/cl600g",
    status: "운영중",
  },
];
