---
name: EmuConfigurator UI Patterns & Conventions
description: EmuConfigurator-specific UI patterns for PID tab layout, MSP field verification, sub-tab structure, and i18n strategy
applyTo: 'src/tabs/**/*.{html,js,css}'
---

# EmuConfigurator UI Patterns & Conventions

## 1. PID Tab Layout — `cf_column` Pattern

Sub-tabs inside `#pid_tuning` use a flex-column layout. Always follow this pattern — do NOT invent custom layout classes.

### Sub-tab container CSS
```css
.tab-pid_tuning .subtab-NAME {
    display: flex;
    flex-flow: row wrap;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
}
.tab-pid_tuning .subtab-NAME .cf_column {
    min-width: 250px;
    flex: 1;
}
```

### Sub-tab HTML structure
```html
<div class="subtab-NAME" style="display: none;">
    <div class="clear-both"></div>
    <div class="cf_column">
        <div class="gui_box grey topspacer pid_tuning">
            <table class="pid_tuning">...</table>
        </div>
    </div>
    <div class="cf_column">
        <div class="gui_box grey topspacer pid_tuning">
            <table class="pid_tuning">...</table>
        </div>
    </div>
</div>
```

`cf_column` is the standard column class used in `subtab-pid` and `subtab-rates`. Never use custom column classes like `stable_col_left`.

---

## 2. PID Table — `pid_titlebar` Pattern

Merge the box title and column headers into **one `<tr class="pid_titlebar">` row** — do not use a separate title table or title row before the column-header row. The `pid_main` Acro PIDs table is the authoritative template.

```html
<table class="pid_tuning">
    <tr class="pid_titlebar">
        <th class="name">
            <div class="name-helpicon-flex">
                <span data-i18n="sectionTitleKey"></span>
                <div class="helpicon cf_tip" data-i18n="[title]sectionHelpKey">?</div>
            </div>
        </th>
        <th class="proportional" data-i18n="pidTuningProportional"></th>
        <th class="derivative" data-i18n="pidTuningDerivative"></th>
        <th class=""><span data-i18n="pidTuningFeedForward"></span></th>
    </tr>
    <!-- data rows -->
</table>
```

- `th.name` = section title (from existing i18n key)
- Remaining `th` = column headers
- Do NOT invent new i18n keys for section titles — reuse existing keys (e.g., `pidTuningLevel`, `pidTuningHorizon`)

---

## 3. In-Table Section Divider — `pid_mode`

Use a `pid_titlebar2` row with a `div.pid_mode` to visually separate groups within the same table (grey banner):

```html
<tr class="pid_titlebar2">
    <th colspan="4"><div class="pid_mode"></div></th>
</tr>
```

Place this between PID coefficient rows and mode-setting rows (e.g., Angle Expo / Angle Limit below P/D/FF rows). This is preferable to splitting into a second box when the items are logically related to the same section.

---

## 4. Column Header Word-Wrap Fix

Label+icon flex containers in `pid_titlebar` use `.name-helpicon-flex`. At narrow window widths, the tooltip icon wraps to a new line without explicit constraints.

**Required CSS:**
```css
.tab-pid_tuning .pid_titlebar .name-helpicon-flex {
    display: flex;
    flex-flow: row nowrap;      /* prevent icon wrapping */
    justify-content: space-around;
}
.tab-pid_tuning .pid_titlebar .name-helpicon-flex .helpicon {
    margin-right: 0;
    flex-shrink: 0;              /* prevent icon compression */
}
```

---

## 5. API Version Gating

Use `CONFIG.apiVersion` for feature detection. Container divs carry visibility classes; JS shows/hides based on API version at tab load time.

```html
<!-- Legacy (API < 1.46) -->
<div class="OLDANGLEUI gui_box grey topspacer pid_tuning">...</div>

<!-- Modern (API >= 1.46) -->
<div class="NEWANGLEUI gui_box grey topspacer pid_tuning">...</div>
```

JS in `pid_tuning.js`:
```javascript
$('.NEWANGLEUI')[CONFIG.apiVersion >= 1.46 ? 'show' : 'hide']();
$('.OLDANGLEUI')[CONFIG.apiVersion < 1.46 ? 'show' : 'hide']();
```

---

## 6. MSP Field Verification

**Always verify field names, types, ranges, and presence in firmware `msp.c` before writing HTML inputs.** Never infer fields from a similar existing UI — MSP is the ground truth.

Checklist before adding a new field to the Stable PIDs or any advanced tab:
1. Find the relevant MSP command in `src/msp/MSPCodes.js` (e.g., `MSP_PID_ADVANCED`)
2. Locate the corresponding read/write block in `src/js/msp/MSPHelper.js`
3. Verify the field name, data type (U8/U16/I16), and max value
4. Cross-check in firmware `src/msp/msp.c` (the MSP serialization code)
5. Check `src/pid.c` or feature source to understand the field's behavioral role

**Known gotchas:**
- `PID_LEVEL_LOW.F` = `f_angle` (16-bit feedforward) — there is NO HIGH feedforward in MSP; leave that cell empty
- `PID_LEVEL_LOW.I` / `HIGH.I` are used internally as Direct FF coefficients; they are NOT exposed via MSP

---

## 7. Sub-Tab Switching Pattern

Sub-tabs in `pid_tuning.js` are managed by `activateSubtab(subtabName)`:

```javascript
function activateSubtab(subtabName) {
    const names = ['pid', 'stable', 'rates', 'filter', 'feel'];
    for (const name of names) {                          // ← must use `const`
        const el = $('.tab-pid_tuning .subtab-' + name);
        el[name === subtabName ? 'show' : 'hide']();
    }
}
```

**Critical:** `for (const name of names)` — bare `for (name of names)` without `const`/`let` throws `ReferenceError` in strict mode even if `name` appears declared elsewhere. Always declare the loop variable.

When adding a new sub-tab:
1. Add its name string to the `names` array
2. Add a `<div class="subtab-NAME" style="display: none;">` in the HTML
3. Add a nav button with `data-sub-tab="NAME"` to the sub-tab nav bar

---

## 8. i18n Rules for UI Changes

### Reuse existing keys — do not invent new ones

Before adding any i18n string, search `locales/en/messages.json` for an existing key that fits. Creating a new key when an existing one is appropriate is a common mistake.

- Section title for Angle/Horizon/NFE/RTH modes → `pidTuningLevel`
- Horizon mode section title → `pidTuningHorizon`
- Column headers → `pidTuningProportional`, `pidTuningDerivative`, `pidTuningFeedForward`

### Adding new required keys

Only add a new key when no existing key fits (e.g., a new tab label). Add it to English only — non-English locales fall back automatically.

### i18n key literal rendering

If a UI shows `someKey.message` as literal text, the i18n key does not exist in `locales/en/messages.json`. Check that:
- The key was added to en/messages.json
- The app was rebuilt (`yarn dev` / hot-reload picked up the change)
- The key string in HTML exactly matches the key in the JSON (case-sensitive)

See also: [LOCALE-MAINTENANCE.instructions.md](LOCALE-MAINTENANCE.instructions.md) for locale workflow details.
