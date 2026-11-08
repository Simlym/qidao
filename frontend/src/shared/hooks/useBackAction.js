import React from "react";
import { backDispatcher } from "../../platform/backNavigation";

export function useBackAction(handler, { enabled = true, priority = 0 } = {}) {
  const latest = React.useRef(handler);
  React.useLayoutEffect(() => { latest.current = handler; });
  React.useEffect(() => {
    if (!enabled) return;
    return backDispatcher.register(() => latest.current(), priority);
  }, [enabled, priority]);
}
