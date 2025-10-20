'use strict';

var pkg = require('./package.json');
// remove gulp-appdmg from the package.json we're going to write
delete pkg.optionalDependencies['gulp-appdmg'];

const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const https = require('follow-redirects').https;
const path = require('path');

const zip = require('gulp-zip');
const del = require('del');
const makensis = require('makensis');
const deb = require('gulp-debian');
const buildRpm = require('rpm-builder');
const commandExistsSync = require('command-exists').sync;
const targz = require('targz');

const gulp = require('gulp');
const concat = require('gulp-concat');
const yarn = require("gulp-yarn");
const rename = require('gulp-rename');
const os = require('os');
const git = require('gulp-git');
const source = require('vinyl-source-stream');
const stream = require('stream');

const DIST_DIR = './dist/';
const APPS_DIR = './apps/';
const DEBUG_DIR = './debug/';
const RELEASE_DIR = './release/';

const LINUX_INSTALL_DIR = '/opt/emuflight';

// Global variable to hold the change hash from when we get it, to when we use it.
var gitChangeSetId;

// FIXME: hardcoded version number
// 0.45.6 Win7 connects; 0.42.3 fixed OSX Flashing; 0.46.X broke Win7 connect. maybe serial/usb needs updating
// reverted to 0.42.6 due to Windows increased CLI-tab buffer/autocomplete issues.
// 0.50.3 is last version to open Links properly. also works on Win11.
var NWversion;
if (os.platform() === 'win32') {
    NWversion ='0.42.6'
} else {
    NWversion ='0.50.3'
}

var nwBuilderOptions = {
    version: NWversion,
    files: './dist/**/*',
    macIcns: './assets/osx/app-icon.icns',
    macPlist: { 'CFBundleDisplayName': 'Emuflight Configurator'},
    winIco: './src/images/emu_icon.ico',
    zip: false,
    downloadUrl: 'https://dl.nwjs.io',
    manifestUrl: 'https://dl.nwjs.io/versions.json'
};

// FIXME: hardcoded version number
var nwArmVersion = '0.28.4';

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

gulp.task('download-nwjs', function(done) {
    const nwjsSdkDir = './nwjs-sdk';
    const currentPlatform = os.platform();
    const currentArch = os.arch();

    let platformString;
    let archString;
    let fileExtension;
    let stripComponents = 1; // Default for tar.gz

    // Determine platform string for NW.js download
    if (currentPlatform === 'darwin') {
        platformString = 'osx';
        fileExtension = 'zip';
    } else if (currentPlatform === 'win32') {
        platformString = 'win';
        fileExtension = 'zip';
    } else if (currentPlatform === 'linux') {
        platformString = 'linux';
        fileExtension = 'tar.gz';
    } else {
        console.error(`Unsupported platform: ${currentPlatform}`);
        return done(new Error('Unsupported platform'));
    }

    // Determine architecture string for NW.js download
    if (currentArch === 'x64') {
        archString = 'x64';
    } else if (currentArch === 'ia32') {
        archString = 'ia32';
    } else if (currentArch === 'arm64') { // For macOS M1
        archString = 'arm64';
    } else {
        console.error(`Unsupported architecture: ${currentArch}`);
        return done(new Error('Unsupported architecture'));
    }

    const nwjsFileName = `nwjs-sdk-v${NWversion}-${platformString}-${archString}.${fileExtension}`;
    const nwjsUrl = `https://dl.nwjs.io/v${NWversion}/${nwjsFileName}`;
    const nwjsTarballPath = `./${nwjsFileName}`;

    if (fs.existsSync(nwjsSdkDir)) {
        console.log('NW.js SDK already exists, skipping download.');
        return done();
    }

    console.log(`Downloading NW.js SDK for ${platformString}-${archString} from ${nwjsUrl}...`);
    const file = fs.createWriteStream(nwjsTarballPath);
    https.get(nwjsUrl, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(function() {
                console.log('NW.js SDK downloaded. Extracting...');
                try {
                    fse.ensureDirSync(nwjsSdkDir); // Ensure the directory exists before extraction
                    if (fileExtension === 'zip') {
                        // For zip files, use a different extraction method (e.g., 'unzip' command)
                        // This assumes 'unzip' is available on the system.
                        // For Windows, this would need a different approach or a node module.
                        child_process.execSync(`unzip -o ${nwjsTarballPath} -d ${nwjsSdkDir}`);
                        // NW.js zip files often extract into a folder named like nwjs-sdk-vX.Y.Z-platform-arch
                        // We need to move its content to nwjsSdkDir
                        const extractedFolderName = `nwjs-sdk-v${NWversion}-${platformString}-${archString}`;
                        fse.moveSync(path.join(nwjsSdkDir, extractedFolderName), nwjsSdkDir, { overwrite: true });
                    } else { // tar.gz
                        child_process.execSync(`tar -xzf ${nwjsTarballPath} -C ${nwjsSdkDir} --strip-components=${stripComponents}`);
                    }
                    console.log('NW.js SDK extracted.');
                    fs.unlinkSync(nwjsTarballPath); // Clean up tarball
                    done();
                } catch (err) {
                    console.error('Error during extraction:', err.message);
                    done(err);
                }
            });
        });
    }).on('error', function(err) {
        console.error('Error during download:', err.message);
        fs.unlink(nwjsTarballPath, () => done(err)); // Delete the file async.
    });
});

