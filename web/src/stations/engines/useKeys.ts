import { useEffect, useRef } from "react";
export function useKeys() {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const pressed = new Map<string, number>(),
      releases = new Map<string, ReturnType<typeof setTimeout>>();
    const event = (e: Event) => {
      const { key, up } = (e as CustomEvent<{ key: string; up: boolean }>)
          .detail,
        k = key.toLowerCase();
      const previous = releases.get(k);
      if (previous) {
        clearTimeout(previous);
        releases.delete(k);
      }
      if (!up) {
        if (!keys.current.has(k)) pressed.set(k, performance.now());
        keys.current.add(k);
        return;
      }
      const delay = Math.max(
        0,
        65 - (performance.now() - (pressed.get(k) ?? 0)),
      );
      if (delay)
        releases.set(
          k,
          setTimeout(() => {
            keys.current.delete(k);
            pressed.delete(k);
            releases.delete(k);
          }, delay),
        );
      else {
        keys.current.delete(k);
        pressed.delete(k);
      }
    };
    const blur = () => {
      keys.current.clear();
      pressed.clear();
      for (const timer of releases.values()) clearTimeout(timer);
      releases.clear();
    };
    window.addEventListener("station:key", event);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("station:key", event);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, []);
  return keys;
}
