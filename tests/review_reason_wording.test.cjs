'use strict';
// Freshness Phase 1 (2.42.0): an inactive reviewed build is explained in a sentence. Before, the engine pasted the status
// word into "The reviewed build is <status>.", which read "The reviewed build is needs review." on the site.
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine.js'),{fixture}=require('./build_coach.test.cjs');
const me={slug:'hero',role:'jungle'};
const broken=/^The reviewed build is (needs review|review unresolved|supporting mechanics|item metadata|incompatible)/;
const cases={
  'needs review':b=>{b.guidance.status='needs review';},
  'supporting mechanics changed; needs review':b=>{b.heroes.hero.abilities[0].text='Changed';},
  'item metadata unavailable':b=>{delete b.items.B;}
};
for(const [status,mutate] of Object.entries(cases))test(status+' reads as a sentence in Match',()=>{
  const b=fixture();mutate(b);const e=M.create(b),review=e.buildReview('hero','jungle'),a=e.adaptBuild(me);
  assert.equal(review.status,status);assert.equal(a.available,false);
  assert.doesNotMatch(a.unavailableReason,broken,a.unavailableReason);
  assert.match(a.unavailableReason,/^The reviewed build [^]+\.$/,a.unavailableReason);
});
test('every review status has its own sentence',()=>{
  assert.equal(typeof M.reviewReason,'function');
  const said={
    'needs review':M.reviewReason('needs review'),
    'review unresolved: Experimental role; kept out of automatic suggestions.':M.reviewReason('review unresolved: Experimental role; kept out of automatic suggestions.'),
    'item metadata unavailable':M.reviewReason('item metadata unavailable'),
    'incompatible blessing tree':M.reviewReason('incompatible blessing tree'),
    'supporting mechanics changed; needs review':M.reviewReason('supporting mechanics changed; needs review')
  };
  for(const [status,sentence] of Object.entries(said)){
    assert.doesNotMatch(sentence,broken,status);assert.match(sentence,/^The reviewed build [^]+\.$/,status);
  }
  assert.match(said['review unresolved: Experimental role; kept out of automatic suggestions.'],/Experimental role; kept out of automatic suggestions\./);
  assert.match(M.reviewReason('something new'),/^The reviewed build is not active \(something new\)\.$/);
});
