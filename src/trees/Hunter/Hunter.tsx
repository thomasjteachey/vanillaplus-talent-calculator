import React from "react";

import { data as fallbackData } from "./data";

import { KlassTrees } from "../../views";
import { createTalentProvider } from "../../TalentContext";
import { useRuntimeTalentData } from "../../hooks/useRuntimeTalentData";

export const Hunter: React.FC = () => {
  const { data } = useRuntimeTalentData("Hunter", fallbackData);

  const TalentProvider = React.useMemo(
    () => createTalentProvider(data),
    [data],
  );

  return (
    <TalentProvider>
      <KlassTrees klass="Hunter" />
    </TalentProvider>
  );
};
