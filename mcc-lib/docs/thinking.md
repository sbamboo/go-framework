```md
Welcome to MinecraftCustomClient!
Select the action you would like to do:
> [Install]            Runs the installer action.
  [Uninstall]          Allowes you to uninstall clients installed by this app.
  [Open Install Loc]   Opens the default install location folder.
  [Datacopy]           Tool for copying data between modpacks. (EXPERIMENTAL)
  [Exit]

Use your keyboard to select:
↑ : Up
↓ : Down
↲ : Select (ENTER)
q : Quit
␛ : Quit (ESC)
```

```md
Welcome to MinecraftCustomClient installer!
Any clients with [NoSup] have no support offered, use on your own risk.
Select a flavor to install:
> 1.21.11_Community-Client_U3.B2.E                      {Not done :) (EssentialsMod)}
  1.21.11_Community-Client_U3.B2.C                      {Not done :) (e4mc Mod)}
  1.21.11_Community-Client-Lite_U3.B2.E                 {Lite version, not done :) (EssentialsMod)}
  1.21.11_Community-Client-Lite_U3.B2.C                 {Lite version, not done :) (e4mc Mod)}
  1.21.10_Community-Client_U3.B2.E_PR                   {Pre-Release :) (EssentialsMod) [NoSup]}
  1.20.4_Community-Client_Lite U3                       {Lite version, not done :)}
  1.20_Community-Client_Lite_Vicy                       {Lite version, not done :)}
  TrainsAndChains+ (1.19) Update2                       {A new expanded version of my TrainsAndChains modpack! (U2)}
  TrainsAndChains+ (1.19) Update1                       {A new expanded version of my TrainsAndChains modpack!}
  Super Mozzarella (Optimized By Cheddarn)              {My optimized verison of the official Super Mozzarella modpack.}
  Super Mozzarella (Optimized)                          {An optimized verison of the official Super Mozzarella modpack.}
  Super Mozzarella (Cheddar Flavour)                    {My custom edition of the official Super Mozzarella modpack.}
  Super Mozzarella (Cheddar Flavour) - ValkyrianSkies   My custom edition of the official Super Mozzarella modpack, with V...
  1.21.11_Mooare_U1.B1.E                                {A client with some more stuff. (EssentialsMod)}
  1.21.11_Mooare_U1.B1.C                                {A client with some more stuff. (e4mc Mod)}
  1.21.10_Mooare_U1.B1.E_PR                             {Pre-Release :) (EssentialsMod) [NoSup]}
  1.21.5 Mooare U1 BETA1 E                              {A client with some more stuff. (Essentials Mod)}
  1.21.5 Mooare U1 BETA1 C                              {A client with some more stuff. (e4mc Mod)}
  [Exit]

Use your keyboard to select:
↑ : Up
↓ : Down
↲ : Select (ENTER)
q : Quit
␛ : Quit (ESC)
```

```go
MCCLib.GetRepo("axow.se/mcc/v3/repos/official.json") => MCCLib.Repo as repo

res.Format => int
ires.UUID => "..."
repo.Meta => {"name", "author", "version", "created", "last_updated"}
repo.Partials => {"kp": "url"}
repo.Resources.Sources => {...}
repo.Resources.Runtimes => []MCCLib.Resource
repo.Resources.Loaders => []MCCLib.Resource
repo.Resources.Mods => []MCCLib.Resource
repo.Resources.Resourcepacks => []MCCLib.Resource
repo.Resources.Modpacks => []MCCLib.Resource
repo.GetCounts() => {"sources", "runtimes", "loaders", "mods", "resourcepacks", "modpacks"}
```

```go
MCCLib.Resource as res

res.Format => int
res.Id => "..."
ires.UUID => "..."
res.Meta => {"type", "name", "description", "author", "icon", "hidden", "group", "library"}
res.FMeta => MCCLib.FMeta
res.Versions => {"<verstr>": MCCLib.ResourceVer}
```

```go
MCCLib.ResourceVer as resv

resv.Meta => {"created", "mcver"}
resv.Sources => []MCCLib.IResourceSource
resv.Depends => []string
resv.Conflicts => []string
resv.Resources => {"mods": []MCCLib.InnerResource "resourcepacks": []MCCLib.InnerResource}
resv.Variants => {"<variantname>": MCCLib.ResVariant}
resv.Overrides => MCCLib.ResOverides
resv.GetCounts() => {"mods", "resourcepacks"}
```

```go
MCCLib.InnerResource as ires

ires.Id => "..."
ires.UUID => "..."
ires.Meta => {"optional", "disabled"}
ires.FMeta => MCCLib.FMeta
ires.Sources => []MCCLib.IResourceSource
ires.Depends => []string
ires.Conflicts => []string
```

```go
MCCLib.IResourceSource as isrc

isrc.Type => string // "builtin.java" | "builtin.fabric.installer" | "builtin.forge.verlist" | "url" | "modrinth" | "repo"

// MCCLib.GenericResourceSource : MCCLib.IResourceSource
isrc.Platforms => []Enum.PlatformIdentifier // "*" | "win" | "lnx" | "mac"
isrc.Source => "..."
isrc.Verify => MCCLib.HVerify

// .Type = "modrinth"      // MCCLib.ModrinthResourceSource : MCCLib.IResourceSource
isrc.projslug => "..."
isrc.verslug => "..."

// .Type = "repo"          // MCCLib.RepoResourceSource : MCCLib.IResourceSource
isrc.identifier => "..."
```

```go
MCCLib.ResVariant as vari

vari.Meta => {"description"}
vari.InSelection => *string // Nullable
vari.Resources => {"mods": []MCCLib.InnerResource "resourcepacks": []MCCLib.InnerResource}
vari.Overrides => MCCLib.ResOverides
vari.IsMultiselect => bool
vari.GetCounts() => {"mods", "resourcepacks"}
```

```go
MCCLib.ResOverides as rovv

rovv.Type => Enum.ResOverideType // "url" | "base64" | "in-archive"
rovv.Source => "..."
rovv.Verify => MCCLib.HVerify
```

```go
MCCLib.HVerify as hver

hver.Algorithm => Enum.HVerifyAlgo // "crc32" | "sha256"
hver.Hash => "..."
```

```go
MCCLib.FMeta
  type FMeta map[string]interface{}
```