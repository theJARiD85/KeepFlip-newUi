import {
  createCrosslistingAutomationPlan,
  type CrosslistingAutomationInput,
  type CrosslistingAutomationPlan,
} from '@/services/crosslisting-automation-plan';

/** Hand the same generated run to the visible marketplace WebView host. */
export function dispatchToAutomationEngine(
  input: CrosslistingAutomationInput,
  openVisibleWebView: (plan: CrosslistingAutomationPlan) => void,
) {
  openVisibleWebView(createCrosslistingAutomationPlan(input));
}
