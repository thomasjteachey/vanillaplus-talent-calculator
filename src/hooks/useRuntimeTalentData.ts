import { useMemo } from "react";

import { TalentData } from "../TalentContext";
import { useTalentApi } from "./useTalentApi";
import { buildTalentDataFromApi } from "../utils/buildTalentDataFromApi";

/**
 * Backwards compatible signature:
 *   useRuntimeTalentData("Druid", fallbackData)
 *
 * The fallback argument is intentionally ignored for data building.
 * It's kept ONLY so you don't have to edit every class component.
 *
 * "No flash" behavior:
 * - While loading / before API returns, returns empty data so the
 *   previous class's trees don't render.
 */
export const useRuntimeTalentData = (
  klass: string,
  _fallbackForVisuals?: TalentData
) => {
  const { data: api, loading, error } = useTalentApi(klass);

  const data = useMemo(() => {
    if (!api || loading) return {} as TalentData;

    try {
      return buildTalentDataFromApi(api as any);
    } catch {
      return {} as TalentData;
    }
  }, [api, loading]);

  return {
    data,
    loading,
    error,
    isFallback: !api || !!error,
  };
};
