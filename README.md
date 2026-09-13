# PF2e Kemenor Toolkit

A personal grab-bag of Pathfinder 2e automations for Foundry VTT, so that a handful of wanted
features don't each cost a whole module. Built against Foundry v14 and PF2e 8.x.

## Summoner and eidolon

The PF2e system does not automate eidolons. In the entire system source, `eidolon` appears in
code five times: the creature trait, exclusion from the encounter tracker, kindred flanking,
the undead/construct type exceptions, and `isReallyPC`. Everything else is compendium content.
This module fills in the mechanics.

An eidolon is not, and cannot sensibly be, its own actor type: a module-registered subtype
would get a bare `Actor` with none of `CharacterPF2e`'s behaviour. So an eidolon here is what
the system already recognises — a `character` actor carrying the `eidolon` trait.

### Linking

Links are found automatically on world load: an unlinked summoner and exactly one eidolon-trait
character sharing a player owner are paired without a macro or a targeting step. Ownership is the
matching signal on purpose — in a party with two summoners, pairing on names or traits would
cheerfully bond the wrong eidolon to the wrong summoner and then share the wrong hit points.
Where there is no shared player owner, or more than one candidate, the module declines to guess
and you link it by hand.

Manual control, if the pairing is ambiguous:

```js
game.kemenorToolkit.link(summonerActor, eidolonActor);
game.kemenorToolkit.unlink(summonerActor, eidolonActor);
```

### Shared hit points

> "The connection between you and your eidolon means you both share a single pool of Hit
> Points." — Eidolon class feature

The summoner's stored hit points are the single source of truth. The eidolon stores none: its
`system.attributes.hp` is a live view onto the summoner's, and writes aimed at the eidolon are
redirected. Redirection happens on the client that initiated the update, so a player rolling
damage does not wait on a GM round trip.

Dying, wounded and drained act on the shared pool and are moved to the summoner, taking the
greater value if the summoner already has the condition — matching "you apply those effects
only once (applying the greater effect, if applicable)".

### Manifest and dismiss

```js
game.kemenorToolkit.manifestEidolon(summonerActor);  // place adjacent to the summoner
game.kemenorToolkit.dismissEidolon(actor);           // remove its tokens, everywhere
game.kemenorToolkit.toggleEidolon(actor);            // whichever applies
```

Dismissal removes the eidolon's tokens from the current scene only. A world that has been
running a while accumulates the same actor's tokens across every scene it ever visited, and
dismissing should not erase those. Pass `{ allScenes: true }` to sweep a stale token everywhere.
With **Dismiss at 0 hit points** on, reaching 0 in the shared pool dismisses automatically, on
the scene the summoner is standing on.

### Shared investiture

> "Your eidolon gains item bonuses to Perception and skills from any magical items that you
> have invested. Your eidolon increases its item bonus to AC based on your armor's armor
> potency rune or bracers of armor. It also gains an item bonus to its saves from the resilient
> rune on your armor or from your bracers of armor. [...] Your eidolon's Strikes benefit from
> the fundamental and property runes on your handwraps of mighty blows."

All four are applied, and all four show up on the eidolon's sheet rather than appearing only at
roll time.

Note the word *increases* in the AC clause. An eidolon already has an item bonus to AC from its
key attribute — "If Strength is their key attribute, your eidolon has a +2 item bonus to AC with
a +3 Dexterity cap. If Dexterity is their key attribute, your eidolon has +1 item bonus to AC
with a +4 Dexterity cap." The summoner's armor potency rune (or bands of force) stacks on top of
that, rather than competing with it. Since item bonuses otherwise do not stack, the module
expresses the total as one combined item bonus that supersedes the eidolon's own: a Strength-key
eidolon whose summoner wears +1 armor ends up at +3, not +2.

Saves work the other way round — the eidolon has no base item bonus there, so the resilient rune
simply *grants* one.

All of this is read off the summoner while the eidolon prepares its own data, and nothing
otherwise tells the eidolon that the summoner's inventory moved. The module therefore re-derives
the eidolon whenever a physical item on its summoner is created, changed or deleted — swapping the
shared weapon, investing or divesting, or etching a new rune all take effect immediately rather
than at whatever point something else happens to trigger a reset.

For the alternative path — "you can Invest a magic weapon (even though magic weapons can't
normally be Invested) to share its fundamental and property runes with your eidolon" — the
system has no invested weapons at all: `isInvested` is `null` for every weapon, because none of
them carry the `invested` trait.