// Function definitions are processed before function calls.
const getChangesetId = gulp.series(getHash, writeChangesetId);
gulp.task('get-changeset-id', getChangesetId);

// dist_yarn MUST be done after dist_src
var distBuild = gulp.series(dist_src, dist_changelog, dist_yarn, dist_locale, dist_libraries, dist_resources, getChangesetId);
var distRebuild = gulp.series(clean_dist, distBuild);
gulp.task('dist', distRebuild);

var appsBuild = gulp.series(gulp.parallel(clean_apps, distRebuild), apps, gulp.parallel(listPostBuildTasks(APPS_DIR)));
gulp.task('apps', appsBuild);

var debugBuild = gulp.series(clean_debug, distBuild, 'download-nwjs', gulp.parallel(listPostBuildTasks(DEBUG_DIR)), start_debug)
gulp.task('debug', debugBuild);

var releaseBuild = gulp.series(gulp.parallel(clean_release, appsBuild), gulp.parallel(listReleaseTasks()));
gulp.task('release', releaseBuild);

var multiReleaseBuild = gulp.series(gulp.parallel(appsBuild), gulp.parallel(listReleaseTasks()));
gulp.task('mrelease', multiReleaseBuild);

gulp.task('default', debugBuild);

gulp.task('download-nwjs', function(done) {
    const nwjsSdkDir = './nwjs-sdk';
    const nwjsTarball = 'nwjs-sdk-v0.50.3-linux-x64.tar.gz';
    const nwjsUrl = 'https://dl.nwjs.io/v0.50.3/nwjs-sdk-v0.50.3-linux-x64.tar.gz';

    if (fs.existsSync(nwjsSdkDir)) {
        console.log('NW.js SDK already exists, skipping download.');
        return done();
    }

    console.log('Downloading NW.js SDK...');
    const file = fs.createWriteStream(nwjsTarball);
    https.get(nwjsUrl, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(function() {
                console.log('NW.js SDK downloaded. Extracting...');
                child_process.execSync(`mkdir ${nwjsSdkDir} && tar -xzf ${nwjsTarball} -C ${nwjsSdkDir} --strip-components=1`);
                console.log('NW.js SDK extracted.');
                fs.unlinkSync(nwjsTarball); // Clean up tarball
                done();
            });
        });
    }).on('error', function(err) {
        fs.unlink(nwjsTarball); // Delete the file async. (But we don't check the result)
        done(err);
    });
});

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --armv7, --osx64, --win32, --win64, or --chromeos)
// #
function getInputPlatforms() {
    var supportedPlatforms = ['linux64', 'linux32', 'armv7', 'osx64', 'win32', 'win64', 'chromeos'];
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
    const currentPlatform = os.platform();

    let executablePath;
    if (currentPlatform === 'darwin') {
        executablePath = path.join('./nwjs-sdk', 'nwjs.app', 'Contents', 'MacOS', 'nwjs');
    } else if (currentPlatform === 'win32') {
        executablePath = path.join('./nwjs-sdk', 'nw.exe');
    } else { // Linux
        executablePath = path.join('./nwjs-sdk', 'nw');
    }

    return `${executablePath} ./dist/`;
}

