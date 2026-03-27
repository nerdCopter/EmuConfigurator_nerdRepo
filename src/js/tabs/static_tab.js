'use strict';

TABS.staticTab = {};
TABS.staticTab.initialize = function (staticTabName, callback) {
    var self = this;

    if (GUI.active_tab != staticTabName) {
        GUI.active_tab = staticTabName;
    }
    var tabFile = './tabs/' + staticTabName + '.html';

    $('#content').html('<div id="tab-static"><div id="tab-static-contents"></div>');
    
    // Load mixercalc assets and script dynamically when tab is opened
    var loadAndInitialize = function() {
        $('#tab-static-contents').load(tabFile, function () {
            // translate to user-selected language
            i18n.localizePage();

            // Special handling for mixercalc tab - call after HTML loads
            if (staticTabName === 'mixercalc' && typeof mixerCalcMain === 'function') {
                mixerCalcMain();
            }

            GUI.content_ready(callback);
        });
    };
    
    // For mixercalc, load assets first
    if (staticTabName === 'mixercalc') {
        // Load CSS
        if (!$('link[href="./css/tabs/mixercalc.css"]').length) {
            $('<link type="text/css" rel="stylesheet" href="./css/tabs/mixercalc.css" media="all"/>').appendTo('head');
        }
        // Load JS and then proceed
        if (typeof mixerCalcMain === 'undefined') {
            $.getScript('./js/tabs/mixercalc.js', loadAndInitialize)
                .fail(function(jqxhr, settings, exception) {
                    console.error('Failed to load mixercalc.js:', exception);
                    const errorMsg = `Error loading Mixer Calculator: ${exception}`;
                    if (processLogger) processLogger.log(errorMsg, 'style_danger');
                    // Show error in UI
                    const $content = $("#content");
                    $content.html(`<div style="color: red; padding: 20px;">${errorMsg}</div>`);
                });
        } else {
            loadAndInitialize();
        }
    } else {
        loadAndInitialize();
    }

};
// Just noting that other tabs have cleanup functions.
