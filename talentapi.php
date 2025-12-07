<?php
/**
 * talentapi.php (VanillaPlus talent API)
 *
 * Goals:
 *  - Build ALL talent layout/prereqs from API data.
 *  - NEVER include pet talent tabs/trees.
 *  - Provide enough DBC rows to resolve common tooltip tokens:
 *      $s, $m, $d, $t, $o, $a (plus ID-prefixed variants where applicable)
 *    by including:
 *      * Spell rows referenced by talent ranks
 *      * Spell rows referenced by numeric tooltip tokens inside those spells
 *      * SpellDuration rows (for $d)
 *      * SpellRadius rows (for $a)
 *      * SpellDescriptionVariables rows (optional, future-proof)
 *  - Provide tab icon TextureFilename so UI tabs keep their normal icons.
 *
 * Query params:
 *   ?klass=Druid   (optional)
 *
 * Returns JSON:
 * {
 *   "talents":   [...],
 *   "tabs":      [...],
 *   "spells":    [...],
 *   "durations": [...],
 *   "radii":     [...],
 *   "descVars":  [...]
 * }
 */

header('Content-Type: application/json; charset=utf-8');

// ========================
// CONFIG – EDIT THIS PART
// ========================
$DB_HOST   = '192.168.1.226';
$DB_USER   = 'brokilodeluxe';
$DB_PASS   = 'Brokilo2!';
$DB_NAME   = 'dbc';
$DB_PORT   = 3306;

$TALENT_TABLE     = 'talent_lplus';
$TALENTTAB_TABLE  = 'talenttab_lplus';
$SPELL_TABLE      = 'spell_lplus';
$SPELLICON_TABLE  = 'spellicon_lplus';

// Candidate names for extra DBC mirrors.
// The first existing one will be used.
$SPELLDURATION_TABLE_CANDIDATES = array(
    'spellduration_lplus',
    'spell_duration_lplus',
    'spellduration',
    'spell_duration'
);

$SPELLRADIUS_TABLE_CANDIDATES = array(
    'spellradius_lplus',
    'spell_radius_lplus',
    'spellradius',
    'spell_radius'
);

$SPELLDESCVAR_TABLE_CANDIDATES = array(
    'spelldescriptionvariables_lplus',
    'spell_description_variables_lplus',
    'spelldescriptionvariables',
    'spell_description_variables'
);

// Talent columns that contain spell IDs
$TALENT_SPELL_COLUMNS = array(
    'SpellRank_1',
    'SpellRank_2',
    'SpellRank_3',
    'SpellRank_4',
    'SpellRank_5',
    'SpellRank_6',
    'SpellRank_7',
    'SpellRank_8',
    'SpellRank_9',
    'RequiredSpellID',
);

