// Compare running node version with .nvmrc and warn if mismatch
const fs = require('fs');
const path = require('path');
try {
  const nvmrc = fs.readFileSync(path.join(__dirname, '..', '.nvmrc'), 'utf8').trim();
  const expected = nvmrc;
  const actual = process.version.replace(/^v/, '');
  if (actual !== expected) {
    console.warn(`\n\u26A0\uFE0F Node runtime mismatch: .nvmrc expects ${expected} but current node is ${actual}.`);
    console.warn('Please run `nvm install && nvm use` or equivalent to switch to the correct Node version.');
  } else {
    console.log(`Node version ${actual} matches .nvmrc (${expected}).`);
  }
} catch (e) {
  // best-effort - do not fail installs
  console.warn('Could not read .nvmrc to validate node version:', e.message);
}
