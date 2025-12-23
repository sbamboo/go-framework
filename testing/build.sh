#!/bin/bash

# build.sh

# --- Configuration ---
PUBLIC_KEY_FILE="./signing/public.pem"
PRIVATE_KEY_FILE="./signing/private.pem"
OUTPUT_PATH="./builds"
APP_NAME="testapp" # Default app name, can be overridden

# --- Variables for arguments (initialized with null/empty) ---
SEMVER=""
UIND=""
CHANNEL=""
BINARY_PATCH=0
PATCH_FOR_UIND=""
PATCH_COMPARE_PATH=""
OS=""
ARCH=""
NOTES=""
AUTO=0
OUT=""
NO_CROSS_COMPILE=0
ADD_DEPLOY=""
DEPLOY_URL=""
GH_UP_META_REPO=""
WITH_DEBUGGER=0
DO_DEBUG_LDFLAGS=0
HELP=0

# --- Helper Functions ---

# Function to display error messages in red
error() {
    echo -e "\e[31mError: $@\e[0m" >&2
    exit 1
}

# Function to display warning messages in yellow
warn() {
    echo -e "\e[33m$@\e[0m" >&2
}

# Function to display info messages in cyan
info() {
    echo -e "\e[36m$@\e[0m"
}

# Function to display success messages in green
success() {
    echo -e "\e[32m$@\e[0m"
}

# --- Dependency Check ---
check_dependency() {
    local dep_name="$1"
    if ! command -v "$dep_name" &>/dev/null; then
        error "'$dep_name' is not installed or not in your PATH. Please install it to continue."
    fi
}

check_dependency "openssl"
check_dependency "sha256sum"
check_dependency "base64"
check_dependency "bsdiff"
check_dependency "go"
check_dependency "git"
check_dependency "jq"


# --- Help Text ---
show_help() {
    cat <<EOF
Usage: ./build.sh [options]

Options:
  -semver "<string>"             Semantic version (e.g., 1.2.3)
  -uind <int>                    Unique update index (integer)
  -channel "<string>"            Deployment channel (e.g., release, dev)
  --binaryPatch                  Indicates this is a binary patch (default: no)
  -os "<string>"                 Target OS (windows, linux, darwin)
  -arch "<string>"               Target architecture (amd64, arm64)
  -notes "<string>"              Release notes
  --auto                         Uses default target OS/arch and disables binary patch
  -out "<filepath>"              Output JSON to file
  --noCrossCompile               Tells golang not to use cross-compilation by not adding GOOS and GOARCH env vars
  -addDeploy "<filepath>"        Add this entry to the following deploy.json under its channel
  -deployURL "<string>"          URL for the deploy.json, where most channels fetch updates from
  -ghUpMetaRepo "<owner>/<repo>" GitHub repository for "ugit."/"git." channels to fetch github releases from
  --withDebugger                 Build with debugger support (default: no)
  --doDebugLdflags               Prints debug ldflags for the Go build
  -appName "<string>"            Application name (current: $APP_NAME)
  --help                         Show this help message

Notes:
  If any parameter is missing, you will be prompted for it.
  Use --auto to skip prompts for target OS/arch and binary patch.

Examples:
  ./build.sh -semver "1.2.3" -uind 5 -channel "release"
  ./build.sh -semver "1.2.3" -uind 5 -channel "release" --auto
  ./build.sh -semver "1.2.3" -uind 5 -channel "dev" --binaryPatch
  ./build.sh -semver "1.2.3" -uind 5 -channel "dev" -out "./entry.json"
EOF
    exit 0
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -semver) SEMVER="$2"; shift ;;
        -uind) UIND="$2"; shift ;;
        -channel) CHANNEL="$2"; shift ;;
        --binaryPatch) BINARY_PATCH=1 ;;
        -patchForUind) PATCH_FOR_UIND="$2"; shift ;;
        -patchComparePath) PATCH_COMPARE_PATH="$2"; shift ;;
        -os) OS="$2"; shift ;;
        -arch) ARCH="$2"; shift ;;
        -notes) NOTES="$2"; shift ;;
        --auto) AUTO=1 ;;
        -out) OUT="$2"; shift ;;
        --noCrossCompile) NO_CROSS_COMPILE=1 ;;
        -addDeploy) ADD_DEPLOY="$2"; shift ;;
        -deployURL) DEPLOY_URL="$2"; shift ;;
        -ghUpMetaRepo) GH_UP_META_REPO="$2"; shift ;;
        --withDebugger) WITH_DEBUGGER=1 ;;
        --doDebugLdflags) DO_DEBUG_LDFLAGS=1 ;;
        -appName) APP_NAME="$2"; shift ;;
        --help) HELP=1 ;;
        *) error "Unknown parameter passed: $1. Use --help for usage information." ;;
    esac
    shift
