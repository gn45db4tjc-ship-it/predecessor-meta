'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const UI_HEAD_SRC = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8').split('// START CLIENT')[0];
const RANK_VIEW_SRC = fs.readFileSync(path.join(ROOT, 'rank_view.js'), 'utf8');

function fixture({predAgeHours = 31, bracket = 'gold', bracketLabel = 'Gold+', liveVersion = '1.18', statzTierStatus = 'ok'} = {}) {
  const now = Date.now();
  const statzAt = new Date(now - 2 * 3600000).toISOString();
  const predAt = new Date(now - predAgeHours * 3600000).toISOString();
  return {
    patch: '1.18',
    bracket: {segment: bracket, label: bracketLabel},
    tier_order: {S: 0, A: 1, B: 2, C: 3, D: 4},
    tier_list: [
      {slug: 'khaimera', role: 'jungle', tier: 'A', winRate: 51.8, pickRate: 8.2, matches: 1200, rank: 1},
      {slug: 'steel', role: 'jungle', tier: 'B', winRate: 50.4, pickRate: 5.1, matches: 900, rank: 2}
    ],
    pairs: [],
    official: {
      status: 'verified',
      live: {version: liveVersion, url: 'https://www.predecessorgame.com/en-US/news/patch-notes'}
    },
    sources: {
      pred_scoped: {status: 'retained', fetched_at: predAt, url: 'https://pred.gg/heroes'},
      statz_tierlist: {status: statzTierStatus, fetched_at: statzAt, url: 'https://statz.gg/predecessor/tierlist'},
      statz_hero_pages: {status: 'ok', fetched_at: statzAt, url: 'https://statz.gg/predecessor/heroes'}
    },
    scoped_statistics: {
      source: 'Pred.gg',
      status: 'retained',
      patch: '1.18',
      bracket,
      bracket_label: bracketLabel,
      gameModes: ['RANKED'],
      roles: {
        jungle: {
          status: 'retained',
          url: 'https://pred.gg/heroes?role=jungle',
          fetched_at: predAt,
          rows: [
            {slug: 'khaimera', role: 'jungle', winRate: 52.1, matches: 640, wonGames: 333, fetched_at: predAt, url: 'https://pred.gg/heroes?role=jungle'}
          ]
        }
      },
      rows: [
        {slug: 'khaimera', role: 'jungle', winRate: 52.1, matches: 640, wonGames: 333, fetched_at: predAt, url: 'https://pred.gg/heroes?role=jungle'}
      ]
    },
    heroes: {
      khaimera: {
        slug: 'khaimera',
        display_name: 'Khaimera',
        roles_order: ['jungle'],
        abilities: [{key: 'Q', display_name: 'Unleash', text: 'Empower the next five basic attacks.'}],
        roles: {jungle: {status: 'ok', patch: '1.18', tier: 'A', winRate: 51.8, pickRate: 8.2, banRate: 4.1, playedGames: 1200, fetched_at: statzAt}}
      },
      steel: {
        slug: 'steel',
        display_name: 'Steel',
        roles_order: ['jungle', 'support'],
        abilities: [{key: 'R', display_name: 'Shield Slam', text: 'Leap and slam down, stunning enemies.'}],
        roles: {jungle: {status: 'ok', patch: '1.18', tier: 'B', winRate: 50.4, pickRate: 5.1, banRate: 2.0, playedGames: 900, fetched_at: statzAt}}
      },
      unreviewed: {
        slug: 'unreviewed',
        display_name: 'Unreviewed Hero',
        roles_order: ['jungle'],
        abilities: [{key: 'Q', display_name: 'Placeholder', text: 'Placeholder text.'}],
        roles: {jungle: {status: 'ok', patch: '1.18', tier: 'C', winRate: 48.9, pickRate: 2.0, banRate: 0.5, playedGames: 400, fetched_at: statzAt}}
      }
    },
    guidance: {
      patch: '1.18',
      status: 'reviewed for current patch',
      pools: {jungle: ['khaimera', 'steel', 'unreviewed']},
      meta_review: {patch: '1.17.2', bracket: 'gold', bracket_label: 'Gold+', mode: 'RANKED', entries: []},
      strategic_review: {
        patch: '1.18',
        reviewed_at: '2026-11-04T12:00:00Z',
        heroes: {
          khaimera: {
            pick_when: 'Pick into low-mobility backlines.',
            counterplay: 'Apply anti-heal early.',
            source: 'https://pred.gg/heroes/khaimera',
            source_abilities: {Q: 'Empower the next five basic attacks.'}
          },
          steel: {
            pick_when: 'Pick when the comp needs engage and peel.',
            counterplay: 'Spread out against Shield Slam.',
            source: 'https://pred.gg/heroes/steel',
            source_abilities: {R: 'Leap and slam down, stunning enemies.'}
          }
        }
      },
      builds: []
    }
  };
}

