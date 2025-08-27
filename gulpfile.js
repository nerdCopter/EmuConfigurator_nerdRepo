'use strict';

var pkg = require('./package.json');
// remove gulp-appdmg from the package.json we're going to write
delete pkg.optionalDependencies['gulp-appdmg'];

const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const makensis = require('makensis');
const deb = require('gulp-debian');
const buildRpm = require('rpm-builder');
const commandExistsSync = require('command-exists').sync;

const gulp = require('gulp');
const concat = require('gulp-concat');
const yarn = require("gulp-yarn");
const rename = require('gulp-rename');
const os = require('os');
const git = require('gulp-git');
const source = require('vinyl-source-stream');
const stream = require('stream');
const browserify = require('browserify');

const DIST_DIR = './dist/';
const APPS_DIR = './apps/';
const DEBUG_DIR = './debug/';
const RELEASE_DIR = './release/';

const LINUX_INSTALL_DIR = '/opt/emuflight';

// Global variable to hold the change hash from when we get it, to when we use it.
var gitChangeSetId;

//-----------------
//Pre tasks operations
//-----------------
const SELECTED_PLATFORMS = getInputPlatforms();

//-----------------
//Tasks
//-----------------

gulp.task('clean', gulp.parallel(clean_dist, clean_apps, clean_debug, clean_release));

gulp.task('clean-dist', clean_dist);

gulp.task('clean-apps', clean_apps);

gulp.task('clean-debug', clean_debug);

gulp.task('clean-release', clean_release);

gulp.task('clean-cache', clean_cache);

// Function definitions are processed before function calls.
const getChangesetId = gulp.series(getHash, writeChangesetId);
gulp.task('get-changeset-id', getChangesetId);

function dist_src_files() {
    var distSources = [
        './src/**/*',
        '!./src/css/dropdown-lists/LICENSE',
        '!./src/css/font-awesome/css/font-awesome.css',
        '!./src/support/**'
    ];
    return gulp.src(distSources, { base: 'src' })
        .pipe(gulp.dest(DIST_DIR));
}

function dist_src_root_files() {
    return gulp.src(['manifest.json', 'yarn.lock'])
        .pipe(gulp.dest(DIST_DIR));
}

function dist_src_package_json() {
    var packageJson = new stream.Readable;
    packageJson.push(JSON.stringify(pkg,undefined,2));
    packageJson.push(null);
    return packageJson
        .pipe(source('package.json'))
        .pipe(gulp.dest(DIST_DIR));
}

const dist_src = gulp.parallel(dist_src_files, dist_src_root_files, dist_src_package_json);

function bundle() {
    return browserify({
        entries: 'src/js/main.js',
        debug: true
    })
    .bundle()
    .pipe(source('bundle.js'))
    .pipe(gulp.dest(DIST_DIR));
}

function dist_fontawesome() {
    gulp.src('./node_modules/@fortawesome/fontawesome-free/css/all.min.css')
        .pipe(gulp.dest(DIST_DIR + 'css/font-awesome/css'));
    return gulp.src('./node_modules/@fortawesome/fontawesome-free/webfonts/*')
        .pipe(gulp.dest(DIST_DIR + 'css/font-awesome/webfonts'));
}

// dist_yarn MUST be done after dist_src
var distBuild = gulp.series(dist_src, dist_changelog, dist_yarn, dist_locale, bundle, dist_fontawesome, dist_resources, getChangesetId);
var distRebuild = gulp.series(clean_dist, distBuild);
gulp.task('dist', distRebuild);

var appsBuild = gulp.series(gulp.parallel(clean_apps, distRebuild), apps);
gulp.task('apps', appsBuild);

var debugBuild = gulp.series(distBuild, debug, start_debug)
gulp.task('debug', debugBuild);

var releaseBuild = gulp.series(gulp.parallel(clean_release, appsBuild), gulp.parallel(listReleaseTasks()));
gulp.task('release', releaseBuild);

var multiReleaseBuild = gulp.series(gulp.parallel(appsBuild), gulp.parallel(listReleaseTasks()));
gulp.task('mrelease', multiReleaseBuild);

