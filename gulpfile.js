'use strict';

var pkg = require('./package.json');
const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const del = require('del');
const gulp = require('gulp');
const concat = require('gulp-concat');
const yarn = require("gulp-yarn");
const rename = require('gulp-rename');
const os = require('os');
const git = require('gulp-git');
const source = require('vinyl-source-stream');
const stream = require('stream');

const DIST_DIR = './dist/';
const RELEASE_DIR = './release/';

// Global variable to hold the change hash from when we get it, to when we use it.
var gitChangeSetId;

//-----------------
//Tasks
//-----------------

gulp.task('clean', gulp.parallel(clean_dist, clean_release));
gulp.task('clean-dist', clean_dist);
gulp.task('clean-release', clean_release);

// Function definitions are processed before function calls.
const getChangesetId = gulp.series(getHash, writeChangesetId);
gulp.task('get-changeset-id', getChangesetId);

// dist_yarn MUST be done after dist_src
var distBuild = gulp.series(dist_src, dist_changelog, dist_yarn, dist_locale, dist_libraries, dist_resources, getChangesetId);
var distRebuild = gulp.series(clean_dist, distBuild);
gulp.task('dist', distRebuild);

// Electron Forge/Builder tasks
gulp.task('electron-start', gulp.series(distRebuild, electron_start));
gulp.task('electron-package', gulp.series(distRebuild, electron_package));
gulp.task('electron-make', gulp.series(distRebuild, electron_make));

// Default task: build and start in debug mode
gulp.task('default', gulp.series(distRebuild, electron_start));

// Legacy compat: Keep 'debug' and 'release' tasks for backwards compatibility
gulp.task('debug', gulp.series(distRebuild, electron_start));
gulp.task('release', electron_make);

// -----------------
// Helper functions
// -----------------

function clean_dist() {
    return del([DIST_DIR + '**'], { force: true });
}

function clean_release() {
    return del([RELEASE_DIR + '**'], { force: true });
}

// Real work for dist task. Done in another task to call it via gulp series.
function dist_src() {
    var distSources = [
        './src/**/*',
        '!./src/css/dropdown-lists/LICENSE',
        '!./src/css/font-awesome/css/font-awesome.css',
        '!./src/css/opensans_webfontkit/*.{txt,html}',
        '!./src/support/**'
    ];
    var packageJson = new stream.Readable;
    packageJson.push(JSON.stringify(pkg,undefined,2));
    packageJson.push(null);

    return packageJson
        .pipe(source('package.json'))
        .pipe(gulp.src(distSources, { base: 'src' }))
        .pipe(gulp.src('manifest.json', { passthrougth: true }))
        .pipe(gulp.src('yarn.lock', { passthrougth: true }))
        .pipe(gulp.dest(DIST_DIR));
}

function dist_changelog() {
    return gulp.src('changelog.html')
        .pipe(gulp.dest(DIST_DIR+"tabs/"));
}

// This function relies on files from the dist_src function
function dist_yarn() {
    return gulp.src(['./dist/package.json', './dist/yarn.lock'])
        .pipe(gulp.dest('./dist'))
        .pipe(yarn({
            production: true
        }));
}

function dist_locale() {
    return gulp.src('./locales/**/*', { base: 'locales'})
        .pipe(gulp.dest(DIST_DIR + '_locales'));
}

function dist_libraries() {
    return gulp.src('./libraries/**/*', { base: '.'})
        .pipe(gulp.dest(DIST_DIR + 'js'));
}

function dist_resources() {
    return gulp.src(['./resources/**/*', '!./resources/osd/**/*.png'], { base: '.'})
        .pipe(gulp.dest(DIST_DIR));
}

function getHash(cb) {
    git.revParse({args: '--short HEAD'}, function (err, hash) {
        if (err) {
            gitChangeSetId = 'unsupported';
        } else {
            gitChangeSetId = hash;
        }
        cb();
    });
}

function writeChangesetId() {
    var versionJson = JSON.stringify({
        gitChangesetId: gitChangeSetId,
        version: pkg.version,
        max_msp: pkg.max_msp
        }, undefined, 2);
    
    fse.ensureDirSync(DIST_DIR);
    fs.writeFileSync(path.join(DIST_DIR, 'version.json'), versionJson);
    console.log('Wrote version.json to ' + path.join(DIST_DIR, 'version.json'));
    return Promise.resolve();
}

// Electron tasks: These invoke electron-forge commands which use forge.config.js
function electron_start(done) {
    console.log('Starting Electron in development mode...');
    const cp = child_process.spawn('npx', ['electron-forge', 'start'], { stdio: 'inherit' });
    cp.on('exit', (code) => {
        if (code !== 0) {
            console.error('Electron start failed with code:', code);
            process.exit(code);
        }
        done();
    });
}

function electron_package(done) {
    console.log('Packaging Electron app...');
    const cp = child_process.spawn('npx', ['electron-forge', 'package'], { stdio: 'inherit' });
    cp.on('exit', (code) => {
        if (code !== 0) {
            console.error('Electron packaging failed with code:', code);
            process.exit(code);
        }
        console.log('Packaging complete. Check ./out/ for results.');
        done();
    });
}

function electron_make(done) {
    console.log('Building Electron installers/distributables...');
    const cp = child_process.spawn('npx', ['electron-forge', 'make'], { stdio: 'inherit' });
    cp.on('exit', (code) => {
        if (code !== 0) {
            console.error('Electron make failed with code:', code);
            process.exit(code);
        }
        console.log('Build complete. Check ./out/make/ for installers.');
        done();
    });
}
