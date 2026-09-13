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
import { applyInvestiture, onWeaponPrepareBaseData, sharedRuneSource, setSharedWeapon } from "./investiture.js";
import { dismissEidolon, manifestEidolon, toggleEidolon } from "./manifest.js";

const SETTINGS = {
    sharedHP: true,
    sharedHeroPoints: true,
    sharedInvestiture: true,
    autoLink: true,
    autoDismiss: true,
};

Hooks.once("init", () => {
    for (const [key, defaultValue] of Object.entries(SETTINGS)) {
        game.settings.register(MODULE_ID, key, {
            name: `${MODULE_ID}.settings.${key}.name`,
            hint: `${MODULE_ID}.settings.${key}.hint`,
            scope: "world",
            config: true,
            requiresReload: true,
            default: defaultValue,
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
    };
});

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