gulp.task('default', debugBuild);

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --osx64, --win32, --win64, or --chromeos)
// #
function getInputPlatforms() {
    var supportedPlatforms = ['linux64', 'linux32', 'osx64', 'win32', 'win64', 'chromeos'];
    var platforms = [];
    var regEx = /--(\w+)/;
    console.log(process.argv);
    for (var i = 3; i < process.argv.length; i++) {
        var arg = process.argv[i].match(regEx)[1];
        if (supportedPlatforms.indexOf(arg) > -1) {
            platforms.push(arg);
        } else if (arg == 'nowinicon') {
            console.log('ignoring winIco')
            delete nwBuilderOptions['winIco'];
        } else {
            console.log('Unknown platform: ' + arg);
            process.exit();
        }
    }

    if (platforms.length === 0) {
        var defaultPlatform = getDefaultPlatform();
        if (supportedPlatforms.indexOf(defaultPlatform) > -1) {
            platforms.push(defaultPlatform);
        } else {
            console.error(`Your current platform (${os.platform()}) is not a supported build platform. Please specify platform to build for on the command line.`);
            process.exit();
        }
    }

    if (platforms.length > 0) {
        console.log('Building for platform(s): ' + platforms + '.');
    } else {
        console.error('No suitables platforms found.');
        process.exit();
    }

    return platforms;
}

// Gets the default platform to be used
function getDefaultPlatform() {
    var defaultPlatform;
    switch (os.platform()) {
    case 'darwin':
        defaultPlatform = 'osx64';
        break;
    case 'linux':
        defaultPlatform = 'linux64';
        break;
    case 'win32':
        defaultPlatform = 'win32';
        break;
    case 'win64':
        defaultPlatform = 'win64';
        break;
    default:
        defaultPlatform = '';
        break;
    }
    return defaultPlatform;
}


function getPlatforms() {
    return SELECTED_PLATFORMS.slice();
}

function removeItem(platforms, item) {
    var index = platforms.indexOf(item);
    if (index >= 0) {
        platforms.splice(index, 1);
    }
}

function getRunDebugAppCommand(arch) {
    switch (arch) {
    case 'osx64':
        return 'open ' + path.join(DEBUG_DIR, pkg.name + '.app');
        break;
    case 'linux64':
    case 'linux32':
        return path.join(DEBUG_DIR, pkg.name);
        break;
    case 'win32':
    case 'win64':
        return path.join(DEBUG_DIR, pkg.name + '.exe');
        break;
    default:
        return '';
        break;
    }
}

function getReleaseFilename(platform, ext) {
    return `${pkg.name}_${pkg.version}_${platform}.${ext}`;
}

async function clean_dist() {
    const {deleteAsync} = await import('del');
    return deleteAsync([DIST_DIR + '**'], { force: true });
}

async function clean_apps() {
    const {deleteAsync} = await import('del');
    return deleteAsync([APPS_DIR + '**'], { force: true });
}

async function clean_debug() {
    const {deleteAsync} = await import('del');
    return deleteAsync([DEBUG_DIR + '**'], { force: true });
}

async function clean_release() {
    const {deleteAsync} = await import('del');
    return deleteAsync([RELEASE_DIR + '**'], { force: true });
}

