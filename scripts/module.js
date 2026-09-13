import {
    FLAGS,
    MODULE_ID,
    candidateEidolons,
    getEidolonOf,
    getSummonerOf,
    isEidolon,
    isSummoner,
    link,
    refresh,
    unlink,
} from "./lib.js";
import { registerSharedHitPoints, shareHeroPoints, shareHitPoints } from "./shared-hp.js";
import {
    applyInvestiture,
    onWeaponPrepareBaseData,
    registerInvestiture,
    sharedRuneSource,
    setSharedWeapon,
} from "./investiture.js";
import { dismissEidolon, manifestEidolon, toggleEidolon } from "./manifest.js";
import { isDelayed, registerDelay, requestDelay, requestReturn } from "./delay.js";
import { registerComposition } from "./composition.js";

// `reload` marks settings that change wrapper registration or data preparation, which only take
// effect on a fresh load. The delay settings only gate presentation, so they apply immediately.
const SETTINGS = {
    sharedHP: { default: true, reload: true },
    sharedHeroPoints: { default: true, reload: true },
    sharedInvestiture: { default: true, reload: true },
    autoLink: { default: true, reload: true },
    autoDismiss: { default: true, reload: true },
    delayButton: { default: true, reload: false },
    delayEffect: { default: true, reload: false },
    delayChatCard: { default: true, reload: false },
    compositionAutomation: { default: true, reload: false },
};

Hooks.once("init", () => {
    for (const [key, config] of Object.entries(SETTINGS)) {
        game.settings.register(MODULE_ID, key, {
            name: `${MODULE_ID}.settings.${key}.name`,
            hint: `${MODULE_ID}.settings.${key}.hint`,
            scope: "world",
            config: true,
            requiresReload: config.reload,
            default: config.default,
            type: Boolean,
        });
    }

    libWrapper.register(
        MODULE_ID,
        "CONFIG.Actor.documentClass.prototype.prepareData",
        function (wrapped, ...args) {
            wrapped(...args);
            if (!game.actors) return;
            shareHitPoints(this);
            shareHeroPoints(this);
        },
        "WRAPPER",
    );

    // Investiture pushes modifier synthetics, which the system consumes while building
    // statistics in prepareDerivedData -- so they have to be in place before the wrapped call.
    libWrapper.register(
        MODULE_ID,
        "CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareDerivedData",
        function (wrapped, ...args) {
            if (game.actors && isEidolon(this)) applyInvestiture(this);
            return wrapped(...args);
        },
        "WRAPPER",
    );

    libWrapper.register(
        MODULE_ID,
        "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
        onWeaponPrepareBaseData,
        "WRAPPER",
    );

    registerSharedHitPoints();
    registerInvestiture();
    registerDelay();
    registerComposition();
    Hooks.on("renderSettingsConfig", onRenderSettings);

    game.kemenorToolkit = {
        link,
        unlink,
        manifestEidolon,
        dismissEidolon,
        toggleEidolon,
        setSharedWeapon,
        sharedRuneSource,
        chooseSharedWeapon,
        getSummonerOf,
        getEidolonOf,
        delay: requestDelay,
        returnToInitiative: requestReturn,
        isDelayed,
    };
});

/**
 * Section headings inside this module's block in Game Settings.
 *
 * Foundry renders one flat list per module, which reads as an undifferentiated pile once there
 * are more than a handful. Each entry names the setting a heading is inserted above. The anchor
 * is the input's `name`, because the settings form carries no per-setting id attribute.
 */
const SETTING_HEADINGS = {
    sharedHP: "headings.eidolon",
    delayButton: "headings.delay",
    compositionAutomation: "headings.composition",
};

function onRenderSettings(_app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    for (const [key, label] of Object.entries(SETTING_HEADINGS)) {
        const group = root.querySelector(`input[name="${MODULE_ID}.${key}"]`)?.closest(".form-group");
        if (!group) continue;
        // Re-renders would otherwise stack headings.
        if (group.previousElementSibling?.classList.contains(`${MODULE_ID}-heading`)) continue;

        const heading = document.createElement("h3");
        heading.className = `${MODULE_ID}-heading`;
        heading.textContent = game.i18n.localize(`${MODULE_ID}.${label}`);
        group.before(heading);
    }
}

Hooks.once("ready", async () => {
    if (game.modules.get("pf2e-eidolon-helper")?.active) {
        ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.conflict`), { permanent: true });
    }
    if (!game.user.isGM) return;

    if (game.settings.get(MODULE_ID, "autoLink")) await autoLink();

    // Data preparation order across actors is not guaranteed on load, and an eidolon that
    // prepared before its summoner will have read an unprepared statistic. One reset once
    // everything exists settles it.
    for (const actor of game.actors) {
        if (getSummonerOf(actor)) {
            actor.reset();
            refresh(actor);
        }
    }
});

/** Link each unlinked summoner to its eidolon when the pairing is unambiguous. */
async function autoLink() {
    for (const summoner of game.actors.filter(isSummoner)) {
        if (getEidolonOf(summoner)) continue;

        const candidates = candidateEidolons(summoner);
        if (candidates.length === 1) {
            await link(summoner, candidates[0]);
            ui.notifications.info(
                game.i18n.format(`${MODULE_ID}.autoLink.linked`, {
                    summoner: summoner.name,
                    eidolon: candidates[0].name,
                }),
            );
        } else if (candidates.length > 1) {
            ui.notifications.warn(
                game.i18n.format(`${MODULE_ID}.autoLink.ambiguous`, {
                    summoner: summoner.name,
                    count: candidates.length,
                }),
            );
        }
    }
}

/** Pick which magic weapon shares its runes with the eidolon. */
async function chooseSharedWeapon(summoner) {
    summoner ??= canvas.tokens.controlled[0]?.actor;
    if (!isSummoner(summoner)) {
        return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.manifest.notSummoner`));
    }

    const weapons = summoner.itemTypes.weapon.filter(
        (w) => w.system.runes.potency > 0 || w.system.runes.striking > 0 || w.system.runes.property.length,
    );
    if (!weapons.length) {
        return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.shared.noMagicWeapons`));
    }

    const current = summoner.itemTypes.weapon.find((w) => w.flags?.[MODULE_ID]?.[FLAGS.sharedWeapon]);
    const options = weapons
        .map((w) => `<option value="${w.id}" ${w.id === current?.id ? "selected" : ""}>${w.name}</option>`)
        .join("");

    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize(`${MODULE_ID}.shared.title`) },
        content: `<p>${game.i18n.localize(`${MODULE_ID}.shared.hint`)}</p>
            <select id="kt-weapon" style="width:100%"><option value="">&mdash;</option>${options}</select>`,
        buttons: [
            {
                action: "ok",
                label: game.i18n.localize(`${MODULE_ID}.shared.confirm`),
                default: true,
                callback: (event) => event.target.closest("form").querySelector("#kt-weapon").value,
            },
            { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null },
        ],
    });

    if (choice === null || choice === undefined) return;
    await setSharedWeapon(summoner, choice ? summoner.items.get(choice) : null);
    refresh(getEidolonOf(summoner));
}