// ========================
// HELPERS
// ========================
function fail($msg, $httpCode = 500) {
    http_response_code($httpCode);
    echo json_encode(array('error' => $msg), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fetch_all_assoc(mysqli_result $result) {
    $rows = array();
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
}

function table_exists(mysqli $mysqli, $tableName) {
    $safe = $mysqli->real_escape_string($tableName);
    $sql = "SHOW TABLES LIKE '{$safe}'";
    $res = $mysqli->query($sql);
    if (!$res) return false;
    $row = $res->fetch_row();
    return $row ? true : false;
}

function first_existing_table(mysqli $mysqli, array $candidates) {
    foreach ($candidates as $t) {
        if (table_exists($mysqli, $t)) return $t;
    }
    return null;
}

/**
 * Build WoW-style icon fields from TextureFilename.
 */
function build_icon_fields(array &$row) {
    if (!isset($row['TextureFilename']) || $row['TextureFilename'] === null || $row['TextureFilename'] === '') {
        $row['IconName'] = null;
        $row['IconPath'] = null;
        $row['IconUrl']  = null;
        return;
    }

    $tex = $row['TextureFilename'];
    $tex = str_replace('\\', '/', $tex);

    $basename = $tex;

    $pos = strrpos($basename, '/');
    if ($pos !== false) {
        $basename = substr($basename, $pos + 1);
    } else {
        $prefix = 'InterfaceIcons';
        if (stripos($basename, $prefix) === 0) {
            $basename = substr($basename, strlen($prefix));
        }
    }

    $basename = ltrim($basename, "\\/");

    $row['IconName'] = $basename;
    $row['IconPath'] = 'Interface\\Icons\\' . $basename;

    $lower = strtolower($basename);
    $row['IconUrl'] = 'https://wow.zamimg.com/images/wow/icons/large/' . $lower . '.jpg';
}

function fetch_spells_into_map(mysqli $mysqli, $SPELL_TABLE, $SPELLICON_TABLE, array $ids, array &$spellsById) {
    if (empty($ids)) return;

    $chunkSize = 500;
    for ($offset = 0; $offset < count($ids); $offset += $chunkSize) {
        $chunk = array_slice($ids, $offset, $chunkSize);
        $in    = implode(',', array_map('intval', $chunk));

        $sqlSpells = "
            SELECT s.*, i.TextureFilename
            FROM `$SPELL_TABLE` AS s
            LEFT JOIN `$SPELLICON_TABLE` AS i
                ON i.ID = s.SpellIconID
            WHERE s.ID IN ($in)
        ";

        $resSpells = $mysqli->query($sqlSpells);
        if (!$resSpells) {
            fail('Spell query failed: ' . $mysqli->error);
        }

        $rows = fetch_all_assoc($resSpells);
        foreach ($rows as $spellRow) {
            build_icon_fields($spellRow);

            $id = isset($spellRow['ID']) ? (int)$spellRow['ID'] : 0;
            if ($id > 0) $spellsById[$id] = $spellRow;
        }
    }
}

// Class mask map (Vanilla/WotLK style)
$CLASS_MASK = array(
    'Warrior' => 1,
    'Paladin' => 2,
    'Hunter'  => 4,
    'Rogue'   => 8,
    'Priest'  => 16,
    'Shaman'  => 64,
    'Mage'    => 128,
    'Warlock' => 256,
    'Druid'   => 1024,
);

// ========================
// MAIN
// ========================
$mysqli = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT);
if ($mysqli->connect_errno) {
    fail('MySQL connection failed: ' . $mysqli->connect_error);
}
$mysqli->set_charset('utf8');

// Optional class filter
$klass = null;
if (isset($_GET['klass'])) {
    $klass = trim($_GET['klass']);
    if ($klass === '') $klass = null;
}

$classMask = null;
if ($klass && isset($CLASS_MASK[$klass])) {
    $classMask = (int)$CLASS_MASK[$klass];
}

// 1) Load tabs + tab icons
$sqlTabs = "
    SELECT t.*, i.TextureFilename
    FROM `$TALENTTAB_TABLE` AS t
    LEFT JOIN `$SPELLICON_TABLE` AS i
        ON i.ID = t.SpellIconID
";
$resTabs = $mysqli->query($sqlTabs);
if (!$resTabs) {
    fail('TalentTab query failed: ' . $mysqli->error);
}
$tabsAll = fetch_all_assoc($resTabs);

// Filter tabs by class mask and exclude pet tabs
$tabs = array();
$allowedTabIds = array();

foreach ($tabsAll as $t) {
    $tabId = isset($t['ID']) ? (int)$t['ID'] : 0;

    // Detect PetTalentMask across common export styles
    $petMask =
        (isset($t['PetTalentMask']) ? (int)$t['PetTalentMask'] : 0) ? (int)$t['PetTalentMask'] :
        ((isset($t['PetTalentMask_1']) ? (int)$t['PetTalentMask_1'] : 0) ? (int)$t['PetTalentMask_1'] :
        (isset($t['PetTalentMask1']) ? (int)$t['PetTalentMask1'] : 0));

    if ($petMask && $petMask != 0) {
        continue;
    }

    if ($classMask !== null) {
        // When class is specified, ONLY allow tabs with a real ClassMask that matches.
        $maskVal =
            (isset($t['ClassMask']) ? (int)$t['ClassMask'] : 0) ? (int)$t['ClassMask'] :
            (isset($t['ClassMask_0']) ? (int)$t['ClassMask_0'] : 0);

        if (!$maskVal) {
            // Key exclusion: ClassMask=0 tabs are treated as non-class (pet) tabs.
            continue;
        }

        if (($maskVal & $classMask) === 0) {
            continue;
        }
    }

    build_icon_fields($t);

    $tabs[] = $t;
    if ($tabId > 0) $allowedTabIds[$tabId] = true;
}

// 2) Load talents
$sqlTalents = "SELECT * FROM `$TALENT_TABLE`";
$resTalents = $mysqli->query($sqlTalents);
if (!$resTalents) {
    fail('Talent query failed: ' . $mysqli->error);
}
$talentsAll = fetch_all_assoc($resTalents);

// Filter talents by allowed tabs
$talents = array();
if (!empty($allowedTabIds)) {
    foreach ($talentsAll as $row) {
        $tabId =
            (isset($row['TabID']) ? (int)$row['TabID'] : 0) ? (int)$row['TabID'] :
            (isset($row['TabId']) ? (int)$row['TabId'] : 0);

        if ($tabId > 0 && isset($allowedTabIds[$tabId])) {
            $talents[] = $row;
        }
    }
} else {
    $talents = $talentsAll;
}

// 3) Collect spell IDs referenced by talents
$spellIds = array();
foreach ($talents as $row) {
    foreach ($TALENT_SPELL_COLUMNS as $col) {
        if (isset($row[$col])) {
            $val = (int)$row[$col];
            if ($val > 0) $spellIds[$val] = true;
        }
    }
}

// 4) Fetch spells + icons (first pass)
$spellIdsList = array_keys($spellIds);
sort($spellIdsList);

$spellsById = array();
fetch_spells_into_map($mysqli, $SPELL_TABLE, $SPELLICON_TABLE, $spellIdsList, $spellsById);

// 5) Second-pass: scan tooltip strings for numeric spell references used in tooltips.
//   $12345s1, $12345m1, $12345d, $12345t1, $12345o1, $12345a1
$referenced = array();
foreach ($spellsById as $s) {
    $desc =
        (isset($s['Description_Lang_enUS']) ? $s['Description_Lang_enUS'] : '') .
        "\n" .
        (isset($s['AuraDescription_Lang_enUS']) ? $s['AuraDescription_Lang_enUS'] : '');

    if (!$desc) continue;

    if (preg_match_all('/\$(\d+)(?:s\d+|m\d+|d|t\d+|o\d+|a\d+)/', $desc, $m)) {
        foreach ($m[1] as $idStr) {
            $sid = (int)$idStr;
            if ($sid > 0) $referenced[$sid] = true;
        }
    }
}

$missing = array();
foreach (array_keys($referenced) as $sid) {
    if (!isset($spellsById[$sid])) $missing[] = $sid;
}

if (!empty($missing)) {
    sort($missing);
    fetch_spells_into_map($mysqli, $SPELL_TABLE, $SPELLICON_TABLE, $missing, $spellsById);
}

// 6) Load SpellDuration rows if available.
$durTable = first_existing_table($mysqli, $SPELLDURATION_TABLE_CANDIDATES);
$durations = array();
if ($durTable) {
    $resDur = $mysqli->query("SELECT * FROM `$durTable`");
    if ($resDur) {
        $durations = fetch_all_assoc($resDur);
    }
}

// 7) Load SpellRadius rows if available.
$radTable = first_existing_table($mysqli, $SPELLRADIUS_TABLE_CANDIDATES);
$radii = array();
if ($radTable) {
    $resRad = $mysqli->query("SELECT * FROM `$radTable`");
    if ($resRad) {
        $radii = fetch_all_assoc($resRad);
    }
}

// 8) Load SpellDescriptionVariables if available.
$descVarTable = first_existing_table($mysqli, $SPELLDESCVAR_TABLE_CANDIDATES);
$descVars = array();
if ($descVarTable) {
    $resDV = $mysqli->query("SELECT * FROM `$descVarTable`");
    if ($resDV) {
        $descVars = fetch_all_assoc($resDV);
    }
}

$mysqli->close();

echo json_encode(
    array(
        'talents'   => $talents,
        'tabs'      => $tabs,
        'spells'    => array_values($spellsById),
        'durations' => $durations,
        'radii'     => $radii,
        'descVars'  => $descVars,
    ),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
