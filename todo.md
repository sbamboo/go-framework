# FRAMEWORK
- updates can't fetch on non windows targets (app makes wrong target-key)
- add a module to goframework for calculating and verifying checksums and signatures of files and optionally content

# TESTAPP

# DEBUGGER
- After two site refresh debugger can no longer content frontend<->server (udp addrinuse?)
- Sometimes a rebuild or restart of debugger is required to get app<->debugger to connect (udp addrinuse?)

# DEBUGGER/FRAMEWORK
- Update stream never sends net:stop / net:stop.update nor ResolveAdditionalInfo
- Ctrl+C app causes a net:start towards deploy (defer?)


# RESEARCH / INVESTIGATE
- In Commit `0f71c34` debugger frontend calls `calculateProgress` in `populateRow`, when netevents are streams but not files, `calculateProgress` returns either 0, 3 or undefined, whilst the console.log's inside the function say it returns the correct values (a procetage of transferred/size), but in Commit `e20d8ab` we replaced `calculateProgress` by running the same code in the `populateRow` scope and then it worked?

- In Commit `de2feb8`