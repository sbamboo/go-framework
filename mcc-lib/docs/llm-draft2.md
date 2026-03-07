# Modpack Section Specification

Below is the **fully commented schema definition** for the `modpacks`
section of the repository format.\
This section defines how modpacks are declared, versioned, and resolved
by clients.

``` jsonc
    "modpacks": [
        // Modpacks define installable Minecraft instances composed of repository resources.
        // They aggregate mods, resourcepacks, runtimes, loaders, and overrides into a single install target.
        //
        // A modpack entry itself does NOT define the pack contents directly unless the type is "inline".
        // Other types reference external manifests or archives.

        {
            // Defines how the modpack manifest is stored or distributed.
            //
            // Allowed values:
            //   inline       -> manifest stored directly inside the repository file
            //   json         -> manifest hosted as a remote JSON file
            //   archive      -> downloadable archive containing listing.json
            //   archive.b64  -> archive embedded as base64 inside repository
            "type": "inline",

            // Unique identifier for this modpack within the repository.
            // Clients reference pack versions using this ID.
            "id": "example-repo-inline",

            // Version map for this modpack.
            // Keys are arbitrary version identifiers.
            // Recommended format: <pack-version>-<minecraft-version>
            "versions": {

                // Example pack version targeting Minecraft 1.21.11
                "0.0.1-1.21.11": {

                    // Display metadata
                    "name": "Example Pack",
                    "version": "0.0.1",

                    // Target Minecraft version using semantic style version naming.
                    "mcver": "1.21.11",

                    // Hard dependencies required before the pack can install.
                    // Typically runtimes and loaders.
                    "depends": [
                        "runtimes.jdk-17",
                        "loaders.fabric-*"
                    ],

                    // Resources included in the modpack.
                    // These reference repository resources using namespace syntax.
                    "resources": {

                        // Included mods
                        "mods": [
                            "mods.example-*"
                        ],

                        // Included resourcepacks
                        "resourcepacks": [
                            "resourcepacks.example-*"
                        ]
                    },

                    // Optional resources that users may enable or disable.
                    // These do not block installation if unavailable.
                    "optional": {

                        "mods": [
                            "mods.optional-minimap-*"
                        ],

                        "resourcepacks": []
                    },

                    // Conflicting resources.
                    // If these are present they must be disabled or installation must stop.
                    "conflicts": [
                        "mods.optifine-*"
                    ],

                    // File overrides copied into the instance directory after installation.
                    // These may define configs, datapacks, worlds, etc.
                    "overrides": [
                        {
                            "type": "url",
                            "path": "config/options.txt",
                            "source": "https://example.com/options.txt"
                        }
                    ]
                }
            }
        }
    ]
```

------------------------------------------------------------------------

# Field Descriptions

## type

Defines how the modpack manifest is distributed.

Supported values:

**inline**\
The entire modpack manifest exists directly inside the repository JSON.

**json**\
The repository contains a link to an external JSON manifest.

**archive**\
The pack is distributed as an archive file containing a `listing.json`
manifest and optional overrides.

**archive.b64**\
The archive is embedded directly inside the repository using Base64
encoding.

This allows repositories to be distributed as **single self-contained
files**.

------------------------------------------------------------------------

## id

Unique identifier for the modpack.

This identifier is used by launchers and installers to reference the
pack and resolve updates.

Example:

    example-repo-inline

IDs should be:

-   lowercase
-   stable across versions
-   unique inside the repository

------------------------------------------------------------------------

## versions

A map of version identifiers to pack manifests.

Keys are arbitrary strings but should follow a recommended pattern:

    <pack-version>-<minecraft-version>

Examples:

    1.0.0-1.21.1
    2.3.4-1.20.4
    0.5.0-1.19.2

This makes version compatibility easier for clients to evaluate.

------------------------------------------------------------------------

## name

Human-readable display name of the modpack.

Used in UI listings and launcher displays.

------------------------------------------------------------------------

## version

Internal pack version number.

This is used by clients for update detection and compatibility checks.

------------------------------------------------------------------------

## mcver

Target Minecraft version for the pack.

Uses semantic version naming similar to npm or JavaScript package
ecosystems.

Example:

    1.21.11

Clients should verify compatibility against the installed loader and
runtime.

------------------------------------------------------------------------

## depends

Hard dependencies required before installing the pack.

These usually reference:

-   runtimes
-   loaders

Example:

    runtimes.jdk-17
    loaders.fabric-*

Wildcard matching allows the installer to resolve the most compatible
version.

------------------------------------------------------------------------

## resources

Defines resources included in the pack.

Resources reference entries defined elsewhere in the repository using
the namespace format:

    category.resourceId-version

Example:

    mods.sodium-*
    mods.fabric-api-*
    resourcepacks.example-*

The installer resolves the best compatible version automatically.

------------------------------------------------------------------------

## optional

Optional resources available to the user.

These resources enhance the pack but are **not required for
installation**.

Clients may present these as toggleable options during installation.

Example:

    mods.minimap-*

------------------------------------------------------------------------

## conflicts

Defines resources incompatible with the modpack.

If a conflicting resource is enabled the installer must:

-   disable the resource
-   or abort installation

Example:

    mods.optifine-*

------------------------------------------------------------------------

## overrides

Overrides copy files directly into the Minecraft instance directory
after resource installation.

Typical uses:

-   configuration files
-   datapacks
-   world templates
-   shader configuration
-   resourcepack settings

Example:

    config/options.txt

Overrides may originate from:

-   remote URLs
-   embedded Base64 data
-   archives

------------------------------------------------------------------------

# Archive Layout

When using `archive` or `archive.b64`, the archive must contain:

    listing.json
    overrides/

Example layout:

    example-pack.zip
        listing.json
        overrides/
            config/
            resourcepacks/

`listing.json` contains the modpack manifest described above.

------------------------------------------------------------------------

# Design Goals

The modpack format is designed to:

-   reuse repository resources
-   support deterministic installations
-   allow modular pack composition
-   support remote and embedded pack distribution
-   remain extensible for future resource types

Future extensions may include:

-   pack inheritance
-   variant groups
-   capability-based dependencies
-   shared libraries across packs
