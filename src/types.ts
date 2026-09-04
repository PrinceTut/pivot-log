export interface ResearchStat {
  value: string;
  label: string;
}

export interface ResearchMeta {
  title: string;
  dek: string;
  date: string; // ISO format YYYY-MM-DD, required for correct sort order
  updatedDate?: string;
  stats: ResearchStat[];
  slug: string;
}
