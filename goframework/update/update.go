package goframework_update

import (
	"crypto"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/inconshreveable/go-update"
	"gopkg.in/yaml.v3"

	fwcommon "github.com/sbamboo/goframework/common"
)

// GithubUpdateFetcher encapsulates the logic for fetching and processing Github Releases
// Implements: fwcommon.GithubUpdateFetcherInterface
type GithubUpdateFetcher struct {
	Owner   string
	Repo    string
	fetcher fwcommon.FetcherInterface
}

// NewGithubUpdateFetcher creates a new instance of GithubUpdateFetcher.
func NewGithubUpdateFetcher(owner, repo string, fetcher fwcommon.FetcherInterface) *GithubUpdateFetcher {
	return &GithubUpdateFetcher{
		Owner:   owner,
		Repo:    repo,
		fetcher: fetcher,
	}
}

// FetchUpMetaReleases fetches releases from GitHub, parses their bodies
// for UpMeta, and attaches asset URLs, returning processed release data.
func (ghup *GithubUpdateFetcher) FetchUpMetaReleases() ([]fwcommon.UpdateReleaseData, error) {
	releases, err := ghup.fetchReleases()
	if err != nil {
		return nil, fmt.Errorf("error fetching releases: %w", err)
	}

	var results []fwcommon.UpdateReleaseData

	for _, rel := range releases {
		notes, upmeta, err := ghup.parseReleaseBodyForUpMeta(rel.Body)
		if err != nil {
			fmt.Printf("ERROR parsing release body for tag %s: %v\n", rel.TagName, err)
			continue
		}

		obj := fwcommon.UpdateReleaseData{
			Tag:      rel.TagName,
			Notes:    notes,
			Released: rel.Released,
		}

		if upmeta != nil {
			// Attach URLs from GitHub assets
			for key, source := range upmeta.Sources {
				if url := ghup.findAssetURL(rel.Assets, source.Filename); url != nil {
					source.URL = *url
				}

				if source.PatchAsset != nil {
					if patchURL := ghup.findAssetURL(rel.Assets, *source.PatchAsset); patchURL != nil {
						source.PatchURL = patchURL
					}
				} else {
					source.PatchURL = nil // Ensure nil if patch_asset is not specified
				}

				upmeta.Sources[key] = source // Update the map entry
			}
			obj.UpMeta = upmeta
		}

		results = append(results, obj)
	}
	return results, nil
}

