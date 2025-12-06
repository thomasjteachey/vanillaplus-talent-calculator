<?php
/**
 * talentapi.php
 *
 * Returns JSON:
 * {
 *   "talents": [ raw rows from talent_lplus ],
 *   "spells":  [ rows from spell_lplus + icon fields ]
 * }
 */

header('Content-Type: application/json; charset=utf-8');

// Ensure the response reflects current DB state at request time
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// If your React app is on a different origin, uncomment and tighten:
// header('Access-Control-Allow-Origin: https://your-domain.com');
// header('Access-Control-Allow-Methods: GET, OPTIONS');


// ========================
// CONFIG – EDIT THIS PART
// ========================
$DB_HOST   = '192.168.1.226';
$DB_USER   = 'brokilodeluxe';
$DB_PASS   = 'Brokilo2!';
$DB_NAME   = 'dbc';
$DB_PORT   = 3306;

$TALENT_TABLE    = 'talent_lplus';
$SPELL_TABLE     = 'spell_lplus';
$SPELLICON_TABLE = 'spellicon_lplus'; // table with ID, TextureFilename

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
// HELPER FUNCTIONS
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

/**
 * Build WoW-style icon fields from TextureFilename.
 *
 * TextureFilename examples (from your table):
 *   "InterfaceIconsTrade_Engineering"
 *   "InterfaceIconsSpell_Shadow_BlackPlague"
 *   "InterfaceIconsSpell_Nature_NaturesBlessing"
 *
 * We normalize these to:
 *   IconName = "Trade_Engineering" / "Spell_Shadow_BlackPlague" / ...
 *   IconPath = "Interface\\Icons\\Trade_Engineering"
 *   IconUrl  = "https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg"
 */
function build_icon_fields(array &$spellRow) {
    if (!isset($spellRow['TextureFilename']) || $spellRow['TextureFilename'] === null || $spellRow['TextureFilename'] === '') {
        $spellRow['IconName'] = null;
        $spellRow['IconPath'] = null;
        $spellRow['IconUrl']  = null;
        return;
    }

    $tex = $spellRow['TextureFilename'];

    // Normalize slashes
    $tex = str_replace('\\', '/', $tex);

    // Default basename is whole string
    $basename = $tex;

    // Case 1: already like "Interface/Icons/Trade_Engineering"
    $pos = strrpos($basename, '/');
    if ($pos !== false) {
        $basename = substr($basename, $pos + 1);
    } else {
        // Case 2: your format "InterfaceIconsTrade_Engineering"
        $prefix = 'InterfaceIcons';
        if (stripos($basename, $prefix) === 0) {
            $basename = substr($basename, strlen($prefix)); // "Trade_Engineering"
        }
    }

    // Remove any leftover leading slashes
    $basename = ltrim($basename, "\\/");

    $spellRow['IconName'] = $basename;
    $spellRow['IconPath'] = 'Interface\\Icons\\' . $basename;

    // Web icon URL (wowhead/zamimg style)
    $lower = strtolower($basename);
    $spellRow['IconUrl'] = 'https://wow.zamimg.com/images/wow/icons/large/' . $lower . '.jpg';
}


// ========================
// MAIN
// ========================

$mysqli = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT);
if ($mysqli->connect_errno) {
    fail('MySQL connection failed: ' . $mysqli->connect_error);
}
$mysqli->set_charset('utf8');

// 1) Load all talents
$sqlTalents = "SELECT * FROM `$TALENT_TABLE`";
$resTalents = $mysqli->query($sqlTalents);
if (!$resTalents) {
    fail('Talent query failed: ' . $mysqli->error);
}
$talents = fetch_all_assoc($resTalents);

// 2) Collect all spell IDs referenced by talents
$spellIds = array(); // use as set: spellId => true

foreach ($talents as $row) {
    foreach ($TALENT_SPELL_COLUMNS as $col) {
        if (isset($row[$col])) {
            $val = (int)$row[$col];
            if ($val > 0) {
                $spellIds[$val] = true;
            }
        }
    }
}

// If no spell IDs, return just talents
if (empty($spellIds)) {
    echo json_encode(
        array(
            'talents' => $talents,
            'spells'  => array(),
        ),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    $mysqli->close();
    exit;
}

// 3) Fetch all spells + icon data, in chunks
$spellIdsList = array_keys($spellIds);
sort($spellIdsList);

$spellsById = array();
$chunkSize = 500;

$total = count($spellIdsList);
for ($offset = 0; $offset < $total; $offset += $chunkSize) {
    $chunk = array_slice($spellIdsList, $offset, $chunkSize);
    if (empty($chunk)) {
        continue;
    }

    $in = implode(',', array_map('intval', $chunk));

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
        // add icon fields derived from TextureFilename
        build_icon_fields($spellRow);

        $id = (int)$spellRow['ID'];
        $spellsById[$id] = $spellRow;
    }
}

// 4) Response
$mysqli->close();

echo json_encode(
    array(
        'talents' => $talents,
        'spells'  => array_values($spellsById),
    ),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
