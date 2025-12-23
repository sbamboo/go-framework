# FRAMEWORK
- Send `usage:stats` regularly
- Handling around services like gdrive,dropbox,sprend
- include old platform features: simplified debug descriptor, add .Terminal, should sixel be libsixel?, add console and cli with formatting and escape codes, auto escape-code to windows legacy etc...
- after fix of debugger go back to defering .Close() in update


# TESTAPP


# DEBUGGER
- After two site refresh debugger can no longer content frontend<->server (udp addrinuse?)
- Sometimes a rebuild or restart of debugger is required to get app<->debugger to connect (udp addrinuse?)
- Status bar should have the avrg. delay calculated based on `sent` as well as delay with debugger-server, maybe if we are connected to the app or the server etc.


# DEBUGGER/FRAMEWORK
- Sometimes `db498bd`>`2a9d850` comes back, adding a time.sleep inside `report.Close()` helps... (Could it be the send queue?)


# THOUGHTS?
- SecondaryStream return instead? or option; i.e when we get request-stream we start our own and handle progress inbetween; or another fix for current way of handing progress apon ProgressReport read 


# RESEARCH / INVESTIGATE
- In Commit `0f71c34` debugger frontend calls `calculateProgress` in `populateRow`, when netevents are streams but not files, `calculateProgress` returns either 0, 3 or undefined, whilst the console.log's inside the function say it returns the correct values (a procetage of transferred/size), but in Commit `e20d8ab` we replaced `calculateProgress` by running the same code in the `populateRow` scope and then it worked?

- In Commit `de2feb8` `populateRow` and `stopNetworkRow` used `switch/case` to determine what color of progressbar to show based on `event_state`, however it always fell through to the default value even when the `event_state` was confirmed a match to the case. Switching to `if in [...] else if in [...] else` also did not work and fell through to `else` however in commit `4a09dab` switching to `if (== a || == b || == c) else if (== d || == e) else` did not fall through and worked?

- In Commit `db498bd` in net doing an update did defer `report.Close()` but report.Close did not send `net:update` `net:stop` events, trying to use `net:stop.update` did not work until we changed the wrapper of `progressor` to only send `net:update` if report.Close() did not call it (using a FrameworkFlag) and then it worked with `net:stop.update` in commit `2a9d850`