// FetchAssetReleases fetches releases from GitHub, parses their tags and assets for metadata.
func (ghup *GithubUpdateFetcher) FetchAssetReleases() ([]fwcommon.UpdateReleaseData, error) {
	releases, err := ghup.fetchReleases()
	if err != nil {
		return nil, fmt.Errorf("error fetching releases: %w", err)
	}

	var results []fwcommon.UpdateReleaseData

	for _, rel := range releases {
		var upmeta *fwcommon.UpdateUpMeta
		var parseErr error

		// Only attempt to parse upmeta from tag if it's a "ci-" prefixed tag
		if strings.HasPrefix(rel.TagName, "ci-") {
			upmeta, parseErr = ghup.parseAssetReleaseForMeta(rel.TagName)
			if parseErr != nil {
				fmt.Printf("ERROR parsing tag %s: %v\n", rel.TagName, parseErr)
				// Continue processing the release even if tag parsing fails, just won't have upmeta
				upmeta = nil
			}
		}

		notes := strings.TrimSpace(strings.SplitN(rel.Body, "<details>", 2)[0])

		obj := fwcommon.UpdateReleaseData{
			Tag:      rel.TagName,
			Notes:    notes,
			Released: rel.Released,
		}

		if upmeta != nil {
			upmeta.Sources = make(map[string]fwcommon.UpdateSourceInfo) // Initialize sources map

			assetMap := make(map[string]fwcommon.GithubAsset)
			for _, asset := range rel.Assets {
				assetMap[asset.Name] = asset
			}

			// Process main executable assets
			for _, asset := range rel.Assets {
				// Skip signature and patch files when iterating for main assets
				if strings.HasSuffix(asset.Name, ".sig") || strings.Contains(asset.Name, ".patch") {
					continue
				}

				// Derive the source key (platform-arch)
				sourceKey := extractPlatformArch(asset.Name)
				if sourceKey == "" {
					fmt.Printf("WARNING: Could not determine platform-arch for asset '%s'. Skipping.\n", asset.Name)
					continue
				}

				source := fwcommon.UpdateSourceInfo{
					URL:      asset.BrowserDownloadURL,
					Filename: asset.Name,
					// Initialize patch fields to null/default
					IsPatch:        false,
					PatchFor:       nil,
					PatchChecksum:  nil,
					PatchSignature: nil,
					PatchURL:       nil,
					Signature:      nil, // Initialize signature to nil
				}

				// Extract checksum from digest
				if digestParts := strings.SplitN(asset.Digest, ":", 2); len(digestParts) == 2 && digestParts[0] == "sha256" {
					source.Checksum = digestParts[1]
				} else {
					fmt.Printf("WARNING: Unexpected digest format for asset %s: %s\n", asset.Name, asset.Digest)
					source.Checksum = ""
				}

				// Fetch signature content
				sigAssetName := asset.Name + ".sig"
				if sigAsset, ok := assetMap[sigAssetName]; ok {
					sigContent, err := ghup.fetchBinaryFileContent(sigAsset.BrowserDownloadURL)
					if err != nil {
						fmt.Printf("ERROR fetching signature for %s: %v\n", asset.Name, err)
						source.Signature = nil
						source.SignatureBytes = nil
					} else {
						source.Signature = nil
						source.SignatureBytes = sigContent
					}
				}

				// Check for associated patch file
				filenameNoExt := strings.TrimSuffix(asset.Name, getFileExtension(asset.Name))
				patchRegex := regexp.MustCompile(
					`^` + regexp.QuoteMeta(filenameNoExt) + `_(\d+)t(\d+)\.patch$`,
				)

				for _, patchAssetCandidate := range rel.Assets {
					if strings.HasSuffix(patchAssetCandidate.Name, ".patch") {
						matches := patchRegex.FindStringSubmatch(patchAssetCandidate.Name)
						if len(matches) == 3 {
							source.IsPatch = true
							source.PatchURL = &patchAssetCandidate.BrowserDownloadURL

							if digestParts := strings.SplitN(
								patchAssetCandidate.Digest,
								":",
								2,
							); len(digestParts) == 2 && digestParts[0] == "sha256" {
								patchChecksum := digestParts[1]
								source.PatchChecksum = &patchChecksum
							}

							// Fetch patch signature content
							patchSigAssetName := patchAssetCandidate.Name + ".sig"
							if patchSigAsset, ok := assetMap[patchSigAssetName]; ok {
								patchSigContent, err := ghup.fetchBinaryFileContent(patchSigAsset.BrowserDownloadURL)
								if err != nil {
									fmt.Printf("ERROR fetching patch signature for %s: %v\n", patchAssetCandidate.Name, err)
									source.PatchSignature = nil
									source.PatchSignatureBytes = nil
								} else {
									source.PatchSignature = nil
									source.PatchSignatureBytes = patchSigContent
								}
							}

							if patchForUind, err := strconv.Atoi(matches[1]); err == nil {
								source.PatchFor = &patchForUind
							}
							// A patch asset should also specify its original target filename,
							// but for this asset-based approach, it's tied to the main asset.
							// The PatchAsset field would be used here if it were available in the patch metadata.
							patchAssetFilename := patchAssetCandidate.Name
							source.PatchAsset = &patchAssetFilename // Store the actual patch asset name found
							break
						}
					}
				}
				upmeta.Sources[sourceKey] = source
			}
			obj.UpMeta = upmeta
		}
		results = append(results, obj)
	}
	return results, nil
}

func (ghup *GithubUpdateFetcher) parseAssetReleaseForMeta(tagName string) (*fwcommon.UpdateUpMeta, error) {

	strippedTag := tagName[len("ci-"):] // Remove "ci-" prefix

	// Split from the right to easily get semver and uind
	// Example: "git.commit-5-0.0.0" -> ["git.commit-5", "0.0.0"]
	parts := strings.Split(strippedTag, "-")

	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid tag format for '%s': expected at least 3 parts after 'ci-' (channel-uind-semver)", tagName)
	}

	semver := parts[len(parts)-1]
	uindStr := parts[len(parts)-2]

	channelParts := parts[:len(parts)-2] // All parts before uind and semver
	channel := strings.Join(channelParts, "-")

	uind, err := strconv.Atoi(uindStr)
	if err != nil {
		// This error should ideally not happen if the regex correctly captured digits
		return nil, fmt.Errorf("invalid uind '%s' in tag '%s': %w", uindStr, tagName, err)
	}

	return &fwcommon.UpdateUpMeta{
		UpMetaVer: "unknown", // Statically set as per requirement
		Format:    1,         // Example format version
		Uind:      uind,
		Semver:    semver,
		Channel:   channel,
		Sources:   make(map[string]fwcommon.UpdateSourceInfo), // Initialize the map
	}, nil
}

