import React, { useEffect, useRef } from "react";
import { withRouter, matchPath, RouteComponentProps } from "react-router-dom";

import "./KlassTrees.css";
import { config } from "../config";
import {
  useTalentContext,
  getPointsLeft,
  getTreePointsSpent,
  getStateFromHash,
  getHashFromState,
} from "../TalentContext";
import { TalentTree } from "../components/TalentTree";
import { ClearButton } from "../components/ClearButton";

interface Props extends RouteComponentProps {
  klass: string;
}

export const KlassTrees = withRouter<Props, React.FC<Props>>(
  ({ klass, location, history }) => {
    const { state, data, resetAll, restoreState } = useTalentContext();
    const restoredHash = useRef<string | null>(null);

    const pointsLeft = getPointsLeft(state);
    const treeNames = Object.keys(data);
    const treePointsSpent = treeNames
      .map(treeName => getTreePointsSpent(state, treeName))
      .join("/");

    const requiredLevel =
      config.TOTAL_POINTS - pointsLeft + config.FIRST_POINT_LEVEL - 1;

    // TODO: move this into a hook?
    useEffect(() => {
      if (treeNames.length === 0) return;

      const match = matchPath<{ skills: string }>(location.pathname, {
        path: "/:klass/:skills",
      });
      const hash = match && match.params && match.params.skills;

      if (hash && restoredHash.current !== hash) {
        restoreState(getStateFromHash(data, hash));
        restoredHash.current = hash;
      }
    }, [data, location.pathname, restoreState, treeNames.length]);

    useEffect(() => {
      const klassMatch = matchPath<{ klass: string }>(location.pathname, {
        path: "/:klass",
      });
      const klass = klassMatch && klassMatch.params && klassMatch.params.klass;

      const hashMatch = matchPath<{ skills: string }>(location.pathname, {
        path: "/:klass/:skills",
      });
      const urlHash = hashMatch && hashMatch.params && hashMatch.params.skills;

      const skillHash = getHashFromState(state);

      if (skillHash) {
        history.replace(`/${klass}/${skillHash}`);
      } else if (!urlHash || restoredHash.current) {
        history.replace(`/${klass}`);
      }
    }, [history, location.pathname, state]);

    return (
      <div className="KlassTrees-container">
        <div className="KlassTrees">
          <div className="KlassTrees-header">
            <div className="KlassTrees-titleArea">
              <h1>
                {klass} {treePointsSpent}
              </h1>
              <p className="KlassTrees-summary">
                Required level: {requiredLevel >= 10 ? requiredLevel : "-"}
              </p>
              <p className="KlassTrees-summary">Points left: {pointsLeft}</p>
            </div>
            <ClearButton onClick={() => resetAll()}>Clear all</ClearButton>
          </div>
          <div className="KlassTrees-list">
            {treeNames.map(name => (
              <TalentTree key={name} name={name} />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
