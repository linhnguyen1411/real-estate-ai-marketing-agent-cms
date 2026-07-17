import type { AutomationAction, AutomationActionKey, AutomationActionRegistration } from './types';
import { AUTOMATION_ACTION_KEYS } from './types';
import { STUB_AUTOMATION_ACTIONS } from './stubs';

const registrations = new Map<AutomationActionKey, AutomationActionRegistration>();

function register(reg: AutomationActionRegistration): void {
  registrations.set(reg.key, reg);
}

function bootstrapDefaults(): void {
  if (registrations.size > 0) return;

  for (const action of STUB_AUTOMATION_ACTIONS) {
    register({
      key: action.key,
      label: action.label,
      action,
      implemented: false,
    });
  }
}

/** Register or replace an action (e.g. PublishAction bound to a destination host). */
export function registerAutomationAction(
  action: AutomationAction,
  implemented = true,
): void {
  bootstrapDefaults();
  register({
    key: action.key,
    label: action.label,
    action,
    implemented,
  });
}

export function getAutomationAction(key: AutomationActionKey): AutomationAction | undefined {
  bootstrapDefaults();
  return registrations.get(key)?.action;
}

export function getAutomationActionRegistration(
  key: AutomationActionKey,
): AutomationActionRegistration | undefined {
  bootstrapDefaults();
  return registrations.get(key);
}

export function listAutomationActions(): AutomationActionRegistration[] {
  bootstrapDefaults();
  return AUTOMATION_ACTION_KEYS.map(key => {
    const reg = registrations.get(key);
    if (!reg) {
      throw new Error(`Automation action not registered: ${key}`);
    }
    return reg;
  });
}

export function isAutomationActionImplemented(key: AutomationActionKey): boolean {
  return getAutomationActionRegistration(key)?.implemented === true;
}

/** Test-only */
export function _resetAutomationActionRegistryForTests(): void {
  registrations.clear();
}
