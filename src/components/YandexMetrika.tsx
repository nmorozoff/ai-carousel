import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const METRIKA_ID = 107233398;

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
  }
}

/** Отслеживает переходы в SPA для Яндекс Метрики */
export function YandexMetrika() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.ym === "function") {
      window.ym(METRIKA_ID, "hit", window.location.href);
    }
  }, [location.pathname]);

  return null;
}
