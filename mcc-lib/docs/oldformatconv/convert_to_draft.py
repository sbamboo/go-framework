import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import uuid
import zipfile
import zlib
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from urllib.request import urlopen
except ImportError:  # pragma: no cover - very old Python
    urlopen = None  # type: ignore


def camel_to_snake(name: str) -> str:
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    s2 = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1)
    return s2.replace("-", "_").lower()


def omit_empty(obj: Any) -> Any:
    """Recursively omit keys whose value is an empty array or empty object."""
    if isinstance(obj, dict):
        return {
            k: v
            for k, v in ((k, omit_empty(v)) for k, v in obj.items())
            if v not in ([], {})
        }
    if isinstance(obj, list):
        return [omit_empty(x) for x in obj]
    return obj


def add_legacy_meta(meta: Dict[str, Any], key: str, value: Any) -> None:
    snake = camel_to_snake(key)
    meta_key = f"legacy_{snake}"
    if meta_key not in meta:
        meta[meta_key] = value


def print_progress_bar(prefix: str, current: int, total: Optional[int]) -> None:
    if total and total > 0:
        fraction = min(max(current / float(total), 0.0), 1.0)
        bar_len = 30
        filled = int(bar_len * fraction)
        bar = "#" * filled + "-" * (bar_len - filled)
        percent = int(fraction * 100)
        msg = f"{prefix} [{bar}] {percent:3d}% ({current}/{total} bytes)"
    else:
        msg = f"{prefix} {current} bytes"
    sys.stdout.write("\r" + msg)
    sys.stdout.flush()


def finish_progress_bar() -> None:
    sys.stdout.write("\n")
    sys.stdout.flush()


def compute_hash(data: bytes, algorithm: str) -> str:
    """Return hex digest for verify hash. algorithm is 'crc32' or 'sha256'."""
    if algorithm == "crc32":
        return format(zlib.crc32(data) & 0xFFFFFFFF, "08x")
    if algorithm == "sha256":
        return hashlib.sha256(data).hexdigest()
    raise ValueError(f"Unsupported hash algorithm: {algorithm}")


def is_url(path: str) -> bool:
    return path.startswith("http://") or path.startswith("https://")