The fix is to give the weapon that trait. That is what makes the system offer an Invest toggle
for it and count it against the ten-item investiture limit, which is what Investing a weapon
should cost. The module then reads the ordinary `isInvested` state, so the native toggle is the
on/off switch, and adds the two limits the rules put on this specific case: the runes apply only
while the weapon is held, and only one weapon at a time.

Add the trait by hand, or let the module do it:

```js
game.kemenorToolkit.chooseSharedWeapon();  // with the summoner's token selected
```

With exactly one invested, held weapon no bookkeeping is needed — it is simply used. The module
flag only comes into play to break a tie between several. Invested handwraps of mighty blows
always win.

## Delay

The system ships Delay as a `SimpleAction` — it posts the free action to chat and does nothing to
the initiative order. This implements the rest of it.

An hourglass appears on the active combatant in the encounter tracker. Delaying ends the turn and
takes them out of the order; their slot is passed over for the remainder of the round. A play
arrow then appears on their row, and returning drops them in immediately after whoever just acted,
permanently setting their initiative to that position. Returning never ends anyone's turn — the
combatant is slotted in behind whoever is currently acting and picks up the turn when that one
finishes, which is what "triggered by the end of any other creature's turn" describes.

There is deliberately no "pick your slot" prompt when you delay. The action reads:

> "You can return to the initiative order as a free action triggered by the end of any other
> creature's turn."

Any creature's — so there is no set of legal slots to choose between, and committing to one up
front asks for the very information you delayed in order to find out.

If the delay is never taken, it lapses on its own: when the original slot comes round again the
combatant simply takes a normal turn there, initiative unchanged, matching "If you Delay an entire
round without returning to the initiative order, the actions from the Delayed turn are lost, your
initiative doesn't change, and your next turn occurs at your original position."

Players can use the button. Only a GM may write initiative or advance an encounter, so a player's
click is forwarded to the active GM's client through a Foundry query rather than failing on
permissions; with no GM online the button reports that instead of half-completing.

Reordering rewrites `flags.pf2e.overridePriority` for every combatant sharing the resulting
initiative value, the same way the tracker's own drag-and-drop does — equal initiative alone
leaves the order down to combatant id.

```js
game.kemenorToolkit.delay(combatant);
game.kemenorToolkit.returnToInitiative(combatant);
game.kemenorToolkit.isDelayed(combatant);
```

## Lingering Composition

> "If your next action is to cast a cantrip composition with a duration of 1 round, attempt a
> Performance check. [...] Critical Success The composition lasts 4 rounds. Success The composition
> lasts 3 rounds. Failure The composition lasts 1 round, but you don't spend the Focus Point."

Casting Lingering Composition rolls Performance against the standard-difficulty DC for the
highest-level target and arms the next composition cantrip. Casting that cantrip then applies its
spell effect — read from the link in the spell's own description, so this is not specific to
Courageous Anthem — to the caster and every ally inside the emanation, for the rounds earned. On a
failure the focus point is handed back, as the spell says it should be.

Nothing to remember and no macro to click: both spells are cast normally.

Targets are resolved at the moment of casting, which is what an emanation does — it is not a
persistent aura, so it also works on gridless scenes where PF2e's aura support does not.

Effects are applied by the GM's client through a query, since a player has no permission to create
items on another player's actor.

If another module hands out the same composition effect through an aura — pf2e-automations ships
`Aura: Courageous Anthem`, which reacts to the same cast — that source is cleared, because two of
them means duplicate effects and an aura-applied copy with an unlimited duration that outlives the
spell. Detection is by behaviour rather than by name: any effect whose Aura rule grants this very
spell effect. Turn the setting off to hand the job back.

## Settings

| Setting | Default |
| --- | --- |
| Shared hit point pool | on |
| Shared hero points | on |
| Shared investiture | on |
| Link summoners automatically | on |
| Dismiss at 0 hit points | on |
| Delay button in the combat tracker | on |
| Delaying effect | on |
| Announce Delay in chat | on |
| Automate Lingering Composition | on |

## Installation

Manifest URL:

```
https://github.com/Kemenor/pf2e-kemenor-toolkit/releases/latest/download/module.json
```

Requires [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper). Conflicts with
`pf2e-eidolon-helper` — both redirect eidolon hit point updates, so enable only one.

## Credits

The rune-sharing and hit-point-redirection approaches were informed by reading
[pf2e-eidolon-helper](https://github.com/reyzor1991/pf2e-eidolon-helper) by Reyzor.
