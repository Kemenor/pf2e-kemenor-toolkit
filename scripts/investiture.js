import { FLAGS, MODULE_ID, getEidolonOf, getSummonerOf, refresh, setting } from "./lib.js";

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

/**
 * Bands of force is the remaster name for what pre-remaster text calls bracers of armor, and
 * the rules name it as the alternative source for the eidolon's AC and save item bonuses. Both
 * spellings are matched so the module works either side of the remaster.
 */
const ARMOR_SUBSTITUTE = /^(bands-of-force|bracers-of-armor)/;

/** The item bonus a bands of force style item grants to the given statistic on the summoner. */
function armorSubstituteBonus(summoner, modifiers) {
    const items = summoner.inventory.filter(
        (i) => i.isInvested && ARMOR_SUBSTITUTE.test(i.slug ?? ""),
    );
    if (!items.length) return 0;
    const slugs = new Set(items.map((i) => i.slug));
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

/**
 * The eidolon's own item bonus to AC, which the summoner's armor increases rather than
 * replaces. It comes from the key-attribute choice (+2 Strength / +1 Dexterity) and is applied
 * by whichever module built the eidolon, so it is read from the rule elements on its own items
 * -- the prepared statistic is not available yet at the point this runs.
 */
function ownItemBonusToAC(eidolon) {
    let best = 0;
    for (const item of eidolon.items) {
        for (const rule of item._source.system.rules ?? []) {
            if (rule.key !== "FlatModifier" || rule.type !== "item") continue;
            const selectors = Array.isArray(rule.selector) ? rule.selector : [rule.selector];
            if (!selectors.includes("ac")) continue;
            const value = Number(rule.value);
            if (Number.isFinite(value)) best = Math.max(best, value);
        }
    }
    return best;
}

export function applyInvestiture(eidolon) {
    if (!setting("sharedInvestiture")) return;
    const summoner = getSummonerOf(eidolon);
    if (!summoner) return;

    const synthetics = eidolon.synthetics;
    if (!synthetics?.modifiers) return;

    const armor = summoner.wornArmor;
    const investedUUIDs = new Set(summoner.inventory.filter((i) => i.isInvested).map((i) => i.uuid));

    // AC: "Your eidolon increases their item bonus to AC based on your armor's armor potency
    // rune or bands of force." Increases, not replaces -- an eidolon already has an item bonus
    // to AC from its key attribute (+2 for Strength, +1 for Dexterity), and the summoner's
    // armor stacks on top of it. Item bonuses do not stack in general, so this is expressed as
    // a single combined item bonus that supersedes the eidolon's own.
    const acIncrease = Math.max(
        armor?.system?.runes?.potency ?? 0,
        armorSubstituteBonus(summoner, summoner.system?.attributes?.ac?.modifiers),
    );
    if (acIncrease > 0) {
        push(
            synthetics,
            "ac",
            deferred({
                slug: "shared-investiture-ac",
                label: game.i18n.localize(`${MODULE_ID}.investiture.ac`),
                modifier: ownItemBonusToAC(eidolon) + acIncrease,
            }),
        );
    }

    // Saves: resilient rune on the summoner's armor, or bracers of armor.
    const saveBonus = Math.max(
        armor?.system?.runes?.resilient ?? 0,
        armorSubstituteBonus(summoner, summoner.saves?.fortitude?.modifiers),
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
 * The weapon whose runes the eidolon's Strikes borrow.
 *
 * Invested handwraps of mighty blows always win. Otherwise it is a magic weapon the summoner
 * has Invested and is currently holding -- the system has no `invested` trait on weapons by
 * default, so giving one the trait is what opts it in, and the native Invest toggle then acts
 * as the on/off switch. The module flag only exists to disambiguate: with exactly one invested
 * held weapon no flag is needed, and "you can have no more than one weapon invested in this way
 * at a time" is satisfied on its own.
 */
export function sharedRuneSource(summoner) {
    const weapons = summoner.itemTypes.weapon;

    const handwraps = weapons.find((w) => w.slug === "handwraps-of-mighty-blows" && w.isInvested);
    if (handwraps) return handwraps;

    const eligible = weapons.filter(
        (w) => w.isInvested && w.handsHeld > 0 && w.slug !== "handwraps-of-mighty-blows",
    );
    if (eligible.length <= 1) return eligible[0] ?? null;

    // More than one invested held weapon: the flag decides which one is shared.
    return eligible.find((w) => w.flags?.[MODULE_ID]?.[FLAGS.sharedWeapon]) ?? null;
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

/**
 * Invest one magic weapon on the summoner's behalf and share it with the eidolon.
 *
 * Magic weapons carry no `invested` trait, so this adds it -- which is what makes the system
 * show an Invest toggle for the item and count it against the ten-item investiture limit, both
 * of which are what "you can Invest a magic weapon" should mean mechanically.
 */
export async function setSharedWeapon(summoner, weapon) {
    for (const old of summoner.itemTypes.weapon) {
        if (old.id === weapon?.id) continue;
        if (old.flags?.[MODULE_ID]?.[FLAGS.sharedWeapon]) {
            await old.unsetFlag(MODULE_ID, FLAGS.sharedWeapon);
            await old.update({ "system.equipped.invested": false });
        }
    }

    if (weapon) {
        const traits = weapon._source.system.traits.value;
        const update = { "system.equipped.invested": true };
        if (!traits.includes("invested")) {
            update["system.traits.value"] = [...traits, "invested"];
        }
        await weapon.update(update);
        await weapon.setFlag(MODULE_ID, FLAGS.sharedWeapon, true);
    }

    summoner.reset();
}

/**
 * Re-derive the eidolon when its summoner's possessions change.
 *
 * Everything shared by investiture is read off the summoner during the eidolon's own data
 * preparation, and nothing tells the eidolon that the summoner's inventory moved. Swap the
 * weapon whose runes are being shared, invest or divest something, change a rune, and the
 * eidolon keeps serving whatever it derived last time until something else happens to reset it.
 */
export function registerInvestiture() {
    const pending = new Set();
    const flush = foundry.utils.debounce(() => {
        for (const id of pending) {
            const eidolon = game.actors.get(id);
            eidolon?.reset();
            refresh(eidolon);
        }
        pending.clear();
    }, 50);

    const onItemChange = (item) => {
        const actor = item?.parent;
        if (!actor?.isOfType?.("character") || !item.isOfType?.("physical")) return;
        const eidolon = getEidolonOf(actor);
        if (!eidolon) return;
        pending.add(eidolon.id);
        flush();
    };

    for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, onItemChange);
}
