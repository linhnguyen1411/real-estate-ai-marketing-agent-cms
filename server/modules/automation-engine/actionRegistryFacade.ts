/**
 * ActionRegistry facade — wraps social-publishing action registry.
 * Automation Engine entry point; action implementations unchanged.
 */

import {
  getAutomationAction,
  getAutomationActionRegistration,
  isAutomationActionImplemented,
  listAutomationActions,
  registerAutomationAction,
  type AutomationActionKey,
} from '../social-publishing/browser/actions';

export const ActionRegistry = {
  register: registerAutomationAction,
  get: getAutomationAction,
  getRegistration: getAutomationActionRegistration,
  list: listAutomationActions,
  isImplemented: isAutomationActionImplemented,
  keys: (): AutomationActionKey[] => listAutomationActions().map(r => r.key),
};
