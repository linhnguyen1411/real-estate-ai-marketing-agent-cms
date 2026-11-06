export type PurchasablePlan = 'pro' | 'enterprise';

export const LICENSE_PLAN_FEATURES: Record<PurchasablePlan, string[]> = {
  pro: [
    'tool.exe',
    'agent.sources',
    'agent.runtime',
    'agent.reports',
    'agent.notifications',
    'lead.intel',
    'crm',
    'investor_leads',
  ],
  enterprise: [
    'tool.exe',
    'agent.*',
    'lead.intel',
    'crm',
    'investor_leads',
    'fb_inbox',
    'automation.*',
    'team.manage',
  ],
};

export const LICENSE_PLAN_MAX_DEVICES: Record<PurchasablePlan, number> = {
  pro: 3,
  enterprise: 10,
};
