- It should not be
```go
type RepoResources struct {
	Sources       map[string]string // key => value
	Runtimes      []Resource
	Loaders       []Resource
	Mods          []Resource
	Resourcepacks []Resource
	Modpacks      []Resource
}
```
rather for tuneims, loaders, mods, resourcepacks, modpacks:
```go
GetAll(enum.type)
Get(enum.type, identifier)
```
etc.

- Counts should be based on `resource_counts` when possible instead of len() 
- 