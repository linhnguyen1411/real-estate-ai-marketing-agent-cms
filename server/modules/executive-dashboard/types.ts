/**
 * H0.5 — Executive AI Operations Dashboard snapshot
 * Compose-only from existing modules. Does not touch Runtime/Fleet/Scanner cores.
 */

export type ExecutiveTask = {
  id: string;
  title: string;
  status: 'done' | 'running' | 'waiting' | 'idle';
  progress: number;
  durationLabel: string;
  machine: string;
};

export type ExecutiveAttention = {
  severity: 'red' | 'yellow' | 'green';
  text: string;
};

export type ExecutiveCampaignCard = {
  name: string;
  status: string;
  buyers: number;
  roi: string;
  pipelineTy: number;
  content: number;
  publishing: string;
};

export type ExecutiveFunnel = {
  scanned: number;
  candidates: number;
  aiReviewed: number;
  qualified: number;
  sales: number;
  appointments: number;
  won: number;
};

export type ExecutiveSnapshot = {
  version: 'h05_executive_v1';
  today: {
    health: number;
    aiStatus: string;
    campaign: string;
    buyer: number;
    qualified: number;
    appointments: number;
    pipelineTy: number;
    expectedRevenueTy: number;
  };
  aiDoing: {
    active: ExecutiveTask[];
    waitingApproval: ExecutiveTask[];
  };
  funnel: ExecutiveFunnel;
  campaigns: ExecutiveCampaignCard[];
  attention: ExecutiveAttention[];
  recommendations: string[];
  opsMini: Array<{ label: string; value: string; href: string }>;
};
