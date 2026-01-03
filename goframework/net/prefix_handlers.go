package goframework_net

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	fwcommon "github.com/sbamboo/goframework/common"
)

func isGoogleDriveWarning(prefix []byte, _ *http.Response) bool {
    s := string(prefix)
    return strings.Contains(s, "<!DOCTYPE html>") &&
           strings.Contains(s, "Google Drive - Virus scan warning")
}

func parseGoogleDriveConfirm(body []byte, _ *http.Response) (string, error) {
    s := string(body)

    // Extract form action
    action, ok := fwcommon.ExtractBetween(s, `action="`, `"`)
    if !ok {
        return "", fmt.Errorf("gdrive: form action not found")
    }

    // Parameters we care about
    keys := []string{"id", "export", "confirm", "uuid"}
    params := url.Values{}

    for _, key := range keys {
        val, ok := fwcommon.ExtractBetween(
            s,
            `name="`+key+`" value="`,
            `"`,
        )
        if ok {
            params.Set(key, val)
        }
    }

    if len(params) == 0 {
        return "", fmt.Errorf("gdrive: no parameters found")
    }

    return action + "?" + params.Encode(), nil
}

func isDropboxDl0link(_ []byte, resp *http.Response) bool {
    url := resp.Request.URL.String()
    // https://www.dropbox.com/scl/fi/{id}/{fn}?...
    if !strings.Contains(url, "dl=0") {
        return false
    }

    // https://www.dropbox.com/scl/fi/{id}/{fn}?...dl=0...
    parts := strings.Split(url, "?")
    firstPart := parts[0]
    // https://www.dropbox.com/scl/fi/{id}/{fn}

    prefix := "https://www.dropbox.com/scl/fi/"
    if strings.HasPrefix(firstPart, prefix) {
        firstPart = firstPart[len(prefix):]
        // {id}/{fn}
        return strings.Contains(firstPart, "/")
    }

    return false
}

func parseDropboxDl0link(_ []byte, resp *http.Response) (string, error) {
    // s := string(body)

    // var rawUrl string

    // if strings.Contains(s, "<noscript>") {
    //     // Extract noscript
    //     noscript, ok := fwcommon.ExtractBetween(s, `<meta content="0;url=`, `http-equiv="refresh"`)
    //     if !ok {
    //         return "", fmt.Errorf("dropbox: noscript not found")
    //     }

    //     // Trim spaces from ends
    //     noscript = strings.TrimSpace(noscript)

    //     rawUrl = "https://www.dropbox.com" + strings.ReplaceAll(noscript, "&amp;", "&")
    // } else {
    //     // Extract al:web:url
    //     alweburl, ok := fwcommon.ExtractBetween(s, `<meta content="https://www.dropbox.com/scl/fi/`, `property="al:web:url"`)
    //     if !ok {
    //         return "", fmt.Errorf("dropbox: al:web:url not found")
    //     }

    //     // Trim spaces from ends
    //     alweburl = strings.TrimSpace(alweburl)

    //     rawUrl = "https://www.dropbox.com/scl/fi/" + strings.ReplaceAll(alweburl, "&amp;", "&")
    // }

    // parsedURL, err := url.Parse(rawUrl)
    parsedURL, err := url.Parse(resp.Request.URL.String())
	if err != nil {
		return "", fmt.Errorf("dropbox: failed to parse extracted URL: %w", err)
	}

	query := parsedURL.Query()
	if query.Get("dl") != "1" {
        query.Set("dl", "1")
		parsedURL.RawQuery = query.Encode()
		return parsedURL.String(), nil
	}

    return "", fmt.Errorf("dropbox: Failed to convert url.")
}
