import { MODULE_ID, primaryToken, setting } from "./lib.js";

/**
 * Lingering Composition, automated end to end.
 *
 *   "If your next action is to cast a cantrip composition with a duration of 1 round, attempt a
 *    Performance check. The DC is usually a standard-difficulty DC of a level equal to the
 *    highest-level target of your composition [...] Critical Success The composition lasts 4
 *    rounds. Success The composition lasts 3 rounds. Failure The composition lasts 1 round, but
 *    you don't spend the Focus Point for casting this spell."
 *
 * Casting Lingering Composition rolls the check and arms the next composition cantrip. Casting
 * that cantrip then applies its spell effect to the caster and every ally in the emanation, for
 * however many rounds the check earned. Nothing to remember and no macro to click.
 */

const ARMED = "lingeringComposition";
const QUERY = `${MODULE_ID}.composition`;

/** Standard-difficulty DC by level. */
const DC_BY_LEVEL = [
    14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46,
    48, 50,
];

function standardDC(level) {
    return DC_BY_LEVEL[Math.clamp(Math.floor(level), 0, DC_BY_LEVEL.length - 1)];
}

/** Rounds earned per degree of success: 0 crit fail, 1 fail, 2 success, 3 crit success. */
const ROUNDS_BY_DEGREE = [1, 1, 3, 4];

function isComposition(spell) {
    const traits = spell?.system?.traits?.value ?? [];
    return traits.includes("composition") && traits.includes("cantrip");
}

/** The spell effect a composition hands out, taken from the link in its own description. */
function effectUuidFor(spell) {
    const description = spell?.system?.description?.value ?? "";
    const match = description.match(/@UUID\[(Compendium\.[^\]]*spell-effects[^\]]*)\]/);
    return match?.[1] ?? null;
}

/** Distance between two token documents, edge to edge where the canvas can tell us. */
function distanceBetween(a, b) {
    if (a?.object?.distanceTo && b?.object) return a.object.distanceTo(b.object);
    const centre = (t) => {
        const size = t.parent?.grid?.size ?? 100;
        return { x: t.x + (t.width * size) / 2, y: t.y + (t.height * size) / 2 };
    };
    return canvas.grid.measurePath([centre(a), centre(b)]).distance;
}

/** The caster and every ally inside the emanation. */
function targetsInArea(caster, radius) {
    const origin = primaryToken(caster);
    if (!origin) return [caster];
    const scene = origin.parent;
    const targets = new Set([caster]);
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!actor || actor === caster) continue;
        if (actor.alliance !== caster.alliance) continue;
        if (distanceBetween(origin, token) <= radius) targets.add(actor);
    }
    return [...targets];
}

/* -------------------------------------------- */
/*  Casting                                     */
/* -------------------------------------------- */

async function onLingeringComposition(caster) {
    const radius = 60; // Every composition cantrip is a 60-foot emanation.
    const targets = targetsInArea(caster, radius);
    const highestLevel = Math.max(...targets.map((a) => a.level ?? 0), caster.level ?? 0);
    const dc = standardDC(highestLevel);

    const roll = await caster.skills.performance.roll({
        dc: { value: dc },
        label: game.i18n.localize(`${MODULE_ID}.composition.checkLabel`),
        extraRollOptions: ["action:lingering-composition"],
    });
    if (!roll) return;

    const degree = roll.options?.degreeOfSuccess ?? 1;
    const rounds = ROUNDS_BY_DEGREE[degree] ?? 1;

    if (degree >= 2) {
        await caster.setFlag(MODULE_ID, ARMED, { rounds, at: game.time.worldTime });
    } else {
        // "Failure The composition lasts 1 round, but you don't spend the Focus Point."
        const focus = caster.system.resources?.focus;
        if (focus && focus.value < focus.max) {
            await caster.update({ "system.resources.focus.value": focus.value + 1 });
        }
    }

    ui.notifications.info(
        game.i18n.format(`${MODULE_ID}.composition.result`, { rounds, dc, name: caster.name }),
    );
}

