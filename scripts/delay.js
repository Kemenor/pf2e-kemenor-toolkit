import { MODULE_ID, setting } from "./lib.js";

/**
 * Delay, as the free action actually reads:
 *
 *   "You wait for the right moment to act. The rest of your turn doesn't happen yet. Instead,
 *    you're removed from the initiative order. You can return to the initiative order as a free
 *    action triggered by the end of any other creature's turn. This permanently changes your
 *    initiative to the new position. You can't use reactions until you return to the initiative
 *    order. If you Delay an entire round without returning to the initiative order, the actions
 *    from the Delayed turn are lost, your initiative doesn't change, and your next turn occurs
 *    at your original position in the initiative order."
 *
 * So there is no set of legal slots to pick from up front: you return when a turn ends, wherever
 * the fight has got to by then. Delaying parks the combatant beside the order; returning drops
 * them in after whoever just acted.
 */

const DELAYED = "delayed";
const EFFECT_SLUG = "kemenor-delaying";

/** Foundry query names, used to hand privileged work to the GM's client. */
const QUERY = {
    delay: `${MODULE_ID}.delay`,
    return: `${MODULE_ID}.return`,
};

export function delayDataOf(combatant) {
    return combatant?.flags?.[MODULE_ID]?.[DELAYED] ?? null;
}

export function isDelayed(combatant) {
    return !!delayDataOf(combatant);
}

/* -------------------------------------------- */
/*  Entry points (any client)                   */
/* -------------------------------------------- */

export async function requestDelay(combatant) {
    return dispatch(QUERY.delay, "handleDelay", combatant);
}

export async function requestReturn(combatant) {
    return dispatch(QUERY.return, "handleReturn", combatant);
}

/**
 * Only a GM may write initiative or advance the encounter, so a player's click is forwarded to
 * the active GM's client rather than attempted locally and failing on permissions.
 */
async function dispatch(queryName, handlerName, combatant) {
    const combat = combatant?.parent;
    if (!combat?.started) return warn("notStarted");
    if (!combatant.isOwner) return warn("notOwner");

    const payload = { combatantUuid: combatant.uuid };
    if (game.user.isGM) return HANDLERS[handlerName](payload);

    const gm = game.users.activeGM;
    if (!gm) return warn("noActiveGM");
    try {
        return await gm.query(queryName, payload, { timeout: 10_000 });
    } catch (error) {
        console.error(`${MODULE_ID} |`, error);
        return warn("queryFailed");
    }
}

/* -------------------------------------------- */
/*  GM-side handlers                            */
/* -------------------------------------------- */

async function handleDelay({ combatantUuid }) {
    const combatant = await fromUuid(combatantUuid);
    const combat = combatant?.parent;
    if (!combat?.started) return;
    if (combat.combatant !== combatant) return warn("notYourTurn");
    if (isDelayed(combatant)) return;

    // Remember where they were: if the delay lapses, initiative is unchanged and their next turn
    // happens at the original position.
    await combatant.setFlag(MODULE_ID, DELAYED, {
        initiative: combatant.initiative,
        round: combat.round,
    });
    await addDelayingEffect(combatant.actor);
    await postCard(combatant, "delay");

    // Ending the turn is what actually removes them from play; the skip hook keeps their slot
    // passed over for the rest of the round.
    await combat.nextTurn();
}

async function handleReturn({ combatantUuid }) {
    const combatant = await fromUuid(combatantUuid);
    const combat = combatant?.parent;
    if (!combat?.started || !isDelayed(combatant)) return;

    const current = combat.combatant;
    if (!current || current === combatant) return warn("returnNeedsAnotherTurn");

    await combatant.unsetFlag(MODULE_ID, DELAYED);
    await removeDelayingEffect(combatant.actor);

    // "This permanently changes your initiative to the new position."
    const currentId = current.id;
    const order = combat.turns.filter((c) => typeof c.initiative === "number" && c !== combatant);
    const afterIndex = order.findIndex((c) => c.id === currentId);
    order.splice(afterIndex + 1, 0, combatant);
    await combat.updateEmbeddedDocuments("Combatant", initiativeUpdates(combat, order, combatant));

    // Returning does not end anyone's turn. The trigger is the end of another creature's turn,
    // so the combatant is slotted in directly behind whoever is acting and picks up the turn
    // when that one finishes normally. Reordering can shift the turn pointer, so put it back on
    // the combatant whose turn it actually still is.
    if (combat.combatant?.id !== currentId) {
        const turn = combat.turns.findIndex((c) => c.id === currentId);
        if (turn >= 0) await combat.update({ turn }, { diff: false });
    }

    await postCard(combatant, "return");
}

const HANDLERS = { handleDelay, handleReturn };

/* -------------------------------------------- */
/*  Turn skipping and lapsing                   */
/* -------------------------------------------- */

/**
 * A delayed combatant's slot is passed over. When their original slot comes round again in a
 * later round the delay has run its full round, so it simply ends and they take a normal turn.
 */
