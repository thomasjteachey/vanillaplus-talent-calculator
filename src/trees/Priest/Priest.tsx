import React from "react";

import { data as fallbackData } from "./data";

import { KlassTrees } from "../../views";
import { createTalentProvider } from "../../TalentContext";
import { useRuntimeTalentData } from "../../hooks/useRuntimeTalentData";

export const Priest: React.FC = () => {
  const { data } = useRuntimeTalentData("Priest", fallbackData);

  const TalentProvider = React.useMemo(
    () => createTalentProvider(data),
    [data],
  );

  return (
    <TalentProvider>
      <KlassTrees klass="Priest" />
    </TalentProvider>
  );
};
