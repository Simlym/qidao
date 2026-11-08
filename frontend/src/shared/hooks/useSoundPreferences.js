import { useEffect, useState } from "react";
import { soundMuted, soundTheme, subscribeSoundPreferences } from "../sounds";

export function useSoundPreferences() {
  const [preferences, setPreferences] = useState(() => ({ muted: soundMuted(), theme: soundTheme() }));
  useEffect(() => {
    const update = () => setPreferences({ muted: soundMuted(), theme: soundTheme() });
    const unsubscribe = subscribeSoundPreferences(update);
    window.addEventListener("storage", update);
    update();
    return () => { unsubscribe(); window.removeEventListener("storage", update); };
  }, []);
  return preferences;
}