async function onTurnChange(combat, changed) {
    if (!("turn" in changed || "round" in changed)) return;
    if (game.user !== game.users.activeGM) return;
    if (!combat.started) return;

    const combatant = combat.combatant;
    const delay = delayDataOf(combatant);
    if (!delay) return;

    if (combat.round > delay.round) {
        await combatant.unsetFlag(MODULE_ID, DELAYED);
        await removeDelayingEffect(combatant.actor);
        await postCard(combatant, "lapse");
        return;
    }

    // Don't spin if every remaining combatant is delayed.
    if (combat.turns.every((c) => isDelayed(c) || c.isDefeated)) return;
    await combat.nextTurn();
}

/* -------------------------------------------- */
/*  Initiative placement                        */
/* -------------------------------------------- */

/**
 * Produce combatant updates placing `moved` at its index in `order`.
 *
 * Mirrors the system's own drag-and-drop logic in `apps/sidebar/encounter-tracker.ts`. Equal
 * initiative values are not enough on their own: PF2e breaks ties on
 * `flags.pf2e.overridePriority[initiative]` and then on combatant id, so every combatant sharing
 * the resulting value needs its priority rewritten or the order is arbitrary.
 */
function initiativeUpdates(combat, order, moved) {
    const index = order.indexOf(moved);
    const above = order[index - 1] ?? null;
    const below = order[index + 1] ?? null;

    const movedUp = !!below && combat.getCombatantWithHigherInit(moved, below) === below;

    const initiative = !above
        ? below.initiative + 1
        : !below
          ? above.initiative - 1
          : below.initiative < above.initiative && movedUp
            ? below.initiative + 1
            : below.initiative;

    const updates = { [moved.id]: { initiative } };

    const sharing = order.filter((c) => (c === moved ? initiative : c.initiative) === initiative);
    if (sharing.length > 1) {
        sharing.forEach((c, priority) => {
            updates[c.id] ??= {};
            updates[c.id].priority = priority;
        });
    }

    return Object.entries(updates).map(([id, data]) => {
        const update = { _id: id };
        if (data.initiative !== undefined) update.initiative = data.initiative;
        if (data.priority !== undefined) {
            update[`flags.pf2e.overridePriority.${initiative}`] = data.priority;
        }
        return update;
    });
}

/* -------------------------------------------- */
/*  Presentation                                */
/* -------------------------------------------- */

async function addDelayingEffect(actor) {
    if (!actor || !setting("delayEffect")) return;
    return actor.createEmbeddedDocuments("Item", [
        {
            type: "effect",
            name: game.i18n.localize(`${MODULE_ID}.delay.effect`),
            img: "icons/svg/clockwork.svg",
            system: {
                slug: EFFECT_SLUG,
                tokenIcon: { show: true },
                description: { value: game.i18n.localize(`${MODULE_ID}.delay.effectHint`) },
                duration: { value: -1, unit: "encounter", sustained: false, expiry: "turn-start" },
            },
        },
    ]);
}

async function removeDelayingEffect(actor) {
    const ids = actor?.itemTypes?.effect?.filter((e) => e.slug === EFFECT_SLUG).map((e) => e.id) ?? [];
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}

async function postCard(combatant, type) {
    if (!setting("delayChatCard")) return;
    const label = game.i18n.localize(`${MODULE_ID}.delay.card.${type}`);
    const glyph = type === "lapse" ? "" : `<span class="action-glyph">F</span>`;
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: combatant.token, actor: combatant.actor }),
        content: `<div class="pf2e chat-card action-card"><header class="card-header flexrow">
            <img src="systems/pf2e/icons/actions/FreeAction.webp" alt="${label}">
            <h3>${label} ${glyph}</h3></header></div>`,
    });
}

function warn(key) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.delay.errors.${key}`));
    return null;
}

/* -------------------------------------------- */
/*  Combat tracker buttons                      */
/* -------------------------------------------- */

function onRenderTracker(_app, html) {
    if (!setting("delayButton")) return;
    const combat = game.combat;
    if (!combat?.started) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    for (const li of root.querySelectorAll("li.combatant")) {
        // Both `renderCombatTracker` and `renderEncounterTracker` fire for the same tracker, so
        // clear first rather than appending a second button on every render.
        for (const stale of li.querySelectorAll(`.${MODULE_ID}-delay-button`)) stale.remove();

        const combatant = combat.combatants.get(li.dataset.combatantId ?? "");
        if (!combatant?.isOwner || combatant.initiative === null) continue;

        const delayed = isDelayed(combatant);
        if (!delayed && combat.combatant?.id !== combatant.id) continue;

        const button = document.createElement("a");
        button.className = `${MODULE_ID}-delay-button`;
        button.dataset.tooltip = game.i18n.localize(`${MODULE_ID}.delay.${delayed ? "return" : "delay"}`);
        button.innerHTML = `<i class="fa-solid ${delayed ? "fa-play" : "fa-hourglass-half"}"></i>`;
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            (delayed ? requestReturn : requestDelay)(combatant);
        });

        (li.querySelector(".token-initiative") ?? li).append(button);
    }
}

export function registerDelay() {
    CONFIG.queries[QUERY.delay] = handleDelay;
    CONFIG.queries[QUERY.return] = handleReturn;
    Hooks.on("updateCombat", onTurnChange);
    Hooks.on("renderCombatTracker", onRenderTracker);
    Hooks.on("renderEncounterTracker", onRenderTracker);
}