function getReleaseFilename(platform, ext) {
    return `${pkg.name}_${pkg.version}_${platform}.${ext}`;
}

function clean_dist() {
    return del([DIST_DIR + '**'], { force: true });
}

function clean_apps() {
    return del([APPS_DIR + '**'], { force: true });
}

function clean_debug() {
    return del([DEBUG_DIR], { force: true });
}

function clean_release() {
    return del([RELEASE_DIR + '**'], { force: true });
}

function clean_cache() {
    return del(['./cache/**'], { force: true });
}

// Real work for dist task. Done in another task to call it via
// run-sequence.
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
        .pipe(yarn());
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

    // Use gulp.series to run buildAppBundle for each platform sequentially
    const buildTasks = platforms.map(platform => function(cb) {
        buildAppBundle([platform], 'normal', APPS_DIR, cb);
    });

    gulp.series(...buildTasks)(done);
}

function listPostBuildTasks(folder, done) {

    var platforms = getPlatforms();

    var postBuildTasks = [];

    if (platforms.indexOf('linux32') != -1) {
        postBuildTasks.push(function post_build_linux32(done) {
            return post_build('linux32', folder, done);
        });
    }

    if (platforms.indexOf('linux64') != -1) {
        postBuildTasks.push(function post_build_linux64(done) {
            return post_build('linux64', folder, done);
        });
    }

    if (platforms.indexOf('armv7') != -1) {
        postBuildTasks.push(function post_build_armv7(done) {
            return post_build('armv7', folder, done);
        });
    }

    // We need to return at least one task, if not gulp will throw an error
    if (postBuildTasks.length == 0) {
        postBuildTasks.push(function post_build_none(done) {
            done();
        });
    }
    return postBuildTasks;
}

function post_build(arch, folder, done) {

    if ((arch === 'linux32') || (arch === 'linux64')) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(folder, pkg.name, arch);
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);

        try {
            // Copy copyright - temporarily commented out due to ENOTDIR error
            // const copyrightPath = path.join(launcherDir, 'copyright');
            // fse.removeSync(copyrightPath); // Ensure any existing 'copyright' directory/file is removed
            // const copyrightContent = fs.readFileSync('assets/linux/copyright');
            // fs.writeFileSync(copyrightPath, copyrightContent);
            // Copy icon directory - temporarily commented out due to ENOTDIR error
            // fse.removeSync(path.join(launcherDir, 'icon')); // Ensure any existing 'icon' file/directory is removed
            // fse.copySync('assets/linux/icon/', path.join(launcherDir, 'icon/'), { overwrite: true });
            done();
        } catch (err) {
            console.error('Error copying launcher scripts: ' + err);
            done(err);
        }
    } else if (arch === 'armv7') {
        console.log('Moving ARMv7 build from "linux32" to "armv7" directory...');
        fse.moveSync(path.join(folder, pkg.name, 'linux32'), path.join(folder, pkg.name, 'armv7'));
        done();
    } else {
        done();
    }
}

// Create debug app directories in ./debug
function debug(done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');

    buildNWAppsWrapper(platforms, 'sdk', DEBUG_DIR, done);
}

