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

  const posToCoords = (pos: Position) => ({
    row: pos.charCodeAt(0) - 96,
    col: Number(pos[1]),
  });

  const fromCoords = posToCoords(from);
  const toCoords = posToCoords(to);

  const rowStart = Math.min(fromCoords.row, toCoords.row);
  const rowEnd = Math.max(fromCoords.row, toCoords.row) + 1;
  const colStart = Math.min(fromCoords.col, toCoords.col);
  const colEnd = Math.max(fromCoords.col, toCoords.col) + 1;

  return (
    <div
      className={`Arrow-container Arrow-container--${dir}`}
      style={{ gridArea: `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}` }}
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
