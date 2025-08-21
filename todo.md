# FRAMEWORK
- updates can't fetch on non windows targets (app makes wrong target-key)
- add a module to goframework for calculating and verifying checksums and signatures of files and optionally content
- net.Read()/.Close() does not change EventState

# TESTAPP

# DEBUGGER
- After two site refresh debugger can no longer content frontend<->server
- Sometimes a rebuild is required to get app<->debugger to connect

# DEBUGGER/FRAMEWORK
- Streams dont get finish progressbar even though they get net:stop
- Update stream never sends net:stop / net:stop.update nor ResolveAdditionalInfo
- Ctrl+C app causes a net:start towards deploy