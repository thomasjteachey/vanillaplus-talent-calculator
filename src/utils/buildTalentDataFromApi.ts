import { Position, ArrowDir, TalentData } from "../TalentContext";

/**
 * This file converts your API payload into the TalentData shape used by the UI.
 * It also resolves Blizzard-style spell text tokens.
 *
 * Key fixes included:
 *  - $h/$n/$u (best-effort value tokens)
 *  - newline normalization for /r /n /r/n and \r \n \r\n
 *  - scaled tokens: $/10; $/100; $/1000; with BOTH:
 *      - numeric form: $/1000;$1  (your Feign Death case)
 *      - letter form:  $/1000;$s1, $/100;$m1, etc
 */

type ApiTalentRow = Record<string, any>;
type ApiSpellRow = Record<string, any>;
type ApiTabRow = Record<string, any>;
type ApiDurationRow = Record<string, any>;
type ApiRadiusRow = Record<string, any>;
type ApiDescVarRow = Record<string, any>;

type ApiResponse = {
  talents: ApiTalentRow[];
  spells: ApiSpellRow[];
  tabs?: ApiTabRow[];
  durations?: ApiDurationRow[];
  radii?: ApiRadiusRow[];
  descVars?: ApiDescVarRow[];
};

const ROW_LETTERS = ["a", "b", "c", "d", "e", "f", "g"] as const;
const MAX_COLS = 4;
const MAX_EFFECTS = 3;

const toNum = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const toPos = (tier: number, col: number): Position => {
  const rowLetter = ROW_LETTERS[tier] ?? "a";
  const colNum = Math.min(Math.max(col + 1, 1), MAX_COLS);
  return `${rowLetter}${colNum}` as Position;
};

const spellRankFields = [
  "SpellRank_1",
  "SpellRank_2",
  "SpellRank_3",
  "SpellRank_4",
  "SpellRank_5",
  "SpellRank_6",
  "SpellRank_7",
  "SpellRank_8",
  "SpellRank_9",
];

const getSpellName = (s?: ApiSpellRow) =>
  String(s?.Name_Lang_enUS ?? s?.Name ?? s?.name ?? "");

const getSpellDescRaw = (s?: ApiSpellRow) =>
  String(s?.Description_Lang_enUS ?? s?.Description ?? s?.description ?? "");

const getAuraDescRaw = (s?: ApiSpellRow) =>
  String(s?.AuraDescription_Lang_enUS ?? s?.AuraDescription ?? "");

const getIconUrl = (s?: ApiSpellRow) =>
  String(
    s?.IconUrl ??
      s?.IconURL ??
      s?.iconUrl ??
      s?.Icon ??
      s?.icon ??
      ""
  );

const getTabName = (t?: ApiTabRow) =>
  String(
    t?.Name_Lang_enUS ??
      t?.Name ??
      t?.name ??
      t?.TabName ??
      t?.tabName ??
      ""
  );

const getTabIconUrl = (t?: ApiTabRow) =>
  String(
    t?.IconUrl ??
      t?.IconURL ??
      t?.iconUrl ??
      t?.Icon ??
      t?.icon ??
      ""
  );

// -------- Pet tab filtering --------
const isPetTab = (tab?: ApiTabRow) => {
  if (!tab) return false;

  const petMask = toNum(
    tab.PetTalentMask ??
      tab.PetTalentMask_1 ??
      tab.PetTalentMask1 ??
      tab.petTalentMask ??
      0,
    0
  );
  if (petMask > 0) return true;

  const classMask = toNum(
    tab.ClassMask ?? tab.ClassMask_0 ?? tab.classMask ?? 0,
    0
  );
  // Many exports use classMask 0 for non-class/pet-like tabs.
  if (classMask === 0) return true;

  return false;
};

// -------- Duration helpers --------
const getDurationMsFromRow = (row?: ApiDurationRow): number => {
  if (!row) return 0;
  const d =
    row.BaseDuration ??
    row.Duration ??
    row.Duration_1 ??
    row.Duration1 ??
    row.DurationBase ??
    row.duration ??
    0;
  return toNum(d, 0);
};

