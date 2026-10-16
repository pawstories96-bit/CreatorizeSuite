export type Shot = {
  id: string;
  title: string;
  start: number;
  end: number;
  narration: string;
  scene: any;
  status: string;
  qa?: any;
};
export type Project = {
  id: string;
  title: string;
  topic: string;
  direction: string;
  style: string;
  baseStyle?: string;
  styleParams?: any;
  look: string;
  format: string;
  language: string;
  targetLengthSec: number;
  channelId: string | null;
  status: string;
  createdAt: string;
  kanbanStage?: string;
  workspaceId?: string;
  updatedAt: string;
  script: string;
  research: string;
  shots: Shot[];
  words: { w: string; start: number; end: number }[];
  notes: any[];
  pipeline: Record<string, string>;
  audio?: string;
  sourceVideo?: string;
  cameraCuts?: any[];
  sourceTranscript?: string;
  references?: any[];
  scriptSettings?: { mode: string; banned: string[]; required: string[]; maxSentenceWords: number };
  scriptingSkill?: { name: string; text: string };
  mix?: string;
  mixReport?: { ambience: string; levelDb: number; targetLUFS: number };
  durationSec?: number;
  thumbnail?: string;
  lastExport?: string;
  metadata?: any;
  quality?: string;
  timingSource?: string;
  agent?: { provider: string; model: string; effort: string } | null;
  needsReview?: boolean;
  timeline?: { cues: any[]; cards: any[]; audio: any[] };
};
export type Job = {
  id: string;
  projectId: string;
  action: string;
  status: string;
  progress: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  events: { type: string; text: string; at: string }[];
  error?: string;
  displayError?: string;
  commit?: string;
  comparisons?: {
    shotId: string;
    title: string;
    time: number;
    before: string;
    after: string;
  }[];
  output?: string;
  usage?: any;
  size?: number;
  resolution?: string;
  provider?: string;
  model?: string;
  effort?: string;
  estimatedCost?: number;
  runs?: {
    provider: string;
    role: string;
    model: string;
    durationMs: number;
    usage: any;
    estimatedCost?: number;
  }[];
};
export type State = {
  projects: Project[];
  jobs: Job[];
  channels: any[];
  memory: any[];
  memoryProposals?: any[];
  styles: any[];
  routines: any[];
  thumbnails: any[];
  boards: any[];
  uploads: any[];
  learnings: any[];
  settings: any;
  workspace: string;
  activeWorkspace?: string;
  workspaces?: { id: string; name: string }[];
  catalogs?: any[];
  characters?: any[];
};
export const emptyState: State = {
  projects: [],
  jobs: [],
  channels: [],
  memory: [],
  styles: [],
  routines: [],
  thumbnails: [],
  boards: [],
  uploads: [],
  learnings: [],
  settings: {},
  workspace: "",
};
export const time = (n = 0) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export const ago = (s: string) => {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(s).getTime()) / 60000),
  );
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : new Date(s).toLocaleDateString();
};
export async function api(url: string, method = "GET", body?: any) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
export const media = (p: Project, file?: string) =>
  file ? `/media/${p.id}/${file}` : undefined;
