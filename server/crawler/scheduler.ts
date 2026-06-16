import cron, { ScheduledTask } from 'node-cron';
import { getActiveCrawlerJobs } from '../dbHelper';
import { runCrawlerJob } from './crawlerService';

const scheduledTasks = new Map<string, ScheduledTask>();
const runningJobs = new Set<string>();

function intervalToCron(minutes: number) {
  const safeMinutes = Math.max(5, Math.min(minutes, 24 * 60));
  if (safeMinutes < 60) {
    return `*/${safeMinutes} * * * *`;
  }
  const hours = Math.max(1, Math.round(safeMinutes / 60));
  return `0 */${hours} * * *`;
}

async function executeJob(jobId: string) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  try {
    console.log(`[CRAWLER] Auto-run job ${jobId}`);
    const summary = await runCrawlerJob(jobId);
    console.log(`[CRAWLER] Job ${jobId}: ${summary.message}`);
  } catch (error: any) {
    console.error(`[CRAWLER] Job ${jobId} failed:`, error.message || error);
  } finally {
    runningJobs.delete(jobId);
  }
}

export function scheduleCrawlerJob(job: { id: string; run_interval_minutes: number; status: string }) {
  unscheduleCrawlerJob(job.id);
  if (job.status !== 'active') return;

  const expression = intervalToCron(job.run_interval_minutes);
  const task = cron.schedule(expression, () => {
    executeJob(job.id);
  });
  scheduledTasks.set(job.id, task);
}

export function unscheduleCrawlerJob(jobId: string) {
  const existing = scheduledTasks.get(jobId);
  if (existing) {
    existing.stop();
    scheduledTasks.delete(jobId);
  }
}

export function reloadCrawlerScheduler() {
  scheduledTasks.forEach(task => task.stop());
  scheduledTasks.clear();

  const jobs = getActiveCrawlerJobs();
  jobs.forEach(job => scheduleCrawlerJob(job));
  console.log(`[CRAWLER] Scheduler loaded ${jobs.length} active job(s)`);
}

export function initCrawlerScheduler() {
  reloadCrawlerScheduler();
}