function injectARMCache(flavor, callback) {
    var flavorPostfix = `-${flavor}`;
    var flavorDownloadPostfix = flavor !== 'normal' ? `-${flavor}` : '';
    clean_cache().then(function() {
        if (!fs.existsSync('./cache')) {
            fs.mkdirSync('./cache');
        }
        fs.closeSync(fs.openSync('./cache/_ARMv7_IS_CACHED', 'w'));
        var versionFolder = `./cache/${nwBuilderOptions.version}${flavorPostfix}`;
        if (!fs.existsSync(versionFolder)) {
            fs.mkdirSync(versionFolder);
        }
        if (!fs.existsSync(versionFolder + '/linux32')) {
            fs.mkdirSync(`${versionFolder}/linux32`);
        }
        var downloadedArchivePath = `${versionFolder}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        var downloadUrl = `https://github.com/LeonardLaszlo/nw.js-armv7-binaries/releases/download/v${nwArmVersion}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        if (fs.existsSync(downloadedArchivePath)) {
            console.log('Prebuilt ARMv7 binaries found in /tmp');
            downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
        } else {
            console.log(`Downloading prebuilt ARMv7 binaries from "${downloadUrl}"...`);
            process.stdout.write('> Starting download...\r');
            var armBuildBinary = fs.createWriteStream(downloadedArchivePath);
            var request = https.get(downloadUrl, function(res) {
                var totalBytes = res.headers['content-length'];
                var downloadedBytes = 0;
                res.pipe(armBuildBinary);
                res.on('data', function (chunk) {
                        downloadedBytes += chunk.length;
                        process.stdout.write(`> ${parseInt((downloadedBytes * 100) / totalBytes)}% done             \r`);
                });
                armBuildBinary.on('finish', function() {
                    process.stdout.write('> 100% done             \n');
                    armBuildBinary.close(function() {
                        downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
                    });
                });
            });
        }
    });

    function downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder) {
        console.log('Injecting prebuilt ARMv7 binaries into Linux32 cache...');
        targz.decompress({
            src: downloadedArchivePath,
            dest: versionFolder,
        }, function(err) {
            if (err) {
                console.log(err);
                clean_debug();
                process.exit(1);
            } else {
                fs.rename(
                    `${versionFolder}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm`,
                    `${versionFolder}/linux32`,
                    (err) => {
                        if (err) {
                            console.log(err);
                            clean_debug();
                            process.exit(1);
                        }
                        callback();
                    }
                );
            }
        });
    }
}

function buildAppBundle(platforms, flavor, dir, done) {
    const nwjsSdkDir = './nwjs-sdk';
    const currentPlatform = os.platform();
    const currentArch = os.arch();

    let platformString;
    let archString;

    // Determine platform string for NW.js download
    if (currentPlatform === 'darwin') {
        platformString = 'osx';
    } else if (currentPlatform === 'win32') {
        platformString = 'win';
    } else if (currentPlatform === 'linux') {
        platformString = 'linux';
    } else {
        console.error(`Unsupported platform: ${currentPlatform}`);
        return done(new Error('Unsupported platform'));
    }

    // Determine architecture string for NW.js download
    if (currentArch === 'x64') {
        archString = 'x64';
    } else if (currentArch === 'ia32') {
        archString = 'ia32';
    } else if (currentArch === 'arm64') { // For macOS M1
        archString = 'arm64';
    } else {
        console.error(`Unsupported architecture: ${currentArch}`);
        return done(new Error('Unsupported architecture'));
    }

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    const appBundleDir = path.join(dir, appBundleBaseName);

    // Ensure SDK is downloaded and extracted
    gulp.series('download-nwjs', function(cb) {
        // Copy dist contents into the extracted NW.js SDK
        // On macOS, the app content goes into nwjs.app/Contents/Resources/app.nw
        // On Windows/Linux, it goes directly into the SDK root
        let appContentTargetDir = nwjsSdkDir;
        if (currentPlatform === 'darwin') {
            appContentTargetDir = path.join(nwjsSdkDir, 'nwjs.app', 'Contents', 'Resources', 'app.nw');
            fse.ensureDirSync(appContentTargetDir);
        }

        fse.copySync(DIST_DIR, appContentTargetDir, { overwrite: true });

        // Move the prepared SDK to the target app bundle directory
        fse.ensureDirSync(dir); // Ensure the parent directory exists
        fse.moveSync(nwjsSdkDir, appBundleDir, { overwrite: true });

        console.log(`Application bundle created at ${appBundleDir}`);
        cb();
    })(done);
}

