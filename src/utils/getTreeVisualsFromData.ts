import { TalentData } from "../TalentContext";

export type TreeVisuals = Record<string, { background: string; icon: string }>;

export const getTreeVisualsFromData = (data: TalentData): TreeVisuals => {
  const visuals: TreeVisuals = {};
  for (const treeName of Object.keys(data)) {
    const tree = data[treeName];
    visuals[treeName] = {
      background: tree.background,
      icon: tree.icon,
    };
  }
  return visuals;
};