const getDurationMsForSpell = (
  spell: ApiSpellRow | undefined,
  durationsById: Map<number, ApiDurationRow>
): number => {
  if (!spell) return 0;

  const durIndex = toNum(spell.DurationIndex ?? 0, 0);
  if (durIndex) {
    const row = durationsById.get(durIndex);
    const ms = getDurationMsFromRow(row);
    if (ms) return ms;
  }

  const direct = toNum(spell.Duration ?? spell.duration ?? 0, 0);
  if (direct) return direct;

  return 0;
};

const formatDuration = (ms: number): string => {
  if (!ms) return "0 sec";
  if (ms < 0) return "infinite";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} sec`;
  const min = Math.round(sec / 60);
  return `${min} min`;
};

const getPeriodSeconds = (spell: ApiSpellRow | undefined, idx: number): number => {
  if (!spell) return 0;

  const a = spell[`EffectAuraPeriod_${idx}`];
  const b = spell[`EffectAuraPeriod${idx}`];
  const periodMs = toNum(a ?? b ?? 0, 0);

  if (!periodMs) return 0;
  return Math.round(periodMs / 1000);
};

// -------- Radius helpers --------
const getRadiusYardsFromRow = (row?: ApiRadiusRow): number => {
  if (!row) return 0;
  const r =
    row.Radius ??
    row.Radius_1 ??
    row.Radius1 ??
    row.RadiusBase ??
    row.radius ??
    0;
  return toNum(r, 0);
};

const getRadiusYardsForSpell = (
  spell: ApiSpellRow | undefined,
  radiiById: Map<number, ApiRadiusRow>,
  idx: number
): number => {
  if (!spell) return 0;

  const keyA = `EffectRadiusIndex_${idx}`;
  const keyB = `EffectRadiusIndex${idx}`;
  const radIndex = toNum(spell[keyA] ?? spell[keyB] ?? 0, 0);
  if (!radIndex) return 0;

  const row = radiiById.get(radIndex);
  return getRadiusYardsFromRow(row);
};

const formatYards = (v: number): string => {
  if (!v) return "0";
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

// -------- Base points --------
const getBasePointsPlusOne = (spell: ApiSpellRow | undefined, idx: number): number => {
  if (!spell) return 0;

  const a = spell[`EffectBasePoints_${idx}`];
  const b = spell[`EffectBasePoints${idx}`];
  const base = toNum(a ?? b ?? 0, 0);

  return base + 1;
};

// -------- SpellDescriptionVariables --------
const getDescVarsString = (row?: ApiDescVarRow) =>
  String(
    row?.Variables ??
      row?.variables ??
      row?.Vars ??
      row?.vars ??
      row?.Values ??
      row?.values ??
      ""
  );

const parseDescVars = (row?: ApiDescVarRow): number[] => {
  const raw = getDescVarsString(row).trim();
  if (!raw) return [];
  return raw
    .split(/[;,\|]/)
    .map((s) => toNum(s.trim(), NaN))
    .filter((n) => Number.isFinite(n));
};

const getDescVarIdForSpell = (spell?: ApiSpellRow): number =>
  toNum(
    spell?.SpellDescriptionVariablesID ??
      spell?.SpellDescriptionVariablesId ??
      spell?.DescriptionVariablesID ??
      spell?.DescriptionVariablesId ??
      spell?.DescriptionVariables ??
      spell?.descVarsId ??
      0,
    0
  );

const getDescVarValue = (
  spell: ApiSpellRow | undefined,
  idx: number,
  descVarsById: Map<number, ApiDescVarRow>
): number => {
  if (!spell || idx < 1) return NaN;

  const id = getDescVarIdForSpell(spell);
  if (!id) return NaN;

  const row = descVarsById.get(id);
  const vars = parseDescVars(row);
  const v = vars[idx - 1];

  return Number.isFinite(v) ? v : NaN;
};

// -------- Text helpers --------
const normalizeLineBreaks = (s: string) =>
  s
    // JSON-escaped sequences
    .replace(/\\r\\n|\\r|\\n/g, "\n")
    // legacy slash-escaped sequences
    .replace(/\/r\/n|\/r|\/n/g, "\n")
    // real CR/LF chars
    .replace(/\r\n|\r|\n/g, "\n");

const formatScaled = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);

// -------- Arrow dir --------
// We keep this intentionally conservative to avoid ArrowDir union mismatches.
// "down" is known to be valid from previous compile errors.
const resolveArrowDir = (): ArrowDir => "down";

// -------- Token resolver --------
const resolveSpellDescription = (
  raw: string,
  currentSpell: ApiSpellRow | undefined,
  spellsById: Map<number, ApiSpellRow>,
  durationsById: Map<number, ApiDurationRow>,
  radiiById: Map<number, ApiRadiusRow>,
  descVarsById: Map<number, ApiDescVarRow>
) => {
  if (!raw) return raw;

  const getSpell = (spellIdStr?: string) =>
    spellIdStr && String(spellIdStr).length > 0
      ? spellsById.get(toNum(spellIdStr))
      : currentSpell;

  let out = normalizeLineBreaks(raw);

  // 1) ULTRA-TOLERANT numeric scaled vars (YOUR CASE)
  // Matches: $/1000;$1  with any whitespace variants.
  out = out.replace(
    /\$\/\s*(10|100|1000)\s*;\s*\$\s*(\d+)/g,
    (m, divStr, idxStr) => {
      const div = toNum(divStr, 1);
      const idx = toNum(idxStr, 0);
      if (!div || idx < 1) return m;

      // Prefer real SpellDescriptionVariables
      const dv = getDescVarValue(currentSpell, idx, descVarsById);
      if (Number.isFinite(dv)) return formatScaled(dv / div);

      // Fallback: map $1..3 to basepoints for now
      if (!currentSpell || idx > MAX_EFFECTS) return m;
      const val = getBasePointsPlusOne(currentSpell, idx);
      return formatScaled(val / div);
    }
  );

// Lettered scaled tokens - tolerant of case + optional '$' before the identifier
// Supports:
//   $/1000;$s1
//   $/1000;S1
//   $/100;  $12345S2
//   $/10;h3
out = out.replace(
  /\$\/\s*(10|100|1000)\s*;\s*\$?\s*(\d+)?\s*([sSmMhHnNuU])\s*(\d+)/g,
  (m, divStr, spellIdStr, _letter, idxStr) => {
    const div = toNum(divStr, 1);
    const idx = toNum(idxStr, 0);
    if (!div || idx < 1 || idx > 3) return m;

    const spell =
      spellIdStr && String(spellIdStr).length > 0
        ? spellsById.get(toNum(spellIdStr))
        : currentSpell;

    if (!spell) return m;

    // Keep consistent with Blizzard-style $s logic
    const val = getBasePointsPlusOne(spell, idx);
    return formatScaled(val / div);
  }
);

  // Optional plain numeric $1 $2 if they appear alone
  // Only replace when NOT followed by a letter (avoid clobbering $123s1).
  out = out.replace(/\$(\d+)(?![a-zA-Z])/g, (m, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1) return m;

    const dv = getDescVarValue(currentSpell, idx, descVarsById);
    if (Number.isFinite(dv)) return String(dv);

    return m;
  });

  // $sX / $<id>sX
  out = out.replace(/\$(\d+)?s(\d+)/g, (m, spellIdStr, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1 || idx > MAX_EFFECTS) return m;

    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    return String(getBasePointsPlusOne(spell, idx));
  });

  // $mX / $<id>mX (best-effort = basepoints)
  out = out.replace(/\$(\d+)?m(\d+)/g, (m, spellIdStr, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1 || idx > MAX_EFFECTS) return m;

    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    return String(getBasePointsPlusOne(spell, idx));
  });

// $h / $h1..3 / $123h1..3
// $n / $u variants too
// Best-effort: treat like $s-style value tokens.
// IMPORTANT: index is optional -> defaults to 1
out = out.replace(
  /\$(\d+)?\s*([hnu])\s*(\d+)?/gi,
  (m, spellIdStr, _letter, idxStr) => {
    const idx = idxStr ? toNum(idxStr, 0) : 1;
    if (idx < 1 || idx > 3) return m;

    const spell =
      spellIdStr && String(spellIdStr).length > 0
        ? spellsById.get(toNum(spellIdStr))
        : currentSpell;

    if (!spell) return m;

    return String(getBasePointsPlusOne(spell, idx));
  }
);

  // $aX (radius)
  out = out.replace(/\$(\d+)?a(\d+)/g, (m, spellIdStr, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1 || idx > MAX_EFFECTS) return m;

    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    const yards = getRadiusYardsForSpell(spell, radiiById, idx);
    return yards ? formatYards(yards) : m;
  });

  // $tX (period)
  out = out.replace(/\$(\d+)?t(\d+)/g, (m, spellIdStr, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1 || idx > MAX_EFFECTS) return m;

    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    const sec = getPeriodSeconds(spell, idx);
    return sec ? String(sec) : m;
  });

  // $d (duration)
  out = out.replace(/\$(\d+)?d/g, (m, spellIdStr) => {
    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    const ms = getDurationMsForSpell(spell, durationsById);
    return formatDuration(ms);
  });

  // $oX (rough total)
  out = out.replace(/\$(\d+)?o(\d+)/g, (m, spellIdStr, idxStr) => {
    const idx = toNum(idxStr, 0);
    if (idx < 1 || idx > MAX_EFFECTS) return m;

    const spell = getSpell(spellIdStr);
    if (!spell) return m;

    const base = getBasePointsPlusOne(spell, idx);
    const periodSec = getPeriodSeconds(spell, idx);
    const durationMs = getDurationMsForSpell(spell, durationsById);

    if (!periodSec || !durationMs) return String(base);

    const ticks = Math.max(1, Math.floor(durationMs / 1000 / periodSec));
    return String(base * ticks);
  });

  return normalizeLineBreaks(out);
};

// -------- Main builder --------
export const buildTalentDataFromApi = (api: ApiResponse): TalentData => {
  const talents = Array.isArray(api.talents) ? api.talents : [];
  const spells = Array.isArray(api.spells) ? api.spells : [];
  const tabs = Array.isArray(api.tabs) ? api.tabs : [];
  const durations = Array.isArray(api.durations) ? api.durations : [];
  const radii = Array.isArray(api.radii) ? api.radii : [];
  const descVars = Array.isArray(api.descVars) ? api.descVars : [];

  const spellsById = new Map<number, ApiSpellRow>();
  for (let i = 0; i < spells.length; i++) {
    const s = spells[i];
    const id = toNum(s.ID ?? s.Id ?? s.id);
    if (id > 0) spellsById.set(id, s);
  }

  const tabsById = new Map<number, ApiTabRow>();
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const id = toNum(t.ID ?? t.Id ?? t.id);
    if (id > 0) tabsById.set(id, t);
  }

  const durationsById = new Map<number, ApiDurationRow>();
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i];
    const id = toNum(d.ID ?? d.Id ?? d.id);
    if (id > 0) durationsById.set(id, d);
  }

  const radiiById = new Map<number, ApiRadiusRow>();
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    const id = toNum(r.ID ?? r.Id ?? r.id);
    if (id > 0) radiiById.set(id, r);
  }

  const descVarsById = new Map<number, ApiDescVarRow>();
  for (let i = 0; i < descVars.length; i++) {
    const dv = descVars[i];
    const id = toNum(dv.ID ?? dv.Id ?? dv.id);
    if (id > 0) descVarsById.set(id, dv);
  }

  // Normalize talents
  const normalized: Array<{
    raw: ApiTalentRow;
    id: number;
    tabId: number;
    tier: number;
    col: number;
    pos: Position;
    name: string;
    rankSpellIds: number[];
  }> = [];

  for (let i = 0; i < talents.length; i++) {
    const row = talents[i];

    const id = toNum(row.ID ?? row.Id ?? row.id);
    const tabId = toNum(row.TabID ?? row.TabId ?? row.tabId);

    const tabRow = tabsById.get(tabId);
    if (isPetTab(tabRow)) continue;

    const tier = toNum(row.TierID ?? row.TierId ?? row.Tier ?? 0);
    const col = toNum(row.ColumnIndex ?? row.Column ?? row.Col ?? 0);

    const rankSpellIds: number[] = [];
    for (let f = 0; f < spellRankFields.length; f++) {
      const key = spellRankFields[f];
      const sid = toNum(row[key], 0);
      if (sid > 0) rankSpellIds.push(sid);
    }

    if (rankSpellIds.length === 0) continue;

    const rank1Spell = spellsById.get(rankSpellIds[0]);
    const name = getSpellName(rank1Spell) || `Talent_${id || rankSpellIds[0]}`;

    normalized.push({
      raw: row,
      id,
      tabId,
      tier,
      col,
      pos: toPos(tier, col),
      name,
      rankSpellIds,
    });
  }

  // Build prereq lookup by talent id
  const idToMeta: Record<number, { name: string; pos: Position }> = {};
  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];
    if (t.id > 0) idToMeta[t.id] = { name: t.name, pos: t.pos };
  }

  // Group by tab without Map iteration
  const byTab: Record<string, typeof normalized> = {};
  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];
    const key = String(t.tabId);
    if (!byTab[key]) byTab[key] = [];
    byTab[key].push(t);
  }

  const out: TalentData = {} as TalentData;

  const ensureTree = (tabId: number) => {
    const tab = tabsById.get(tabId);
    if (isPetTab(tab)) return null;

    const prettyName = getTabName(tab);
    const treeName = prettyName || `Tab ${tabId}`;

    if ((out as any)[treeName]) return treeName;

    (out as any)[treeName] = {
      name: treeName,
      background: "",
      icon: getTabIconUrl(tab),
      talents: {},
    };

    return treeName;
  };

  const tabKeys = Object.keys(byTab);
  for (let k = 0; k < tabKeys.length; k++) {
    const tabId = toNum(tabKeys[k], 0);
    const list = byTab[tabKeys[k]];
    const treeName = ensureTree(tabId);
    if (!treeName) continue;

    for (let i = 0; i < list.length; i++) {
      const t = list[i];

      const maxRank = t.rankSpellIds.length || 1;
      const reqPoints = Math.max(0, t.tier) * 5;

      const icon =
        getIconUrl(spellsById.get(t.rankSpellIds[0])) || "";

      const description = (rank: number) => {
        const idx = Math.max(0, rank - 1);
        const sid = t.rankSpellIds[idx];
        const spell = sid ? spellsById.get(sid) : undefined;

        const rawDesc = getSpellDescRaw(spell) || getAuraDescRaw(spell);

        return resolveSpellDescription(
          rawDesc,
          spell,
          spellsById,
          durationsById,
          radiiById,
          descVarsById
        );
      };

      // Prereq support (best-effort)
      const prereqTalentId = toNum(
        t.raw.PrereqTalent_1 ??
          t.raw.PrereqTalent1 ??
          t.raw.PrereqTalent ??
          0
      );

      let prereqName: string | undefined;
      let arrows:
        | { dir: ArrowDir; from: Position; to: Position }[]
        | undefined;

      if (prereqTalentId > 0) {
        const pre = idToMeta[prereqTalentId];
        if (pre) {
          prereqName = pre.name;
          arrows = [
            {
              dir: resolveArrowDir(),
              from: pre.pos,
              to: t.pos,
            },
          ];
        }
      }

      (out as any)[treeName].talents[t.name] = {
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
  }

  return out;
};
