import { MODULE_ID, getEidolonOf, getSummonerOf, refresh, setting } from "./lib.js";

/**
 * "The connection between you and your eidolon means you both share a single pool of Hit
 * Points. Damage taken by either you or the eidolon reduces your Hit Points, while healing
 * either of you recovers your Hit Points."
 *
 * The summoner's stored hit points are the single source of truth. The eidolon never stores
 * hit points of its own: its `system.attributes.hp` is redefined as a live view onto the
 * summoner's, and every write aimed at the eidolon is redirected to the summoner instead.
 */

/** Called from the `prepareData` wrapper, after the system has finished preparing the actor. */
export function shareHitPoints(actor) {
    if (!setting("sharedHP")) return;
    const summoner = getSummonerOf(actor);
    if (!summoner) return;

    // A live getter rather than a clone: the eidolon sheet then shows the summoner's real
    // pool, including temporary hit points and the modifier breakdown behind the maximum.
    Object.defineProperty(actor.system.attributes, "hp", {
        configurable: true,
        enumerable: true,
        get: () => summoner.system.attributes.hp,
    });
}

export function shareHeroPoints(actor) {
    if (!setting("sharedHeroPoints")) return;
    const summoner = getSummonerOf(actor);
    if (!summoner) return;
    Object.defineProperty(actor.system.resources, "heroPoints", {
        configurable: true,
        enumerable: true,
        get: () => summoner.system.resources.heroPoints,
    });
}

/** Conditions that act on the shared pool, and so belong on the summoner. */
const SHARED_CONDITIONS = new Set(["dying", "wounded", "drained"]);

export function registerSharedHitPoints() {
    // Strip hit point writes off the eidolon and apply them to the summoner. This runs on
    // whichever client initiated the update, so the player who rolled the damage is the one
    // who writes it, and no GM round trip is needed.
    Hooks.on("preUpdateActor", (actor, changes) => {
        if (!setting("sharedHP")) return;
        const summoner = getSummonerOf(actor);
        if (!summoner) return;

        const hp = changes?.system?.attributes?.hp;
        if (!hp) return;
        delete changes.system.attributes.hp;
        summoner.update({ "system.attributes.hp": hp });
    });

    Hooks.on("preUpdateActor", (actor, changes) => {
        if (!setting("sharedHeroPoints")) return;
        const summoner = getSummonerOf(actor);
        if (!summoner) return;

        const heroPoints = changes?.system?.resources?.heroPoints;
        if (!heroPoints) return;
        delete changes.system.resources.heroPoints;
        summoner.update({ "system.resources.heroPoints": heroPoints });
    });

    // The eidolon stores nothing, so when the summoner's pool moves there is no second write
    // to make: the eidolon only needs to recompute and redraw.
    Hooks.on("updateActor", (actor, changes) => {
        const eidolon = getEidolonOf(actor);
        if (!eidolon) return;

        const touchedHP = setting("sharedHP") && !!changes?.system?.attributes?.hp;
        const touchedHero = setting("sharedHeroPoints") && !!changes?.system?.resources?.heroPoints;
        if (!touchedHP && !touchedHero) return;

        eidolon.reset();
        refresh(eidolon);

        if (touchedHP && setting("autoDismiss") && actor.system.attributes.hp.value === 0) {
            if (game.user === game.users.activeGM) dismissOnZero(actor, eidolon);
        }
    });

    // Dying, wounded and drained all operate on the shared pool. Applying them to the eidolon
    // would put them on an actor with no pool of its own, so move them to the summoner.
    Hooks.on("preCreateItem", (item, data) => {
        if (!setting("sharedHP")) return;
        const actor = item.parent;
        if (!actor || data.type !== "condition") return;
        if (!SHARED_CONDITIONS.has(data.system?.slug)) return;

        const summoner = getSummonerOf(actor);
        if (!summoner) return;

        // "If you and your eidolon are both subject to the same effect that affects your Hit
        // Points, you apply those effects only once (applying the greater effect)."
        const existing = summoner.getCondition(data.system.slug);
        const incoming = data.system.value?.value ?? 1;
        if (!existing) summoner.createEmbeddedDocuments("Item", [data]);
        else if ((existing.value ?? 1) < incoming) {
            game.pf2e.ConditionManager.updateConditionValue(existing.id, summoner, incoming);
        }
        return false;
    });
}

async function dismissOnZero(summoner, eidolon) {
    const { dismissEidolon } = await import("./manifest.js");
    // Dismiss where the summoner is standing, which is where play is happening -- not
    // whichever scene the GM happens to be looking at.
    const scene = summoner.getActiveTokens(false, true)[0]?.parent ?? null;
    return dismissEidolon(eidolon, { silent: true, scene });
}

export { MODULE_ID };
