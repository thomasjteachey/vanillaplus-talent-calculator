import { useMemo } from "react";

import { TalentData } from "../TalentContext";
import { useTalentApi } from "./useTalentApi";
import { getTreeVisualsFromData, TreeVisuals } from "../utils/getTreeVisualsFromData";
import { buildTalentDataFromApi } from "../utils/buildTalentDataFromApi";

/**
 * Runtime TalentData builder that:
 * - uses DBC-like fields (TierId, ColumnIndex, prereq_talent, prereq_rank)
 * - whitelists talents by the existing class data.ts so you don't mix classes
 * - infers tree membership from the existing class data.ts
 */
export const useRuntimeTalentData = (klass: string, fallback: TalentData) => {
  const { data: api, loading, error } = useTalentApi();

  const visuals = useMemo((): TreeVisuals => {
    const v = getTreeVisualsFromData(fallback);
    const firstTreeName = Object.keys(v)[0];

    // Fallback should always have at least one tree,
    // but we provide a safe default so TS is happy.
    const unknown =
      (firstTreeName && v[firstTreeName]) || { background: "", icon: "" };

    return {
      ...v,
      Unknown: unknown,
    };
  }, [fallback]);

  const data = useMemo(() => {
    if (!api) return fallback;

    try {
      return buildTalentDataFromApi(api, fallback, visuals);
    } catch {
      return fallback;
    }
  }, [api, fallback, visuals]);

  return {
    data,
    loading,
    error,
    isFallback: !api || !!error,
  };
};
