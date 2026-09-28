'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const manifest = fs.readFileSync('extension.toml', 'utf8');
const grammar = manifest.split('[grammars.gherkin]')[1];
const revision = grammar.match(/^rev = "([0-9a-f]{40})"$/m)?.[1];
if (!revision || !grammar.includes('path = "grammar"')) throw new Error('Pin the vendored grammar to a full commit SHA');
// The grammar Zed fetches must match the sources exercised by these tests.
execFileSync('git', ['diff', '--exit-code', revision, '--', 'grammar'], { stdio: 'inherit' });
