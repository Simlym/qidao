import React from "react";
import { offlineOwner } from "../offlineIdentity.js";
import { SESSION_CHANGED } from "../api/session.js";

function subscribe(listener) {
  window.addEventListener(SESSION_CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SESSION_CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useOfflineOwner() {
  return React.useSyncExternalStore(subscribe, offlineOwner);
}
