export type Project = {
  id: number;
  name: string;
  description: string;
  genre: string;
  rules: string;
  episode_goal?: number;
};
export type Episode = { id: number; project_id: number; number: number; title: string; summary: string; content: string; updated_at: string };
