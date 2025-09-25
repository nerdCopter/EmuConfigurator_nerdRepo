'use strict';

// This file is the main entry point for the browserify bundle.

// --- Global Objects ---
// The original application relied on a large number of global objects.
// We define them here on the `window` object so that all the legacy
// modules can access them as they are loaded.
window.TABS = {};
window.GUI = {};
window.FC = {};

// --- Global Libraries ---
// Expose jQuery globally as it's used by many files and libraries.
window.$ = window.jQuery = require('jquery');

// Load other libraries that expect to be global.
// Browserify will wrap them, but they will attach themselves to `window`.
require('jquery-ui-npm');
require('jquery-textcomplete');
window.Promise = require('bluebird');
window.inflection = require('inflection');
window.marked = require('marked');
window.ShortUniqueId = require('short-unique-id');
window.objectHash = require('object-hash');
window.i18n = require('i18next');
require('i18next-xhr-backend');

// --- Application Modules ---
// Load all application modules in the correct order.
// `require` executes the file, which will define the global objects.
window.CONFIGURATOR = require('./data_storage.js');
require('./injected_methods.js');
require('./ConfigStorage.js');
require('./fc.js');
require('./port_handler.js');
require('./port_usage.js');
require('./serial.js');
require('./gui.js');
require('./huffman.js');
require('./default_huffman_tree.js');
require('./model.js');
require('./serial_backend.js');
require('./msp/MSPCodes.js');
require('./msp.js');
require('./msp/MSPHelper.js');
require('./backup_restore.js');
require('./peripherals.js');
require('./protocols/stm32.js');
require('./protocols/stm32usbdfu.js');
require('./localization.js');
require('./boards.js');
require('./RateCurve.js');
require('./Features.js');
require('./Beepers.js');
require('./release_checker.js');
require('./jenkins_loader.js');
require('./tabs/static_tab.js');
require('./tabs/landing.js');
require('./tabs/setup.js');
require('./tabs/setup_osd.js');
require('./tabs/help.js');
require('./tabs/ports.js');
require('./tabs/configuration.js');
require('./tabs/pid_tuning.js');
require('./tabs/receiver.js');
require('./tabs/auxiliary.js');
require('./tabs/adjustments.js');
require('./tabs/servos.js');
require('./tabs/gps.js');
require('./tabs/motors.js');
require('./tabs/led_strip.js');
require('./tabs/sensors.js');
require('./tabs/cli.js');
require('./tabs/logging.js');
require('./tabs/onboard_logging.js');
require('./FirmwareCache.js');
require('./tabs/firmware_flasher.js');
require('./tabs/failsafe.js');
require('./LogoManager.js');
require('./tabs/osd.js');
require('./tabs/power.js');
require('./tabs/transponder.js');
require('./CliAutoComplete.js');
require('./DarkTheme.js');
require('./tabs/vtx.js');
require('./utils/VtxDeviceStatus/VtxDeviceStatusFactory.js');
require('./utils/VtxDeviceStatus/VtxDeviceStatus.js');
require('./utils/VtxDeviceStatus/TrampDeviceStatus.js');
require('./utils/VtxDeviceStatus/SmartAudioDeviceStatus.js');
require('./utils/VtxDeviceStatus/Rtc6705DeviceStatus.js');

// --- Preset Loading ---
window.PRESETS = {};
var HttpClient = function() {
    this.get = function(aUrl, aCallback) {
        var anHttpRequest = new XMLHttpRequest();
        anHttpRequest.onreadystatechange = function() {
            if (anHttpRequest.readyState == 4 && anHttpRequest.status == 200)
                aCallback(anHttpRequest.responseText);
        }
        anHttpRequest.open('GET', aUrl, true);
        anHttpRequest.send(null);
    }
}
var client = new HttpClient();
var presetUrls = [
    { key: 'presets-nonHELIO-v0.2.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.2.0/presets-nonHELIO.json' },
    { key: 'presets-HELIO-v0.2.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.2.0/presets-HELIO.json' },
    { key: 'presets-nonHELIO-v0.3.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.3.0/presets-nonHELIO.json' },
    { key: 'presets-HELIO-v0.3.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.3.0/presets-HELIO.json' },
    { key: 'presets-nonHELIO-v0.4.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.4.0/presets-nonHELIO.json' },
    { key: 'presets-HELIO-v0.4.0', url: 'https://raw.githubusercontent.com/emuflight/emuflight-presets/master/presets-0.4.0/presets-HELIO.json' }
];