done

if [[ "$HELP" -eq 1 ]]; then
    show_help
fi

# CD to script's directory
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
cd "$SCRIPT_DIR" || error "Failed to change directory to $SCRIPT_DIR"

# --- Helper Functions ---

generate_key_pair() {
    local private_key_path="$1"
    local public_key_path="$2"
    local re_made_private_key=0

    # Private key
    if [[ ! -f "$private_key_path" ]]; then
        warn "Generating new ECDSA private key..."
        if ! openssl ecparam -genkey -name prime256v1 -noout -out "$private_key_path"; then
            error "Failed to generate private key. Make sure OpenSSL is installed and in your PATH."
        fi
        success "Private key saved to: $private_key_path"
        re_made_private_key=1
    else
        info "Private key already exists: $private_key_path"
    fi

    # Public key
    if [[ ! -f "$public_key_path" || "$re_made_private_key" -eq 1 ]]; then
        if [[ "$re_made_private_key" -eq 1 && -f "$public_key_path" ]]; then
            rm -f "$public_key_path"
            warn "Invalidated and removed existing public key: $public_key_path"
        fi
        warn "Generating public key from private key..."
        if ! openssl ec -in "$private_key_path" -pubout -out "$public_key_path"; then
            error "Failed to generate public key. Make sure OpenSSL is installed and in your PATH."
        fi
        success "Public key saved to: $public_key_path"
    else
        info "Public key already exists: $public_key_path"
    fi
}

lf_normalize_pem_file() {
    local pem_file_path="$1"
    if [[ ! -f "$pem_file_path" ]]; then
        error "PEM file not found: $pem_file_path"
    fi
    # Read the PEM file, normalize line endings to LF, and write back
    # Using perl for in-place replacement and ensuring only LF
    perl -pi -e 's/\r\n|\r/\n/g' "$pem_file_path"
    success "Normalized PEM file: $pem_file_path"
}


get_binary_checksum() {
    local file_path="$1"
    if [[ ! -f "$file_path" ]]; then
        error "File not found: $file_path"
    fi
    sha256sum "$file_path" | awk '{print $1}'
}

LAST_SIGNATURE=

sign_binary() {
    local file_path="$1"
    local private_key_path="$2"

    if [[ ! -f "$file_path" ]]; then
        error "File not found: $file_path"
    fi
    if [[ ! -f "$private_key_path" ]]; then
        error "Private key file not found: $private_key_path"
    fi

    local signature_file_path="${file_path}.sig"

    info "Signing binary..."
    if ! openssl dgst -sha256 -sign "$private_key_path" -out "$signature_file_path" "$file_path"; then
        error "Failed to sign binary using openssl."
    fi

    if [[ ! -f "$signature_file_path" ]]; then
        error "Signature file was not created."
    fi

    local base64_signature=$(base64 -w 0 < "$signature_file_path")
    rm -f "$signature_file_path"

    LAST_SIGNATURE=$base64_signature
}

