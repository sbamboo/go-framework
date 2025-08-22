# GoFramework
A framework to act as the basis of my golang appliactions, handling network fetches, debugging/logging and implementing an update system.

### This is under very early development and meant for my own projects, so not recommeded to be used :P
<br><br>

# Project Notes
- Library is recommended to be imported as `fwlib`
- All common definitions are in /common which should be imported as `fwcommon`
- /common provides a `Ptr(any) &any` helper
- Inside /common is the framework-wide counter, *(Ex. used to label network events)*, accessible as `fwcommon.FrameworkIndexes`
    - `netevent` is for network events
- Inside /common is a handler for interal flags accessible at `fwcommon.FrameworkFlags`
    - `net.internal_error_log`, default `true`, Enables /net internal logging of errors *(Should be toggled when calling subparts internally and externally handling logging, to avoid double-logged errors)*
    - `update.internal_error_log`, default `true`, Enables /update internal logging of errors *(Should be toggled when calling subparts internally and externally handling logging, to avoid double-logged errors)*