def download_bytes(path: str, label: str) -> bytes:
    """
    Download or read bytes from a URL or local file with a per-fetch progress bar.
    """
    if is_url(path):
        if urlopen is None:
            raise RuntimeError("urllib is not available to fetch URLs")
        with urlopen(path) as resp:  # type: ignore[arg-type]
            total_str = resp.headers.get("Content-Length")
            total = int(total_str) if total_str is not None else None
            chunks: List[bytes] = []
            read = 0
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
                read += len(chunk)
                print_progress_bar(f"Downloading {label}", read, total)
            finish_progress_bar()
            return b"".join(chunks)
    else:
        full_path = os.path.abspath(path)
        if not os.path.isfile(full_path):
            raise FileNotFoundError(full_path)
        total = os.path.getsize(full_path)
        read = 0
        chunks: List[bytes] = []
        with open(full_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
                read += len(chunk)
                print_progress_bar(f"Reading {label}", read, total)
        finish_progress_bar()
        return b"".join(chunks)


def load_json_from_path(path: str, label: str) -> Any:
    data = download_bytes(path, label)
    text = data.decode("utf-8")
    return json.loads(text)


def is_archive_path(path: str) -> bool:
    lower = path.lower()
    return (
        lower.endswith(".zip")
        or lower.endswith(".mlisting")
        or lower.endswith(".mlisting.zip")
        or lower.endswith(".mlisting.jar")
    )


def extract_listing_from_archive_bytes(archive_bytes: bytes) -> Dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
        candidate: Optional[str] = None
        if "listing.json" in zf.namelist():
            candidate = "listing.json"
        else:
            for name in zf.namelist():
                if os.path.basename(name).lower() == "listing.json":
                    candidate = name
                    break
        if candidate is None:
            raise FileNotFoundError("listing.json not found in archive")
        with zf.open(candidate) as f:
            content = f.read().decode("utf-8")
            return json.loads(content)


def build_mod_entry_from_listing_source(
    item: Dict[str, Any],
    mod_id: str,
    include_hash_alg: Optional[str] = None,
    download_label: str = "",
    compact: bool = False,
    no_unsup_meta: bool = False,
) -> Dict[str, Any]:
    filename = item.get("filename") or os.path.basename(item.get("url", "mod"))

    mod: Dict[str, Any] = {
        "id": mod_id,
        "meta": {},
        "sources": [],
        "depends": [],
        "conflicts": [],
    }
    if not compact:
        mod["uuid"] = str(uuid.uuid4())
        mod["optional"] = False
        mod["disabled"] = False

    # Preserve all v2/listing source fields in meta as meta.v2_<snake_case> (per Formats.md meta)
    # Skip url (in sources[].source) and filename (in sources[].filename)
    if not no_unsup_meta:
        for k, v in item.items():
            if k in ("url", "filename"):
                continue
            mod["meta"][f"v2_{camel_to_snake(k)}"] = v

    src: Dict[str, Any] = {
        "type": "url",
        "source": item.get("url", ""),
        "filename": filename,
    }
    if not compact:
        src["platforms"] = ["*"]
    if include_hash_alg and item.get("url"):
        data = download_bytes(item["url"], download_label or f"mod {basename}")
        src["verify"] = {
            "algorithm": include_hash_alg,
            "hash": compute_hash(data, include_hash_alg),
        }
    mod["sources"].append(src)

    icon = item.get("modrinthIcon")
    if icon:
        mod["icon"] = icon

    return mod


def build_version_from_listing(
    listing: Dict[str, Any],
    flavor: Dict[str, Any],
    include_hash_alg: Optional[str] = None,
    compact: bool = False,
    no_unsup_meta: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    version_key = (
        listing.get("version")
        or flavor.get("mcver")
        or listing.get("minecraftVer")
        or "legacy-1.0"
    )

    version_obj: Dict[str, Any] = {}
    version_obj["created"] = listing.get("created") or flavor.get("created")
    mcver = listing.get("minecraftVer") or flavor.get("mcver")
    if mcver:
        version_obj["mcver"] = mcver

    # Depends: derive from modloader if present
    depends: List[str] = []
    loader = (
        listing.get("modloader")
        or listing.get("modLoader")
        or flavor.get("source", {}).get("modLoader")
    )
    loader_ver = (
        listing.get("modloaderVer")
        or listing.get("modLoaderVer")
        or flavor.get("source", {}).get("modLoaderVer")
    )
    if loader:
        loader_id = str(loader).lower()
        if loader_ver:
            depends.append(f"loaders:{loader_id}:{loader_ver}")
        else:
            depends.append(f"loaders:{loader_id}:*")

    version_obj["depends"] = depends

    resources: Dict[str, Any] = {
        "mods": [],
        "resourcepacks": [],
    }

    sources = listing.get("sources") or []
    flavor_name = flavor.get("name") or "flavor"
    used_mod_ids: Set[str] = set()
    for i, src_item in enumerate(sources):
        try:
            basename = os.path.splitext(
                src_item.get("filename") or os.path.basename(src_item.get("url", "mod"))
            )[0] or "mod"
            mod_id = basename
            suffix = 0
            while mod_id in used_mod_ids:
                suffix += 1
                mod_id = f"{basename}-{suffix}"
            used_mod_ids.add(mod_id)
            label = f"mod {i + 1}/{len(sources)} ({flavor_name})" if include_hash_alg else ""
            mod_entry = build_mod_entry_from_listing_source(
                src_item,
                mod_id=mod_id,
                include_hash_alg=include_hash_alg,
                download_label=label,
                compact=compact,
                no_unsup_meta=no_unsup_meta,
            )
            resources["mods"].append(mod_entry)
        except Exception:
            # Skip bad entries but continue
            continue

    version_obj["resources"] = resources
    version_obj["resource_counts"] = {
        "mods": len(resources["mods"]),
        "resourcepacks": len(resources["resourcepacks"]),
    }

    return str(version_key), version_obj


def convert_flavor(
    flavor: Dict[str, Any],
    include_all: bool,
    include_hash_alg: Optional[str] = None,
    compact: bool = False,
    no_unsup_meta: bool = False,
) -> Dict[str, Any]:
    """
    Convert a single legacy flavor entry into a V3 inline modpack resource.
    """
    source_type = flavor.get("sourceType")
    source = flavor.get("source")

    modpack = {
        "type": "inline",  # For now all new repos are inline
        "format": 3,
        "id": flavor.get("id") or camel_to_snake(flavor.get("name", "legacy-pack")),
        "name": flavor.get("name"),
        "description": flavor.get("desc"),
        "author": flavor.get("author"),
        "group": flavor.get("group"),
        "meta": {},
        "versions": {},
    }
    # In compact mode only include hidden if set in old repo
    if not compact or flavor.get("hidden") is True:
        modpack["hidden"] = bool(flavor.get("hidden", False))

    meta = modpack["meta"]

    # supported -> meta.supported
    if "supported" in flavor:
        meta["supported"] = bool(flavor["supported"])

    # Determine base icon (launcherIcon or icon -> icon; do not put in meta.legacy_icon)
    icon: Optional[str] = None
    if isinstance(source, dict) and "launcherIcon" in source:
        icon = source.get("launcherIcon")
    if not icon and isinstance(source, dict) and "icon" in source:
        icon = source.get("icon")
    if not icon and "launcherIcon" in flavor:
        icon = flavor.get("launcherIcon")
    if not icon and "icon" in flavor:
        icon = flavor.get("icon")

    listing: Optional[Dict[str, Any]] = None
    archive_url: Optional[str] = None
    archive_bytes: Optional[bytes] = None

    # urlListing and mlisting: string source is JSON listing or archive URL -> overrides
    if source_type in ("included", "urlListing", "mlisting", "legacy", "legacyB64"):
        if source_type == "included":
            if isinstance(source, dict):
                listing = source
        elif source_type in ("urlListing", "mlisting"):
            if isinstance(source, str):
                if is_archive_path(source):
                    archive_url = source
                if include_all:
                    if archive_url:
                        archive_bytes = download_bytes(
                            source, f"archive for {flavor.get('name')}"
                        )
                        listing = extract_listing_from_archive_bytes(archive_bytes)
                    else:
                        listing = load_json_from_path(
                            source, f"listing for {flavor.get('name')}"
                        )
        elif source_type in ("legacy", "legacyB64"):
            if isinstance(source, dict):
                url = source.get("url")
                if url and is_archive_path(url):
                    archive_url = url
                if include_all:
                    if source_type == "legacyB64" and source.get("base64"):
                        raw = base64.b64decode(source["base64"])
                        archive_bytes = raw
                    elif url:
                        archive_bytes = download_bytes(
                            url, f"archive for {flavor.get('name')}"
                        )
                    else:
                        raise ValueError("Legacy source missing url/base64")
                    listing = extract_listing_from_archive_bytes(archive_bytes)

    # If we need verify for overrides but don't have archive bytes yet, fetch once
    if archive_url and include_hash_alg and archive_bytes is None:
        archive_bytes = download_bytes(
            archive_url, f"overrides hash for {flavor.get('name')}"
        )

    # If listing has its own launcherIcon or icon and we have no icon yet, use that
    if listing and not icon and "launcherIcon" in listing:
        icon = listing.get("launcherIcon")
    if listing and not icon and "icon" in listing:
        icon = listing.get("icon")

    if icon:
        modpack["icon"] = icon

    versions: Dict[str, Any] = {}

    def _make_overrides() -> Optional[Dict[str, Any]]:
        if not archive_url:
            return None
        overrides: Dict[str, Any] = {
            "type": "url",
            "source": archive_url,
        }
        if include_hash_alg and archive_bytes is not None:
            overrides["verify"] = {
                "algorithm": include_hash_alg,
                "hash": compute_hash(archive_bytes, include_hash_alg),
            }
        return overrides

    if include_all and listing:
        ver_key, ver_obj = build_version_from_listing(
            listing, flavor,
            include_hash_alg=include_hash_alg,
            compact=compact,
            no_unsup_meta=no_unsup_meta,
        )
        ov = _make_overrides()
        if ov:
            ver_obj["overrides"] = ov
        versions[ver_key] = ver_obj
    else:
        ver_key = flavor.get("mcver") or "legacy-1.0"
        ver_obj: Dict[str, Any] = {
            "created": None,
            "mcver": flavor.get("mcver"),
            "depends": [],
            "resources": {
                "mods": [],
                "resourcepacks": [],
            },
            "resource_counts": {
                "mods": 0,
                "resourcepacks": 0,
            },
        }
        ov = _make_overrides()
        if ov:
            ver_obj["overrides"] = ov
        versions[str(ver_key)] = ver_obj

    modpack["versions"] = versions

    # Anything that does not have an obvious mapping goes into meta as legacy_*
    # launcherIcon and icon are mapped to icon above, not to meta.legacy_icon / meta.legacy_launcher_icon
    if not no_unsup_meta:
        known_flavor_keys = {
            "name",
            "desc",
            "author",
            "id",
            "hidden",
            "supported",
            "sourceType",
            "source",
            "group",
            "mcver",
            "launcherIcon",
            "icon",
        }
        for k, v in flavor.items():
            if k in known_flavor_keys:
                continue
            add_legacy_meta(meta, k, v)

        # Source specific legacy fields
        if isinstance(source, dict):
            for k, v in source.items():
                if k in ("url", "base64", "modLoader", "modLoaderVer", "minecraftVer", "launcherIcon", "icon"):
                    continue
                # For included type omit fields already encoded in v3 (version key, created, depends, mcver, etc.)
                if source_type == "included" and k in (
                    "format", "name", "version", "modloader", "modLoader",
                    "modloaderVer", "modLoaderVer", "created", "minecraftVer",
                    "sources", "sourceLength",
                ):
                    continue
                if k == "backwardsCompat" and isinstance(v, dict):
                    for bk, bv in v.items():
                        add_legacy_meta(meta, bk, bv)
                else:
                    add_legacy_meta(meta, k, v)
        elif isinstance(source, str) and not archive_url:
            add_legacy_meta(meta, "source", source)

        if source_type and source_type not in ("included",):
            add_legacy_meta(meta, "sourceType", source_type)

    return modpack


def convert_repo(
    old_repo: Dict[str, Any],
    include_all: bool,
    flavor_names: Optional[List[str]] = None,
    include_hash_alg: Optional[str] = None,
    compact: bool = False,
    no_unsup_meta: bool = False,
    omit_empty_containers: bool = False,
) -> Tuple[Dict[str, Any], List[Tuple[str, str]]]:
    flavors = old_repo.get("flavors") or []
    if flavor_names:
        wanted = {name for name in flavor_names}
        flavors = [f for f in flavors if str(f.get("name")) in wanted]
    total = len(flavors)

    new_repo: Dict[str, Any] = {
        "format": 3,
        "uuid": str(uuid.uuid4()),
        "name": old_repo.get("name", "Converted legacy repository"),
        "author": old_repo.get("author"),
        "version": old_repo.get("version"),
        "created": old_repo.get("created"),
        "last_updated": old_repo.get("lastUpdated") or old_repo.get("last_updated"),
        "partials": {},
        "resources": {
            "sources": {},
            "runtimes": [],
            "loaders": [],
            "mods": [],
            "resourcepacks": [],
            "modpacks": [],
            "resource_counts": {},
        },
    }

    failures: List[Tuple[str, str]] = []

    for idx, flavor in enumerate(flavors, start=1):
        ident = str(flavor.get("id") or flavor.get("name") or idx)
        try:
            modpack = convert_flavor(
                flavor,
                include_all=include_all,
                include_hash_alg=include_hash_alg,
                compact=compact,
                no_unsup_meta=no_unsup_meta,
            )
            new_repo["resources"]["modpacks"].append(modpack)  # type: ignore[index]
        except Exception as exc:
            failures.append((ident, str(exc)))
        finally:
            sys.stdout.write(f"\rProcessed {idx}/{total} flavors")
            sys.stdout.flush()

    sys.stdout.write("\n")
    sys.stdout.flush()

    resources = new_repo["resources"]
    counts = {
        "sources": len(resources.get("sources", {})),
        "runtimes": len(resources.get("runtimes", [])),
        "loaders": len(resources.get("loaders", [])),
        "mods": len(resources.get("mods", [])),
        "resourcepacks": len(resources.get("resourcepacks", [])),
        "modpacks": len(resources.get("modpacks", [])),
    }
    resources["resource_counts"] = counts

    if omit_empty_containers:
        new_repo = omit_empty(new_repo)  # type: ignore[assignment]
    return new_repo, failures


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Convert legacy MCC repository format to a V3 draft inline repository.",
    )
    parser.add_argument("old_repo", help="Path to legacy repo.json")
    parser.add_argument("new_repo", help="Output path for new repo.json")
    parser.add_argument(
        "--include-all",
        action="store_true",
        help="Fetch and include listing contents (mods) into modpacks.",
    )

    parser.add_argument(
        "--flavors",
        help="Semicolon-separated flavor names to include (by flavor.name).",
    )
    parser.add_argument(
        "--include-hash",
        choices=("crc32", "sha256"),
        dest="include_hash",
        metavar="ALG",
        help="Add verify hash for all URLs (overrides and mod sources). ALG is crc32 or sha256.",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Omit fields not in old format: uuid, optional, disabled, platforms; only include hidden if set in old repo.",
    )
    parser.add_argument(
        "--no-unsup-meta",
        action="store_true",
        dest="no_unsup_meta",
        help="Do not fill meta with unsupported fields (legacy_* and v2_*).",
    )
    parser.add_argument(
        "--omit-empty",
        action="store_true",
        dest="omit_empty",
        help="Omit empty arrays and objects from the output.",
    )

    args = parser.parse_args(argv)

    with open(args.old_repo, "r", encoding="utf-8") as f:
        old_repo = json.load(f)

    flavor_names = None
    if args.flavors:
        flavor_names = [s for s in str(args.flavors).split(";") if s]

    new_repo, failures = convert_repo(
        old_repo,
        include_all=args.include_all,
        flavor_names=flavor_names,
        include_hash_alg=args.include_hash,
        compact=args.compact,
        no_unsup_meta=args.no_unsup_meta,
        omit_empty_containers=args.omit_empty,
    )

    out_dir = os.path.dirname(os.path.abspath(args.new_repo))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    with open(args.new_repo, "w", encoding="utf-8") as f:
        json.dump(new_repo, f, indent=4, ensure_ascii=False)

    total = len(old_repo.get("flavors") or [])
    failed = len(failures)
    succeeded = total - failed

    sys.stdout.write(
        f"\nConversion finished: {succeeded}/{total} flavors converted successfully, {failed} failed.\n"
    )

    if failures:
        sys.stdout.write("Failed entries:\n")
        for ident, msg in failures:
            sys.stdout.write(f"  - {ident}: {msg}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

