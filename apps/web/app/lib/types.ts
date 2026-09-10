export type Project = {
  id: number;
  name: string;
  description: string;
  genre: string;
  rules: string;
  episode_goal?: number;
};
export type Episode = { id: number; project_id: number; number: number; title: string; summary: string; content: string; updated_at: string };
export type Item = {
  id: number;
  name?: string;
  title?: string;
  role?: string;
  personality?: string;
  description?: string;
  status?: string;
  entity_type?: string;
  objective?: string;
  conflict?: string;
  setup_episode?: number | null;
  payoff_episode?: number | null;
};
export type TimelineEvent = { id: number; project_id: number; episode_number: number; title: string; world_time: string; description: string };