generate_bsdiff_patch() {
    local old_file="$1"
    local new_file="$2"
    local patch_file="$3"

    info "Creating bsdiff patch from '$old_file' to '$new_file' as '$patch_file'..."
    if ! bsdiff "$old_file" "$new_file" "$patch_file"; then
        error "Failed to create bsdiff patch. Make sure bsdiff is installed and in your PATH."
    fi
    success "BSDiff patch created successfully: $patch_file"
}

validate_uind() {
    local input_uind="$1"
    if [[ "$input_uind" =~ ^[0-9]+$ ]]; then
        return 0 # Indicate success
    else
        return 1 # Indicate failure
    fi
}

# Function to read input with a prompt
read_input() {
    local prompt_msg="$1"
    local default_val="$2"
    local input_val

    if [[ -n "$default_val" ]]; then
        read -rp "$prompt_msg ($default_val): " input_val
        if [[ -z "$input_val" ]]; then
            echo "$default_val"
        else
            echo "$input_val"
        fi
    else
        read -rp "$prompt_msg: " input_val
        echo "$input_val"
    fi
}

# --- Main Script ---

# 0. Ensure Signing directory exists
mkdir -p "./signing" || error "Failed to create signing directory."

# 1. Generate Key Pair if it doesn't exist
generate_key_pair "$PRIVATE_KEY_FILE" "$PUBLIC_KEY_FILE"

# 2. Get User Input
# semver
if [[ -z "$SEMVER" ]]; then
    SEMVER=$(read_input "Enter application semantic version (e.g., 1.0.0)")
    [[ -z "$SEMVER" ]] && error "Semantic version cannot be empty."
fi

# uind - must be integer
if [[ -z "$UIND" ]]; then
    while true; do
        INPUT_UIND=$(read_input "Enter unique update index (integer, e.g., 1, 2, 3)")
        if validate_uind "$INPUT_UIND"; then
            UIND="$INPUT_UIND"
            break
        else
            warn "Invalid UIND. Please enter an integer."
        fi
    done
else
    # Validate CLI uind param
    if ! validate_uind "$UIND"; then
        while true; do
            INPUT_UIND=$(read_input "Enter unique update index (integer, e.g., 1, 2, 3)")
            if validate_uind "$INPUT_UIND"; then
                UIND="$INPUT_UIND"
                break
            else
                warn "Invalid UIND. Please enter an integer."
            fi
        done
    fi
fi

# channel
if [[ -z "$CHANNEL" ]]; then
    CHANNEL=$(read_input "Enter deployment channel (e.g., release, dev)")
    [[ -z "$CHANNEL" ]] && error "Channel cannot be empty."
fi

# binary patch & target
GENERATE_PATCH=0
if [[ "$AUTO" -eq 1 ]]; then
    # If auto, use default values for targetOS, targetArch and isPatch = no
    TARGET_OS="${OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
    TARGET_ARCH="${ARCH:-$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')}"
    GENERATE_PATCH=0
    PATCH_FOR_UIND=""
    PATCH_COMPARE_PATH=""
