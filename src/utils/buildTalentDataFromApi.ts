import { Position, ArrowDir, TalentData } from "../TalentContext";
import { TreeVisuals } from "./getTreeVisualsFromData";

type ApiTalentRow = Record<string, unknown>;
type ApiSpellRow = Record<string, unknown>;

const ROW_LETTERS = ["a", "b", "c", "d", "e", "f", "g"] as const;

const toNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toPosExact = (tier: number, col: number): Position => {
  const rowLetter = ROW_LETTERS[tier] ?? "a";
  const colNum = Math.min(Math.max(col + 1, 1), 4);
  return `${rowLetter}${colNum}` as Position;
};

const getField = (row: ApiTalentRow, candidates: string[]) => {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null) return row[c];
  }
  return undefined;
};

const collectRankSpellIds = (talentRow: ApiTalentRow): number[] => {
  const keys = Object.keys(talentRow);

  const rankKeys = keys
    .filter((k) => /^SpellRank_?\d+$/.test(k))
    .sort((a, b) => {
      const na = Number(a.match(/\d+$/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+$/)?.[0] ?? 0);
      return na - nb;
    });

  const ids: number[] = [];
  for (const k of rankKeys) {
    const v = toNumber(talentRow[k]);
    if (v > 0) ids.push(v);
  }
  return ids;
};

const buildNameToTreeMap = (fallback: TalentData) => {
  const map = new Map<string, string>();
  for (const treeName of Object.keys(fallback)) {
    const talents = fallback[treeName]?.talents ?? {};
    for (const talentName of Object.keys(talents)) {
      map.set(talentName, treeName);
    }
  }
  return map;
};

const buildAllowedNames = (fallback: TalentData) => {
  const set = new Set<string>();
  for (const treeName of Object.keys(fallback)) {
    for (const talentName of Object.keys(fallback[treeName]?.talents ?? {})) {
      set.add(talentName);
    }
  }
  return set;
};

const resolveArrowDir = (from: Position, to: Position): ArrowDir => {
  const fromRow = from.charCodeAt(0) - 97; // 'a' -> 0
  const toRow = to.charCodeAt(0) - 97;
  const fromCol = Number(from[1]) - 1;
  const toCol = Number(to[1]) - 1;

  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;

  if (colDiff === 0) return "down";
  if (rowDiff === 0) return colDiff > 0 ? "right" : "left";
  if (colDiff > 0) return rowDiff >= 2 ? "right-down-down" : "right-down";

  // No left-down variants in this UI; degrade gracefully.
  return "down";
};

