import { MODULE_ID, candidateEidolons, getEidolonOf, isEidolon, isSummoner, link, unlink } from "./lib.js";

/** The actor a macro should act on: the selected token, else the user's assigned character. */
export function selectedActor() {
    return canvas.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

/**
 * Pair a summoner with an eidolon through a dialog, for when automatic linking cannot tell which
 * eidolon belongs to whom.
 */
export async function linkDialog() {
    const summoners = game.actors.filter(isSummoner);
    const eidolons = game.actors.filter(isEidolon);
    if (!summoners.length || !eidolons.length) {
        return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.link.nothingToLink`));
    }

    const preselect = selectedActor();
    const options = (list, selected) =>
        list
            .map((a) => `<option value="${a.id}" ${a.id === selected?.id ? "selected" : ""}>${a.name}</option>`)
            .join("");

    const summonerGuess = isSummoner(preselect) ? preselect : null;
    const eidolonGuess = isEidolon(preselect)
        ? preselect
        : summonerGuess
          ? (getEidolonOf(summonerGuess) ?? candidateEidolons(summonerGuess)[0])
          : null;

    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize(`${MODULE_ID}.link.title`) },
        content: `
            <p>${game.i18n.localize(`${MODULE_ID}.link.hint`)}</p>
            <div class="form-group">
                <label>${game.i18n.localize(`${MODULE_ID}.link.summoner`)}</label>
                <select id="kt-summoner">${options(summoners, summonerGuess)}</select>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize(`${MODULE_ID}.link.eidolon`)}</label>
                <select id="kt-eidolon">${options(eidolons, eidolonGuess)}</select>
            </div>`,
        buttons: [
            {
                action: "link",
                label: game.i18n.localize(`${MODULE_ID}.link.confirm`),
                default: true,
                callback: (event) => {
                    const form = event.target.closest("form");
                    return {
                        summoner: form.querySelector("#kt-summoner").value,
                        eidolon: form.querySelector("#kt-eidolon").value,
                    };
                },
            },
            {
                action: "unlink",
                label: game.i18n.localize(`${MODULE_ID}.link.unlink`),
                callback: (event) => {
                    const form = event.target.closest("form");
                    return {
                        summoner: form.querySelector("#kt-summoner").value,
                        eidolon: form.querySelector("#kt-eidolon").value,
                        remove: true,
                    };
                },
            },
            { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null },
        ],
    });

    if (!choice) return;
    const summoner = game.actors.get(choice.summoner);
    const eidolon = game.actors.get(choice.eidolon);
    if (!summoner || !eidolon) return;

    if (choice.remove) {
        await unlink(summoner, eidolon);
        return ui.notifications.info(
            game.i18n.format(`${MODULE_ID}.link.unlinked`, { summoner: summoner.name, eidolon: eidolon.name }),
        );
    }
    await link(summoner, eidolon);
    ui.notifications.info(
        game.i18n.format(`${MODULE_ID}.autoLink.linked`, { summoner: summoner.name, eidolon: eidolon.name }),
    );
}

/* -------------------------------------------- */
/*  Installable macros                          */
/* -------------------------------------------- */

const MACROS = [
    {
        key: "manifest",
        img: "icons/magic/summoning/demon-embrace-glow-purple.webp",
        command: "game.kemenorToolkit.toggleEidolon(game.kemenorToolkit.selectedActor());",
    },
    {
        key: "shareWeapon",
        img: "icons/skills/melee/hand-grip-sword-red.webp",
        command: "game.kemenorToolkit.chooseSharedWeapon(game.kemenorToolkit.selectedActor());",
    },
    {
        key: "link",
        img: "icons/magic/symbols/runes-star-blue.webp",
        command: "game.kemenorToolkit.linkDialog();",
    },
    {
        key: "delay",
        img: "icons/magic/time/hourglass-yellow-green.webp",
        command: [
            "const combatant = game.combat?.combatant;",
            "if (!combatant) ui.notifications.warn('No encounter is running.');",
            "else if (game.kemenorToolkit.isDelayed(combatant)) game.kemenorToolkit.returnToInitiative(combatant);",
            "else game.kemenorToolkit.delay(combatant);",
        ].join("\n"),
    },
];

/** Create (or refresh) the module's macros in a world folder the players can drag from. */
export async function createMacros() {
    const folderName = game.i18n.localize(`${MODULE_ID}.macros.folder`);
    const folder =
        game.folders.find((f) => f.type === "Macro" && f.name === folderName) ??
        (await Folder.create({ name: folderName, type: "Macro" }));

    const made = [];
    for (const macro of MACROS) {
        const name = game.i18n.localize(`${MODULE_ID}.macros.${macro.key}`);
        const data = {
            name,
            type: "script",
            img: macro.img,
            command: macro.command,
            folder: folder.id,
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        };

        const existing = game.macros.find((m) => m.name === name && m.folder?.id === folder.id);
        if (existing) await existing.update({ command: macro.command, img: macro.img });
        else made.push(await Macro.create(data));
    }

    ui.notifications.info(
        game.i18n.format(`${MODULE_ID}.macros.created`, { count: MACROS.length, folder: folderName }),
    );
    return made;
}

/** Settings-menu entry point: clicking the button runs the install rather than opening a window. */
export class MacroInstaller extends foundry.applications.api.ApplicationV2 {
    async render() {
        await createMacros();
        return this;
    }
}
