import React from "react";

import "./Arrow.css";
import arrowLeft from "../assets/arrows/left.png";
import arrowLeftGold from "../assets/arrows/left--gold.png";
import arrowRight from "../assets/arrows/right.png";
import arrowRightGold from "../assets/arrows/right--gold.png";
import arrowDown from "../assets/arrows/down.png";
import arrowDownGold from "../assets/arrows/down--gold.png";
import arrowRightDown from "../assets/arrows/right-down.png";
import arrowRightDownGold from "../assets/arrows/right-down--gold.png";

import { Position, ArrowDir } from "../TalentContext";

const positionToCoords = (pos: Position) => {
  const row = pos.charCodeAt(0) - "a".charCodeAt(0) + 1;
  const col = Number(pos.slice(1));

  return { row, col };
};

const getGridArea = (from: Position, to: Position) => {
  const { row: fromRow, col: fromCol } = positionToCoords(from);
  const { row: toRow, col: toCol } = positionToCoords(to);

  const rowStart = Math.min(fromRow, toRow);
  const rowEnd = Math.max(fromRow, toRow) + 1;
  const colStart = Math.min(fromCol, toCol);
  const colEnd = Math.max(fromCol, toCol) + 1;

  return `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}`;
};

const imageMap = {
  left: arrowLeft,
  "left--gold": arrowLeftGold,
  right: arrowRight,
  "right--gold": arrowRightGold,
  down: arrowDown,
  "down--gold": arrowDownGold,
  "right-down": arrowRightDown,
  "right-down--gold": arrowRightDownGold,
  "right-down-down": arrowDown,
  "right-down-down--gold": arrowDownGold,
};

interface Props {
  dir: ArrowDir;
  from: Position;
  to: Position;
  active: boolean;
}

export const Arrow: React.FC<Props> = ({ dir, from, to, active }) => {
  const arrowType = `${dir}${active ? "--gold" : ""}` as keyof typeof imageMap;

  return (
    <div
      className={`Arrow-container Arrow-container--${dir}`}
      style={{ gridArea: getGridArea(from, to) }}
    >
      <div
        className={`Arrow Arrow--${dir}`}
        style={{
          backgroundImage: `url(${imageMap[arrowType]})`,
        }}
      />
    </div>
  );
};
