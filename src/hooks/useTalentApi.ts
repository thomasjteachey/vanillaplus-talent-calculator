import { useEffect, useState } from "react";
import { config } from "../config";

export type ApiTalentRow = Record<string, unknown>;
export type ApiSpellRow = Record<string, unknown>;

export interface TalentApiResponse {
  talents: ApiTalentRow[];
  spells: ApiSpellRow[];
  error?: string;
}

export function useTalentApi() {
  const [data, setData] = useState<TalentApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(config.TALENT_API_URL, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Talent API HTTP ${res.status}`);
        }

        const json = (await res.json()) as TalentApiResponse;

        if (json.error) {
          throw new Error(json.error);
        }

        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
