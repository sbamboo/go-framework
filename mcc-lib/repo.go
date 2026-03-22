package mcclib

//region: Enums
type PlatformIdentifier string

const (
	PlatformAny PlatformIdentifier = "*"
	PlatformWin PlatformIdentifier = "win"
	PlatformLnx PlatformIdentifier = "lnx"
	PlatformMac PlatformIdentifier = "mac"
)

type HashAlgorithm string

const (
	HashCRC32 HashAlgorithm = "crc32"
	HashSHA256 HashAlgorithm = "sha256"
)

type ResOverrideType string
const (
	ResOverrideTypeURL ResOverrideType = "url"
	ResOverrideTypeB64 ResOverrideType = "base64"
	ResOveridesTypeInArchive ResOverrideType = "in-archive"
)
//endregion

//region: Types
type Meta map[string]interface{}
type FMeta map[string]interface{}
//endregion

//region: Repo Structs
type HVerify struct {
	Algorithm HashAlgorithm
	Hash      string
}

type IResourceSource interface{}
type GenericResourceSource struct {
	// Implements IResourceSource
	Platforms []PlatformIdentifier
	Source    string
	Verify    HVerify
}
type ModrinthResourceSource struct {
	// Implements IResourceSource
	Platforms []PlatformIdentifier
	Source    string
	Verify    HVerify
	ProjSlug  string
	VerSlug   string
}
type RepoResourceSource struct {
	// Implements IResourceSource
	Platforms  []PlatformIdentifier
	Source     string
	Verify     HVerify
	Identifier string
}

type InnerResource struct {
	Id        string
	UUID      string
	Meta      Meta
	FMeta     FMeta
	Sources   []IResourceSource
	Depends   []string
	Conflicts []string
}

type ResVariant struct {
	Meta          Meta
	InSelection   *string
	Resources     map[string][]InnerResource // "Mods" | "Resourcepacks"
	Overrides     ResOverides
	InMultiselect bool
}

func (r *ResVariant) GetCounts() map[string]any {
	return map[string]any{
		"Mods":          len(r.Resources["Mods"]),
		"Resourcepacks": len(r.Resources["Resourcepacks"]),
	}
}

type ResOverides struct {
	Type ResOverrideType
	Source string
	Verify HVerify
}

type ResourceVer struct {
	Meta      Meta
	Sources   []IResourceSource
	Depends   []string
	Conflicts []string
	Resources map[string][]InnerResource // "Mods" | "Resourcepacks"
	Variants  map[string]ResVariant
	Overrides ResOverides
}

func (r *ResourceVer) GetCounts() map[string]any {
	return map[string]any{
		"Mods":          len(r.Resources["Mods"]),
		"Resourcepacks": len(r.Resources["Resourcepacks"]),
	}
}

type Resource struct {
	Format   int
	Id       string
	UUID     string
	Meta     Meta
	FMeta    FMeta
	Versions map[string]ResourceVer
}

// TODO: Should be getters instead so non-inline data works
type RepoResources struct {
	Sources       map[string]string // key => value
	Runtimes      []Resource
	Loaders       []Resource
	Mods          []Resource
	Resourcepacks []Resource
	Modpacks      []Resource
}

func (r *RepoResources) GetCounts() map[string]any {
	return map[string]any{
		"Sources":       len(r.Sources),
		"Runtimes":      len(r.Runtimes),
		"Loaders":       len(r.Loaders),
		"Mods":          len(r.Mods),
		"Resourcepacks": len(r.Resourcepacks),
		"Modpacks":      len(r.Modpacks),
	}
}

type Repo struct {
	Format    int
	UUID      string
	Meta      map[string]any
	Partials  map[string]string // keypath => url
	Resources RepoResources
}
//endregion