async function clean_cache() {
    const {deleteAsync} = await import('del');
    return deleteAsync(['./cache/**'], { force: true });
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

// Create runable app directories in ./apps
function apps(done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');
    removeItem(platforms, 'android');

    buildNWApps(platforms, 'normal', APPS_DIR, done);
}

// Create debug app directories in ./debug
function debug(done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');

    buildNWApps(platforms, 'sdk', DEBUG_DIR, done);
}

function parsePlatform(platform) {
    switch (platform) {
        case 'osx64':
            return { platform: 'osx', arch: 'x64' };
        case 'win32':
            return { platform: 'win', arch: 'ia32' };
        case 'win64':
            return { platform: 'win', arch: 'x64' };
        case 'linux32':
            return { platform: 'linux', arch: 'ia32' };
        case 'linux64':
            return { platform: 'linux', arch: 'x64' };
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

async function buildNWApps(platforms, flavor, dir, done) {
    const nwbuild = await import('nw-builder');
    if (platforms.length > 0) {
        for (const p of platforms) {
            const { platform, arch } = parsePlatform(p);
            try {
                await nwbuild.default({
                    srcDir: './dist',
                    glob: false,
                    mode: 'build',
                    version: '0.88.0',
                    flavor: flavor,
                    platform: platform,
                    arch: arch,
                    outDir: dir,
                    // macIcns: './assets/osx/app-icon.icns', //TODO
                    // macPlist: { 'CFBundleDisplayName': 'Emuflight Configurator'}, //TODO
                    // winIco: './src/images/emu_icon.ico', //TODO
                    zip: false,
                });
            } catch (error) {
                console.log('Error building NW apps: ' + error);
                clean_debug();
                process.exit(1);
            }
        }
        done();
    } else {
        console.log('No platform suitable for NW Build')
        done();
    }
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
    var versionJson = new stream.Readable;
    versionJson.push(JSON.stringify({
        gitChangesetId: gitChangeSetId,
        version: pkg.version,
        max_msp: pkg.max_msp
        }, undefined, 2));
    versionJson.push(null);
    return versionJson
        .pipe(source('version.json'))
        .pipe(gulp.dest(DIST_DIR))
}

function start_debug(done) {

    var platforms = getPlatforms();

    var exec = require('child_process').exec;
    if (platforms.length === 1) {
        var run = getRunDebugAppCommand(platforms[0]);
        console.log('Starting debug app (' + run + ')...');
        exec(run, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
        });
    } else {
        console.log('More than one platform specified, not starting debug app');
    }
    done();
}

// Create installer package for windows platforms
function release_win(arch, done) {

    // Check if makensis exists
    if (!commandExistsSync('makensis')) {
        console.warn('makensis command not found, not generating package for: ' + arch);
        return done();
    }

    // The makensis does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    // Parameters passed to the installer script
    const options = {
            verbose: 3,
            define: {
                'VERSION': pkg.version,
                'PLATFORM': arch,
                'DEST_FOLDER': RELEASE_DIR
            }
        }

    var output = makensis.compileSync('./assets/windows/installer.nsi', options);

    if (output.status === 0) {
        console.log(`Standard output:\n${output.stdout}`);
    } else {
        console.error(`Exit Code ${output.status}: ${output.stderr}`);
    }

    done();
}

// Create distribution package (zip) for windows and linux platforms
async function release_zip(arch) {
    var src = path.join(APPS_DIR, '**');
    var output = getReleaseFilename(arch, 'zip');
    var base = APPS_DIR;

    return await compressFiles(src, base, output, 'Emuflight Configurator');
}

// Create distribution package for chromeos platform
async function release_chromeos() {
    var src = path.join(DIST_DIR, '**');
    var output = getReleaseFilename('chromeos', 'zip');
    var base = DIST_DIR;

    return await compressFiles(src, base, output, '.');
}

// Compress files from srcPath, using basePath, to outputFile in the RELEASE_DIR
async function compressFiles(srcPath, basePath, outputFile, zipFolder) {
    const zip = await import('gulp-zip');
    return gulp.src(srcPath, { base: basePath })
               .pipe(rename(function(actualPath) {
                   actualPath.dirname = path.join(zipFolder, actualPath.dirname);
               }))
               .pipe(zip.default(outputFile))
               .pipe(gulp.dest(RELEASE_DIR));
}

function release_deb(arch, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('dpkg-deb')) {
        console.warn('dpkg-deb command not found, not generating deb package for ' + arch);
        return done();
    }

    return gulp.src([path.join(APPS_DIR, '*')])
        .pipe(deb({
             package: pkg.name,
             version: pkg.version,
             section: 'base',
             priority: 'optional',
             architecture: getLinuxPackageArch('deb', arch),
             maintainer: pkg.author,
             description: pkg.description,
             preinst: [`rm -rf ${LINUX_INSTALL_DIR}/${pkg.name}`],
             postinst: [`chown root:root ${LINUX_INSTALL_DIR}`, `chown -R root:root ${LINUX_INSTALL_DIR}/${pkg.name}`, `xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`],
             prerm: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
             depends: 'libgconf-2-4',
             changelog: [],
             _target: `${LINUX_INSTALL_DIR}/${pkg.name}`,
             _out: RELEASE_DIR,
             _copyright: 'assets/linux/copyright',
             _clean: true
    }));
}

function release_rpm(arch, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('rpmbuild')) {
        console.warn('rpmbuild command not found, not generating rpm package for ' + arch);
        return done();
    }

    // The buildRpm does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    var options = {
             name: pkg.name,
             version: pkg.version,
             buildArch: getLinuxPackageArch('rpm', arch),
             vendor: pkg.author,
             summary: pkg.description,
             license: 'GNU General Public License v3.0',
             requires: 'libgconf-2-4',
             prefix: '/opt',
             files:
                 [ { cwd: APPS_DIR,
                     src: '*',
                     dest: `${LINUX_INSTALL_DIR}/${pkg.name}` } ],
             postInstallScript: [`xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`],
             preUninstallScript: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
             tempDir: path.join(RELEASE_DIR,'tmp-rpm-build-' + arch),
             keepTemp: false,
             verbose: false,
             rpmDest: RELEASE_DIR,
             execOpts: { maxBuffer: 1024 * 1024 * 16 },
    };

    buildRpm(options, function(err, rpm) {
        if (err) {
          console.error("Error generating rpm package: " + err);
        }
        done();
    });
}

