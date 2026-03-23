package mcclib

import (
	"fmt"
	"strconv"
	"strings"

	"encoding/json"

	libfw "github.com/sbamboo/goframework"
)

type MCCLib struct{
	fw *libfw.Framework
}
func NewMCCLib(fw *libfw.Framework) *MCCLib {
	return &MCCLib{fw: fw}
}

func parseKeypath(kp string) []string {
    var parts []string
    var buf strings.Builder
    escape := false

    for _, r := range kp {
        switch {
        case escape:
            buf.WriteRune(r)
            escape = false
        case r == '\\':
            escape = true
        case r == '.':
            parts = append(parts, buf.String())
            buf.Reset()
        default:
            buf.WriteRune(r)
        }
    }

    if buf.Len() > 0 {
        parts = append(parts, buf.String())
    }

    return parts
}

func mergeMaps(dst, src map[string]any) { // mergeMaps merges src into dst (both map[string]any)
	for k, v := range src {
		if existing, ok := dst[k]; ok {
			if ev, ok1 := existing.(map[string]any); ok1 {
				if sv, ok2 := v.(map[string]any); ok2 {
					mergeMaps(ev, sv)
					continue
				}
			}
		}
		dst[k] = v
	}
}

func mergeOverAtKeypath(data map[string]any, keypath string, subdata any) error { // mergeOverAtKeypath merges subdata at the target keypath
	keyparts := parseKeypath(keypath)
	if len(keyparts) == 0 || (len(keyparts) == 1 && (keyparts[0] == "" || keyparts[0] == ".")) {
		// Merge at the root
		if m, ok := subdata.(map[string]any); ok {
			mergeMaps(data, m)
		} else {
			return fmt.Errorf("cannot merge non-map at root")
		}
		return nil
	}

	current := data
	for i, part := range keyparts {
		isLast := i == len(keyparts)-1

		// Handle array index
		if strings.HasPrefix(part, "[") && strings.HasSuffix(part, "]") {
			idxStr := part[1 : len(part)-1]
			idx, err := strconv.Atoi(idxStr)
			if err != nil {
				return fmt.Errorf("invalid index %s", idxStr)
			}

			// Convert current into []any if needed
			arr, ok := current["_array"].([]any)
			if !ok {
				arr = []any{}
			}

			// Expand slice if needed
			for len(arr) <= idx {
				arr = append(arr, map[string]any{})
			}

			if isLast {
				if m, ok := subdata.(map[string]any); ok {
					if existing, ok := arr[idx].(map[string]any); ok {
						mergeMaps(existing, m)
					} else {
						arr[idx] = m
					}
				} else {
					arr[idx] = subdata
				}
			} else {
				// Ensure the next level is a map
				if _, ok := arr[idx].(map[string]any); !ok {
					arr[idx] = map[string]any{}
				}
				current = arr[idx].(map[string]any)
			}

			current["_array"] = arr
		} else {
			// Regular map key
			if isLast {
				if m, ok := subdata.(map[string]any); ok {
					if existing, ok := current[part].(map[string]any); ok {
						mergeMaps(existing, m)
					} else {
						current[part] = m
					}
				} else {
					current[part] = subdata
				}
			} else {
				// Traverse or create map
				if _, ok := current[part]; !ok {
					current[part] = map[string]any{}
				}
				next, ok := current[part].(map[string]any)
				if !ok {
					return fmt.Errorf("expected map at %s", part)
				}
				current = next
			}
		}
	}

	return nil
}

func fromJSON(b []byte) (map[string]any, error) {
    var data map[string]any
    if err := json.Unmarshal(b, &data); err != nil {
        return nil, err
    }
    return data, nil
}

func toJSON(data map[string]any) (string, error) {
    b, err := json.MarshalIndent(data, "", "  ")
    if err != nil {
        return "", err
    }
    return string(b), nil
}

func (m *MCCLib) fetchJson(url string) (map[string]any, error) {
	// Implementation to fetch and parse the repository from the given URL
	nh, err := m.fw.Net.GET(url, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to fetch repository from URL: %s, error: %v", url, err)
	}

	// Get the content
	content := nh.GetNonStreamContent()
	if content == nil {
		return nil, fmt.Errorf("Failed to fetch repository content from URL: %s", url)
	}

	// Unmarshal the JSON content into a map
    data, err := fromJSON([]byte(*content))
    if err != nil {
        return nil, fmt.Errorf("Failed to unmarshal repository JSON: %v", err)
    }

	return data, nil
}

func (m *MCCLib) GetRepo(url string) (Repo, error) {
	// Fetch the JSON data
	data, err := m.fetchJson(url)
	if err != nil {
		return Repo{}, err
	}

	// Apply partials
	if partialsRaw, ok := data["partials"]; ok {
		switch partials := partialsRaw.(type) {
			case map[string]any:
				// partials is a map of keypath -> url
				for kp, urlRaw := range partials {
					urlStr, ok := urlRaw.(string)
					if !ok {
						return Repo{}, fmt.Errorf("Partial URL at keypath %s is not a string", kp)
					}

					// Fetch JSON from URL
					subdata, err := m.fetchJson(urlStr)
					if err != nil {
						return Repo{}, fmt.Errorf("Failed to fetch partial from %s: %v", urlStr, err)
					}

					if err := mergeOverAtKeypath(data, kp, subdata); err != nil {
						return Repo{}, fmt.Errorf("Failed to merge partial at %s: %v", kp, err)
					}
				}

			case []any:
				// partials is an array of {keypath, url}
				for i, item := range partials {
					mItem, ok := item.(map[string]any)
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d is not an object", i)
					}

					kpRaw, ok := mItem["keypath"]
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d missing keypath", i)
					}
					kp, ok := kpRaw.(string)
					if !ok {
						return Repo{}, fmt.Errorf("Partial keypath at index %d is not a string", i)
					}

					urlRaw, ok := mItem["url"]
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d missing url", i)
					}
					urlStr, ok := urlRaw.(string)
					if !ok {
						return Repo{}, fmt.Errorf("Partial url at index %d is not a string", i)
					}

					// Fetch JSON from URL
					subdata, err := m.fetchJson(urlStr)
					if err != nil {
						return Repo{}, fmt.Errorf("Failed to fetch partial from %s: %v", urlStr, err)
					}

					if err := mergeOverAtKeypath(data, kp, subdata); err != nil {
						return Repo{}, fmt.Errorf("Failed to merge partial at %s: %v", kp, err)
					}
				}

			default:
				return Repo{}, fmt.Errorf("partials should be either a map of keypath->url or an array of objects")
			}
	}
	
	// For now log the content
	finalJSON, err := toJSON(data)
    if err != nil {
        return Repo{}, fmt.Errorf("Failed to marshal final JSON: %v", err)
    }
	m.fw.Log.Info(
    	fmt.Sprintf("Fetched repository content: %s", finalJSON),
	)

	return Repo{}, nil
}