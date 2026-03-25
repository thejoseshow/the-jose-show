"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CONFIG,
  generateCSSVariables,
  type WhiteLabelConfig,
} from "@/lib/white-label";

interface WhiteLabelContextValue {
  config: WhiteLabelConfig;
  loading: boolean;
}

const WhiteLabelContext = createContext<WhiteLabelContextValue>({
  config: DEFAULT_CONFIG,
  loading: true,
});

export function WhiteLabelProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WhiteLabelConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.data) {
            setConfig(json.data);
          }
        }
      } catch {
        // Fall back to default config silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Inject CSS variables whenever config changes
  useEffect(() => {
    const css = generateCSSVariables(config);
    let styleEl = document.getElementById("wl-theme") as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "wl-theme";
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `:root { ${css} }`;

    return () => {
      styleEl?.remove();
    };
  }, [config]);

  return (
    <WhiteLabelContext.Provider value={{ config, loading }}>
      {children}
    </WhiteLabelContext.Provider>
  );
}

export function useWhiteLabel(): WhiteLabelContextValue {
  return useContext(WhiteLabelContext);
}
