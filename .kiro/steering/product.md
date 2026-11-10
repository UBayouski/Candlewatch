# Candlewatch - Product

Candlewatch is a focus timer where a candle is the clock, ghosts are your distractions and abandoned sessions get a grave. Tagline: **Keep the candle lit.**

Hackathon: Kiroween 2026, category Costume Contest. Deadline Dec 4, 2026, 2:00 PM PT (submit Dec 3).

Source of truth for scope: `docs/BRIEF.md`. Do not edit it unless the user asks.

## The rule

**The costume is the function: every spooky element shows one piece of state.** Nothing is decoration only. Take the costume off and nothing is left to read. Any new visual element must map to a piece of state, or it does not ship.

| Element | Shows |
|---|---|
| Candle | Time left (wax height is exactly the fraction left; a drip at each quarter) |
| Flame | Session state (steady when lit, small and blue when paused, gutters in the last minute, smoke when out) |
| Room's light | Progress (the pool of light shrinks with the wax) |
| Ghosts | Distractions (one per distraction this session; size grows with time away) |
| Graveyard | Snuffed sessions (a gravestone with intent and date) |
| Shelf | Finished sessions (a candle stub, one shelf per day) |
| Dawn | Completion |

Time left is also always shown as text (`12:31`), in the page title while a session runs, and to screen readers.

## Who it is for

- People who work in timed focus sessions and lose them to one more tab.
- Anyone who finds a plain countdown easy to ignore and a guilty feeling hard to ignore.

## Core model (summary)

- Session: optional one-line intent, length in whole minutes (presets 15, 25, 50; custom 5 to 90), start time, paused spans, outcome.
- States: `idle` -> `lit` <-> `paused` -> `burned-out` (completed) or `snuffed` (abandoned). No other transitions. Total pause time is capped at 10 minutes; past that the session is snuffed.
- Distraction: while `lit`, each time the page goes hidden and comes back is one distraction, with time away. Distractions never change the timer; they only summon ghosts.
- Break: optional, skippable 5-minute break after a burned-out session ("the wax cools").
- History: every finished or snuffed session in localStorage, lossless JSON round-trip. The current session survives a reload.

## Interaction (summary)

Light (Enter), pause/resume (Space), snuff (Esc, then confirm; the dialog reads "Let it go dark?" with **Keep burning** focused). Graveyard and shelf are a second view through a door on the left. Settings: sound, ghosts on/off, default length. Everything works with the keyboard alone; focus is always visible.

## Story and tone

A lighthouse keeper's last candle. Keep it lit until the watch ends; whatever you leave unwatched comes back as a ghost. Short, dry flavour text in one strings file. No long cutscenes; the first visit shows one line of instructions, then the candle.

## Non-goals (brief section 9)

- Accounts, sync, cloud history, a task manager, to-do lists, statistics dashboards beyond the graveyard and shelf.
- Browser notifications and background push. The page title and the chime are enough.
- A native app or a browser extension. Blocking websites.
- Themes other than the one room.

## Naming

Never use the word "Pomodoro" (trademark); say "focus session". No trademarks, logos or real product names anywhere.