// fetchReleases fetches raw GithubReleaseAssets data from the GitHub API for the
// configured owner and repository.
func (ghup *GithubUpdateFetcher) fetchReleases() ([]fwcommon.GithubReleaseAssets, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases", ghup.Owner, ghup.Repo)
	fmt.Println("Fetching releases from:", url)

	fwcommon.FrameworkFlags.Disable("net.internal_error_log") // Disable net's debugging since we handle it
	report, err := ghup.fetcher.GET(url, false, false, nil)
	fwcommon.FrameworkFlags.Enable("net.internal_error_log") // Re-enable net's debugging
	if err != nil {
		return nil, fmt.Errorf("fetcher.GET failed for %s: %w", url, err)
	}

	if report.GetResponse().StatusCode != http.StatusOK {
		content := "No body"
		if report.GetNonStreamContent() != nil {
			content = *report.GetNonStreamContent()
		}
		return nil, fmt.Errorf("HTTP status %d: %s", report.GetResponse().StatusCode, content)
	}

	var releases []fwcommon.GithubReleaseAssets
	err = json.Unmarshal([]byte(*report.GetNonStreamContent()), &releases)
	if err != nil {
		return nil, fmt.Errorf("json.Unmarshal failed: %w", err)
	}
	return releases, nil
}

// fetchFileContent fetches the content of a file from a given URL.
func (ghup *GithubUpdateFetcher) fetchFileContent(url string) (string, error) {
	fwcommon.FrameworkFlags.Disable("net.internal_error_log") // Disable net's debugging since we handle it
	report, err := ghup.fetcher.GET(url, false, false, nil)
	fwcommon.FrameworkFlags.Enable("net.internal_error_log") // Re-enable net's debugging
	if err != nil {
		return "", fmt.Errorf("failed to fetch content from %s: %w", url, err)
	}

	if report.GetResponse().StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP status %d fetching %s", report.GetResponse().StatusCode, url)
	}

	if report.GetNonStreamContent() == nil {
		return "", fmt.Errorf("received empty content for %s", url)
	}

	return *report.GetNonStreamContent(), nil
}

// fetchBinaryFileContent fetches the content of a file from a given URL as bytes.
func (ghup *GithubUpdateFetcher) fetchBinaryFileContent(url string) ([]byte, error) {
	fwcommon.FrameworkFlags.Disable("net.internal_error_log")      // Disable net's debugging since we handle it
	report, err := ghup.fetcher.GET(url, true, false, nil)         // Stream the body
	defer fwcommon.FrameworkFlags.Enable("net.internal_error_log") // Re-enable net's debugging

	if err != nil {
		return nil, fmt.Errorf("failed to fetch content from %s: %w", url, err)
	}

	if report.GetResponse().StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d fetching %s", report.GetResponse().StatusCode, url)
	}

	// report works as an io.Reader, so we can read the content directly
	content, err := io.ReadAll(report)
	if err != nil {
		return nil, fmt.Errorf("failed to read content from %s: %w", url, err)
	}
	defer report.Close()

	return content, nil
}

// parseReleaseBodyForUpMeta extracts release notes and an optional UpMeta struct
// from a GitHub release body string.
func (ghup *GithubUpdateFetcher) parseReleaseBodyForUpMeta(body string) (string, *fwcommon.UpdateUpMeta, error) {
	// Extract the notes: everything before the first <details> tag
	notes := strings.TrimSpace(strings.SplitN(body, "<details>", 2)[0])

	// Match all ```yaml ... blocks
	codeBlockRe := regexp.MustCompile("(?s)```yaml\\s*\n(.*?)```")
	matches := codeBlockRe.FindAllStringSubmatch(body, -1)

	if len(matches) == 0 { // len() for nil slices is defined as zero
		return notes, nil, nil
	}

	for _, match := range matches {
		yamlContent := strings.TrimSpace(match[1])

		if strings.Contains(yamlContent, "__upmeta__") {
			var upmeta fwcommon.UpdateUpMeta
			err := yaml.Unmarshal([]byte(yamlContent), &upmeta)
			if err != nil {
				return notes, nil, fmt.Errorf("failed to parse UpMeta YAML: %w", err)
			}
			return notes, &upmeta, nil
		}
	}

	return notes, nil, nil
}