else
    if [[ "$BINARY_PATCH" -eq 1 ]]; then
        GENERATE_PATCH=1
    else
        # Prompt for binary patch if no flag given
        read -rp "Is this a binary patch? (y/n): " RESP
        [[ "$RESP" == "y" || "$RESP" == "Y" ]] && GENERATE_PATCH=1
    fi

    if [[ "$GENERATE_PATCH" -eq 1 ]]; then
        if [[ -z "$PATCH_FOR_UIND" ]]; then
            while true; do
                INPUT_PATCH_FOR=$(read_input "Enter the UIND of the version this patch is FOR (the old version's UIND)")
                if validate_uind "$INPUT_PATCH_FOR"; then
                    PATCH_FOR_UIND="$INPUT_PATCH_FOR"
                    break
                else
                    warn "Invalid UIND. Please enter an integer."
                fi
            done
        else
            if ! validate_uind "$PATCH_FOR_UIND"; then
                while true; do
                    INPUT_PATCH_FOR=$(read_input "Enter the UIND of the version this patch is FOR (the old version's UIND)")
                    if validate_uind "$INPUT_PATCH_FOR"; then
                        PATCH_FOR_UIND="$INPUT_PATCH_FOR"
                        break
                    else
                        warn "Invalid UIND. Please enter an integer."
                    fi
                done
            fi
        fi

        if [[ -z "$PATCH_COMPARE_PATH" ]]; then
            PATCH_COMPARE_PATH=$(read_input "Enter path to the previous version's binary for patch generation (e.g., ./builds/your_app_v1.0.0.exe)")
        fi
        while [[ ! -f "$PATCH_COMPARE_PATH" ]]; do
            error "Previous binary not found at: $PATCH_COMPARE_PATH. Please enter a valid path."
            PATCH_COMPARE_PATH=$(read_input "Enter path to the previous version's binary for patch generation (e.g., ./builds/your_app_v1.0.0.exe)")
        done
    fi

    # Prompt targetOS and targetArch if not provided
    if [[ -z "$OS" ]]; then
        DEFAULT_OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        if [[ "$DEFAULT_OS" == "darwin" ]]; then
            DEFAULT_OS="darwin"
        elif [[ "$DEFAULT_OS" == "linux" ]]; then
            DEFAULT_OS="linux"
        else
            DEFAULT_OS="windows" # Default for other systems, typically WSL or Windows Git Bash
        fi
        TARGET_OS=$(read_input "Enter target OS (windows, linux, darwin)" "$DEFAULT_OS")
        [[ -z "$TARGET_OS" ]] && TARGET_OS="$DEFAULT_OS"
    else
        TARGET_OS="$OS"
    fi

    if [[ -z "$ARCH" ]]; then
        DEFAULT_ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
        TARGET_ARCH=$(read_input "Enter target architecture (amd64, arm64)" "$DEFAULT_ARCH")
        [[ -z "$TARGET_ARCH" ]] && TARGET_ARCH="$DEFAULT_ARCH"
    else
        TARGET_ARCH="$ARCH"
    fi
fi

# deployURL
if [[ -z "$DEPLOY_URL" ]]; then
    DEPLOY_URL=$(read_input "Enter the URL for the deploy.json (e.g., https://example.com/deploy.json)")
    [[ -z "$DEPLOY_URL" ]] && error "Deploy URL cannot be empty."
fi

# if ghUpMetaRepo is not set and channel begins with "ugit."
if [[ -z "$GH_UP_META_REPO" && "$CHANNEL" == "ugit."* ]]; then
    GH_UP_META_REPO=$(read_input "Enter the github repository where github release channels are posted. (e.g., sbamboo/go-framework)")
fi


GO_OS_ENV="GOOS=$TARGET_OS"
GO_ARCH_ENV="GOARCH=$TARGET_ARCH"

# build time and commit hash
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
if [[ "$COMMIT_HASH" == "unknown" ]]; then
    warn "Git not found or not a git repo; setting commit hash to 'unknown'"
fi

# 3. Create Output Directory
mkdir -p "$OUTPUT_PATH" || error "Failed to create output directory: $OUTPUT_PATH"

# 4. Build the Go Application
BINARY_NAME="$APP_NAME"
PLATFORM_KEY="$TARGET_OS-$TARGET_ARCH" # e.g., "windows-amd64"

BINARY_NAME+="_v$SEMVER"
BINARY_NAME+="_$CHANNEL"
BINARY_NAME+="_$PLATFORM_KEY"

if [[ "$TARGET_OS" == "windows" ]]; then BINARY_NAME+=".exe"; fi

OUTPUT_BINARY_PATH="$OUTPUT_PATH/$BINARY_NAME"
LDFLAGS="-X 'main.AppVersion=$SEMVER' -X 'main.AppUIND=$UIND' -X 'main.AppChannel=$CHANNEL' -X 'main.AppBuildTime=$BUILD_TIME' -X 'main.AppCommitHash=$COMMIT_HASH' -X 'main.AppDeployURL=$DEPLOY_URL'"

