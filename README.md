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
character sharing a player owner are paired without a macro or a targeting step. Links made by
`pf2e-eidolon-helper` are adopted on first load, so nothing needs re-linking.

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

Dismissal clears the eidolon's tokens on every scene, not just the current one. With
**Dismiss at 0 hit points** on, reaching 0 in the shared pool dismisses automatically.

### Shared investiture

> "Your eidolon gains item bonuses to Perception and skills from any magical items that you
> have invested. Your eidolon increases its item bonus to AC based on your armor's armor
> potency rune or bracers of armor. It also gains an item bonus to its saves from the resilient
> rune on your armor or from your bracers of armor. [...] Your eidolon's Strikes benefit from
> the fundamental and property runes on your handwraps of mighty blows."

All four are applied, and all four show up on the eidolon's sheet rather than appearing only at
roll time.

For the alternative path — "you can Invest a magic weapon (even though magic weapons can't
normally be Invested) to share its fundamental and property runes with your eidolon" — note
that the system has no notion of an invested weapon (`isInvested` is `null` for every weapon),
so this module tracks the choice itself:

```js
game.kemenorToolkit.chooseSharedWeapon();  // with the summoner's token selected
```

One weapon at a time, and the runes only apply while it is actually held. Invested handwraps
of mighty blows always win over a shared weapon.

## Settings

| Setting | Default |
| --- | --- |
| Shared hit point pool | on |
| Shared hero points | on |
| Shared investiture | on |
| Link summoners automatically | on |
| Dismiss at 0 hit points | on |

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