// findAssetURL finds the browser download URL for an asset by its name
// within a list of GithubAsset.
func (ghup *GithubUpdateFetcher) findAssetURL(assets []fwcommon.GithubAsset, name string) *string {
	for _, asset := range assets {
		if asset.Name == name {
			return &asset.BrowserDownloadURL
		}
	}
	return nil
}

// getFileExtension extracts the file extension from a filename.
func getFileExtension(filename string) string {
	dotIndex := strings.LastIndex(filename, ".")
	if dotIndex == -1 || dotIndex == len(filename)-1 {
		return ""
	}
	return filename[dotIndex:]
}

// reverseString reverses a string.
func reverseString(s string) string {
	runes := []rune(s)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}

// extractPlatformArch parses a filename to extract the "<platform>-<arch>" part.
func extractPlatformArch(filename string) string {
	filenameNoExt := strings.TrimSuffix(filename, getFileExtension(filename))

	reversedFilename := reverseString(filenameNoExt)

	// We are looking for the pattern "arch-platform" in the reversed string.
	// We need to find the first '-' or '_' after the architecture.
	// Then the next '-' or '_' after the platform.
	var parts []string
	currentPart := ""
	delimiterCount := 0

	for _, r := range reversedFilename {
		if r == '-' || r == '_' {
			if currentPart != "" {
				parts = append(parts, currentPart)
				currentPart = ""
				delimiterCount++
				if delimiterCount == 2 {
					break // Found two delimiters, so we have the arch and platform parts
				}
			}
		} else {
			currentPart += string(r)
		}
	}
	if currentPart != "" { // Add the last part if string ends without a delimiter
		parts = append(parts, currentPart)
	}

	// We need at least two parts for "arch" and "platform"
	if len(parts) >= 2 {
		arch := reverseString(parts[0])     // First part found in reversed string is the architecture
		platform := reverseString(parts[1]) // Second part found is the platform

		// Reconstruct as "platform-arch"
		return fmt.Sprintf("%s-%s", platform, arch)
	}

	return "" // Could not parse platform-arch
}

// --- Main NetUpdater structures and methods ---

// NetUpReleaseInfo contains details about a specific software release.
type NetUpReleaseInfo struct {
	UIND     int                                  `json:"uind"`
	Semver   string                               `json:"semver"`
	Released string                               `json:"released"`
	Notes    string                               `json:"notes"`
	Sources  map[string]fwcommon.UpdateSourceInfo `json:"sources"` // Map for platform-specific URLs
}

// NetUpDeployFile represents the structure of the deploy.json file.
type NetUpDeployFile struct {
	Format   int                           `json:"format"`
	Channels map[string][]NetUpReleaseInfo `json:"channels"`
}

// NetUpdater provides methods for checking and applying updates from a remote source.
type NetUpdater struct {
	config  *fwcommon.FrameworkConfig
	fetcher fwcommon.FetcherInterface
	log     fwcommon.LoggerInterface
}

// NewNetUpdater creates and initializes a new NetUpdater instance.
func NewNetUpdater(config *fwcommon.FrameworkConfig, fetcherPtr fwcommon.FetcherInterface, logPtr fwcommon.LoggerInterface) *NetUpdater {
	nu := &NetUpdater{
		config:  config,
		fetcher: fetcherPtr,
		log:     logPtr,
	}

	if config.UpdatorAppConfiguration.GithubUpMetaRepo != nil && strings.Contains(*config.UpdatorAppConfiguration.GithubUpMetaRepo, "/") {
		parts := strings.SplitN(*config.UpdatorAppConfiguration.GithubUpMetaRepo, "/", 2)
		if len(parts) == 2 {
			// Pass the fetcher to NewGithubUpdateFetcher
			nu.config.UpdatorAppConfiguration.GhMetaFetcher = NewGithubUpdateFetcher(parts[0], parts[1], nu.fetcher)
		}
	}

	return nu
}

func (nu *NetUpdater) logThroughError(err error) error {
	if fwcommon.FrameworkFlags.IsEnabled("update.internal_error_log") {
		return nu.log.LogThroughError(err)
	}
	return err
}

