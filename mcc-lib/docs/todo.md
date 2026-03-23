- Instead of storing 
	```go
	type RepoResources struct {
		runtimes      []Resource
		loaders       []Resource
		mods          []Resource
		resourcepacks []Resource
		modpacks      []Resource
	}
	```
	We should maybe read of JSON data 