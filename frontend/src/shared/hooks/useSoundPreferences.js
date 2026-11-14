import { useEffect, useState } from "react";
import { soundMuted, soundTheme, soundKeepAlive, subscribeSoundPreferences } from "../sounds";

const readPreferences = () => ({ muted: soundMuted(), theme: soundTheme(), keepAlive: soundKeepAlive() });

export function useSoundPreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    const update = () => setPreferences(readPreferences());
    const unsubscribe = subscribeSoundPreferences(update);
    window.addEventListener("storage", update);
    update();
    return () => { unsubscribe(); window.removeEventListener("storage", update); };
  }, []);
  return preferences;
}