// GetLatestVersion fetches the deploy file or GitHub releases and determines the latest compatible release
// for the updater's current channel and platform.
func (nu *NetUpdater) GetLatestVersion() (*NetUpReleaseInfo, error) {
	if strings.HasPrefix(nu.config.UpdatorAppConfiguration.Channel, "ugit.") {
		if nu.config.UpdatorAppConfiguration.GhMetaFetcher == nil {
			return nil, nu.logThroughError(fmt.Errorf("github update meta repo not configured for 'ugit.' channel"))
		}
		return nu.getLatestVersionFromGitHub(true)
	} else if strings.HasPrefix(nu.config.UpdatorAppConfiguration.Channel, "git.") {
		if nu.config.UpdatorAppConfiguration.GhMetaFetcher == nil {
			return nil, nu.logThroughError(fmt.Errorf("github update meta repo not configured for 'git.' channel"))
		}
		return nu.getLatestVersionFromGitHub(false)
	} else {
		return nu.getLatestVersionFromJsonDeploy()
	}
}

// getLatestVersionFromJsonDeploy fetches update metadata from a deploy.json file.
func (nu *NetUpdater) getLatestVersionFromJsonDeploy() (*NetUpReleaseInfo, error) {
	if nu.config.UpdatorAppConfiguration.DeployURL == nil || *nu.config.UpdatorAppConfiguration.DeployURL == "" {
		return nil, nu.logThroughError(fmt.Errorf("deploy.json URL is not configured"))
	}
	fmt.Println("Fetching deploy.json from:", *nu.config.UpdatorAppConfiguration.DeployURL)
	fwcommon.FrameworkFlags.Disable("net.internal_error_log") // Disable net's debugging since we handle it
	report, err := nu.fetcher.GET(*nu.config.UpdatorAppConfiguration.DeployURL, false, false, nil)
	fwcommon.FrameworkFlags.Enable("net.internal_error_log") // Re-enable net's debugging
	if err != nil {
		return nil, nu.logThroughError(fmt.Errorf("failed to fetch deploy.json from %s: %w", *nu.config.UpdatorAppConfiguration.DeployURL, err))
	}

	if report.GetResponse().StatusCode != http.StatusOK {
		return nil, nu.logThroughError(fmt.Errorf("failed to fetch deploy.json, status code: %d", report.GetResponse().StatusCode))
	}

	if report.GetNonStreamContent() == nil {
		return nil, nu.logThroughError(fmt.Errorf("received empty content for deploy.json"))
	}

	var deployFile NetUpDeployFile
	err = json.Unmarshal([]byte(*report.GetNonStreamContent()), &deployFile)
	if err != nil {
		return nil, nu.logThroughError(fmt.Errorf("failed to unmarshal deploy.json: %w", err))
	}

	releases, ok := deployFile.Channels[nu.config.UpdatorAppConfiguration.Channel]
	if !ok || len(releases) == 0 {
		return nil, nu.logThroughError(fmt.Errorf("no releases found for channel '%s'", nu.config.UpdatorAppConfiguration.Channel))
	}

	var latest *NetUpReleaseInfo
	for i := range releases {
		release := &releases[i]
		// Ensure the release has source info for the current platform
		if _, ok := release.Sources[nu.config.UpdatorAppConfiguration.Target]; ok {
			if latest == nil || release.UIND > latest.UIND {
				latest = release
			}
		} else {
			fmt.Printf("Skipping release %s (UIND %d) - no build found for %s\n", release.Semver, release.UIND, nu.config.UpdatorAppConfiguration.Target)
		}
	}
	if latest == nil {
		return nil, nu.logThroughError(fmt.Errorf("no compatible releases found for channel '%s' on %s", nu.config.UpdatorAppConfiguration.Channel, nu.config.UpdatorAppConfiguration.Target))
	}

	return latest, nil
}

