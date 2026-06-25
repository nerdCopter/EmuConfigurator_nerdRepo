#!/bin/sh
set -e

rm -f /usr/share/icons/hicolor/128x128/apps/emuflight-configurator.png

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
