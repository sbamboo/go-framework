# Repository format

## Requirements
- JSON Repository format for a searchable index
- Dependency Graph
- Future proof for different kinds of resources

```jsonc
{
    "format": 3,                             // V3 Formats begin at 3, as of now 3 is the only V3 format number but future changes will increase it so we might get V3 format:4 etc.
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // Required identifier
    "name": "Official MCC Repository",       // Display name    (Optional)
    "author": "MinecraftCustomClient / Axo", // Display author  (Optional)
    "version": "2.0",                        // Display version (Optional)
    "created": "2026-02-22",                 // When was this file created
    "last_updated": "2026-02-22",            // When was this file last updated

    // Partials are urls for partial json files that get merged ontop of this one, this is usefull to reduce the size of the main repo, they are mapped to keypaths, example: 
    //   "resources.modpacks": "https://example.com/repo/official_v3_modpacks.json"
    // "." is also an allowed keypath and means merge at root.
    // This helps reduce size and if a reader only wants say mods they dont have to fetch modpacks.
    "partials": {},

    // Resources are the actuall content
    //   Mods, Resourcepacks and Modpacks are classified as content while other is classified as declarative-resources/dependencies.
    "resources": {
        // Resources.Sources are technically overrides for defaults in the app to allow changing where stuff are pulled from. NOTE! Incompatabilies are not garanteed to be handled.
        //   (All fields here are optional)
        "sources": {
            "chibit_base_v1": "",
            "chibit_base_v2": "",
            "minecraft_versions": "https://piston-meta.mojang.com/mc/game/version_manifest.json",
            "fabric_versions": "https://meta.fabricmc.net/v2/versions/loader",
            "forge_versions": "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json",
            "forge_version_promos": "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
        },

        // Runtimes that other resources can depend on, ids are resolved as "jdk:17" or "jdk:*"
        //   The "builtin.java" type is a placeholder for future declarative installations.
        "runtimes": [
            {
                "id": "jdk",
                "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                "versions": {
                    "17": {
                        "created": "2026-02-22",  // When was this entry created
                        // Sources are just where this resource gets downloaded from based on platform, if a source fails and another is avaliable for valid platform those can be fallbacked on, i.e multiple sources for same platforms are allowed.
                        "sources": [
                            {
                                "type": "builtin.java",
                                "platforms": ["win"], // Short identifiers for the platforms this resource/source is for.
                                // All other fields are known by type, and not same for different types
                                "source": "https://aka.ms/download-jdk/microsoft-jdk-17.0.8.1-windows-x64.zip",
                                // Optionally a source can include a verification hash
                                "verify": {
                                    "algorithm": "crc32", // "crc32" | "sha256"
                                    "hash": "..."
                                }
                            },
                            {
                                "type": "builtin.java",
                                "platforms": ["lnx"],
                                "source": "https://aka.ms/download-jdk/microsoft-jdk-17.0.8.1-linux-x64.tar.gz"
                            },
                            {
                                "type": "builtin.java",
                                "platforms": ["mac"],
                                "source": "https://aka.ms/download-jdk/microsoft-jdk-17.0.8.1-macOS-x64.tar.gz"
                            }
                        ]
                    }
                }
            }
        ],

        // Mod loaders that other resources can depend on, :any is not the same as :*, but :* will match against :any, any just means this single resource is for "any" version while wildcard matches any amount of sources.
        //   The "builtin..." types are placeholders for future declarative installations.
        "loaders": [
            {
                "id": "fabric",
                "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                "name": "Fabric loader",
                "description": "",
                "versions": {
                    "any": {
                        "created": "2026-02-22",
                        "sources": [
                            {
                                "type": "builtin.fabric.installer",
                                "platforms": ["*"], // * matches any defined short-platform-identifier
                                "source": "https://maven.fabricmc.net/net/fabricmc/fabric-installer/0.11.2/fabric-installer-0.11.2.jar",
                                // Optionally a source can include a verification hash
                                "verify": {
                                    "algorithm": "crc32", // "crc32" | "sha256"
                                    "hash": "..."
                                }
                            }
                        ],
                        "depends": [
                            "runtimes:jdk:*"
                        ]
                    }
                }
            },

            {
                "id": "forge",
                "name": "Forge loader",
                "description": "",
                "versions": {
                    "any": {
                        "created": "2026-02-22",
                        "sources": [
                            {
                                "type": "builtin.forge.verlist",
                                "platforms": ["*"]
                            }
                        ],
                        "depends": [
                            "runtimes:jdk:*"
                        ]
                    }
                }
            }
        ],

        // Mods
        //   It's important to note that it's indented for modpacks to contain the links to mods, mods here are for self distributed mods and not indented for re-links.
        //   Officially the types supported should be "url" and "base64", however it's possible in the future modrinth/curseforge can be allowed here for linking.
        "mods": [
            {
                "id": "example",
                "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                "name": "Example mod!",
                "description": "This is a beautiful description of things",
                "author": "MinecraftCustomClient / Axo",
                "icon": "https://example.com/example.png", // Either an url, base64-URI or resourcekey (resourcekeys are named resources that are handled by reader of repo)
                "hidden": false, // Mark as hidden?
                "group": "examples", // Optional group this resource is part of, just a categorization
                // Meta contains any further metadata, good for future expansion
                "meta": {
                    "side": "client", // "client" | "server" | "both"
                    "supported": true
                },
                "library": false, // Library mod
                "versions": {
                    "example-fabric-1.21.11": {
                        "created": "2026-02-22",
                        "mcver": "1.21.11", // Uses js/npm semantic version naming
                        "sources": [
                            {
                                "type": "url",
                                "platforms": ["*"],
                                "source": "https://example.com/example_fabric.jar",
                                // Optionally a source can include a verification hash
                                "verify": {
                                    "algorithm": "crc32", // "crc32" | "sha256"
                                    "hash": "..."
                                }
                            }
                        ],
                        "depends": [
                            "loaders:fabric:*"
                        ],
                        "conflicts": [] // Known conflicts
                    },
                    "example-forge-1.21.11": {
                        "created": "2026-02-22",
                        "mcver": "1.21.11",
                        "sources": [
                            {
                                "type": "url",
                                "platforms": ["*"],
                                "source": "https://example.com/example_forge.jar"
                            }
                        ],
                        "depends": [
                            "loaders:forge:*"
                        ],
                        "conflicts": []
                    }
                }
            }
        ],

        // Resourcepacks
        //   It's important to note that it's indented for modpacks to contain the links to resourcepacks, resourcepacks here are for self distributed resourcepacks and not indented for re-links.
        //   Officially the types supported should be "url" and "base64", however it's possible in the future modrinth/curseforge can be allowed here for linking.
        "resourcepacks": [
            {
                "id": "example",
                "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                "name": "Example resourcepack!",
                "description": "This is a beautiful description of things",
                "author": "MinecraftCustomClient / Axo",
                "icon": "https://example.com/resourcepack.png", // Either an url, base64-URI or resourcekey
                "hidden": false, // Mark as hidden?
                "group": "examples", // Optional group this resource is part of, just a categorization
                // Meta contains any further metadata
                "meta": {
                    "supported": true
                },
                "versions": {
                    "example-1.21.11": {
                        "created": "2026-02-22",
                        "mcver": "1.21.11",
                        "sources": [
                            {
                                "type": "url",
                                "source": "https://example.com/example_rsp.zip",
                                // Optionally a source can include a verification hash
                                "verify": {
                                    "algorithm": "crc32", // "crc32" | "sha256"
                                    "hash": "..."
                                }
                            }
                        ],
                        "depends": [], // Resourcepacks may technically depend on mods/loaders but resourcepack dependencies are not prioritized in implementation.
                        "conflicts": []
                    }
                }
            }
        ],

        // Modpacks
        "modpacks": [
            // Modpacks exists in three versions, JSON right here in the repo, a link to a JSON file or a archive containing a listing.json file where the archive is linked with json/base64.
            // For the sake of giving examples here is a inline modpack
            {
                "type": "inline", // "inline" | "json" | "archive" | "archive.b64"
                "format": 3, // V3 Formats begin at 3, as of now 3 is the only V3 format number but future changes will increase it so we might get V3 format:4 etc.
                "id": "example-repo-inline",
                "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                "name": "Example repo inline",
                "description": "This is a beautiful description of things",
                "author": "MinecraftCustomClient / Axo",
                "icon": "https://example.com/example-repo-inline.png", // Either an url, base64-URI or resourcekey 
                "group": "examples", // Optional group this resource is part of, just a categorization
                "hidden": false, // Mark as hidden?
                // Meta contains any further metadata, good for future expansion
                "meta": {
                    "side": "client", // "client" | "server" | "both"
                    "supported": true,
                    "icon_rendering": "pixelated" // meta.icon_rendering is allowed in all places where "meta" field is sibling to "icon" field.
                },
                "versions": {
                    // Version naming does not have to include mcver since its defined inside, but its recommended to be descriptive.
                    "0.0.1-1.21.11": {
                        "created": "2026-02-22",
                        "mcver": "1.21.11",
                        // Dependencies for the modpack, technically optional as each resource has dependencies
                        "depends": [
                            "loaders:fabric:1.18.4"
                        ],
                        // Resources are the actuall main content
                        "resources": {
                            "mods": [
                                {
                                    "id": "sodium",
                                    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // optional unique identifier
                                    "optional": false,
                                    "disabled": false, // Disabled by default?
                                    "meta": {
                                        "library": false // If not aquirable from source
                                    },
                                    "sources": [
                                        {
                                            // For modrinth mods name, description, author and icon is fetched from their API, fields can be provided as fallback incase api lookup failiure, and are in that case provided in root of mod siblings to "id" field.
                                            "type": "modrinth", // "modrinth" | "curseforge" | "url" | "base64" | "repo"
                                            "platforms": ["*"], // optionally platform here too
                                            "projslug": "AANobbMI",
                                            "verslug": "59wygFUQ",
                                            // Optionally a source can include a verification hash for the actuall mod file
                                            "filename": "sodium.jar",
                                            "verify": {
                                                "algorithm": "crc32", // "crc32" | "sha256"
                                                "hash": "..."
                                            }
                                        }
                                    ],
                                    "depends": [], // Dependencies aside from the modpack wide ones
                                    "conflicts": []
                                },
                                {
                                    "id": "example",
                                    "optional": false,
                                    "disabled": false,
                                    "meta": {},
                                    "sources": [
                                        {
                                            "type": "repo",
                                            "repo": "parent", // "parent" means the repo the modpack was defined in. Else a url.
                                            "identifier": "mods:example:example-fabric-1.21.11"
                                        }
                                    ],
                                    "depends": [],
                                    "conflicts": []
                                }
                            ],
                            "resourcepacks": [
                                {
                                    "id": "example",
                                    "optional": true,
                                    "meta": {},
                                    "sources": [
                                        {
                                            "type": "repo",
                                            "repo": "parent",
                                            "identifier": "resourcepacks:example:example-1.21.11"
                                        }
                                    ],
                                    "depends": [],
                                    "conflicts": []
                                }
                            ]
                        },
                        // Optional lengths field per resource type, each field inside is optional
                        "resource_counts": {
                            "resourcepacks": 1,
                            "mods": 1
                        },
                        // Variants are optional additional content
                        "variants": {
                            "e4mc": {
                                "description": "Uses the e4mc mod to share singleplayer worlds.",
                                "selection": "singleplayer-share", // Optional, is this variant a part of a selection group?
                                // Same as outer
                                "resources": {...},
                                "resource_counts": {...},
                                "overrides": {...}
                            },
                            "essential": {
                                "description": "Uses the essential mod to share singleplayer worlds.",
                                "selection": "singleplayer-share", // Optional, is this variant a part of a selection group?
                                "resources": {...},
                                "resource_counts": {...},
                                "overrides": {...}
                            }
                        },
                        // Defines if a variant selection group is multiselect, by default each selection group is exclusive (one variant per selection group)
                        "variants_are_multiselect": {},
                        // Overrides are content that is not linked as a resource, when the modpack entry is an archive it is expected that any other files then the listing.json is override content, for clarity the modpack entry can have type "in-archive". Otherwise url/base64 is for an archive file containging overrides. 
                        "overrides": {
                            "type": "url", // "url" | "base64" | "in-archive"
                            "source": "https://example.com/example-repo-inline.zip", // For type=url this is the url, for base64 its the data and for archive this field is optional and can provide a relative path for the folder.,
                            // Optionally a verification hash can be included for url types.
                            "verify": {
                                "algorithm": "crc32", // "crc32" | "sha256"
                                "hash": "..."
                            }
                        }
                    }
                }
            }
        ],

        // Optional lengths field per resource type, each field inside is optional
        "resource_counts": {
            "sources": 6,
            "runtimes": 1,
            "loaders": 2,
            "mods": 1,
            "resourcepacks": 1,
            "modpacks": 1
        }
    }
}
```