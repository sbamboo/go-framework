package mcclib

import (
	"fmt"

	libfw "github.com/sbamboo/goframework"
)

type MCCLib struct{
	fw *libfw.Framework
}
func NewMCCLib(fw *libfw.Framework) *MCCLib {
	return &MCCLib{fw: fw}
}

func (m *MCCLib) GetRepo(url string) (Repo, error) {

	// Implementation to fetch and parse the repository from the given URL
	nh, err := m.fw.Net.GET(url, false, false, nil)
	if err != nil {
		return Repo{}, fmt.Errorf("Failed to fetch repository from URL: %s, error: %v", url, err)
	}

	content := nh.GetNonStreamContent()
	if content == nil {
		return Repo{}, fmt.Errorf("Failed to fetch repository content from URL: %s", url)
	}

	// For now log the content
	m.fw.Log.Info(
		// Sprintf
		fmt.Sprintf("Fetched repository content: %s", *content),
	)

	return Repo{}, nil
}