# if $GH_UP_META_REPO is set and not "", add it to ldflags
if [[ -n "$GH_UP_META_REPO" ]]; then
    LDFLAGS+=" -X 'main.AppGithubRepo=$GH_UP_META_REPO'"
fi

if [[ "$DO_DEBUG_LDFLAGS" -eq 1 ]]; then
    info "Debug ldflags:\n$LDFLAGS"
fi

info "Building Go application..."
# Ensure current directory is the project root where go.mod is
pushd "$SCRIPT_DIR" >/dev/null || error "Failed to change directory."

BUILD_COMMAND="go build -ldflags \"$LDFLAGS\""

if [[ "$NO_CROSS_COMPILE" -eq 0 ]]; then
    export GOOS="$TARGET_OS"
    export GOARCH="$TARGET_ARCH"
fi

if [[ "$WITH_DEBUGGER" -eq 1 ]]; then
    BUILD_COMMAND+=" -tags \"with_debugger\""
fi
BUILD_COMMAND+=" -o \"$OUTPUT_BINARY_PATH\" ."

if eval "$BUILD_COMMAND"; then
    success "Build successful: $OUTPUT_BINARY_PATH"
else
    error "Go build failed."
fi

popd >/dev/null # Restore previous location
if [[ "$NO_CROSS_COMPILE" -eq 0 ]]; then
    unset GOOS
    unset GOARCH
fi

# 5. Calculate Checksum
CHECKSUM=$(get_binary_checksum "$OUTPUT_BINARY_PATH")
success "Checksum (SHA256): $CHECKSUM"

# 6. Sign the Binary
sign_binary "$OUTPUT_BINARY_PATH" "$PRIVATE_KEY_FILE"
success "Signature: $LAST_SIGNATURE"

# 7. Handle Patch Creation (if applicable)
PATCH_PUBLISH_URL=""
PATCH_CHECKSUM=""
PATCH_SIGNATURE=""
PATCH_FILE_NAME=""
PATCH_FILE_PATH=""

if [[ "$GENERATE_PATCH" -eq 1 ]]; then
    # Make patch file path
    # <filename>_<uind>t<patchForUind>.patch
    PATCH_FILE_NAME="${BINARY_NAME%.*}" # Remove extension
    if [[ -n "$PATCH_FOR_UIND" ]]; then
        PATCH_FILE_NAME+="_${UIND}t${PATCH_FOR_UIND}.patch"
    else
        PATCH_FILE_NAME+="_${UIND}t.patch"
    fi
    PATCH_FILE_PATH="$OUTPUT_PATH/$PATCH_FILE_NAME"

    # Generate the patch file
    generate_bsdiff_patch "$PATCH_COMPARE_PATH" "$OUTPUT_BINARY_PATH" "$PATCH_FILE_PATH"

    # Calculate Checksum for Patch
    PATCH_CHECKSUM=$(get_binary_checksum "$PATCH_FILE_PATH")
    success "Patch File Checksum (SHA256): $PATCH_CHECKSUM"

    # Sign the Patch File
    PATCH_SIGNATURE=$(sign_binary "$PATCH_FILE_PATH" "$PRIVATE_KEY_FILE")
    success "Patch File Signature: $PATCH_SIGNATURE"

    # Placeholder for actual deploy URL. This needs to be determined based on your deployment strategy.
    # In the original, it's hardcoded to a GitHub raw URL, you might want to generalize this.
    PATCH_PUBLISH_URL="https://github.com/sbamboo/go-framework/raw/refs/heads/main/${APP_NAME}/builds/$PATCH_FILE_NAME"
fi

# Placeholder for actual deploy URL. This needs to be determined based on your deployment strategy.
BINARY_PUBLISH_URL="https://github.com/sbamboo/go-framework/raw/refs/heads/main/${APP_NAME}/builds/$BINARY_NAME"

# 8. Release notes
if [[ -z "$NOTES" ]]; then
    NOTES=$(read_input "Enter release notes")
