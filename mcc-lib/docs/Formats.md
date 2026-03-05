# Repository format

## Requirements
- JSON Repository format for a searchable index
- Dependency Graph
- Future proof for different kinds of resources

```jsonc
{
    "format": 3,                             // V3 Formats begin at 3, as of now 3 is the only V3 format number but future changes will increase it so we might get V3 format:4 etc.
    "name": "Official MCC Repository",       // Display name    (Optional)
    "author": "MinecraftCustomClient / Axo", // Display author  (Optional)
    "version": "2.0",                        // Display version (Optional)
    "created": "2026-02-22",                 // When was this file created
    "last_updated": "2026-02-22",             // When was this file last updated

    // Resources are the actuall content
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

        // Runtimes that other resources can depend on, ids are resolved as "jdk-17" or "jdk-*"
        //   The "builtin.java" type is a placeholder for future declarative installations.
        "runtimes": [
            {
                "id": "jdk",
                "versions": {
                    "17": {
                        // Sources are just where this resource gets downloaded from based on platform, if a source fails and another is avaliable for valid platform those can be fallbacked on, i.e multiple sources for same platforms are allowed.
                        "sources": [
                            {
                                "type": "builtin.java",
                                "platforms": ["win"], // Short identifiers for the platforms this resource/source is for.
                                // All other fields are known by type, and not same for different types
                                "source": "https://aka.ms/download-jdk/microsoft-jdk-17.0.8.1-windows-x64.zip"
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

        // Mod loaders that other resources can depend on, -any is not the same as -*, but -* will match against -any, any just means this single resource is for "any" version while wildcard matches any amount of sources.
        //   The "builtin..." types are placeholders for future declarative installations.
        "loaders": [
            {
                "id": "fabric",
                "versions": {
                    "any": {
                        "sources": [
                            {
                                "type": "builtin.fabric.installer",
                                "platforms": ["*"], // * matches any defined short-platform-identifier
                                "source": "https://maven.fabricmc.net/net/fabricmc/fabric-installer/0.11.2/fabric-installer-0.11.2.jar",
                                "depends": [
                                    "runtimes.jdk-*"
                                ]
                            }
                        ]
                    }
                }
            },

            {
                "id": "forge",
                "versions": {
                    "any": {
                        "sources": [
                            {
                                "type": "builtin.forge.verlist",
                                "platforms": ["*"],
                                "depends": [
                                    "runtimes.jdk-*"
                                ]
                            }
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
                "versions": {
                    "example-fabric-1.21.11": {
                        "sources": [
                            {
                                "type": "url",
                                "platforms": ["*"],
                                "mcver": "1.21.11", // Uses js/npm semantic version naming
                                "source": "https://example.com/example_fabric.jar",
                                "depends": [
                                    "loaders.fabric-*"
                                ]
                            }
                        ]
                    },
                    "example-forge-1.21.11": {
                        "sources": [
                            {
                                "type": "url",
                                "platforms": ["*"],
                                "mcver": "1.21.11",
                                "source": "https://example.com/example_forge.jar",
                                "depends": [
                                    "minecraft-1.21.11",
                                    "loaders.forge-*"
                                ]
                            }
                        ]
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
                "versions": {
                    "example-1.21.11": {
                        "sources": [
                            {
                                "type": "url",
                                "mcver": "1.21.11",
                                "source": "https://example.com/example_fabric.jar",
                                "depends": [
                                    "loaders.fabric-*"
                                ]
                            }
                        ]
                    }
                }
            }
        ],

        // Modpacks
        "modpacks": [
            {
                
            }
        ]
    }
}
```