# PF2e Kemenor Toolkit

Pathfinder 2e automations for Foundry VTT: summoner and eidolon handling, Delay, and Lingering
Composition.

Foundry **v14**, PF2e **8.x**.

- [Installation](#installation)
- [Summoner and eidolon](#summoner-and-eidolon)
- [Delay](#delay)
- [Lingering Composition](#lingering-composition)
- [Settings](#settings)
- [API](#api)
- [Compatibility](#compatibility)

## Installation

Paste this manifest URL into Foundry's **Install Module** dialog:

```
https://github.com/Kemenor/pf2e-kemenor-toolkit/releases/latest/download/module.json
```

Requires [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper).

## Summoner and eidolon

### Linking

Summoners are paired with their eidolon automatically on world load — no macro, no targeting. A
summoner is matched to an eidolon-trait character that shares a player owner with them.

Where there is no shared owner, or more than one candidate, nothing is linked and you pair them
yourself. Automatic linking never overrides a link you set by hand.

```js
game.kemenorToolkit.link(summoner, eidolon);
game.kemenorToolkit.unlink(summoner, eidolon);
```

### Shared hit points

The eidolon shares its summoner's hit point pool. Damage or healing applied to either moves the
one pool, from any client, without waiting on the GM.

Dying, wounded and drained are applied to the summoner instead of the eidolon, taking the greater
value if the summoner already has the condition.

Hero points are shared the same way.

### Shared investiture

The summoner's invested items benefit the eidolon:

| Source on the summoner | Effect on the eidolon |
| --- | --- |
| Handwraps of mighty blows, or a shared weapon | Fundamental and property runes on its Strikes |
| Armor potency rune, or bands of force | Added to its item bonus to AC |
| Resilient rune, or bands of force | Item bonus to saves |
| Any invested item | Its item bonuses to Perception and skills |

Armor potency *adds to* the eidolon's own key-attribute AC bonus rather than replacing it, so a
Strength-key eidolon whose summoner wears +1 armor ends up at +3.

Everything shows on the eidolon's sheet, and updates as soon as the summoner's gear changes —
swapping weapons, investing, divesting or etching a rune all take effect immediately.

#### Sharing weapon runes

Invested handwraps of mighty blows are used automatically.

To share a magic weapon's runes instead, give the weapon the **invested** trait and invest it. The
inventory's own Invest toggle then switches the sharing on and off. The runes apply only while the
weapon is held, and only one weapon at a time.

To have the module add the trait and invest it for you:

```js
game.kemenorToolkit.chooseSharedWeapon(); // with the summoner's token selected
```

Handwraps always take precedence over a shared weapon.

### Manifest and dismiss

```js
game.kemenorToolkit.manifestEidolon(summoner); // place adjacent to the summoner
game.kemenorToolkit.dismissEidolon(actor);     // remove its tokens from the current scene
game.kemenorToolkit.toggleEidolon(actor);      // whichever applies
```

Dismissal clears the eidolon from the current scene. Pass `{ allScenes: true }` to remove a stale
token everywhere. With **Dismiss at 0 hit points** on, emptying the shared pool dismisses the
eidolon automatically.

## Delay

An hourglass appears on the active combatant in the encounter tracker. Clicking it ends their turn
and takes them out of the initiative order; their slot is skipped for the rest of the round.

A play arrow then appears on their row. Clicking it puts them back into the order directly behind
whoever is currently acting, permanently setting their initiative to that position. They pick up
the turn when the current one finishes — returning never cuts anyone's turn short.

A delay that is never taken lapses on its own: when the original slot comes round again the
combatant takes a normal turn there, with their initiative unchanged.

Players can use both buttons. A GM has to be online.

```js
game.kemenorToolkit.delay(combatant);
game.kemenorToolkit.returnToInitiative(combatant);
```

## Lingering Composition

Cast Lingering Composition and then a composition cantrip. Both are cast normally — there is no
macro to remember.

Casting Lingering Composition rolls Performance against the standard DC for the highest-level
target. Casting the cantrip then applies its spell effect to the caster and every ally inside the
emanation, lasting 4 rounds on a critical success, 3 on a success, and 1 on a failure. A failed
check hands the focus point back.

This works for any composition cantrip, not just Courageous Anthem. The effect applied is whichever
spell effect is linked first in that spell's description, so linking a custom effect there will use
it instead.

## Settings

### Summoner and eidolon

| Setting | Effect | Reload |
| --- | --- | :-: |
| Shared hit point pool | The eidolon reads and writes its summoner's pool; dying, wounded and drained move to the summoner | yes |
| Shared hero points | The eidolon reads and writes its summoner's hero points | yes |
| Shared investiture | Runes, AC, saves, Perception and skills from the summoner's invested items | yes |
| Link summoners automatically | Pair unlinked summoners on world load by shared ownership | yes |
| Dismiss at 0 hit points | Remove the eidolon's tokens when the shared pool empties | yes |

### Delay

| Setting | Effect | Reload |
| --- | --- | :-: |
| Delay button in the combat tracker | Hourglass to delay, play arrow to return | no |
| Delaying effect | A token-side reminder that reactions are unavailable while delayed | no |
| Announce Delay in chat | Post a free-action card on delay, return and lapse | no |

### Compositions

| Setting | Effect | Reload |
| --- | --- | :-: |
| Automate Lingering Composition | Roll the check on cast and apply the composition for the rounds earned | no |

Everything defaults to on. Settings marked *reload* take effect on the next world load; Foundry
prompts for it.

## API

Exposed on `game.kemenorToolkit`.

| Method | Purpose |
| --- | --- |
| `link(summoner, eidolon)` | Link a pair manually |
| `unlink(summoner, eidolon)` | Remove the link |
| `getSummonerOf(actor)` | The eidolon's summoner, or `null` |
| `getEidolonOf(actor)` | The summoner's eidolon, or `null` |
| `manifestEidolon(summoner)` | Place the eidolon adjacent to its summoner |
| `dismissEidolon(actor, { allScenes })` | Remove the eidolon's tokens |
| `toggleEidolon(actor)` | Whichever of the two applies |
| `chooseSharedWeapon(summoner)` | Pick the weapon whose runes the eidolon borrows |
| `setSharedWeapon(summoner, weapon)` | Set it directly; pass `null` to clear |
| `sharedRuneSource(summoner)` | The weapon currently supplying runes, or `null` |
| `delay(combatant)` | Leave the initiative order |
| `returnToInitiative(combatant)` | Rejoin behind the current combatant |
| `isDelayed(combatant)` | Whether that combatant is delaying |

## Compatibility

**`pf2e-eidolon-helper`** — conflicts. Both redirect eidolon hit point updates, so enable only one.
The module warns on load if it finds the other active.

**`pf2e-automations`** — its `Aura: Courageous Anthem` is removed when a composition is applied, so
the effect is not handed out twice with a duration that never expires.

## Credits

The rune-sharing and hit-point-redirection approaches were informed by
[pf2e-eidolon-helper](https://github.com/reyzor1991/pf2e-eidolon-helper) by Reyzor. Initiative
reordering follows the system's own encounter-tracker drag-and-drop logic.

MIT licensed.