function buildNWAppsWrapper(platforms, flavor, dir, done) {
    function buildNWAppsCallback() {
        buildNWApps(platforms, flavor, dir, done);
    }

    if (platforms.indexOf('armv7') !== -1) {
        if (platforms.indexOf('linux32') !== -1) {
            console.log('Cannot build ARMv7 and Linux32 versions at the same time!');
            clean_debug();
            process.exit(1);
        }
        removeItem(platforms, 'armv7');
        platforms.push('linux32');

        if (!fs.existsSync('./cache/_ARMv7_IS_CACHED', 'w')) {
            console.log('Purging cache because it needs to be overwritten...');
            clean_cache().then(() => {
                injectARMCache(flavor, buildNWAppsCallback);
            })
        } else {
            buildNWAppsCallback();
        }
    } else {
        if (platforms.indexOf('linux32') !== -1 && fs.existsSync('./cache/_ARMv7_IS_CACHED')) {
            console.log('Purging cache because it was previously overwritten...');
            clean_cache().then(buildNWAppsCallback);
        } else {
            buildNWAppsCallback();
        }
    }
}

function buildNWApps(platforms, flavor, dir, done) {
    if (platforms.length > 0) {
        // Dynamically import nw-builder here
        import('nw-builder').then(nwBuilderModule => {
            console.log(`nw-builder outDir: ${dir}`);
            nwBuilderModule.default({
                outDir: dir,
                platforms: platforms,
                flavor: flavor,
                version: NWversion,
                files: './dist/**/*',
                macIcns: './assets/osx/app-icon.icns',
                macPlist: { 'CFBundleDisplayName': 'Emuflight Configurator'},
                winIco: './src/images/emu_icon.ico',
                zip: false,
                downloadUrl: 'https://dl.nwjs.io',
                manifestUrl: 'https://nwjs.io/versions.json'
            }).then(function () {
                done();
            }).catch(function (err) {
                console.log('Error building NW apps: ' + err);
                clean_debug();
                process.exit(1);
            });
        }).catch(err => {
            console.log('Error importing nw-builder: ' + err);
            clean_debug();
            process.exit(1);
        });
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
        exec(run);
    } else {
        console.log('More than one platform specified, not starting debug app');
    }
    done();
}

gulp.task('download-nwjs', function(done) {
    const nwjsSdkDir = './nwjs-sdk';
    const nwjsTarball = 'nwjs-sdk-v0.50.3-linux-x64.tar.gz';
    const nwjsUrl = 'https://dl.nwjs.io/v0.50.3/nwjs-sdk-v0.50.3-linux-x64.tar.gz';

    if (fs.existsSync(nwjsSdkDir)) {
        console.log('NW.js SDK already exists, skipping download.');
        return done();
    }

    console.log('Downloading NW.js SDK...');
    const file = fs.createWriteStream(nwjsTarball);
    https.get(nwjsUrl, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(function() {
                console.log('NW.js SDK downloaded. Extracting...');
                child_process.execSync(`mkdir ${nwjsSdkDir} && tar -xzf ${nwjsTarball} -C ${nwjsSdkDir} --strip-components=1`);
                console.log('NW.js SDK extracted.');
                fs.unlinkSync(nwjsTarball); // Clean up tarball
                done();
            });
        });
    }).on('error', function(err) {
        fs.unlink(nwjsTarball); // Delete the file async. (But we don't check the result)
        done(err);
    });
});