// Load presets from cache or fetch from network
chrome.storage.local.get(presetUrls.map(p => p.key), function(cachedPresets) {
    presetUrls.forEach(function(preset) {
        if (cachedPresets[preset.key]) {
            try {
                PRESETS[preset.key] = JSON.parse(cachedPresets[preset.key]);
            } catch (e) {
                console.error('Failed to parse cached preset:', preset.key, e);
            }
        } else {
            client.get(preset.url, function(response) {
                try {
                    PRESETS[preset.key] = JSON.parse(response);
                    var obj = {};
                    obj[preset.key] = response;
                    chrome.storage.local.set(obj);
                } catch (e) {
                    console.error('Failed to parse preset:', preset.key, e);
                }
            });
        }
    });
});

// --- Application Start ---
$(document).ready(function () {
    $.getJSON('version.json', function(data) {
        CONFIGURATOR.version = data.version;
        CONFIGURATOR.gitChangesetId = data.gitChangesetId;
        CONFIGURATOR.max_msp = data.max_msp;

        if(chrome.runtime && chrome.runtime.getManifest) {
            var manifest = chrome.runtime.getManifest();
            CONFIGURATOR.version = manifest.version;
            CONFIGURATOR.max_msp = manifest.max_msp;
            if (manifest.version_name) {
                CONFIGURATOR.version = manifest.version_name;
            }
        }
        i18n.init(function() {
            startProcess();
            initializeSerialBackend();
        });
    });
});

function getBuildType() {
    return GUI.Mode;
}

