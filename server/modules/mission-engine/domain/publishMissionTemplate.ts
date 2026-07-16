/**
 * Mission template: publish-browser-content
 * Browser-only workflow — no collect/scan steps.
 */

import type { WorkflowPipelineDefinition } from './workflowTypes';

export const PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY = 'publish-browser-content';

export const PUBLISH_BROWSER_CONTENT_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  defaults: { maxAttempts: 2, onFailure: 'stop_workflow' },
  steps: [
    {
      id: 'prepare',
      type: 'browser_prepare',
      enabled: true,
      executionTarget: 'local_worker',
    },
    {
      id: 'navigate',
      type: 'browser_navigate',
      enabled: true,
      dependsOn: ['prepare'],
      executionTarget: 'local_worker',
    },
    {
      id: 'upload',
      type: 'browser_upload_media',
      enabled: true,
      dependsOn: ['navigate'],
      executionTarget: 'local_worker',
    },
    {
      id: 'fill',
      type: 'browser_fill_content',
      enabled: true,
      dependsOn: ['upload'],
      executionTarget: 'local_worker',
    },
    {
      id: 'publish',
      type: 'browser_publish',
      enabled: true,
      dependsOn: ['fill'],
      executionTarget: 'local_worker',
      retry: { maxAttempts: 1, onFailure: 'stop_workflow' },
    },
    {
      id: 'verify',
      type: 'browser_verify_publish',
      enabled: true,
      dependsOn: ['publish'],
      executionTarget: 'local_worker',
    },
    {
      id: 'capture',
      type: 'browser_capture_evidence',
      enabled: true,
      dependsOn: ['verify'],
      executionTarget: 'local_worker',
    },
    {
      id: 'cleanup',
      type: 'browser_cleanup',
      enabled: true,
      dependsOn: ['capture'],
      executionTarget: 'local_worker',
      retry: { onFailure: 'continue' },
    },
  ],
};

export const BROWSER_PUBLISH_STEP_TYPES = PUBLISH_BROWSER_CONTENT_PIPELINE.steps.map(s => s.type);

export function isBrowserPublishPipeline(pipeline: WorkflowPipelineDefinition): boolean {
  return pipeline.steps.some(s => s.type.startsWith('browser_'));
}