// getLatestVersionFromGitHub fetches update metadata from GitHub releases.
func (nu *NetUpdater) getLatestVersionFromGitHub(upMeta bool) (*NetUpReleaseInfo, error) {
	var ghReleases []fwcommon.UpdateReleaseData
	var err error

	if upMeta {
		ghReleases, err = nu.config.UpdatorAppConfiguration.GhMetaFetcher.FetchUpMetaReleases()
	} else {
		ghReleases, err = nu.config.UpdatorAppConfiguration.GhMetaFetcher.FetchAssetReleases()
	}

	if err != nil {
		return nil, nu.logThroughError(fmt.Errorf("failed to fetch GitHub releases: %w", err))
	}

	var latestReleaseInfo *NetUpReleaseInfo

	for _, rel := range ghReleases {
		if rel.UpMeta == nil {
			continue // No upmeta found for this release, skip
		}

		// Filter by channel
		if rel.UpMeta.Channel != nu.config.UpdatorAppConfiguration.Channel {
			continue
		}

		// Check if source exists for current platform
		if _, ok := rel.UpMeta.Sources[nu.config.UpdatorAppConfiguration.Target]; !ok {
			fmt.Printf("Skipping GitHub release %s (UIND %d) - no build found for %s\n", rel.UpMeta.Semver, rel.UpMeta.Uind, nu.config.UpdatorAppConfiguration.Target)
			continue
		}

		// Convert SourceInfo from UpMeta to NetUpReleaseInfo's Sources format if it's the latest
		if latestReleaseInfo == nil || rel.UpMeta.Uind > latestReleaseInfo.UIND {
			sources := make(map[string]fwcommon.UpdateSourceInfo)
			for platform, source := range rel.UpMeta.Sources {
				// No conversion needed, as SourceInfo is now the common struct
				sources[platform] = source
			}

			latestReleaseInfo = &NetUpReleaseInfo{
				UIND:     rel.UpMeta.Uind,
				Semver:   rel.UpMeta.Semver,
				Released: rel.Released,
				Notes:    rel.Notes,
				Sources:  sources,
			}
		}
	}

	if latestReleaseInfo == nil {
		return nil, nu.logThroughError(fmt.Errorf("no compatible GitHub releases found for channel '%s' on %s", nu.config.UpdatorAppConfiguration.Channel, nu.config.UpdatorAppConfiguration.Target))
	}

	return latestReleaseInfo, nil
}