function getLinuxPackageArch(type, arch) {
    var packArch;

    switch (arch) {
    case 'linux32':
        packArch = 'i386';
        break;
    case 'linux64':
        if (type == 'rpm') {
            packArch = 'x86_64';
        } else {
            packArch = 'amd64';
        }
        break;
    default:
        console.error("Package error, arch: " + arch);
        process.exit(1);
        break;
    }

    return packArch;
}

// TODO: add code-signing https://github.com/LinusU/node-appdmg
// Create distribution package for macOS platform
function release_osx64() {

    if (process.env.TRAVIS_OS_NAME == 'osx') {
        const { execSync } = require('child_process');
        let stdout = execSync('./codesign_osxapp.sh');
    } else {
        console.log('running locally - skipping signing of app');
    }

    //var appdmg = require('gulp-appdmg');
    const appdmg = require('./gulp-macdmg');


    // The appdmg does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    // The src pipe is not used
    return gulp.src(['.'])
        .pipe(appdmg({
            target: path.join(RELEASE_DIR, getReleaseFilename('macOS', 'dmg')),
            basepath: APPS_DIR,
            specification: {
                'title': 'Emuflight Configurator',
                //'icon': 'assets/osx/app-icon.icns', // FIXME
                'icon-size': 128,
                'background': path.join(__dirname, 'assets/osx/dmg-background.png'),
                'contents': [
                    { 'x': 180, 'y': 590, 'type': 'file', 'path': pkg.name + '.app', 'name': 'Emuflight Configurator.app' },
                    { 'x': 570, 'y': 590, 'type': 'link', 'path': '/Applications' }

                ],
                background: path.join(__dirname, 'assets/osx/dmg-background.png'),
                format: 'UDZO',
                window: {
                    size: {
                        width: 755,
                        height: 755
                    }
                },
                //'code-sign': { 'signing-identity': process.env.APP_IDENTITY }
            },
        })
    );
}

// Create the dir directory, with write permissions
function createDirIfNotExists(dir) {
    fs.mkdir(dir, '0775', function(err) {
        if (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    });
}

// Create a list of the gulp tasks to execute for release
function listReleaseTasks(done) {

    var platforms = getPlatforms();

    var releaseTasks = [];

    if (platforms.indexOf('chromeos') !== -1) {
        releaseTasks.push(release_chromeos);
    }

    if (platforms.indexOf('linux64') !== -1) {
        releaseTasks.push(function release_linux64_zip() {
            return release_zip('linux64');
        });
        releaseTasks.push(function release_linux64_deb(done) {
            return release_deb('linux64', done);
        });
        releaseTasks.push(function release_linux64_rpm(done) {
            return release_rpm('linux64', done);
        });
    }

    if (platforms.indexOf('linux32') !== -1) {
        releaseTasks.push(function release_linux32_zip() {
            return release_zip('linux32');
        });
        releaseTasks.push(function release_linux32_deb(done) {
            return release_deb('linux32', done);
        });
        releaseTasks.push(function release_linux32_rpm(done) {
            return release_rpm('linux32', done);
        });
    }

    if (platforms.indexOf('osx64') !== -1) {
        releaseTasks.push(release_osx64);
    }

    if (platforms.indexOf('win32') !== -1) {
        releaseTasks.push(function release_win32_zip() {
            return release_zip('win32');
        });
        releaseTasks.push(function release_win32(done) {
            return release_win('win32', done);
        });
    }

    if (platforms.indexOf('win64') !== -1) {
        releaseTasks.push(function release_win64_zip() {
            return release_zip('win64');
        });
        releaseTasks.push(function release_win64(done) {
            return release_win('win64', done);
        });
    }

    return releaseTasks;
}
