import { useEffect } from "react";
import { retainSoundOutput } from "../sounds.js";

export function useGameSoundOutput(active = true) {
  useEffect(() => active ? retainSoundOutput() : undefined, [active]);
}
