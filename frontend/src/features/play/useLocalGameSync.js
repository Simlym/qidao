import React from "react";
import { request } from "../../shared/api/client.js";
import { localGames, localOwner, LOCAL_GAMES_CHANGED, uploadLocalGames } from "./localGames.js";
import { useOfflineOwner } from "../../shared/hooks/useOfflineOwner.js";

export function useLocalGameSync(identity) {
  const owner = useOfflineOwner();
  React.useEffect(() => {
    let busy = false;
    const lifetime = new AbortController();
    async function sync() {
      if (busy || lifetime.signal.aborted) return;
      busy = true;
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      lifetime.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 15000);
      try {
        await uploadLocalGames({
          store: localGames(), owner, currentOwner: localOwner,
          verify: () => request("/auth/me", { signal: timeout.signal }),
          upload: (body, signal) => request("/games/sync", { method: "POST", body, signal }),
          signal: timeout.signal,
          onUploaded: (id) => { request(`/games/${id}/analyze`, { method: "POST", body: {} }).catch(() => {}); },
        });
      } catch { /* 保留本机记录，下一次联网或定时重试。 */ }
      finally { clearTimeout(timer); lifetime.signal.removeEventListener("abort", abort); busy = false; }
    }
    sync();
    const interval = setInterval(sync, 30000);
    window.addEventListener("online", sync);
    window.addEventListener(LOCAL_GAMES_CHANGED, sync);
    return () => {
      lifetime.abort(); clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener(LOCAL_GAMES_CHANGED, sync);
    };
  }, [identity, owner]);
}
