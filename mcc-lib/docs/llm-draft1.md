# Minecraft Repository & Instance Format Specification

**Format Version: 3**\
Generated: 2026-02-22T11:35:34.388909Z

------------------------------------------------------------------------

# 🚀 Capabilities Overview

-   JSON-first repository format (fast searchable index)
-   Versioned project entries
-   Archive or pure JSON instance support
-   Resource-source abstraction (Modrinth, CurseForge, URL, Base64)
-   Full dependency graph support
-   Hard and optional dependencies
-   Hard and optional conflicts
-   Library auto-pruning
-   User-toggleable resources
-   Variant system (groups & exclusive choices)
-   Cascading enable/disable resolution
-   Overrides system (inline or archive-based)
-   Platform migration-safe (source switching between versions)
-   Future-proof for modpacks, resourcepacks, shaderpacks, worlds
-   Deterministic installation resolution

------------------------------------------------------------------------

# 1. Design Philosophy

This format is designed to behave closer to a package manager than a
simple mod list.

Core principles:

1.  Separate *resource identity* from *resource source*
2.  Keep repository index lightweight and searchable
3.  Allow per-version evolution of resource sources
4.  Model dependencies as a graph
5.  Allow full user control with deterministic resolution
6.  Separate UI grouping (variants) from logical constraints
    (dependencies)

------------------------------------------------------------------------

# 2. Repository Format (repo.json)

The repository acts as a searchable index of projects.

``` json
{
  "format": 3,
  "name": "Example Repository",
  "baseUrl": "https://example.com/repo/",
  "generated": "2026-01-01T00:00:00Z",
  "projects": [
    {
      "id": "cool-pack",
      "name": "Cool Pack",
      "author": "YourName",
      "latest": "2.1.0",
      "mcver": ["1.20.1", "1.20.4"],
      "loader": "fabric",
      "category": "adventure",
      "hidden": false,
      "supported": true,
      "logo": "https://example.com/logo.png",
      "meta": {
        "description": "An adventure-focused pack"
      }
    }
  ]
}
```

## Purpose

-   Enables search without downloading full entries
-   Allows filtering by Minecraft version, loader, category
-   Defines latest stable version
-   Keeps metadata lightweight

------------------------------------------------------------------------

# 3. Project Entry Format

Each project version is either:

-   `project-version.json`
-   `project-version.zip` (containing `instance.json` + optional
    overrides)

Both must contain:

``` json
{
  "format": 3,
  "projectId": "cool-pack",
  "version": "2.1.0",
  "revision": 1,
  "mcver": "1.20.4",
  "loader": "fabric",
  "loaderver": "0.15.11",
  "main": {},
  "variants": []
}
```

## Why

-   JSON-first allows fast inspection
-   Archive allows bundling overrides/assets
-   Revision allows metadata-only updates

------------------------------------------------------------------------

# 4. Resource System

Resources represent installable units:

-   mod
-   resourcepack
-   shaderpack
-   datapack
-   world

## Resource Structure

``` json
{
  "id": "sodium",
  "type": "mod",
  "source": "modrinth",
  "identifier": {
    "project": "AANobbMI",
    "version": "0.5.8"
  },
  "depends": ["fabric-api"],
  "dependsOptional": ["indium"],
  "conflicts": ["optifine"],
  "conflictsOptional": [],
  "provides": [],
  "library": false,
  "disabled": false,
  "side": "client"
}
```

------------------------------------------------------------------------

# 5. Resource Fields Explained

## id

Logical identifier within the pack.

## type

Defines install location behavior.

## source

Defines resolution backend: - modrinth - curseforge - url - base64

## identifier

Backend-specific resolution data.

## depends

Hard dependency. Must be enabled.

## dependsOptional

Soft dependency. Enhances functionality if present.

## conflicts

Hard incompatibility.

## conflictsOptional

Soft incompatibility (warn or auto-resolve).

## provides

Capability abstraction (future expansion).

## library

Marks as removable if unused.

## disabled

Default state only. User-toggleable.

## side

client / server / both

------------------------------------------------------------------------

# 6. Variants System

Variants define UX grouping --- not logic.

## Group Variant

``` json
{
  "id": "extra-biomes",
  "type": "group",
  "description": "Biome expansion mods",
  "resources": ["biomes-o-plenty", "terralith"]
}
```

## Exclusive Variant

``` json
{
  "id": "minimap",
  "type": "exclusive",
  "description": "Choose one minimap",
  "members": ["xaeros", "journeymap"],
  "default": "xaeros"
}
```

Variants:

-   Do not define dependencies
-   Do not override graph logic
-   Only control UI and bulk state

------------------------------------------------------------------------

# 7. Dependency Resolution Algorithm

## Step 1 -- Apply User Toggle

Enable/disable requested resource.

## Step 2 -- Enforce Hard Dependencies

For each enabled resource: - Enable all `depends`

## Step 3 -- Enforce Hard Conflicts

If conflicting resources are both enabled: - Block OR resolve based on
priority

## Step 4 -- Cascade Disable

If a resource is disabled: - Disable all resources depending on it

Repeat recursively.

## Step 5 -- Library Pruning

For each resource: If: - library == true - No enabled resource depends
on it

Then: - Auto-disable or prompt user

------------------------------------------------------------------------

# 8. Overrides System

Overrides copy files into instance directory.

## Inline

``` json
{
  "path": "config/options.txt",
  "source": "base64",
  "data": "..."
}
```

## Remote Archive

``` json
{
  "path": "/",
  "source": "url",
  "url": "https://example.com/overrides.zip",
  "extract": true
}
```

## Archive-Based Entry

If instance is zip:

    instance.json
    overrides/

Overrides are relative to JSON root.

------------------------------------------------------------------------

# 9. Why This Architecture Works

-   Decouples logical resources from distribution platform
-   Allows migration between CurseForge and Modrinth
-   Maintains reproducibility
-   Enables advanced UI configuration
-   Prevents dependency inconsistencies
-   Allows clean automatic pruning
-   Enables future pack types without format change

------------------------------------------------------------------------

# 10. Future Extensions

Possible additions:

-   Semantic version ranges
-   Capability-based dependency resolution
-   Priority-based conflict resolution
-   Pack inheritance
-   Cross-pack shared libraries

------------------------------------------------------------------------

# Conclusion

This format provides a deterministic, dependency-aware, source-agnostic
pack system that behaves closer to a real package manager than
traditional Minecraft modpack manifests.

It enables safe evolution across Minecraft versions, loader changes, and
distribution platform shifts while preserving user configurability and
install integrity.
