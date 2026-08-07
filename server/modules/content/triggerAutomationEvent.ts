import type { AutomationTask } from '../../../src/types';

export function triggerAutomationEvent(event: string, detail: string, db: any) {
  const now = new Date().toISOString();
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active' && auto.trigger_event.toLowerCase().includes(event.toLowerCase())) {
      const logMsg = `${now} - Triggered by event: [${detail}] - Executed successfully.`;
      return {
        ...auto,
        last_run: now,
        run_count: auto.run_count + 1,
        logs: [logMsg, ...auto.logs].slice(0, 20) // Keep last 20 logs
      };
    }
    return auto;
  });
}
