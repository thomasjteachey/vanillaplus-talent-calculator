import { State, TalentData } from "./types";
import { config } from "../config";

export const getTalentRank = (state: State, tree: string, talent: string) => {
  return state[tree][talent];
};

export const getTalentData = (
  data: TalentData,
  tree: string,
  talent: string,
) => {
  return data[tree].talents[talent];
};

const getTreeTalents = (data: TalentData, tree: string) => {
  return data[tree].talents;
};

export const getTreeData = (data: TalentData, tree: string) => {
  return data[tree];
};

export const getTreePointsSpent = (state: State, tree: string) => {
  const ranks = Object.values(state[tree]);
  return ranks.reduce((prev, rank) => {
    return prev + rank;
  }, 0);
};

export const getPointsSpent = (state: State) => {
  const treeNames = Object.keys(state);
  return treeNames.reduce((prev, treeName) => {
    return prev + getTreePointsSpent(state, treeName);
  }, 0);
};

export const getPointsLeft = (state: State) => {
  return config.TOTAL_POINTS - getPointsSpent(state);
};

export const isTalentMaxed = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const talentRank = getTalentRank(state, tree, talent);
  const talentData = getTalentData(data, tree, talent);
  return talentRank === talentData.maxRank;
};

export const areReqPointsMet = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const treePointsSpent = getTreePointsSpent(state, tree);
  const talentData = getTalentData(data, tree, talent);
  return treePointsSpent >= talentData.reqPoints;
};

export const isPrereqMet = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const talentData = getTalentData(data, tree, talent);
  if (talentData.prereq) {
    return isTalentMaxed(state, data, tree, talentData.prereq);
  }
  // TODO: returns true if there is no prereq, could cause problems
  return true;
};

// todo: doesn't consider if there are any remaining points
export const isTalentUnlocked = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const prereqMet = isPrereqMet(state, data, tree, talent);
  const reqPointsMet = areReqPointsMet(state, data, tree, talent);
  return prereqMet && reqPointsMet;
};

const getBasePoints = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const { reqPoints } = getTalentData(data, tree, talent);
  // points gating for a tier should only include strictly lower tiers
  return Object.entries(getTreeTalents(data, tree)).reduce(
    (prev, [talentName, talentData]) => {
      if (talentData.reqPoints < reqPoints) {
        return prev + getTalentRank(state, tree, talentName);
      }
      return prev;
    },
    0,
  );
};

export const getTalentDependents = (
  state: State,
  data: TalentData,
  tree: string,
  talent: string,
) => {
  const rank = getTalentRank(state, tree, talent);
  if (rank <= 0) {
    return [];
  }

  const treeTalents = getTreeTalents(data, tree);
  const nextState: State = {
    ...state,
    [tree]: {
      ...state[tree],
      [talent]: rank - 1,
    },
  };

  return Object.entries(treeTalents).reduce<string[]>(
    (prev, [talentName, talentData]) => {
      const nextRank = getTalentRank(nextState, tree, talentName);
      const { prereq } = talentData;
      const reqPointsMet =
        getBasePoints(nextState, data, tree, talentName) >= talentData.reqPoints;
      const prereqMet = prereq
        ? isTalentMaxed(nextState, data, tree, prereq)
        : true;

      if (nextRank > 0 && (!reqPointsMet || !prereqMet)) {
        prev.push(talentName);
      }
      return prev;
    },
    [],
  );
};