function startProcess() {
    var debugMode = typeof process === "object" && process.versions['nw-flavor'] === 'sdk';

    if (GUI.isNWJS()) {
        let nwWindow = GUI.nwGui.Window.get();
        nwWindow.on('close', closeHandler);
        nwWindow.on('new-win-policy', function(frame, url, policy) {
            policy.ignore();
            GUI.nwGui.Shell.openExternal(url);
        });
    } else if (GUI.isChromeApp()) {
        chrome.app.window.onClosed.addListener(closeHandler);
        chrome.runtime.onSuspend.addListener(closeHandler);
    }

    function closeHandler() {
        console.log("closing...");
        this.hide();
        MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, function() {
            GUI.nwGui.App.quit();
        });
    }

    i18n.localizePage();

    GUI.log(i18n.getMessage('infoVersions',{operatingSystem: GUI.operating_system,
                                            chromeVersion: window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/, "$1"),
                                            configuratorVersion: CONFIGURATOR.version }));

    $('#logo .version').text(CONFIGURATOR.version);
    updateStatusBarVersion();
    updateTopBarVersion();

    if (!GUI.isOther() && GUI.operating_system !== 'ChromeOS') {
        checkForConfiguratorUpdates();
    }

    console.log('Libraries: jQuery - ' + $.fn.jquery + ', d3 - ' + d3.version + ', three.js - ' + THREE.REVISION);

    $("#tabs ul.mode-connected li").click(function() {
        ConfigStorage.set({lastTab: $(this).attr("class").split(' ')[0]});
    });

    var ui_tabs = $('#tabs > ul');
    $('a', ui_tabs).click(function () {
        if ($(this).parent().hasClass('active') == false && !GUI.tab_switch_in_progress) {
            var self = this,
                tabClass = $(self).parent().prop('class');
            var tabRequiresConnection = $(self).parent().hasClass('mode-connected');
            var tab = tabClass.substring(4);
            var tabName = $(self).text();

            if (tabRequiresConnection && !CONFIGURATOR.connectionValid) {
                GUI.log(i18n.getMessage('tabSwitchConnectionRequired'));
                return;
            }

            if (GUI.connect_lock) {
                GUI.log(i18n.getMessage('tabSwitchWaitForOperation'));
                return;
            }

            if (GUI.allowedTabs.indexOf(tab) < 0 && tabName == "Firmware Flasher") {
                if (GUI.connected_to || GUI.connecting_to) {
                    $('a.connect').click();
                } else {
                    self.disconnect();
                }
                $('div.open_firmware_flasher a.flash').click();
            } else if (GUI.allowedTabs.indexOf(tab) < 0) {
                GUI.log(i18n.getMessage('tabSwitchUpgradeRequired', [tabName]));
                return;
            }

            GUI.tab_switch_in_progress = true;

            GUI.tab_switch_cleanup(function () {
                if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
                    $('div#flashbutton a.flash_state').removeClass('active');
                    $('div#flashbutton a.flash').removeClass('active');
                }
                $('li', ui_tabs).removeClass('active');
                $(self).parent().addClass('active');
                var content = $('#content');
                content.empty();
                $('#cache .data-loading').clone().appendTo(content);

                function content_ready() {
                    GUI.tab_switch_in_progress = false;
                }

                switch (tab) {
                    case 'mixercalc': TABS.staticTab.initialize('mixercalc', content_ready); break;
                    case 'landing': TABS.landing.initialize(content_ready); break;
                    case 'changelog': TABS.staticTab.initialize('changelog', content_ready); break;
                    case 'privacy_policy': TABS.staticTab.initialize('privacy_policy', content_ready); break;
                    case 'firmware_flasher': TABS.firmware_flasher.initialize(content_ready); break;
                    case 'help': TABS.help.initialize(content_ready); break;
                    case 'auxiliary': TABS.auxiliary.initialize(content_ready); break;
                    case 'adjustments': TABS.adjustments.initialize(content_ready); break;
                    case 'ports': TABS.ports.initialize(content_ready); break;
                    case 'led_strip': TABS.led_strip.initialize(content_ready); break;
                    case 'failsafe': TABS.failsafe.initialize(content_ready); break;
                    case 'transponder': TABS.transponder.initialize(content_ready); break;
                    case 'osd': TABS.osd.initialize(content_ready); break;
                    case 'power': TABS.power.initialize(content_ready); break;
                    case 'setup': TABS.setup.initialize(content_ready); break;
                    case 'setup_osd': TABS.setup_osd.initialize(content_ready); break;
                    case 'configuration': TABS.configuration.initialize(content_ready); break;
                    case 'pid_tuning': TABS.pid_tuning.initialize(content_ready); break;
                    case 'receiver': TABS.receiver.initialize(content_ready); break;
                    case 'servos': TABS.servos.initialize(content_ready); break;
                    case 'gps': TABS.gps.initialize(content_ready); break;
                    case 'motors': TABS.motors.initialize(content_ready); break;
                    case 'sensors': TABS.sensors.initialize(content_ready); break;
                    case 'logging': TABS.logging.initialize(content_ready); break;
                    case 'onboard_logging': TABS.onboard_logging.initialize(content_ready); break;
                    case 'vtx': TABS.vtx.initialize(content_ready); break;
                    case 'cli': TABS.cli.initialize(content_ready, GUI.nwGui); break;
                    default: console.log('Tab not found:' + tab);
                }
            });
        }
    });

    $('#tabs ul.mode-disconnected li a:first').click();

    $('a#options').click(function () {
        var el = $(this);
        if (!el.hasClass('active')) {
            el.addClass('active');
            el.after('<div id="options-window"></div>');
            $('div#options-window').load('./tabs/options.html', function () {
                i18n.localizePage();
                ConfigStorage.get('permanentExpertMode', function (result) {
                    if (result.permanentExpertMode) {
                        $('div.permanentExpertMode input').prop('checked', true);
                    }
                    $('div.permanentExpertMode input').change(function () {
                        var checked = $(this).is(':checked');
                        ConfigStorage.set({'permanentExpertMode': checked});
                        $('input[name="expertModeCheckbox"]').prop('checked', checked).change();
                    }).change();
                });
                ConfigStorage.get('rememberLastTab', function (result) {
                    $('div.rememberLastTab input')
                        .prop('checked', !!result.rememberLastTab)
                        .change(function() { ConfigStorage.set({rememberLastTab: $(this).is(':checked')}) })
                        .change();
                });
                if (GUI.operating_system !== 'ChromeOS') {
                    ConfigStorage.get('checkForConfiguratorUnstableVersions', function (result) {
                        if (result.checkForConfiguratorUnstableVersions) {
                            $('div.checkForConfiguratorUnstableVersions input').prop('checked', true);
                        }
                        $('div.checkForConfiguratorUnstableVersions input').change(function () {
                            var checked = $(this).is(':checked');
                            ConfigStorage.set({'checkForConfiguratorUnstableVersions': checked});
                            checkForConfiguratorUpdates();
                        });
                    });
                } else {
                    $('div.checkForConfiguratorUnstableVersions').hide();
                }
                $('div.cliAutoComplete input')
                    .prop('checked', CliAutoComplete.configEnabled)
                    .change(function () {
                        var checked = $(this).is(':checked');
                        ConfigStorage.set({'cliAutoComplete': checked});
                        CliAutoComplete.setEnabled(checked);
                    }).change();
                $('div.darkTheme input')
                    .prop('checked', DarkTheme.configEnabled)
                    .change(function () {
                        var checked = $(this).is(':checked');
                        ConfigStorage.set({'darkTheme': checked});
                        DarkTheme.setConfig(checked);
                    }).change();
                function close_and_cleanup(e) {
                    if (e.type == 'click' && !$.contains($('div#options-window')[0], e.target) || e.type == 'keyup' && e.keyCode == 27) {
                        $(document).unbind('click keyup', close_and_cleanup);
                        $('div#options-window').slideUp(250, function () {
                            el.removeClass('active');
                            $(this).empty().remove();
                        });
                    }
                }
                $(document).bind('click keyup', close_and_cleanup);
                $(this).slideDown(250);
            });
        }
    });

    $("#content").on('focus', 'input[type="number"]', function () {
        var element = $(this), val = element.val();
        if (!isNaN(val)) {
            element.data('previousValue', parseFloat(val));
        }
    });

    $("#content").on('keydown', 'input[type="number"]', function (e) {
        var whitelist = [ 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 109, 189, 8, 46, 9, 190, 110, 37, 38, 39, 40, 13 ];
        if (whitelist.indexOf(e.keyCode) == -1) {
            e.preventDefault();
        }
    });

    $("#content").on('change', 'input[type="number"]', function () {
        var element = $(this), min = parseFloat(element.prop('min')), max = parseFloat(element.prop('max')), step = parseFloat(element.prop('step')), val = parseFloat(element.val()), decimal_places;
        if (element.prop('min')) { if (val < min) { element.val(min); val = min; } }
        if (element.prop('max')) { if (val > max) { element.val(max); val = max; } }
        if (isNaN(val)) { element.val(element.data('previousValue')); val = element.data('previousValue'); }
        if (isNaN(step) || step % 1 === 0) { if (val % 1 !== 0) { element.val(element.data('previousValue')); val = element.data('previousValue'); } }
        if (!isNaN(step) && step % 1 !== 0) {
            decimal_places = String(step).split('.')[1].length;
            if (val % 1 === 0) {
                element.val(val.toFixed(decimal_places));
            } else if (String(val).split('.')[1].length != decimal_places) {
                element.val(val.toFixed(decimal_places));
            }
        }
    });

    $("#showlog").on('click', function () {
        var state = $(this).data('state');
        if (state) {
            $("#log").animate({height: 27}, 200, function () {
                var command_log = $('div#log');
                command_log.scrollTop($('div.wrapper', command_log).height());
            });
            $("#log").removeClass('active');
            $("#content").removeClass('logopen');
            $(".tab_container").removeClass('logopen');
            $("#scrollicon").removeClass('active');
            ConfigStorage.set({'logopen': false});
            state = false;
        } else {
            $("#log").animate({height: 111}, 200);
            $("#log").addClass('active');
            $("#content").addClass('logopen');
            $(".tab_container").addClass('logopen');
            $("#scrollicon").addClass('active');
            ConfigStorage.set({'logopen': true});
            state = true;
        }
        $(this).text(state ? i18n.getMessage('logActionHide') : i18n.getMessage('logActionShow'));
        $(this).data('state', state);
    });

    ConfigStorage.get('logopen', function (result) {
        if (result.logopen) {
            $("#showlog").trigger('click');
        }
    });

    ConfigStorage.get('permanentExpertMode', function (result) {
        if (result.permanentExpertMode) {
            $('input[name="expertModeCheckbox"]').prop('checked', true);
        }
        $('input[name="expertModeCheckbox"]').change(function () {
            var checked = $(this).is(':checked');
            if (FEATURE_CONFIG && FEATURE_CONFIG.features !== 0) {
                updateTabList(FEATURE_CONFIG.features);
            }
        }).change();
    });

    ConfigStorage.get('cliAutoComplete', function (result) {
        CliAutoComplete.setEnabled(typeof result.cliAutoComplete == 'undefined' || result.cliAutoComplete);
    });

    ConfigStorage.get('darkTheme', function (result) {
        DarkTheme.setConfig(typeof result.darkTheme == 'undefined' || result.darkTheme);
    });
};