// Create installer package for windows platforms
function release_win(arch, done) {

    // Check if makensis exists
    if (!commandExistsSync('makensis')) {
        console.warn('makensis command not found, not generating package for: ' + arch);
        return done();
    }

    // The makensis does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    let platformString = 'win';
    let archString = arch.substring(3); // win32 -> 32, win64 -> 64

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    const appBundlePath = path.join(APPS_DIR, appBundleBaseName);

    // Parameters passed to the installer script
    const options = {
            verbose: 3,
            define: {
                'VERSION': pkg.version,
                'PLATFORM': arch,
                'DEST_FOLDER': RELEASE_DIR,
                'APP_BUNDLE_PATH': appBundlePath // Pass the app bundle path to NSIS
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
function release_zip(arch) {
    let platformString;
    let archString;

    if (arch.startsWith('linux')) {
        platformString = 'linux';
        archString = arch.substring(5);
    } else if (arch.startsWith('win')) {
        platformString = 'win';
        archString = arch.substring(3);
    } else if (arch.startsWith('osx')) {
        platformString = 'osx';
        archString = arch.substring(3);
    } else {
        platformString = arch; // Fallback for armv7
        archString = '';
    }

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    var src = path.join(APPS_DIR, appBundleBaseName, '**');
    var output = getReleaseFilename(arch, 'zip');
    var base = path.join(APPS_DIR, appBundleBaseName);

    return compressFiles(src, base, output, 'Emuflight Configurator');
}

// Create distribution package for chromeos platform
function release_chromeos() {
    var src = path.join(DIST_DIR, '**');
    var output = getReleaseFilename('chromeos', 'zip');
    var base = DIST_DIR;

    return compressFiles(src, base, output, '.');
}

// Compress files from srcPath, using basePath, to outputFile in the RELEASE_DIR
function compressFiles(srcPath, basePath, outputFile, zipFolder) {
    return gulp.src(srcPath, { base: basePath })
               .pipe(rename(function(actualPath) {
                   actualPath.dirname = path.join(zipFolder, actualPath.dirname);
               }))
               .pipe(zip(outputFile))
               .pipe(gulp.dest(RELEASE_DIR));
}

function release_deb(arch, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('dpkg-deb')) {
        console.warn('dpkg-deb command not found, not generating deb package for ' + arch);
        return done();
    }

    let platformString;
    let archString;

    if (arch.startsWith('linux')) {
        platformString = 'linux';
        archString = arch.substring(5);
    } else {
        platformString = arch; // Fallback for armv7
        archString = '';
    }

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    const appBundlePath = path.join(APPS_DIR, appBundleBaseName);

    return gulp.src([path.join(appBundlePath, '**/*')]) // Use the new bundle path
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

    // Check if rpmbuild exists
    if (!commandExistsSync('rpmbuild')) {
        console.warn('rpmbuild command not found, not generating rpm package for ' + arch);
        return done();
    }

    // The buildRpm does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    let platformString;
    let archString;

    if (arch.startsWith('linux')) {
        platformString = 'linux';
        archString = arch.substring(5);
    } else {
        platformString = arch; // Fallback for armv7
        archString = '';
    }

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    const appBundlePath = path.join(APPS_DIR, appBundleBaseName);

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
                 [ { cwd: appBundlePath, // Use the new bundle path
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

    const appdmg = require('./gulp-macdmg');


    // The appdmg does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    let platformString = 'osx';
    let archString = 'x64'; // osx64

    const appBundleBaseName = `${pkg.name}-${platformString}-${archString}`;
    const appBundlePath = path.join(APPS_DIR, appBundleBaseName);

    // The src pipe is not used
    return gulp.src(['.'])
        .pipe(appdmg({
            target: path.join(RELEASE_DIR, getReleaseFilename('macOS', 'dmg')),
            basepath: appBundlePath, // Use the new bundle path
            specification: {
                'title': 'Emuflight Configurator',
                //'icon': 'assets/osx/app-icon.icns', // FIXME
                'icon-size': 128,
                'background': path.join(__dirname, 'assets/osx/dmg-background.png'),
                'contents': [
                    { 'x': 180, 'y': 590, 'type': 'file', 'path': `${pkg.name}.app`, 'name': 'Emuflight Configurator.app' },
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

    if (platforms.indexOf('armv7') !== -1) {
        releaseTasks.push(function release_armv7_zip() {
            return release_zip('armv7');
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

