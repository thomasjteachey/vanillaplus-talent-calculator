import { TalentData } from "../TalentContext";

export type TreeVisual = { background: string; icon: string };
export type TreeVisuals = Record<string, TreeVisual>;

/**
 * Extract tree visuals from an existing TalentData blob.
 * This is used only for background/icon art.
 */
export const getTreeVisualsFromData = (data: TalentData): TreeVisuals => {
  const visuals: TreeVisuals = {};
  for (const treeName of Object.keys(data)) {
    const tree = (data as any)[treeName];
    if (!tree) continue;

    visuals[treeName] = {
      background: tree.background ?? "",
      icon: tree.icon ?? "",
    };
  }
  return visuals;
};