export const buildTalentDataFromApi = (
  api: { talents: ApiTalentRow[]; spells: ApiSpellRow[] },
  fallback: TalentData,
  visuals: TreeVisuals,
): TalentData => {
  const allowedNames = buildAllowedNames(fallback);
  const fallbackNameToTree = buildNameToTreeMap(fallback);

  const spellsById = new Map<number, ApiSpellRow>();
  for (const s of api.spells ?? []) {
    const id = toNumber((s as any).ID ?? (s as any).Id ?? (s as any).id);
    if (id > 0) spellsById.set(id, s);
  }

  const normalized: Array<{
    raw: ApiTalentRow;
    id: number;
    name: string;
    treeName: string;
    tier: number;
    col: number;
    pos: Position;
    rankSpellIds: number[];
  }> = [];

  const tierFieldCandidates = ["TierId", "TierID", "Tier", "Row", "row", "tier"];
  const colFieldCandidates = [
    "ColumnIndex",
    "Column",
    "Col",
    "col",
    "column",
  ];
  const idFieldCandidates = ["ID", "Id", "id", "TalentId", "talent_id"];

  for (const row of api.talents ?? []) {
    const rankSpellIds = collectRankSpellIds(row);
    const rank1 = rankSpellIds[0];

    const rank1Spell = rank1 ? spellsById.get(rank1) : undefined;

    const name =
      String(
        (row as any).Name ??
          (row as any).Name_Lang_enUS ??
          (rank1Spell as any)?.Name ??
          (rank1Spell as any)?.Name_Lang_enUS ??
          "",
      ) || null;

    // Hard filter by existing class data.ts names
    if (!name || !allowedNames.has(name)) {
      continue;
    }

    const explicitTree =
      String(
        (row as any).TreeName ??
          (row as any).TabName ??
          (row as any).TalentTabName ??
          "",
      ) || null;

    const treeName =
      (explicitTree && (fallback as any)[explicitTree] ? explicitTree : null) ??
      fallbackNameToTree.get(name) ??
      "Unknown";

    const tier = toNumber(getField(row, tierFieldCandidates));
    const col = toNumber(getField(row, colFieldCandidates));
    const pos = toPosExact(tier, col);

    const id = toNumber(getField(row, idFieldCandidates));

    normalized.push({
      raw: row,
      id,
      name,
      treeName,
      tier,
      col,
      pos,
      rankSpellIds,
    });
  }

  const idToName = new Map<number, string>();
  const nameToPos = new Map<string, Position>();
  for (const t of normalized) {
    if (t.id > 0) idToName.set(t.id, t.name);
    nameToPos.set(t.name, t.pos);
  }

  const out: TalentData = {};

  const ensureTree = (treeName: string) => {
    if (out[treeName]) return;

    const v = visuals[treeName] ?? visuals["Unknown"];
    if (!v) return;

    out[treeName] = {
      name: treeName,
      background: v.background,
      icon: v.icon,
      talents: {},
    };
  };

  for (const t of normalized) {
    ensureTree(t.treeName);
    if (!out[t.treeName]) continue;

    const maxRank = t.rankSpellIds.length || 1;

    const description = (rank: number) => {
      const idx = Math.max(0, rank - 1);
      const spellId = t.rankSpellIds[idx];
      const spell = spellId ? spellsById.get(spellId) : undefined;

      return String(
        (spell as any)?.Description_Lang_enUS ??
          (spell as any)?.Description ??
          (spell as any)?.description ??
          "",
      );
    };

    const apiIcon =
      (t.rankSpellIds[0] &&
        String((spellsById.get(t.rankSpellIds[0]) as any)?.IconUrl ?? "")) ||
      "";

    const fallbackIcon =
      (fallback[t.treeName]?.talents as any)?.[t.name]?.icon ?? "";

    const icon = apiIcon || fallbackIcon;

    const reqPoints = Math.max(0, t.tier) * 5;

    // DBC-like prereq fields
    const prereqRaw =
      (t.raw as any).prereq_talent ??
      (t.raw as any).PrereqTalent ??
      (t.raw as any).PrereqTalentId ??
      (t.raw as any).RequiredTalent ??
      null;

    let prereqName: string | undefined;

    if (
      prereqRaw !== null &&
      prereqRaw !== undefined &&
      String(prereqRaw) !== "0"
    ) {
      const maybeNum = Number(prereqRaw);
      if (Number.isFinite(maybeNum) && maybeNum > 0) {
        prereqName = idToName.get(maybeNum);
      } else {
        const maybeName = String(prereqRaw);
        if (allowedNames.has(maybeName)) prereqName = maybeName;
      }
    }

    let arrows:
      | {
          dir: ArrowDir;
          from: Position;
          to: Position;
        }[]
      | undefined;

    if (prereqName) {
      const from = nameToPos.get(prereqName);
      const to = t.pos;
      if (from) {
        arrows = [{ dir: resolveArrowDir(from, to), from, to }];
      }
    }

    out[t.treeName].talents[t.name] = {
      name: t.name,
      pos: t.pos,
      icon,
      description,
      maxRank,
      reqPoints,
      ...(prereqName ? { prereq: prereqName } : {}),
      ...(arrows ? { arrows } : {}),
    };
  }

  // Ensure expected trees exist even if API is partial
  for (const treeName of Object.keys(fallback)) {
    if (!out[treeName]) {
      const v = visuals[treeName] ?? visuals["Unknown"];
      if (!v) continue;
      out[treeName] = {
        name: treeName,
        background: v.background,
        icon: v.icon,
        talents: {},
      };
    }
  }

  return out;
};