fi

# 9. Print JSON for deploy.json
# Using jq for JSON manipulation
# Construct the sourceInfo object
SOURCE_INFO=$(jq -n \
    --argjson is_patch $([[ "$GENERATE_PATCH" -eq 1 ]] && echo "true" || echo "false") \
    --arg url "$BINARY_PUBLISH_URL" \
    --arg checksum "$CHECKSUM" \
    --arg signature "$SIGNATURE" \
    --arg patch_url "$PATCH_PUBLISH_URL" \
    --arg patch_checksum "$PATCH_CHECKSUM" \
    --arg patch_signature "$PATCH_SIGNATURE" \
    '{is_patch: $is_patch, url: $url, checksum: $checksum, signature: $signature, patch_url: $patch_url, patch_checksum: $patch_checksum, patch_signature: $patch_signature}')

if [[ -n "$PATCH_FOR_UIND" ]]; then
    SOURCE_INFO=$(echo "$SOURCE_INFO" | jq --argjson patch_for "$PATCH_FOR_UIND" '.patch_for = $patch_for')
else
    SOURCE_INFO=$(echo "$SOURCE_INFO" | jq '.patch_for = null')
fi

# Construct the sourcesMap
SOURCES_MAP=$(jq -n --arg platform_key "$PLATFORM_KEY" --argjson source_info "$SOURCE_INFO" '{(($platform_key)): $source_info}')

# Construct the releaseEntry
RELEASE_ENTRY=$(jq -n \
    --argjson uind "$UIND" \
    --arg semver "$SEMVER" \
    --arg released "$BUILD_TIME" \
    --arg notes "$NOTES" \
    --argjson sources "$SOURCES_MAP" \
    '{uind: $uind, semver: $semver, released: $released, notes: $notes, sources: $sources}')

JSON_ENTRY=$(echo "$RELEASE_ENTRY" | jq -c .)

warn "\n--- Add this to your deploy.json ---"
warn "Channel: $CHANNEL"
echo "$JSON_ENTRY"
warn "-----------------------------------\n"

if [[ -n "$OUT" ]]; then
    if echo "$JSON_ENTRY" | jq . > "$OUT"; then
        success "JSON written to $OUT"
    else
        error "Failed to write JSON to file: $OUT"
    fi
fi

if [[ -n "$ADD_DEPLOY" ]]; then
    if [[ ! -f "$ADD_DEPLOY" ]]; then
        error "File not found: $ADD_DEPLOY"
    fi

    # Read and parse existing deploy.json
    DEPLOY_CONTENT=$(jq . "$ADD_DEPLOY") || error "Failed to read or parse JSON from $ADD_DEPLOY"

    # Validate structure
    if [[ $(echo "$DEPLOY_CONTENT" | jq -e 'has("format") and has("channels")') != "true" ]]; then
        error "Invalid deploy file format: missing 'format' or 'channels' keys."
    fi

    # Add or update the channel with the new release entry
    UPDATED_DEPLOY_CONTENT=$(echo "$DEPLOY_CONTENT" | jq \
        --arg channel "$CHANNEL" \
        --argjson release_entry "$RELEASE_ENTRY" \
        '.channels[$channel] = ((.channels[$channel] // []) + [$release_entry]) | .channels[$channel] |= unique_by(.uind)'
    )

    if [[ -z "$UPDATED_DEPLOY_CONTENT" ]]; then
        error "Failed to update deploy JSON content."
    fi

    # Use jq again for pretty printing and outputting to file
    if echo "$UPDATED_DEPLOY_CONTENT" | jq . > "$ADD_DEPLOY"; then
        success "Updated deploy file: $ADD_DEPLOY"
    else
        error "Failed to write updated deploy file: $ADD_DEPLOY"
    fi
fi

success "Remember to commit '$OUTPUT_BINARY_PATH' (and patch '$PATCH_FILE_PATH' if applicable) and update 'deploy.json' in your repository."