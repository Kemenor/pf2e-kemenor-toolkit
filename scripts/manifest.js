import { MODULE_ID, getEidolonOf, getSummonerOf, isEidolon, isSummoner, primaryToken } from "./lib.js";

function notify(message, type = "info") {
    ui.notifications[type](game.i18n.localize(message) ?? message);
}

/**
 * Placed tokens of this actor. Scoped to one scene by default: a long-running world
 * accumulates the same actor's tokens across every scene it has ever visited, and dismissing
 * an eidolon means removing it from play here, not erasing it from the campaign's history.
 */
function tokensOf(actor, { scene = null, allScenes = false } = {}) {
    const scenes = allScenes ? game.scenes.contents : [scene ?? canvas.scene].filter(Boolean);
    return scenes.flatMap((s) => s.tokens.filter((t) => t.actorId === actor.id));
}

/**
 * Manifest Eidolon: place the eidolon's token adjacent to its summoner on the summoner's
 * current scene. A no-op if it is already manifested there.
 */
export async function manifestEidolon(summoner) {
    if (!isSummoner(summoner)) {
        // Called with the eidolon selected instead, which is the easy mistake to make.
        const linked = getSummonerOf(summoner);
        if (!linked) return notify(`${MODULE_ID}.manifest.notSummoner`, "warn");
        summoner = linked;
    }

    const eidolon = getEidolonOf(summoner);
    if (!eidolon) return notify(`${MODULE_ID}.manifest.noEidolon`, "warn");

    const summonerToken = primaryToken(summoner);
    if (!summonerToken) return notify(`${MODULE_ID}.manifest.noToken`, "warn");

    const scene = summonerToken.parent;
    if (scene.tokens.some((t) => t.actorId === eidolon.id)) {
        return notify(`${MODULE_ID}.manifest.already`);
    }

    const gridSize = scene.grid.size;
    const source = (
        await eidolon.getTokenDocument(
            {
                x: summonerToken.x + summonerToken.width * gridSize,
                y: summonerToken.y,
            },
            { parent: scene },
        )
    ).toObject();

    try {
        const [created] = await scene.createEmbeddedDocuments("Token", [source]);
        return created;
    } catch {
        return notify(`${MODULE_ID}.manifest.noPermission`, "error");
    }
}

/**
 * Dismiss Eidolon: remove its tokens from the current scene. The actor and all its data are
 * untouched. Pass `allScenes` to sweep a stale token out of every scene in the world.
 */
export async function dismissEidolon(actor, { silent = false, scene = null, allScenes = false } = {}) {
    const eidolon = isEidolon(actor) ? actor : getEidolonOf(actor);
    if (!eidolon) return silent ? null : notify(`${MODULE_ID}.manifest.noEidolon`, "warn");

    const tokens = tokensOf(eidolon, { scene, allScenes });
    if (!tokens.length) return silent ? null : notify(`${MODULE_ID}.manifest.notManifested`);

    const bySceneId = {};
    for (const token of tokens) (bySceneId[token.parent.id] ??= []).push(token.id);

    try {
        for (const [sceneId, ids] of Object.entries(bySceneId)) {
            await game.scenes.get(sceneId).deleteEmbeddedDocuments("Token", ids);
        }
    } catch {
        if (!silent) notify(`${MODULE_ID}.manifest.noPermission`, "error");
    }
}

export async function toggleEidolon(actor) {
    const summoner = isSummoner(actor) ? actor : getSummonerOf(actor);
    const eidolon = getEidolonOf(summoner ?? actor);
    if (!eidolon) return notify(`${MODULE_ID}.manifest.noEidolon`, "warn");
    return tokensOf(eidolon).length ? dismissEidolon(eidolon) : manifestEidolon(summoner);
}