function checkForConfiguratorUpdates() {
    var releaseChecker = new ReleaseChecker('configurator', 'https://api.github.com/repos/Emuflight/EmuConfigurator/releases');
    releaseChecker.loadReleaseData(notifyOutdatedVersion);
}

function notifyOutdatedVersion(releaseData) {
    ConfigStorage.get('checkForConfiguratorUnstableVersions', function (result) {
        var showUnstableReleases = !!result.checkForConfiguratorUnstableVersions;
        var versions = releaseData.filter(function (version) {
            var semVerVersion = semver.parse(version.tag_name);
            if (semVerVersion && (showUnstableReleases || semVerVersion.prerelease.length === 0)) {
                return version;
            }
        }).sort(function (v1, v2) {
            try {
                return semver.compare(v2.tag_name, v1.tag_name);
            } catch (e) {
                return false;
            }
        });

        if (versions.length > 0 && semver.lt(CONFIGURATOR.version, versions[0].tag_name)) {
            GUI.log(i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));
            var dialog = $('.dialogConfiguratorUpdate')[0];
            $('.dialogConfiguratorUpdate-content').html(i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));
            $('.dialogConfiguratorUpdate-closebtn').click(function() {
                dialog.close();
            });
            $('.dialogConfiguratorUpdate-websitebtn').click(function() {
                dialog.close();
                window.open(versions[0].html_url, '_blank');
            });
            dialog.showModal();
        }
    });
}

