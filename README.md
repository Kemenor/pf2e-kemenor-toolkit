# PF2e Kemenor Toolkit

A personal grab-bag of Pathfinder 2e automations for Foundry VTT, so a handful of wanted features
don't each cost a whole module.

Built and tested against **Foundry v14** and **PF2e 8.x**.

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

Requires [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper). Every setting is world-scoped,
so only a GM sees them.

## Summoner and eidolon

The PF2e system does not automate eidolons. In the entire system source, `eidolon` appears in code
five times: the creature trait, exclusion from the encounter tracker, kindred flanking, the
undead/construct type exceptions, and `isReallyPC`. Everything else is compendium content. A
comment in `actor/creature/document.ts` defers eidolon play to modules outright.

An eidolon is not, and cannot sensibly be, its own actor type: a module-registered subtype gets a
bare `Actor` with none of `CharacterPF2e`'s behaviour — no proficiencies, no spellcasting, no rule
elements. So an eidolon here is what the system already recognises: a `character` actor carrying
the `eidolon` trait.

### Linking

Links are found automatically on world load: an unlinked summoner and exactly one eidolon-trait
character sharing a player owner are paired without a macro or a targeting step.

Ownership is the matching signal deliberately. In a party with two summoners, pairing on names or
traits would cheerfully bond the wrong eidolon to the wrong summoner and then share the wrong hit
points. Where there is no shared player owner, or more than one candidate, the module declines to
guess and you link by hand. Auto-linking never overrides a link you set yourself.

### Shared hit points

> "The connection between you and your eidolon means you both share a single pool of Hit Points.
> Damage taken by either you or the eidolon reduces your Hit Points, while healing either of you
> recovers your Hit Points."

The summoner's stored hit points are the single source of truth. The eidolon stores none: its
`system.attributes.hp` is a live view onto the summoner's, and writes aimed at the eidolon are
redirected. Redirection happens on the client that initiated the update, so a player rolling damage
does not wait on a GM round trip.

Dying, wounded and drained act on the shared pool and are moved to the summoner, taking the greater
value if the summoner already has the condition — matching "you apply those effects only once
(applying the greater effect, if applicable)".

### Manifest and dismiss

Dismissal removes the eidolon's tokens from the current scene only. A world that has been running a
while accumulates the same actor's tokens across every scene it ever visited, and dismissing should
not erase those. Pass `{ allScenes: true }` to sweep a stale token everywhere. With **Dismiss at 0
hit points** on, reaching 0 in the shared pool dismisses automatically, on the scene the summoner is
standing on.

### Shared investiture

> "Your eidolon gains item bonuses to Perception and skills from any magical items that you have
> invested. Your eidolon increases its item bonus to AC based on your armor's armor potency rune or
> bracers of armor. It also gains an item bonus to its saves from the resilient rune on your armor
> or from your bands of force. [...] Your eidolon's Strikes benefit from the fundamental and
> property runes on your handwraps of mighty blows."

All four are applied, and all four show on the eidolon's sheet rather than appearing only at roll
time. Both *bracers of armor* and its remaster name *bands of force* are recognised.

Note the word **increases** in the AC clause. An eidolon already has an item bonus to AC from its
key attribute — "+2 item bonus to AC with a +3 Dexterity cap" for Strength, "+1 item bonus to AC
with a +4 Dexterity cap" for Dexterity. The summoner's armor potency stacks on top of that rather
than competing with it. Since item bonuses otherwise do not stack, the module expresses the total as
one combined item bonus that supersedes the eidolon's own: a Strength-key eidolon whose summoner
wears +1 armor ends up at +3, not +2.

Saves work the other way round — the eidolon has no base item bonus there, so the resilient rune
simply *grants* one.

#### Sharing weapon runes

> "Your eidolon's Strikes benefit from the fundamental and property runes on your handwraps of
> mighty blows. Alternatively, you can Invest a magic weapon (even though magic weapons can't
> normally be Invested) to share its fundamental and property runes with your eidolon. You share
> these benefits only while you're holding the weapon, and you can have no more than one weapon
> invested in this way at a time."

The system has no invested weapons at all: `isInvested` is `null` for every weapon, because none
carry the `invested` trait. The fix is to give the weapon that trait, which makes the system offer
an Invest toggle and count it against the ten-item investiture limit — the cost Investing a weapon
should carry. The module then reads ordinary invested state, so the native toggle is the on/off
switch, and adds the two limits specific to this case: the weapon must be held, and only one at a
time.

Add the trait by hand, or let the module do it:

```js
game.kemenorToolkit.chooseSharedWeapon(); // with the summoner's token selected
```

With exactly one invested, held weapon no bookkeeping is needed — it is simply used. The module flag
only breaks a tie between several. Invested handwraps of mighty blows always win.

Rune injection happens *before* the wrapped `WeaponPF2e#prepareBaseData` call, because the system
turns striking into damage dice and potency into `flags.pf2e.attackItemBonus` inside that same
method; writing them afterwards would change the sheet without changing what is rolled.

The eidolon is re-derived whenever a physical item on its summoner changes, so swapping the shared
weapon, investing, divesting or etching a rune takes effect immediately.

## Delay

The system ships Delay as a `SimpleAction`: it posts the free action to chat and does nothing to the
initiative order. This implements the rest.

An hourglass appears on the active combatant in the encounter tracker. Delaying ends the turn and
takes them out of the order; their slot is passed over for the remainder of the round. A play arrow
then appears on their row, and returning drops them in immediately after whoever just acted,
permanently setting their initiative to that position.

Returning never ends anyone's turn — the combatant is slotted in behind whoever is currently acting
and picks up the turn when that one finishes, which is what "triggered by the end of any other
creature's turn" describes.

There is deliberately no "pick your slot" prompt when you delay. The action reads:

> "You can return to the initiative order as a free action triggered by the end of any other
> creature's turn."

Any creature's — so there is no set of legal slots to choose between, and committing to one up front
asks for the very information you delayed in order to find out.

If the delay is never taken it lapses on its own: when the original slot comes round again the
combatant takes a normal turn there, initiative unchanged, matching "If you Delay an entire round
without returning to the initiative order, the actions from the Delayed turn are lost, your
initiative doesn't change, and your next turn occurs at your original position."

Players can use the button. Only a GM may write initiative or advance an encounter, so a player's
click is forwarded to the active GM's client through a Foundry query rather than failing on
permissions; with no GM online the button says so instead of half-completing.

Reordering rewrites `flags.pf2e.overridePriority` for every combatant sharing the resulting
initiative value, the same way the tracker's own drag-and-drop does — equal initiative alone leaves
the order down to combatant id.

## Lingering Composition

> "If your next action is to cast a cantrip composition with a duration of 1 round, attempt a
> Performance check. The DC is usually a standard-difficulty DC of a level equal to the
> highest-level target of your composition [...] Critical Success The composition lasts 4 rounds.
> Success The composition lasts 3 rounds. Failure The composition lasts 1 round, but you don't spend
> the Focus Point for casting this spell."

Casting Lingering Composition rolls Performance against the standard DC for the highest-level target
and arms the next composition cantrip. Casting that cantrip then applies its spell effect to the
caster and every ally inside the emanation, for the rounds earned. On a failure the focus point is
handed back, as the spell says it should be.

Nothing to remember and no macro to click: both spells are cast normally.

The effect is read from the link in the spell's own description rather than hardcoded, so any
composition cantrip works, not just Courageous Anthem. To use a custom effect, make it the first
spell-effects link in that spell's description.

Targets are resolved at the moment of casting, which is what an emanation does — it is not a
persistent aura, so this also works on gridless scenes where PF2e's aura support is inert.

Effects are applied by the GM's client through a query, since a player has no permission to create
items on another player's actor.

If another module hands out the same composition effect through an aura — `pf2e-automations` ships
`Aura: Courageous Anthem`, which reacts to the same cast — that source is cleared, because two of
them means duplicate effects and an aura-applied copy with an unlimited duration that outlives the
spell. Detection is by behaviour rather than by name: any effect whose Aura rule grants this very
spell effect.

## Settings

All settings are world-scoped and default to on.

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

Settings marked *reload* change wrapper registration or data preparation and only take effect on a
fresh load; Foundry prompts for the reload.

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

**Conflicts with `pf2e-eidolon-helper`.** Both redirect eidolon hit point updates, so enable only
one. The module warns on load if it finds the other active.

**Auras need a square grid.** PF2e gates aura application on `grid.type === SQUARE`, and
`TokenAura#containsToken` returns false on gridless maps regardless of distance. This is a system
limitation, not something this module changes — but note that Lingering Composition resolves targets
at cast time and so is unaffected.

## Credits

The rune-sharing and hit-point-redirection approaches were informed by reading
[pf2e-eidolon-helper](https://github.com/reyzor1991/pf2e-eidolon-helper) by Reyzor. The initiative
reordering follows the system's own encounter-tracker drag-and-drop logic.

MIT licensed.