async function onCompositionCantrip(caster, spell) {
    const armed = caster.getFlag(MODULE_ID, ARMED);
    const rounds = armed?.rounds ?? 1;
    if (armed) await caster.unsetFlag(MODULE_ID, ARMED);

    const effectUuid = effectUuidFor(spell);
    if (!effectUuid) return;

    const radius = Number(spell.system.area?.value) || 60;
    const targets = targetsInArea(caster, radius);

    const payload = {
        casterUuid: caster.uuid,
        spellUuid: spell.uuid,
        effectUuid,
        rounds,
        targetUuids: targets.map((a) => a.uuid),
    };

    // Applying an effect to another player's actor needs ownership, so the GM does the writing.
    if (game.user.isGM) return applyComposition(payload);
    const gm = game.users.activeGM;
    if (!gm) return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.composition.noGM`));
    return gm.query(QUERY, payload, { timeout: 10_000 });
}

/* -------------------------------------------- */
/*  GM-side application                         */
/* -------------------------------------------- */

async function applyComposition({ casterUuid, spellUuid, effectUuid, rounds, targetUuids }) {
    const caster = await fromUuid(casterUuid);
    const spell = await fromUuid(spellUuid);
    const effect = await fromUuid(effectUuid);
    if (!effect) return;

    const casterToken = primaryToken(caster);
    const source = effect.toObject();
    source._stats = { ...(source._stats ?? {}), compendiumSource: effectUuid };
    source.system.duration = { value: rounds, unit: "rounds", sustained: false, expiry: "turn-start" };
    source.system.context = {
        origin: {
            actor: casterUuid,
            item: spellUuid,
            spellcasting: null,
            rollOptions: [],
            token: casterToken?.uuid ?? null,
        },
        roll: null,
        target: null,
    };

    await clearCompetingAuras(caster, effectUuid);

    for (const uuid of targetUuids) {
        const actor = await fromUuid(uuid);
        if (!actor) continue;

        // Recasting replaces rather than stacks.
        const existing = actor.itemTypes.effect.filter((e) => e._stats?.compendiumSource === effectUuid);
        if (existing.length) {
            await actor.deleteEmbeddedDocuments("Item", existing.map((e) => e.id));
        }
        await actor.createEmbeddedDocuments("Item", [foundry.utils.deepClone(source)]);
    }

    // Another module may be applying the same effect a moment later; sweep once more.
    setTimeout(() => clearCompetingAuras(caster, effectUuid, targetUuids), 600);

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: caster, token: casterToken }),
        content: `<div class="pf2e chat-card"><p>${game.i18n.format(`${MODULE_ID}.composition.applied`, {
            spell: spell?.name ?? "",
            rounds,
            count: targetUuids.length,
        })}</p></div>`,
    });
}


/**
 * Remove any other source handing out the same composition effect.
 *
 * pf2e-automations ships "Aura: Courageous Anthem", which reacts to the same cast and grants the
 * identical spell effect through an Aura rule -- at an unlimited duration that never expires.
 * Two sources for one composition means duplicate effects on everyone and a bonus that outlives
 * the spell. A composition affects whoever stands in the emanation at the moment it is cast
 * rather than persisting as an aura, so this module takes ownership and clears the competitor.
 *
 * Detection is by behaviour, not by name: any effect carrying an Aura rule that grants this very
 * spell effect. Turn off `compositionAutomation` to hand the job back.
 */
async function clearCompetingAuras(caster, effectUuid, targetUuids = []) {
    if (!caster) return;

    const auraSources = caster.itemTypes.effect.filter((effect) =>
        (effect.system.rules ?? []).some(
            (rule) => rule.key === "Aura" && (rule.effects ?? []).some((e) => e.uuid === effectUuid),
        ),
    );
    if (auraSources.length) {
        await caster.deleteEmbeddedDocuments("Item", auraSources.map((e) => e.id));
    }

    // Copies already handed out by such an aura are identifiable by their aura flag.
    for (const uuid of targetUuids) {
        const actor = await fromUuid(uuid);
        const stale = actor?.itemTypes.effect.filter(
            (e) => e._stats?.compendiumSource === effectUuid && e.flags?.pf2e?.aura,
        );
        if (stale?.length) await actor.deleteEmbeddedDocuments("Item", stale.map((e) => e.id));
    }
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerComposition() {
    CONFIG.queries[QUERY] = applyComposition;

    Hooks.on("createChatMessage", async (message) => {
        if (!setting("compositionAutomation")) return;
        // Only the client that cast reacts, so the work happens once.
        if (message.author?.id !== game.user.id) return;

        const origin = message.flags?.pf2e?.origin;
        if (origin?.type !== "spell" || !origin.uuid) return;

        const spell = await fromUuid(origin.uuid);
        const caster = message.actor;
        if (!spell || !caster) return;

        if (spell.slug === "lingering-composition") return onLingeringComposition(caster);
        if (isComposition(spell)) return onCompositionCantrip(caster, spell);
    });
}
