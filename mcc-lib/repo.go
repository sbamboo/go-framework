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

type RepoResourceType string
const (
	RepoResTypeRuntimes RepoResourceType = "Runtimes"
	RepoResTypeLoaders RepoResourceType = "Loaders"
	RepoResTypeMods RepoResourceType = "Mods"
	RepoResTypeResourcepacks RepoResourceType = "Resourcepacks"
	RepoResTypeModpacks RepoResourceType = "Modpacks"
)
//endregion

//region: Types
type Meta map[string]interface{}
type FMeta map[string]interface{}
//endregion

//region: Helper methods
func getCount(counts map[string]int, key string, fallback int) int {
	if counts != nil {
		if v, ok := counts[key]; ok {
			return v
		}
	}
	return fallback
}
//endregion

//region: Repo Structs
type ResourceIdentifier struct {
	Id string
	UUID string
}

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
	counts map[string]int
}

func (r *ResVariant) GetCounts() map[string]any {
	return map[string]any{
		"Mods":          getCount(r.counts, "Mods", len(r.Resources["Mods"])),
		"Resourcepacks": getCount(r.counts, "Resourcepacks", len(r.Resources["Resourcepacks"])),
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
	counts map[string]int
}

func (r *ResourceVer) GetCounts() map[string]any {
	return map[string]any{
		"Mods":          getCount(r.counts, "Mods", len(r.Resources["Mods"])),
		"Resourcepacks": getCount(r.counts, "Resourcepacks", len(r.Resources["Resourcepacks"])),
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

type RepoResources struct {
	Sources       map[string]string // key => value
	runtimes      []Resource
	loaders       []Resource
	mods          []Resource
	resourcepacks []Resource
	modpacks      []Resource
	counts map[string]int
}

func (r *RepoResources) GetCounts() map[string]any {
	return map[string]any{
		"Sources":       getCount(r.counts, "Sources", len(r.Sources)),
		"Runtimes":      getCount(r.counts, "Runtimes", len(r.runtimes)),
		"Loaders":       getCount(r.counts, "Loaders", len(r.loaders)),
		"Mods":          getCount(r.counts, "Mods", len(r.mods)),
		"Resourcepacks": getCount(r.counts, "Resourcepacks", len(r.resourcepacks)),
		"Modpacks":      getCount(r.counts, "Modpacks", len(r.modpacks)),
	}
}

func (r *RepoResources) GetAll(t RepoResourceType) []Resource {
	switch t {
	case RepoResTypeRuntimes:
		return r.runtimes
	case RepoResTypeLoaders:
		return r.loaders
	case RepoResTypeMods:
		return r.mods
	case RepoResTypeResourcepacks:
		return r.resourcepacks
	case RepoResTypeModpacks:
		return r.modpacks
	default:
		return nil
	}
}

func (r *RepoResources) List(t RepoResourceType) []ResourceIdentifier {
	src := r.GetAll(t)

	res := make([]ResourceIdentifier, len(src))
	for i, v := range src {
		res[i] = ResourceIdentifier{
			Id:   v.Id,
			UUID: v.UUID,
		}
	}
	return res
}

func (r *RepoResources) Get(t RepoResourceType, id ResourceIdentifier) *Resource {
	src := r.GetAll(t)

	for i := range src {
		if src[i].Id == id.Id || src[i].UUID == id.UUID {
			return &src[i]
		}
	}
	return nil
}

type Repo struct {
	Format    int
	UUID      string
	Meta      map[string]any
	Partials  map[string]string // keypath => url
	Resources RepoResources
}
//endregion