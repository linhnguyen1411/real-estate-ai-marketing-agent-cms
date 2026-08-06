import assert from 'node:assert/strict';
import {
  getRegisteredLegacyTemplate,
  getRegisteredWorkflowTemplate,
  listMissionRegistryEntries,
} from '../server/modules/mission-engine/domain/missionRegistry';
import { listMissionTemplates } from '../server/agent/missionTemplates';
import { listMissionWorkflowTemplates } from '../server/modules/mission-engine/domain/missionTemplates';
import { PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY } from '../server/modules/mission-engine/domain/publishMissionTemplate';

function testRegistryRegistration() {
  const entries = listMissionRegistryEntries();
  assert.ok(entries.length > 0, 'mission registry must not be empty');

  const ids = new Set<string>();
  for (const entry of entries) {
    assert.ok(!ids.has(entry.id), `duplicate registry id: ${entry.id}`);
    ids.add(entry.id);
  }

  const publish = getRegisteredWorkflowTemplate(PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY);
  assert.ok(publish, 'publish template must be registered in unified registry');

  const legacy = getRegisteredLegacyTemplate('land-fund-buyers-south-danang');
  assert.ok(legacy, 'legacy scan template must be registered in unified registry');
}

function testBackwardCompatibility() {
  const legacy = listMissionTemplates();
  const workflow = listMissionWorkflowTemplates();
  const registry = listMissionRegistryEntries();

  assert.ok(legacy.length > 0, 'legacy templates should remain available');
  assert.ok(workflow.length > 0, 'workflow templates should remain available');
  assert.equal(registry.length, legacy.length + workflow.length, 'registry should include legacy + workflow templates');
}

function main() {
  testRegistryRegistration();
  testBackwardCompatibility();
  console.log('PASS test-mission-registry-unification');
}

main();
