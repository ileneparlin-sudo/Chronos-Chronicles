/**
 * Two Chairs — Automated Branch Test
 * Validates all story branches, paths, scenes, keepsakes, and world events
 * without printing any story text (no spoilers).
 *
 * Run: node test_branches.js
 */

const fs = require('fs');

const html = fs.readFileSync('two_chairs.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('ERROR: No <script> tag found'); process.exit(1); }

// Extract JS objects by evaluating in a sandboxed context
const src = scriptMatch[1];
const sandbox = {};
const wrappedCode = `
  ${src}
  return { STORY, BRANCHES, SCENE_IMAGES, SCENE_LABELS, KEEPSAKES };
`;

// Strip out DOM/audio code that won't run in Node
const strippedCode = wrappedCode
  .replace(/\(function initParticles[\s\S]*?\}\)\(\);/g, '')
  .replace(/\(function initScene[\s\S]*?\}\)\(\);/g, '')
  .replace(/\(function checkSaveOnLoad[\s\S]*?\}\)\(\);/g, '')
  .replace(/document\.body\.addEventListener\([^)]*\)[\s\S]*?\{[^}]*\}[^)]*\);/g, '')
  .replace(/firebase\.initializeApp[\s\S]*?;/g, '')
  .replace(/firebase\.database\(\)/g, '{}')
  .replace(/document\.\w+/g, 'null')
  .replace(/window\.\w+/g, 'null')
  .replace(/localStorage\.\w+/g, 'null')
  .replace(/requestAnimationFrame/g, '(function(){})');

let data;
try {
  data = new Function(strippedCode)();
} catch (e) {
  console.error('ERROR: Failed to parse game data:', e.message);
  process.exit(1);
}

const { STORY, BRANCHES, SCENE_IMAGES, SCENE_LABELS, KEEPSAKES } = data;
const SPECIAL_NEXTS = new Set(['__restart__', '__switch__', '__act2__', '__act3__', '__reach__', '__close__', '__between__']);

let errors = 0;
let warnings = 0;

function err(msg) { console.error('  ERROR:', msg); errors++; }
function warn(msg) { console.warn('  WARN:', msg); warnings++; }

// ── 1. Validate all branches ──
console.log('\n=== BRANCH VALIDATION ===');

const allBranchKeys = Object.keys(BRANCHES);
console.log(`Total branches: ${allBranchKeys.length}`);

allBranchKeys.forEach(key => {
  const branch = BRANCHES[key];

  // Check scene
  if (branch.scene && !SCENE_IMAGES[branch.scene]) {
    err(`${key}: scene "${branch.scene}" not in SCENE_IMAGES`);
  }

  // Check text exists
  if (!branch.text || branch.text.trim().length === 0) {
    err(`${key}: missing or empty text`);
  }

  // Check choices
  if (!branch.choices || !Array.isArray(branch.choices)) {
    err(`${key}: missing choices array`);
  } else {
    branch.choices.forEach((choice, i) => {
      if (!choice.text) err(`${key} choice[${i}]: missing text`);
      if (!choice.next) err(`${key} choice[${i}]: missing next`);
      if (choice.next && !SPECIAL_NEXTS.has(choice.next) && !BRANCHES[choice.next]) {
        err(`${key} choice[${i}]: next "${choice.next}" not found in BRANCHES`);
      }
      if (choice.scene && !SCENE_IMAGES[choice.scene]) {
        err(`${key} choice[${i}]: scene "${choice.scene}" not in SCENE_IMAGES`);
      }
    });
  }

  // Check worldEvent format
  if (branch.worldEvent) {
    const t = typeof branch.worldEvent;
    if (t !== 'string' && t !== 'object') {
      err(`${key}: worldEvent is ${t}, expected string or object`);
    }
  }
});

// ── 2. Validate openings ──
console.log('\n=== OPENING VALIDATION ===');

['elias', 'vivienne'].forEach(char => {
  if (!STORY[char]) { err(`Missing STORY.${char}`); return; }
  const opening = STORY[char].opening;
  if (!opening) { err(`Missing STORY.${char}.opening`); return; }
  if (!opening.text) err(`STORY.${char}.opening: missing text`);
  if (!opening.scene) err(`STORY.${char}.opening: missing scene`);
  if (opening.scene && !SCENE_IMAGES[opening.scene]) {
    err(`STORY.${char}.opening: scene "${opening.scene}" not in SCENE_IMAGES`);
  }
  if (!opening.choices || !opening.choices.length) {
    err(`STORY.${char}.opening: missing choices`);
  } else {
    opening.choices.forEach((c, i) => {
      if (c.next && !BRANCHES[c.next]) {
        err(`STORY.${char}.opening choice[${i}]: next "${c.next}" not found`);
      }
    });
  }
  console.log(`  ${char} opening: OK`);
});

// ── 3. Walk all paths ──
console.log('\n=== PATH WALKING ===');

