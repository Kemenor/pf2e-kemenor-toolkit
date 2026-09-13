import { FLAGS, MODULE_ID, getSummonerOf, setting } from "./lib.js";

/**
 * Shared investiture, from the Eidolon class feature:
 *
 *   "Your eidolon's link to you means it can benefit from certain magic items invested by you.
 *    Your eidolon gains item bonuses to Perception and skills from any magical items that you
 *    have invested. Your eidolon increases its item bonus to AC based on your armor's armor
 *    potency rune or bracers of armor. It also gains an item bonus to its saves from the
 *    resilient rune on your armor or from your bracers of armor. [...] Your eidolon's Strikes
 *    benefit from the fundamental and property runes on your handwraps of mighty blows.
 *    Alternatively, you can Invest a magic weapon [...] to share its fundamental and property
 *    runes with your eidolon. You share these benefits only while you're holding the weapon,
 *    and you can have no more than one weapon invested in this way at a time."
 */

/** A deferred modifier, the shape the system's synthetics registry expects. */
function deferred({ slug, label, modifier, type = "item" }) {
    return (options = {}) => {
        const mod = new game.pf2e.Modifier({ slug, label, modifier, type });
        if (options.test) mod.test(options.test);
        return mod;
    };
}

function push(synthetics, selector, entry) {
    (synthetics.modifiers[selector] ??= []).push(entry);
}

/** The item bonus a bracers of armor style item grants to the given statistic on the summoner. */
function bracersBonus(summoner, modifiers) {
    const bracers = summoner.inventory.filter(
        (i) => i.isInvested && /^bracers-of-armor/.test(i.slug ?? ""),
    );
    if (!bracers.length) return 0;
    const slugs = new Set(bracers.map((i) => i.slug));
    return Math.max(
        0,
        ...(modifiers ?? []).filter((m) => m.enabled && slugs.has(m.slug)).map((m) => m.modifier),
    );
}

/**
 * Item bonuses on the summoner that originate from an item they have invested. Used for
 * Perception and skills, where the bonus is granted by a rule element on the item itself and
 * so is far easier to read off the prepared statistic than to recompute.
 */
function investedItemBonuses(summoner, statistic, investedUUIDs) {
    return (statistic?.modifiers ?? []).filter(
        (m) => m.enabled && m.type === "item" && m.modifier > 0 && investedUUIDs.has(m.source),
    );
}

export function applyInvestiture(eidolon) {
    if (!setting("sharedInvestiture")) return;
    const summoner = getSummonerOf(eidolon);
    if (!summoner) return;

    const synthetics = eidolon.synthetics;
    if (!synthetics?.modifiers) return;

    const armor = summoner.wornArmor;
    const investedUUIDs = new Set(summoner.inventory.filter((i) => i.isInvested).map((i) => i.uuid));

    // AC: armor potency rune, or bracers of armor, whichever is higher.
    const acBonus = Math.max(
        armor?.system?.runes?.potency ?? 0,
        bracersBonus(summoner, summoner.system?.attributes?.ac?.modifiers),
    );
    if (acBonus > 0) {
        push(
            synthetics,
            "ac",
            deferred({
                slug: "shared-investiture-ac",
                label: game.i18n.localize(`${MODULE_ID}.investiture.ac`),
                modifier: acBonus,
            }),
        );
    }

    // Saves: resilient rune on the summoner's armor, or bracers of armor.
    const saveBonus = Math.max(
        armor?.system?.runes?.resilient ?? 0,
        bracersBonus(summoner, summoner.saves?.fortitude?.modifiers),
    );
    if (saveBonus > 0) {
        push(
            synthetics,
            "saving-throw",
            deferred({
                slug: "shared-investiture-save",
                label: game.i18n.localize(`${MODULE_ID}.investiture.save`),
                modifier: saveBonus,
            }),
        );
    }

    // Perception and skills: whatever the summoner's invested items grant.
    const statistics = [["perception", summoner.perception], ...Object.entries(summoner.skills ?? {})];
    for (const [selector, statistic] of statistics) {
        for (const mod of investedItemBonuses(summoner, statistic, investedUUIDs)) {
            push(
                synthetics,
                selector,
                deferred({ slug: mod.slug, label: mod.label, modifier: mod.modifier }),
            );
        }
    }
}

/**
 * The weapon whose runes the eidolon's Strikes borrow: invested handwraps of mighty blows,
 * otherwise a magic weapon explicitly shared with the eidolon and currently held.
 */
export function sharedRuneSource(summoner) {
    const handwraps = summoner.itemTypes.weapon.find(
        (w) => w.slug === "handwraps-of-mighty-blows" && w.isInvested,
    );
    if (handwraps) return handwraps;
    return (
        summoner.itemTypes.weapon.find(
            (w) => w.flags?.[MODULE_ID]?.[FLAGS.sharedWeapon] && w.handsHeld > 0,
        ) ?? null
    );
}

/**
 * Wraps `WeaponPF2e#prepareBaseData`. The runes have to be in place *before* the wrapped call:
 * the system turns striking into damage dice and potency into `flags.pf2e.attackItemBonus`
 * inside that same method, so writing them afterwards would change the numbers on the sheet
 * without changing the numbers that are actually rolled.
 */
export function onWeaponPrepareBaseData(wrapped, ...args) {
    if (!setting("sharedInvestiture")) return wrapped(...args);

    const actor = this.actor;
    // Eidolon Strikes are unarmed; a real weapon it happens to carry keeps its own runes.
    if (!actor || this.system?.category !== "unarmed") return wrapped(...args);

    const summoner = getSummonerOf(actor);
    if (!summoner) return wrapped(...args);

    const source = sharedRuneSource(summoner);
    if (!source) return wrapped(...args);

    const runes = this.system.runes;
    const shared = source.system.runes;
    runes.potency = Math.max(runes.potency ?? 0, shared.potency ?? 0);
    runes.striking = Math.max(runes.striking ?? 0, shared.striking ?? 0);
    if (Array.isArray(shared.property)) {
        const own = Array.isArray(runes.property) ? runes.property : [];
        runes.property = [...new Set([...own, ...shared.property])];
    }

    return wrapped(...args);
}

/** Mark one magic weapon as shared with the eidolon, clearing any previous choice. */
export async function setSharedWeapon(summoner, weapon) {
    const previous = summoner.itemTypes.weapon.filter((w) => w.flags?.[MODULE_ID]?.[FLAGS.sharedWeapon]);
    for (const old of previous) {
        if (old.id !== weapon?.id) await old.unsetFlag(MODULE_ID, FLAGS.sharedWeapon);
    }
    if (weapon) await weapon.setFlag(MODULE_ID, FLAGS.sharedWeapon, true);
    summoner.reset();
}
