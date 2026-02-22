# FRAMEWORK
- ConfigRead / LangSys modules ? In that case language would be `loc("...")` each loc call assigns new `locXXX` adress that is increment index, then .dump() returns each adress to text and can load file which remapps adresses like `loc("hello world")        loc1="hej vrälden"`; or just you know a regular lang key system to make them version-stable
- Add `custom` field input to descriptor generator to hold ex. app version data
- Add exe/args stuff from usage:stats to descriptors
- Chibit v2 (split services) support
- Add Win32API fields to platform descriptor
- after fix of debugger go back to defering .Close() in update


# MCC Project
- CLI args/params parsing with optional --fw- / -fw- args to change any field of framework setup config
- CLI color libary that determines term-color-capabilities and auto-show-color-as-supported
- CLI Sixel/Kitty detect and common display interface, falls back to colored halfblocks using the auto-show-color-as-supported library
- MCC v3 repo format & MCC v3 project format
- MCC lib with prio support for v3
- MCC TUI toolkit building on auto-show-color-as-supported library and optionally Sixel/Kitty, atleast have same menu as old mcc-installer
- MCC App
- Optionally we have `-c config.json` which can load in "unattended" and options, or we for just use a rediciulus amount of CLI params for that :P


# DEBUGGER


# DEBUGGER/FRAMEWORK
- Sometimes `db498bd`>`2a9d850` comes back, adding a time.sleep inside `report.Close()` helps... (Could it be the send queue?)


# THOUGHTS?
- SecondaryStream return instead? or option; i.e when we get request-stream we start our own and handle progress inbetween; or another fix for current way of handing progress apon ProgressReport read 


# RESEARCH / INVESTIGATE
- In Commit `0f71c34` debugger frontend calls `calculateProgress` in `populateRow`, when netevents are streams but not files, `calculateProgress` returns either 0, 3 or undefined, whilst the console.log's inside the function say it returns the correct values (a procetage of transferred/size), but in Commit `e20d8ab` we replaced `calculateProgress` by running the same code in the `populateRow` scope and then it worked?

- In Commit `de2feb8` `populateRow` and `stopNetworkRow` used `switch/case` to determine what color of progressbar to show based on `event_state`, however it always fell through to the default value even when the `event_state` was confirmed a match to the case. Switching to `if in [...] else if in [...] else` also did not work and fell through to `else` however in commit `4a09dab` switching to `if (== a || == b || == c) else if (== d || == e) else` did not fall through and worked?

- In Commit `db498bd` in net doing an update did defer `report.Close()` but report.Close did not send `net:update` `net:stop` events, trying to use `net:stop.update` did not work until we changed the wrapper of `progressor` to only send `net:update` if report.Close() did not call it (using a FrameworkFlag) and then it worked with `net:stop.update` in commit `2a9d850`