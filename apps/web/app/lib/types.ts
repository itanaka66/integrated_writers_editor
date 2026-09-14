export type Project = {
  id: number;
  name: string;
  description: string;
  genre: string;
  rules: string;
  episode_goal?: number;
  style_guide: string;
};
export type Episode = { id: number; project_id: number; number: number; title: string; summary: string; content: string; updated_at: string };
export type Memo = { id: number; project_id: number; category: string; title: string; content: string; created_at: string };
export type Source = { id: number; episode_id: number; project_id: number; title: string; url: string; note: string; created_at: string };
export type Template = { id: number; project_id: number; name: string; structure: string; created_at: string };