['elias', 'vivienne'].forEach(char => {
  const paths = [];
  const visited = new Set();

  function walk(branchKey, path) {
    if (visited.has(branchKey)) return; // prevent cycles
    visited.add(branchKey);

    const branch = BRANCHES[branchKey];
    if (!branch) return;

    if (!branch.choices || branch.choices.length === 0) {
      paths.push([...path, branchKey]);
      return;
    }

    branch.choices.forEach(choice => {
      if (SPECIAL_NEXTS.has(choice.next)) {
        paths.push([...path, branchKey, `[${choice.next}]`]);
      } else if (BRANCHES[choice.next]) {
        walk(choice.next, [...path, branchKey]);
      }
    });
  }

  // Start from opening choices
  const opening = STORY[char].opening;
  opening.choices.forEach(choice => {
    if (BRANCHES[choice.next]) {
      walk(choice.next, ['opening']);
    }
  });

  // Also walk from Act II entry point (reached via __act2__ from act2_gate)
  const act2Start = char === 'elias' ? 'elias_act2_start' : 'vivienne_act2_start';
  if (BRANCHES[act2Start]) {
    walk(act2Start, ['act2_gate', '__act2__']);
  }

  // Also walk from Act III entry point (reached via __act3__ from act2_end)
  const act3Start = char === 'elias' ? 'elias_act3_start' : 'vivienne_act3_start';
  if (BRANCHES[act3Start]) {
    walk(act3Start, ['act2_end', '__act3__']);
  }

  // Also walk endings (reached via joint choice mechanic)
  ['ending_reach', 'ending_close', 'ending_between'].forEach(endKey => {
    if (BRANCHES[endKey]) {
      walk(endKey, ['final_choice', '__reach__/__close__']);
    }
  });

  console.log(`  ${char}: ${paths.length} paths, ${visited.size} unique branches reached`);

  // Check for unreachable branches
  const charPrefix = char === 'elias' ? 'elias_' : 'vivienne_';
  const charBranches = allBranchKeys.filter(k => k.startsWith(charPrefix));
  const unreachable = charBranches.filter(k => !visited.has(k));
  if (unreachable.length) {
    unreachable.forEach(k => warn(`${k}: unreachable from ${char} opening`));
  }
});

// ── 4. Validate keepsakes ──
console.log('\n=== KEEPSAKE VALIDATION ===');

['elias', 'vivienne'].forEach(char => {
  const charKeepsakes = KEEPSAKES[char];
  if (!charKeepsakes) { err(`Missing KEEPSAKES.${char}`); return; }

  // Check that keepsake keys reference valid branches
  Object.keys(charKeepsakes).forEach(key => {
    if (key === '_start') return;
    if (!BRANCHES[key] && key !== 'act2_gate' && key !== 'act2_end') {
      // act2_gate is in BRANCHES, act2_end is in BRANCHES
      if (!BRANCHES[key]) {
        warn(`KEEPSAKES.${char}.${key}: not a valid branch key`);
      }
    }
    const items = charKeepsakes[key];
    if (!Array.isArray(items) || items.length === 0) {
      warn(`KEEPSAKES.${char}.${key}: empty keepsake list`);
    }
  });

  // Check that all branches for this character have keepsake entries
  const charPrefix = char === 'elias' ? 'elias_' : 'vivienne_';
  const charBranches = allBranchKeys.filter(k => k.startsWith(charPrefix));
  const sharedBranches = ['act2_gate', 'act2_end'];

  [...charBranches, ...sharedBranches].forEach(key => {
    if (!charKeepsakes[key]) {
      warn(`KEEPSAKES.${char}: missing entry for branch "${key}"`);
    }
  });

  const totalEntries = Object.keys(charKeepsakes).length;
  console.log(`  ${char}: ${totalEntries} keepsake entries`);
});

// ── 5. Scene coverage ──
console.log('\n=== SCENE COVERAGE ===');

const usedScenes = new Set();
Object.values(BRANCHES).forEach(b => { if (b.scene) usedScenes.add(b.scene); });
['elias', 'vivienne'].forEach(c => {
  if (STORY[c]?.opening?.scene) usedScenes.add(STORY[c].opening.scene);
});

Object.keys(SCENE_IMAGES).forEach(key => {
  if (key === 'title') return;
  const status = usedScenes.has(key) ? 'used' : 'unused';
  if (status === 'unused') warn(`Scene "${key}" defined but never referenced`);
});
console.log(`  ${usedScenes.size} scenes used out of ${Object.keys(SCENE_IMAGES).length} defined`);

// ── Summary ──
console.log('\n=== SUMMARY ===');
console.log(`  Branches: ${allBranchKeys.length}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Warnings: ${warnings}`);

if (errors === 0) {
  console.log('\n  All branches valid. Game is playable.\n');
  process.exit(0);
} else {
  console.error('\n  FAILED: Fix errors above before playing.\n');
  process.exit(1);
}
