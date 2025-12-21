import { useEffect, useRef, useState } from "react";
import { config } from "../config";

export type ApiTalentRow = Record<string, unknown>;
export type ApiSpellRow = Record<string, unknown>;
export type ApiTabRow = Record<string, unknown>;
export type ApiDurationRow = Record<string, unknown>;
export type ApiDescVarRow = Record<string, unknown>;

export interface TalentApiResponse {
  talents: ApiTalentRow[];
  spells: ApiSpellRow[];
  tabs?: ApiTabRow[];
  durations?: ApiDurationRow[];
  descVars?: ApiDescVarRow[];
  castTimes?: ApiDurationRow[];
  ranges?: ApiDurationRow[];
  error?: string;
}

const withQuery = (url: string, params: Record<string, string>) => {
  const hasQ = url.includes("?");
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return url + (hasQ ? "&" : "?") + q;
};

/**
 * Fetches live talent DBC data.
 *
 * "No flash" behavior:
 * - When klass changes, clear the previous payload immediately
 *   so the UI doesn't render the old class while the new request is in flight.
 */
export function useTalentApi(klass?: string) {
  const [data, setData] = useState<TalentApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const lastKlassRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (lastKlassRef.current !== klass) {
      lastKlassRef.current = klass;
      setData(null);
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const url = klass
          ? withQuery(config.TALENT_API_URL, { klass })
          : config.TALENT_API_URL;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Talent API HTTP ${res.status}`);

        const json = (await res.json()) as TalentApiResponse;
        if (json.error) throw new Error(json.error);

        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [klass]);

  return { data, loading, error };
}