function update_packet_error(caller) {
    $('span.packet-error').html(caller.packet_error);
}

function microtime() {
    return new Date().getTime() / 1000;
}

function millitime() {
    return new Date().getTime();
}

var DEGREE_TO_RADIAN_RATIO = Math.PI / 180;
function degToRad(degrees) {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

function bytesToSize(bytes) {
    if (bytes < 1024) return bytes + ' Bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(3) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(3) + ' MB';
    else return (bytes / 1073741824).toFixed(3) + ' GB';
}

function isExpertModeEnabled() {
    return $('input[name="expertModeCheckbox"]').is(':checked');
}

function updateTabList(features) {
    // ... (rest of the function)
}

function zeroPad(value, width) {
    value = "" + value;
    while (value.length < width) {
        value = "0" + value;
    }
    return value;
}

function generateFilename(prefix, suffix) {
    // ... (rest of the function)
}

function getTargetVersion(hardwareId) {
    // ... (rest of the function)
}

function getFirmwareVersion(firmwareVersion, firmwareId) {
    // ... (rest of the function)
}

function getConfiguratorVersion() {
    return i18n.getMessage('versionLabelConfigurator') + ': ' + CONFIGURATOR.version;
}

function updateTopBarVersion(firmwareVersion, firmwareId, hardwareId) {
    // ... (rest of the function)
}

function updateStatusBarVersion(firmwareVersion, firmwareId, hardwareId) {
    // ... (rest of the function)
}

function showErrorDialog(message) {
   var dialog = $('.dialogError')[0];
    $('.dialogError-content').html(message);
    $('.dialogError-closebtn').click(function() {
        dialog.close();
    });
    dialog.showModal();
}