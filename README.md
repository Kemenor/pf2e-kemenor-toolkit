# PF2e Kemenor Toolkit

Pathfinder 2e automations for Foundry VTT: summoner and eidolon handling, Delay, and Lingering
Composition.

Foundry **v14**, PF2e **8.x**.

- [Installation](#installation)
- [Summoner and eidolon](#summoner-and-eidolon)
- [Delay](#delay)
- [Lingering Composition](#lingering-composition)
- [Macros](#macros)
- [Settings](#settings)
- [FAQ](#faq)
- [Compatibility](#compatibility)

## Installation

Paste this manifest URL into Foundry's **Install Module** dialog:

```
https://github.com/Kemenor/pf2e-kemenor-toolkit/releases/latest/download/module.json
```

Requires [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper).

## Summoner and eidolon

### Pairing

Summoners are paired with their eidolon automatically when the world loads — no macro, no
targeting. A summoner is matched to an eidolon-trait character that shares a player owner.

When there is no shared owner, or a summoner has more than one possible eidolon, nothing is paired
and you choose yourself. See [How do I pair a summoner and eidolon by hand?](#how-do-i-pair-a-summoner-and-eidolon-by-hand)

### Shared hit points

> The connection between you and your eidolon means you both share a single pool of Hit Points.
> Damage taken by either you or the eidolon reduces your Hit Points, while healing either of you
> recovers your Hit Points. Like with your actions, if you and your eidolon are both subject to the
> same effect that affects your Hit Points, you apply those effects only once (applying the greater
> effect, if applicable).

The eidolon has no pool of its own. Damage or healing applied to either moves the one pool, from
any client, without waiting on the GM.

Dying, wounded and drained are applied to the summoner instead of the eidolon, taking the greater
value if the summoner already has that condition. Hero points are shared the same way.

### Shared investiture

> Your eidolon's link to you means it can benefit from certain magic items invested by you. Your
> eidolon gains item bonuses to Perception and skills from any magical items that you have invested.
> Your eidolon increases their item bonus to AC based on your armor's armor potency rune or bands of
> force. They also gain an item bonus to their saves from the resilient rune on your armor or from
> your bands of force.

| Source on the summoner | Effect on the eidolon |
| --- | --- |
| Handwraps of mighty blows, or a shared weapon | Fundamental and property runes on its Strikes |
| Armor potency rune, or bands of force | Added to its item bonus to AC |
| Resilient rune, or bands of force | Item bonus to saves |
| Any invested item | Its item bonuses to Perception and skills |

Note *increases* in the AC clause: an eidolon already has an item bonus to AC from its key attribute
(+2 for Strength, +1 for Dexterity), and the summoner's armor potency adds on top rather than
replacing it. A Strength-key eidolon whose summoner wears +1 armor ends up at +3.

Saves work the other way round — the eidolon has no base item bonus there, so the resilient rune
grants one.

Everything shows on the eidolon's sheet and updates as soon as the summoner's gear changes:
swapping weapons, investing, divesting or etching a rune all take effect immediately.

#### Sharing weapon runes

> Your eidolon's Strikes benefit from the fundamental and property runes on your handwraps of mighty
> blows. Alternatively, you can Invest a magic weapon (even though magic weapons can't normally be
> Invested) to share its fundamental and property runes with your eidolon. You share these benefits
> only while you're holding the weapon, and you can have no more than one weapon invested in this
> way at a time. In either case, the eidolon gains only the benefits that can apply to its attacks.

Invested handwraps of mighty blows are used automatically, and always take precedence.

To share a magic weapon instead, give the weapon the **invested** trait and invest it. The
inventory's own Invest toggle then switches the sharing on and off. The runes apply only while the
weapon is held, and only one weapon at a time.

The **Share Weapon Runes with Eidolon** macro adds the trait and invests the weapon for you.

### Manifest and dismiss

> Your eidolon appears in an open space adjacent to you, and can then take a single action. If your
> eidolon was already manifested, you unmanifest it instead. […] If forced beyond this distance, or
> if you are reduced to 0 Hit Points, your eidolon's physical form dissolves.

Using the **Manifest Eidolon** action from the summoner's sheet places the eidolon next to them, or
unmanifests it if it is already out. Players can use it; a GM has to be online.

With **Dismiss at 0 hit points** on, emptying the shared pool unmanifests the eidolon, as the action
describes.

## Delay

> You wait for the right moment to act. The rest of your turn doesn't happen yet. Instead, you're
> removed from the initiative order. You can return to the initiative order as a free action
> triggered by the end of any other creature's turn. This permanently changes your initiative to the
> new position. […] If you Delay an entire round without returning to the initiative order, the
> actions from the Delayed turn are lost, your initiative doesn't change, and your next turn occurs
> at your original position in the initiative order.

An hourglass appears on the active combatant in the encounter tracker. Clicking it ends their turn
and takes them out of the initiative order; their slot is skipped for the rest of the round.

A play arrow then appears on their row. Clicking it puts them back into the order directly behind
whoever is currently acting, permanently setting their initiative to that position. They pick up the
turn when the current one finishes — returning never cuts anyone's turn short.

A delay that is never taken lapses on its own: when the original slot comes round again the
combatant takes a normal turn there, with their initiative unchanged.

Players can use both buttons. A GM has to be online.

## Lingering Composition

> If your next action is to cast a cantrip composition with a duration of 1 round, attempt a
> Performance check. The DC is usually a standard-difficulty DC of a level equal to the highest-level
> target of your composition. […] **Critical Success** The composition lasts 4 rounds. **Success**
> The composition lasts 3 rounds. **Failure** The composition lasts 1 round, but you don't spend the
> Focus Point for casting this spell.

Cast Lingering Composition and then a composition cantrip. Both are cast normally — there is no
macro to remember.

Casting Lingering Composition rolls the Performance check against the right DC. Casting the cantrip
then applies its spell effect to the caster and every ally inside the emanation, for the rounds
earned. A failed check hands the focus point back.

This works for any composition cantrip, not just Courageous Anthem. The effect applied is whichever
spell effect is linked first in that spell's description, so linking a custom effect there uses it
instead.

## Macros

Open **Game Settings → PF2e Kemenor Toolkit → Macros → Create macros**. That adds a *PF2e Kemenor
Toolkit* folder to the world's Macros directory containing:

| Macro | What it does |
| --- | --- |
| Manifest or Dismiss Eidolon | Manifests the selected summoner's eidolon, or unmanifests it |
| Share Weapon Runes with Eidolon | Pick which weapon's runes the eidolon borrows |
| Pair Summoner and Eidolon | Pair or unpair them by hand |
| Delay or Return to Initiative | Delay the current combatant, or bring them back |

Drag any of them onto the hotbar. Players can use them. Running **Create macros** again refreshes
them and won't create duplicates.

## Settings

### Summoner and eidolon

| Setting | Effect | Reload |
| --- | --- | :-: |
| Shared hit point pool | The eidolon reads and writes its summoner's pool; dying, wounded and drained move to the summoner | yes |
| Shared hero points | The eidolon reads and writes its summoner's hero points | yes |
| Shared investiture | Runes, AC, saves, Perception and skills from the summoner's invested items | yes |
| Link summoners automatically | Pair unlinked summoners on world load by shared ownership | yes |
| Dismiss at 0 hit points | Unmanifest the eidolon when the shared pool empties | yes |
| Manifest Eidolon action | The action manifests or unmanifests the eidolon | no |

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

## FAQ

### How do I pair a summoner and eidolon by hand?

1. **Game Settings → PF2e Kemenor Toolkit → Macros → Create macros**
2. Open the **Macros** directory (the bookmark icon in the sidebar) and find the *PF2e Kemenor
   Toolkit* folder
3. Drag **Pair Summoner and Eidolon** onto your hotbar, then click it
4. Choose the summoner and the eidolon from the two lists and click **Pair them**

The same dialog unpairs them with the **Unpair** button.

### Why weren't they paired automatically?

Automatic pairing only fires when a summoner and exactly one eidolon share a player owner. If the
eidolon has no player owner, or a player has two eidolons, it will not guess — pair them by hand
using the steps above. A pairing you set yourself is never overwritten.

### My eidolon's runes or AC look wrong

Check that the summoner is actually holding and investing the weapon, and that the eidolon is paired
(the **Pair Summoner and Eidolon** dialog shows the current pairing). Remember that item bonuses do
not stack: the eidolon shows one combined item bonus to AC rather than two separate ones.

### Can players use all this?

Yes. Delaying, returning, manifesting and casting all work from a player's own client. Some of it
needs a GM logged in, because only a GM may change initiative or create tokens — if no GM is online
you get a message saying so rather than a half-finished action.

### Can I call any of this from my own macros?

Everything is on `game.kemenorToolkit`:

| Method | Purpose |
| --- | --- |
| `linkDialog()` | Open the pairing dialog |
| `link(summoner, eidolon)` / `unlink(summoner, eidolon)` | Pair or unpair directly |
| `getSummonerOf(actor)` / `getEidolonOf(actor)` | The other half of a pair, or `null` |
| `manifestEidolon(summoner)` | Place the eidolon adjacent to its summoner |
| `dismissEidolon(actor, { allScenes })` | Remove the eidolon's tokens |
| `toggleEidolon(actor)` | Whichever of the two applies |
| `chooseSharedWeapon(summoner)` | Pick the weapon whose runes the eidolon borrows |
| `setSharedWeapon(summoner, weapon)` | Set it directly; pass `null` to clear |
| `sharedRuneSource(summoner)` | The weapon currently supplying runes, or `null` |
| `delay(combatant)` / `returnToInitiative(combatant)` | Leave or rejoin the initiative order |
| `isDelayed(combatant)` | Whether that combatant is delaying |
| `selectedActor()` | The selected token's actor, else your assigned character |
| `createMacros()` | Recreate the macro folder |

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
