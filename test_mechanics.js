/**
 * Two Chairs — Game Mechanics Test
 * Tests save/load, world state, joint decision mechanic,
 * rift messaging, scene/theme routing, and keepsake updates.
 * No story text printed (no spoilers).
 *
 * Run: node test_mechanics.js
 */

const fs = require('fs');
const html = fs.readFileSync('two_chairs.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('ERROR: No <script> tag found'); process.exit(1); }

let errors = 0;
let tests = 0;

function pass(msg) { tests++; console.log('  PASS:', msg); }
function fail(msg) { tests++; errors++; console.error('  FAIL:', msg); }
function assert(cond, msg) { cond ? pass(msg) : fail(msg); }

const src = scriptMatch[1];

// ═══════════════════════════════════════════════
// 1. WORLD STATE KEYS
// ═══════════════════════════════════════════════
console.log('\n=== WORLD STATE EVENTS ===');

// Extract all worldEvent values from branches
const worldEvents = [];
const branchBlocks = src.matchAll(/worldEvent:\s*(?:'([^']+)'|\{([^}]+)\})/g);
for (const m of branchBlocks) {
  if (m[1]) worldEvents.push(m[1]);
  if (m[2]) {
    const pairs = m[2].matchAll(/(\w+)\s*:/g);
    for (const p of pairs) worldEvents.push(p[1]);
  }
}

// Extract all world event checks in renderWorldEffects
const checkedEvents = [];
const patchChecks = src.matchAll(/patch\.(\w+)/g);
for (const m of patchChecks) checkedEvents.push(m[1]);
const checkedSet = new Set(checkedEvents);

// Check that world events fired by branches are observed somewhere
const observerEvents = [
  'vivienne_wrote_letter', 'vivienne_sent_voice', 'vivienne_at_tower', 'vivienne_left_reply',
  'vivienne_saw_hollows', 'vivienne_found_aldane', 'vivienne_saw_eleanor_mark', 'vivienne_anchored', 'vivienne_reached',
  'elias_found_watch', 'elias_sent_voice', 'elias_at_tower',
  'elias_read_journals', 'elias_found_eleanor', 'elias_confronted_aldane', 'elias_witnessed_pull', 'elias_anchored', 'elias_reached',
  'chamber_activated', 'rift_core_active',
];

observerEvents.forEach(ev => {
  assert(checkedSet.has(ev), `World event "${ev}" is checked in renderWorldEffects`);
});

console.log(`  ${worldEvents.length} world events fired by branches`);

// ═══════════════════════════════════════════════
// 2. SAVE/LOAD SYSTEM
// ═══════════════════════════════════════════════
console.log('\n=== SAVE/LOAD SYSTEM ===');

assert(src.includes('SAVE_KEY'), 'SAVE_KEY constant exists');
assert(src.includes('function saveGame()'), 'saveGame function exists');
assert(src.includes('function loadGame()'), 'loadGame function exists');
assert(src.includes('function clearSave()'), 'clearSave function exists');
assert(src.includes('function getSave()'), 'getSave function exists');

// Check save captures required fields
assert(src.includes('character: currentChar'), 'Save captures character');
assert(src.includes('branch: currentBranch'), 'Save captures current branch');
assert(src.includes('visited: visitedBranches'), 'Save captures visited branches');
assert(src.includes('world: getWorld()'), 'Save captures world state');

// Check load restores required fields
assert(src.includes('currentChar = save.character'), 'Load restores character');
assert(src.includes('currentBranch = save.branch'), 'Load restores branch');
assert(src.includes('visitedBranches = save.visited'), 'Load restores visited branches');

// ═══════════════════════════════════════════════
// 3. JOINT DECISION MECHANIC
// ═══════════════════════════════════════════════
console.log('\n=== JOINT DECISION MECHANIC ===');

assert(src.includes('function handleFinalChoice'), 'handleFinalChoice function exists');
assert(src.includes('function resolveFinalChoice'), 'resolveFinalChoice function exists');
assert(src.includes('function showWaitingBlock'), 'showWaitingBlock function exists');
assert(src.includes('function removeWaitingBlock'), 'removeWaitingBlock function exists');
assert(src.includes('function showFinalChoiceButtons'), 'showFinalChoiceButtons function exists');

// Check that handleFinalChoice writes to world state
assert(src.includes("_final_choice") && src.includes("setWorld({ [myKey]: choiceValue }"), 'Final choice writes to world state');

// Check that resolveFinalChoice handles both match and mismatch
assert(src.includes("ending_reach") && src.includes("ending_close"), 'Both ending branches referenced in resolution');
assert(src.includes('chose differently'), 'Disagreement message exists');
assert(src.includes('elias_final_choice: null') && src.includes('vivienne_final_choice: null'), 'Disagreement clears both choices');

// Check world polling detects partner choice
assert(src.includes('awaitingPartnerChoice'), 'Partner choice polling variable exists');
assert(
  src.includes("_final_choice']") && src.includes('resolveFinalChoice(myFinalChoice'),
  'World polling checks for partner choice and calls resolve'
);

// Check both characters have final choice branches
assert(src.includes('elias_final_choice:'), 'Elias final choice branch exists');
assert(src.includes('vivienne_final_choice:'), 'Vivienne final choice branch exists');

// Check __reach__ and __close__ routing
assert(src.includes("__reach__") && src.includes("__close__"), 'Special choice routes exist');
assert(src.includes("choice.next === '__reach__' || choice.next === '__close__'"), 'Choose function handles __reach__/__close__');

// ═══════════════════════════════════════════════
// 4. RIFT MESSAGING
// ═══════════════════════════════════════════════
console.log('\n=== RIFT MESSAGING ===');

assert(src.includes('function sendRift'), 'sendRift function exists');
assert(src.includes('function addRiftInput'), 'addRiftInput function exists');
assert(src.includes('function startRiftPolling'), 'startRiftPolling function exists');
assert(src.includes('function distort'), 'distort function exists');
assert(src.includes('rift_messages'), 'Rift messages stored in world state');
assert(src.includes('playRiftChime'), 'Rift chime plays on incoming message');

// ═══════════════════════════════════════════════
// 5. SCENE & THEME ROUTING
// ═══════════════════════════════════════════════
console.log('\n=== SCENE & THEME ROUTING ===');

// Check all scene transitions in branches lead to valid scenes
const sceneRefs = [...src.matchAll(/scene:\s*'(\w+)'/g)].map(m => m[1]);
const sceneImgKeys = [...src.matchAll(/^\s{2}(\w+):\s+'Images\//gm)].map(m => m[1]);
const sceneSet = new Set(sceneImgKeys);
const badScenes = sceneRefs.filter(s => !sceneSet.has(s));
assert(badScenes.length === 0, `All scene references resolve (${badScenes.length === 0 ? 'OK' : 'BAD: ' + badScenes.join(', ')})`);

// Check theme routing
assert(src.includes("'title'") && src.includes('playTitleTheme'), 'Title theme exists and is routed');
assert(src.includes("'victorian'") && src.includes('playVictorian'), 'Victorian theme routed');
assert(src.includes("'modern'") && src.includes('playModern'), 'Modern theme routed');
assert(src.includes("'chamber'") && src.includes('playChamber'), 'Chamber theme routed');
assert(src.includes("currentThemeName"), 'Theme name tracking prevents redundant replays');

// Check rift_core triggers chamber theme
assert(src.includes("'rift_core') playTheme('chamber')"), 'Rift core scene triggers chamber theme');

// Check title theme starts on Enter the Rift
assert(src.includes("initAudio();\n  playTheme('title')"), 'Title theme starts on goToSelect');

// ═══════════════════════════════════════════════
// 6. ACT TRANSITIONS
// ═══════════════════════════════════════════════
console.log('\n=== ACT TRANSITIONS ===');

assert(src.includes("__act2__"), 'Act II transition route exists');
assert(src.includes("__act3__"), 'Act III transition route exists');
assert(src.includes("elias_act2_start") && src.includes("vivienne_act2_start"), 'Act II start branches for both characters');
assert(src.includes("elias_act3_start") && src.includes("vivienne_act3_start"), 'Act III start branches for both characters');

// Check act transitions route based on currentChar
assert(src.includes("currentChar === 'elias' ? 'elias_act2_start' : 'vivienne_act2_start'"), 'Act II routes by character');
assert(src.includes("currentChar === 'elias' ? 'elias_act3_start' : 'vivienne_act3_start'"), 'Act III routes by character');

// ═══════════════════════════════════════════════
// 7. KEEPSAKE COMPLETENESS
// ═══════════════════════════════════════════════
console.log('\n=== KEEPSAKE COMPLETENESS ===');

// Extract all branch keys
const allBranches = [...src.matchAll(/^\s{2}(\w+):\s*\{[\s\S]*?scene:/gm)].map(m => m[1]);
const keepsakeSection = src.slice(src.indexOf('const KEEPSAKES'));
const keepsakeKeys = [...keepsakeSection.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]).filter(k => k !== '_start');
const keepsakeSet = new Set(keepsakeKeys);

// Check ending branches have keepsakes
assert(keepsakeSet.has('ending_reach'), 'ending_reach has keepsake entry');
assert(keepsakeSet.has('ending_close'), 'ending_close has keepsake entry');
assert(keepsakeSet.has('act2_gate'), 'act2_gate has keepsake entry');
assert(keepsakeSet.has('act2_end'), 'act2_end has keepsake entry');

console.log(`  ${keepsakeSet.size} keepsake entries for ${allBranches.length} branches`);

// ═══════════════════════════════════════════════
// 8. WORLD BADGE STATES
// ═══════════════════════════════════════════════
console.log('\n=== WORLD BADGE ===');

assert(html.includes('The Rift is closed'), 'Default badge: Rift is closed');
assert(src.includes("'The Rift is open'"), 'Badge: Rift is open (chamber activated)');
assert(src.includes("'The Rift Core is open'"), 'Badge: Rift Core is open');

// Check loadGame restores badge state
assert(src.includes('save.world.rift_core_active'), 'Load checks rift_core_active for badge');
assert(src.includes('save.world.chamber_activated'), 'Load checks chamber_activated for badge');

// ═══════════════════════════════════════════════
// 9. HTML STRUCTURE
// ═══════════════════════════════════════════════
console.log('\n=== HTML STRUCTURE ===');

assert(html.includes('id="title-screen"'), 'Title screen exists');
assert(html.includes('id="select-screen"'), 'Select screen exists');
assert(html.includes('id="game-screen"'), 'Game screen exists');
assert(html.includes('id="save-modal"'), 'Save modal exists');
assert(html.includes('id="g-story"'), 'Story container exists');
assert(html.includes('id="g-choices"'), 'Choices container exists');
assert(html.includes('id="keepsake-line"'), 'Keepsake line exists');
assert(html.includes('id="world-badge"'), 'World badge exists');
assert(html.includes('id="particle-canvas"'), 'Particle canvas exists');
assert(html.includes('continue-btn'), 'Continue button exists');
assert(html.includes('<title>Two Chairs</title>'), 'Page title is Two Chairs');

// ═══════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════
console.log('\n=== SUMMARY ===');
console.log(`  Tests:  ${tests}`);
console.log(`  Passed: ${tests - errors}`);
console.log(`  Failed: ${errors}`);

if (errors === 0) {
  console.log('\n  All mechanics verified.\n');
  process.exit(0);
} else {
  console.error('\n  FAILED: Fix errors above.\n');
  process.exit(1);
}