function loadMetaRuntime(bundle, mode = 'static') {
  const noop = () => {};
  const documentStub = {
    visibilityState: 'visible',
    activeElement: null,
    documentElement: {hasAttribute: () => false, getAttribute: () => null, style: {setProperty: noop}},
    body: {},
    querySelector: sel => sel === '#detail' ? {addEventListener: noop} : null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: noop
  };
  const windowStub = {
    addEventListener: noop,
    location: {hash: '', href: 'https://example.test/predecessor-meta/'},
    matchMedia: () => ({matches: false, addEventListener: noop})
  };
  const context = vm.createContext({
    INITIAL_BUNDLE: bundle,
    APP_CONFIG: {mode, revision: 1},
    document: documentStub,
    window: windowStub,
    addEventListener: noop,
    location: windowStub.location,
    matchMedia: windowStub.matchMedia,
    navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem: noop, removeItem: noop},
    CSS: {escape: s => String(s)},
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Error,
    Promise,
    isFinite,
    parseFloat,
    parseInt,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: noop,
    console
  });
  context.self = context;
  context.globalThis = context;
  vm.runInContext(ENGINE_SRC, context, {filename: 'engine.js'});
  vm.runInContext(UI_HEAD_SRC, context, {filename: 'ui.js'});
  vm.runInContext(RANK_VIEW_SRC, context, {filename: 'rank_view.js'});
  return vm.runInContext('({B, E, S, effectiveStatSource: () => effectiveStatSource(), rolePriorityHTML: () => rolePriorityHTML(), metaView: () => metaView()})', context);
}

test('PRED-M3: retained Pred.gg sample older than 30h falls back to Statz Meta and keeps the active reviewed working pool in .meta-aside', () => {
  const withinWindow = loadMetaRuntime(fixture({predAgeHours: 29}));
  assert.equal(withinWindow.effectiveStatSource(), 'current', '29h retained Pred.gg stays in the current-cohort Meta view');

  for (const statzTierStatus of ['ok', 'retained']) {
    const expired = loadMetaRuntime(fixture({predAgeHours: 31, statzTierStatus}));
    assert.equal(expired.effectiveStatSource(), 'statz', `31h retained Pred.gg switches Meta to Statz (statz_tierlist=${statzTierStatus})`);
    const poolHTML = expired.rolePriorityHTML();
    assert.match(poolHTML, /class="panel role-priority"/);

    const html = expired.metaView();
    assert.match(
      html,
      /<div class="meta-layout"><div><div class="panel table-panel"><table class="meta-table">[\s\S]*?<\/div><aside class="meta-aside"><div class="panel role-priority"><strong>Reviewed working pool<\/strong>[\s\S]*?<\/div><\/aside><\/div>/,
      `Statz Meta view must wrap table body and <aside class="meta-aside">${poolHTML}</aside> inside .meta-layout (statz_tierlist=${statzTierStatus})`
    );
    const asideMatch = html.match(/<aside class="meta-aside">([\s\S]*?)<\/aside>/);
    assert.ok(asideMatch, 'Statz Meta view renders <aside class="meta-aside">');
    assert.equal(asideMatch[1], poolHTML, 'Statz Meta view reuses rolePriorityHTML() output verbatim inside .meta-aside');
    assert.match(asideMatch[1], /data-hero="khaimera"/);
    assert.match(asideMatch[1], /data-hero="steel"/);
    assert.doesNotMatch(asideMatch[1], /data-hero="unreviewed"/, 'unreviewed pool entries stay excluded');
  }
});

test('PRED-M3: Statz Meta view omits .meta-aside when no working-pool hero has an active strategy review or rank does not match Gold+ review', () => {
  const unreviewedPatch = loadMetaRuntime(fixture({predAgeHours: 31, liveVersion: '1.19', statzTierStatus: 'retained'}));
  assert.equal(unreviewedPatch.effectiveStatSource(), 'statz');
  assert.equal(unreviewedPatch.rolePriorityHTML(), '');
  const unreviewedHTML = unreviewedPatch.metaView();
  assert.doesNotMatch(unreviewedHTML, /meta-aside/);
  assert.doesNotMatch(unreviewedHTML, /role-priority/);

  const silverRank = loadMetaRuntime(fixture({predAgeHours: 31, bracket: 'silver', bracketLabel: 'Silver+'}));
  assert.equal(silverRank.effectiveStatSource(), 'statz');
  assert.equal(silverRank.rolePriorityHTML(), '');
  const silverHTML = silverRank.metaView();
  assert.doesNotMatch(silverHTML, /meta-aside/);
  assert.doesNotMatch(silverHTML, /role-priority/);
});

test('PRED-M3: SOURCE-MANIFEST.json records current SHA-256 digests for modified and added PRED-M3 files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'SOURCE-MANIFEST.json'), 'utf8'));
  for (const relPath of ['ui.js', 'tests/browser_design.cjs', 'tests/statz_working_pool.test.cjs']) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relPath))).digest('hex');
    assert.equal(manifest.files[relPath], digest, 'SOURCE-MANIFEST.json hash mismatch for ' + relPath);
  }
});