// PerformUpdate downloads and applies the specified release. It attempts a patch update
// if applicable, otherwise a full binary update.
func (nu *NetUpdater) PerformUpdate(latestRelease *NetUpReleaseInfo) error {
	opts := update.Options{}

	// Set public key for signature verification
	err := opts.SetPublicKeyPEM(nu.config.UpdatorAppConfiguration.PublicKeyPEM)
	if err != nil {
		return nu.logThroughError(fmt.Errorf("failed to set public key: %w", err))
	}

	// Get platform-specific source URLs
	latestPlatformSource, ok := latestRelease.Sources[nu.config.UpdatorAppConfiguration.Target] // Changed variable name
	if !ok {
		return nu.logThroughError(fmt.Errorf("no update source found for current platform: %s", nu.config.UpdatorAppConfiguration.Target))
	}

	opts.Hash = crypto.SHA256                 // Default, but good to explicitly set
	opts.Verifier = update.NewECDSAVerifier() // Default, but good to explicitly set

	var downloadURL string
	var expectedChecksum []byte
	var expectedSignature []byte
	isPatchAttempt := false

	// Determine if we should attempt a patch update
	// Ensure Signature, PatchChecksum, PatchSignature are not nil before dereferencing
	shouldAttemptPatch := latestPlatformSource.IsPatch &&
		latestPlatformSource.PatchURL != nil && *latestPlatformSource.PatchURL != "" &&
		latestPlatformSource.PatchFor != nil &&
		latestPlatformSource.PatchChecksum != nil && *latestPlatformSource.PatchChecksum != "" &&
		((latestPlatformSource.PatchSignature != nil && *latestPlatformSource.PatchSignature != "") || latestPlatformSource.PatchSignatureBytes != nil)

	if shouldAttemptPatch {
		// Is the patch for us?
		if *latestPlatformSource.PatchFor == nu.config.UpdatorAppConfiguration.UIND {
			fmt.Printf("Attempting to download and apply patch from: %s\n", *latestPlatformSource.PatchURL)
			downloadURL = *latestPlatformSource.PatchURL
			opts.Patcher = update.NewBSDiffPatcher()

			// Set checksum and signature for the patch file
			expectedChecksum, err = hex.DecodeString(*latestPlatformSource.PatchChecksum)
			if err != nil {
				return nu.logThroughError(fmt.Errorf("failed to decode patch checksum: %w", err))
			}
			// If latestPlatformSource.PatchSignature is not nil, we need to do a base64 decode on .PatchSignature
			if latestPlatformSource.PatchSignature != nil && *latestPlatformSource.PatchSignature != "" {
				expectedSignature, err = base64.StdEncoding.DecodeString(*latestPlatformSource.PatchSignature) // Dereference here
				if err != nil {
					return nu.logThroughError(fmt.Errorf("failed to decode full binary signature: %w", err))
				}
			} else if latestPlatformSource.PatchSignatureBytes != nil {
				expectedSignature = latestPlatformSource.PatchSignatureBytes
			} else {
				return nu.logThroughError(fmt.Errorf("patch signature is missing for %s", nu.config.UpdatorAppConfiguration.Target))
			}
			// Mark that we are attempting a patch update
			isPatchAttempt = true
		} else {
			// Warn the user that the patch is not for the current UIND and fallback to a full update
			fmt.Printf("Warning: Patch is for UIND %d, but current UIND is %d. Falling back to full update.\n", *latestPlatformSource.PatchFor, nu.config.UpdatorAppConfiguration.UIND)
			shouldAttemptPatch = false // Force fallback
		}
	}

	if !isPatchAttempt { // If we didn't attempt a patch, or if the patch attempt failed/was skipped
		// If isPatchAttempt is false, it means we will proceed with a full update.
		if latestPlatformSource.IsPatch {
			if latestPlatformSource.PatchURL == nil || *latestPlatformSource.PatchURL == "" {
				fmt.Println("Warning: Release is marked as patch but no patch_url for current platform. Falling back to full update.")
			} else if latestPlatformSource.PatchFor == nil || *latestPlatformSource.PatchFor != nu.config.UpdatorAppConfiguration.UIND {
				// It implies shouldAttemptPatch was false because PatchFor didn't match.
			} else { // Missing patch checksum or signature
				fmt.Println("Warning: Patch is available but missing checksum/signature. Falling back to full update.")
			}
		}

		fmt.Printf("Downloading full binary from: %s\n", latestPlatformSource.URL)
		downloadURL = latestPlatformSource.URL
		opts.Patcher = nil // No patcher needed for full binary update

		// Set checksum and signature for the full binary
		expectedChecksum, err = hex.DecodeString(latestPlatformSource.Checksum)
		if err != nil {
			return nu.logThroughError(fmt.Errorf("failed to decode full binary checksum: %w", err))
		}

		// If latestPlatformSource.Signature is not nil, we need to do a base64 decode on .Signature
		if latestPlatformSource.Signature != nil && *latestPlatformSource.Signature != "" {
			expectedSignature, err = base64.StdEncoding.DecodeString(*latestPlatformSource.Signature) // Dereference here
			if err != nil {
				return nu.logThroughError(fmt.Errorf("failed to decode full binary signature: %w", err))
			}
		} else if latestPlatformSource.SignatureBytes != nil {
			expectedSignature = latestPlatformSource.SignatureBytes
		} else {
			return nu.logThroughError(fmt.Errorf("full binary signature is missing for %s", nu.config.UpdatorAppConfiguration.Target))
		}
	}

	// Assign the derived checksum and signature to opts
	opts.Checksum = expectedChecksum
	opts.Signature = expectedSignature

	fwcommon.FrameworkFlags.Disable("net.internal_error_log")      // Disable net's debugging since we handle it
	report, err := nu.fetcher.GET(downloadURL, true, false, nil)   // Stream the body
	defer fwcommon.FrameworkFlags.Enable("net.internal_error_log") // Re-enable net's debugging

	if err != nil {
		return nu.logThroughError(fmt.Errorf("failed to download update from %s: %w", downloadURL, err))
	}
	defer report.Close() // Close the report when done

	if report.GetResponse().StatusCode != http.StatusOK {
		return nu.logThroughError(fmt.Errorf("failed to download update from %s, status code: %d", downloadURL, report.GetResponse().StatusCode))
	}

	err = update.Apply(report, opts) // Pass the NetProgressReport as io.Reader
	if err != nil {
		return nu.logThroughError(fmt.Errorf("failed to apply update: %w", err))
	}

	fmt.Println("Update applied successfully!")
	return nil
}

// General helpers
func (nu *NetUpdater) GetUpdateConfig() *fwcommon.UpdatorAppConfiguration {
	return nu.config.UpdatorAppConfiguration
}
