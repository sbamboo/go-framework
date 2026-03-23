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

func mergeOverAtKeypath(data map[string]any, keypath []string, subdata any) error {
    if len(keypath) == 0 {
        return fmt.Errorf("Empty keypath")
    }

    current := data
    for i, k := range keypath[:len(keypath)-1] {
        // Handle array index
        if strings.HasPrefix(k, "[") && strings.HasSuffix(k, "]") {
            idxStr := k[1 : len(k)-1]
            idx, err := strconv.Atoi(idxStr)
            if err != nil {
                return fmt.Errorf("Invalid array index in keypath: %s", k)
            }

            arr, ok := current[keypath[i-1]].([]any)
            if !ok {
                return fmt.Errorf("Expected array at %s", keypath[i-1])
            }

            if idx >= len(arr) {
                return fmt.Errorf("Index out of range at %s", k)
            }

            // If last element, replace
            if i == len(keypath)-2 {
                arr[idx] = subdata
                return nil
            }

            // Drill down
            nested, ok := arr[idx].(map[string]any)
            if !ok {
                return fmt.Errorf("Expected object at array index %d", idx)
            }
            current = nested
            continue
        }

        // Normal key
        next, exists := current[k]
        if !exists {
            next = make(map[string]any)
            current[k] = next
        }

        nested, ok := next.(map[string]any)
        if !ok {
            return fmt.Errorf("Expected map at keypath %v", keypath[:i+1])
        }
        current = nested
    }

    // Set the final value
    lastKey := keypath[len(keypath)-1]
    current[lastKey] = subdata
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

func (m *MCCLib) GetRepo(url string) (Repo, error) {

	// Implementation to fetch and parse the repository from the given URL
	nh, err := m.fw.Net.GET(url, false, false, nil)
	if err != nil {
		return Repo{}, fmt.Errorf("Failed to fetch repository from URL: %s, error: %v", url, err)
	}

	// Get the content
	content := nh.GetNonStreamContent()
	if content == nil {
		return Repo{}, fmt.Errorf("Failed to fetch repository content from URL: %s", url)
	}

	// Unmarshal the JSON content into a map
    data, err := fromJSON([]byte(*content))
    if err != nil {
        return Repo{}, fmt.Errorf("Failed to unmarshal repository JSON: %v", err)
    }

	// Apply partials
	if partialsRaw, ok := data["partials"]; ok {
		switch partials := partialsRaw.(type) {
			case map[string]any:
				// Existing behavior: map[keypath] = value
				for kp, subdata := range partials {
					keypath := parseKeypath(kp)
					if err := mergeOverAtKeypath(data, keypath, subdata); err != nil {
						return Repo{}, fmt.Errorf("Failed to merge partial at %s: %v", kp, err)
					}
				}
			case []any:
				// Array of objects [{keypath, data}]
				for i, item := range partials {
					m, ok := item.(map[string]any)
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d is not an object", i)
					}

					kpRaw, ok := m["keypath"]
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d missing keypath", i)
					}
					kp, ok := kpRaw.(string)
					if !ok {
						return Repo{}, fmt.Errorf("Partial keypath at index %d is not a string", i)
					}

					subdata, ok := m["data"]
					if !ok {
						return Repo{}, fmt.Errorf("Partial at index %d missing data", i)
					}

					keypath := parseKeypath(kp)
					if err := mergeOverAtKeypath(data, keypath, subdata); err != nil {
						return Repo{}, fmt.Errorf("Failed to merge partial at %s: %v", kp, err)
					}
				}
			default:
				return Repo{}, fmt.Errorf("partials should be either a map or an array of objects")
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