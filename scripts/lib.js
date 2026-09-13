export const MODULE_ID = "pf2e-kemenor-toolkit";

export const FLAGS = {
    /** On an eidolon: the actor id of its summoner. */
    summoner: "summoner",
    /** On a summoner: the actor id of its eidolon. */
    eidolon: "eidolon",
    /** On a weapon: share its runes with the owner's eidolon. */
    sharedWeapon: "sharedWithEidolon",
};

export function setting(key) {
    try {
        return game.settings.get(MODULE_ID, key);
    } catch {
        return false;
    }
}

export function isSummoner(actor) {
    if (actor?.type !== "character") return false;
    if (actor.class?.slug === "summoner") return true;
    return actor.itemTypes?.feat?.some((f) => f.slug === "summoner-dedication") ?? false;
}

export function isEidolon(actor) {
    if (actor?.type !== "character") return false;
    // The system recognises eidolons by trait, not by a dedicated actor type. Read the raw
    // source traits too, because `actor.traits` is not populated until data preparation runs.
    if (actor.system?.traits?.value?.includes("eidolon")) return true;
    if (actor.traits?.has?.("eidolon")) return true;
    return actor.class?.slug === "eidolon" || actor.class?.name === "Eidolon";
}

/**
 * Read a link flag without going through `getFlag`, so this stays safe to call from inside
 * data preparation and before `game.ready`.
 */
function linkedId(actor, key) {
    return actor?.flags?.[MODULE_ID]?.[key] ?? null;
}

/** The summoner of an eidolon, or null. Never returns the actor itself. */
export function getSummonerOf(actor) {
    if (!game?.actors) return null;
    const id = linkedId(actor, FLAGS.summoner);
    if (!id) return null;
    const summoner = game.actors.get(id);
    return summoner && summoner.id !== actor?.id ? summoner : null;
}

/** The eidolon of a summoner, or null. Never returns the actor itself. */
export function getEidolonOf(actor) {
    if (!game?.actors) return null;
    const id = linkedId(actor, FLAGS.eidolon);
    if (!id) return null;
    const eidolon = game.actors.get(id);
    return eidolon && eidolon.id !== actor?.id ? eidolon : null;
}

export async function link(summoner, eidolon) {
    await eidolon.setFlag(MODULE_ID, FLAGS.summoner, summoner.id);
    await summoner.setFlag(MODULE_ID, FLAGS.eidolon, eidolon.id);
    summoner.reset();
    eidolon.reset();
    refresh(eidolon);
    refresh(summoner);
}

export async function unlink(summoner, eidolon) {
    await eidolon?.unsetFlag(MODULE_ID, FLAGS.summoner);
    await summoner?.unsetFlag(MODULE_ID, FLAGS.eidolon);
    summoner?.reset();
    eidolon?.reset();
    refresh(eidolon);
    refresh(summoner);
}

/** Re-render an actor's sheet and token bars after its derived data changed underneath it. */
export function refresh(actor) {
    if (!actor) return;
    actor.sheet?.rendered && actor.sheet.render(false);
    for (const token of actor.getActiveTokens?.() ?? []) {
        token.renderFlags?.set({ refreshBars: true, redrawEffects: true });
    }
}

/**
 * Candidate eidolons for a summoner: eidolon-trait characters that at least one of the
 * summoner's non-GM owners also owns. That ownership overlap is what makes autolinking safe
 * in a multi-player world.
 */
export function candidateEidolons(summoner) {
    const owners = Object.entries(summoner.ownership)
        .filter(([id, level]) => level === 3 && id !== "default" && !game.users.get(id)?.isGM)
        .map(([id]) => id);
    return game.actors.filter(
        (a) => isEidolon(a) && !getSummonerOf(a) && owners.some((id) => a.ownership[id] === 3),
    );
}

/**
 * The token to treat as an actor's position.
 *
 * `getActiveTokens` returns tokens across every scene in the world, and a long-running game
 * leaves the same actor placed on dozens of them, so its first entry is effectively arbitrary.
 * Anything measuring distance or placing a token has to start from the scene actually in play or
 * it will silently work off a map nobody is looking at.
 */
export function primaryToken(actor) {
    const tokens = actor?.getActiveTokens?.(false, true) ?? [];
    if (tokens.length <= 1) return tokens[0] ?? null;
    const preferred = [canvas.scene?.id, game.scenes.active?.id].filter(Boolean);
    for (const sceneId of preferred) {
        const match = tokens.find((t) => t.parent?.id === sceneId);
        if (match) return match;
    }
    return tokens[0] ?? null;
}

export function log(...args) {
    console.log(`${MODULE_ID} |`, ...args);
}
